import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import type { RoomSessionResponse } from "@duo/protocol";

export type Identity = { playerId: string; nickname: string };
export type StoredSession = Pick<RoomSessionResponse, "playerId" | "seat" | "seatToken">;

const IDENTITY_KEY = "duo.identity.v1";
const ROOM_INDEX_KEY = "duo.room.index.v1";
const memoryStore = new Map<string, string>();
// Only failed writes/deletes override persistent storage. Successful writes
// remain visible across tabs through localStorage as before.
const pendingStorageOverrides = new Map<string, string | null>();

export function clearSessionMemory(): void {
  for (const key of memoryStore.keys()) {
    if (key.startsWith("duo.")) memoryStore.delete(key);
  }
  pendingStorageOverrides.clear();
}

async function readValue(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    if (pendingStorageOverrides.has(key)) return pendingStorageOverrides.get(key) ?? null;
    try {
      const persisted = typeof localStorage === "undefined" ? null : localStorage.getItem(key);
      if (persisted) return persisted;
    } catch {
      // A legacy tab or the in-memory fallback may still be available.
    }
    try {
      const legacy = typeof sessionStorage === "undefined" ? null : sessionStorage.getItem(key);
      if (legacy) {
        try {
          if (typeof localStorage !== "undefined") localStorage.setItem(key, legacy);
        } catch {
          // Returning the legacy value still lets this tab resume.
        }
        return legacy;
      }
    } catch {
      // Fall through to the current-page copy.
    }
    return memoryStore.get(key) ?? null;
  }
  try {
    const persisted = await SecureStore.getItemAsync(key);
    if (persisted) return persisted;
  } catch {
    // Keep this launch usable if the keychain is temporarily unavailable.
  }
  return memoryStore.get(key) ?? null;
}

async function writeValue(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    memoryStore.set(key, value);
    pendingStorageOverrides.set(key, value);
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(key, value);
        pendingStorageOverrides.delete(key);
      }
    } catch {
      // Keep the current page usable when browser storage is restricted.
    }
    return;
  }
  memoryStore.set(key, value);
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    // The in-memory copy still preserves the active identity and room seat.
  }
}

async function deleteValue(key: string): Promise<void> {
  if (Platform.OS === "web") {
    memoryStore.delete(key);
    pendingStorageOverrides.set(key, null);
    let deletedEverywhere = true;
    try {
      if (typeof localStorage !== "undefined") localStorage.removeItem(key);
    } catch {
      deletedEverywhere = false;
      // The remaining stores can still be cleared independently.
    }
    try {
      if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(key);
    } catch {
      deletedEverywhere = false;
      // The in-memory copy has still been removed.
    }
    if (deletedEverywhere) pendingStorageOverrides.delete(key);
    return;
  }
  memoryStore.delete(key);
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Never revive a rejected credential during this launch.
  }
}

const adjectives = ["晴朗", "机灵", "快乐", "勇敢", "温柔", "闪亮"];
const animals = ["海獭", "熊猫", "狐狸", "企鹅", "小鹿", "海豹"];
const englishAdjectives = ["Sunny", "Clever", "Happy", "Brave", "Gentle", "Bright"];
const englishAnimals = ["Otter", "Panda", "Fox", "Penguin", "Deer", "Seal"];

export function localizeGeneratedNickname(nickname: string, language: "zh" | "en"): string {
  for (let adjective = 0; adjective < adjectives.length; adjective += 1) {
    for (let animal = 0; animal < animals.length; animal += 1) {
      const chinese = `${adjectives[adjective]}${animals[animal]}`;
      const english = `${englishAdjectives[adjective]} ${englishAnimals[animal]}`;
      if (nickname === chinese || nickname === english) return language === "en" ? english : chinese;
    }
  }
  return nickname;
}

function defaultNickname(id: string): string {
  const seed = Array.from(id).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return `${adjectives[seed % adjectives.length]}${animals[(seed * 7) % animals.length]}`;
}

export function createClientId(): string {
  try {
    return Crypto.randomUUID();
  } catch {
    const bytes = new Uint8Array(16);
    try {
      Crypto.getRandomValues(bytes);
    } catch {
      // Player and action IDs are uniqueness keys, not authentication secrets.
      for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = Math.floor(Math.random() * 256);
      }
    }
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
}

export async function getIdentity(): Promise<Identity> {
  const stored = await readValue(IDENTITY_KEY);
  if (stored) {
    try {
      return JSON.parse(stored) as Identity;
    } catch {
      // Replace malformed local state with a fresh identity.
    }
  }

  const playerId = createClientId();
  const identity = { playerId, nickname: defaultNickname(playerId) };
  await writeValue(IDENTITY_KEY, JSON.stringify(identity));
  return identity;
}

export async function saveIdentity(identity: Identity): Promise<void> {
  await writeValue(IDENTITY_KEY, JSON.stringify(identity));
}

function roomKey(code: string): string {
  return `duo.room.${code.toUpperCase()}.v1`;
}

export async function getRoomSession(code: string): Promise<StoredSession | null> {
  const stored = await readValue(roomKey(code));
  if (!stored) return null;
  try {
    return JSON.parse(stored) as StoredSession;
  } catch {
    return null;
  }
}

export async function getRecentRoomCodes(limit = 3): Promise<string[]> {
  const storedIndex = await readValue(ROOM_INDEX_KEY);
  if (!storedIndex) return [];
  try {
    const parsed = JSON.parse(storedIndex) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((value): value is string => typeof value === "string")
      .slice(-Math.max(0, limit))
      .reverse();
  } catch {
    return [];
  }
}

export async function saveRoomSession(code: string, session: StoredSession): Promise<void> {
  const normalizedCode = code.toUpperCase();
  await writeValue(roomKey(normalizedCode), JSON.stringify(session));
  const storedIndex = await readValue(ROOM_INDEX_KEY);
  let codes: string[] = [];
  try {
    const parsed = storedIndex ? JSON.parse(storedIndex) as unknown : [];
    codes = Array.isArray(parsed) && parsed.every((value) => typeof value === "string") ? parsed : [];
  } catch {
    codes = [];
  }
  // Saving a room means it was just created, joined, or resumed. Move it to
  // the end so the home-screen recovery card reflects actual recent activity.
  const nextCodes = [...codes.filter((value) => value !== normalizedCode), normalizedCode].slice(-24);
  await writeValue(ROOM_INDEX_KEY, JSON.stringify(nextCodes));
}

export async function removeRoomSession(code: string): Promise<void> {
  const normalizedCode = code.toUpperCase();
  await deleteValue(roomKey(normalizedCode));
  const storedIndex = await readValue(ROOM_INDEX_KEY);
  if (!storedIndex) return;
  try {
    const parsed = JSON.parse(storedIndex) as unknown;
    if (!Array.isArray(parsed)) return;
    const nextCodes = parsed.filter((value): value is string => typeof value === "string" && value !== normalizedCode);
    await writeValue(ROOM_INDEX_KEY, JSON.stringify(nextCodes));
  } catch {
    await writeValue(ROOM_INDEX_KEY, "[]");
  }
}
