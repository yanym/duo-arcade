import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { GAME_IDS } from "@duo/game-core";
import { clearSessionMemory } from "@/lib/session";

const IDENTITY_KEY = "duo.identity.v1";
const ROOM_INDEX_KEY = "duo.room.index.v1";
const SETTINGS_KEY = "duo.settings.v1";

export async function clearLocalData(): Promise<void> {
  clearSessionMemory();
  if (Platform.OS === "web") {
    try {
      if (typeof sessionStorage !== "undefined") {
        for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
          const key = sessionStorage.key(index);
          if (key?.startsWith("duo.")) sessionStorage.removeItem(key);
        }
      }
    } catch {
      // Continue so a restricted session store cannot block the persistent store.
    }
    try {
      if (typeof localStorage !== "undefined") {
        for (let index = localStorage.length - 1; index >= 0; index -= 1) {
          const key = localStorage.key(index);
          if (key?.startsWith("duo.")) localStorage.removeItem(key);
        }
      }
    } catch {
      // The in-memory and any available session data have still been cleared.
    }
    return;
  }

  let roomIndexRaw: string | null = null;
  try {
    roomIndexRaw = await SecureStore.getItemAsync(ROOM_INDEX_KEY);
  } catch {
    // Continue clearing every key whose name can be derived locally.
  }
  let roomCodes: string[] = [];
  try {
    const parsed = roomIndexRaw ? JSON.parse(roomIndexRaw) as unknown : [];
    roomCodes = Array.isArray(parsed) && parsed.every((value) => typeof value === "string") ? parsed : [];
  } catch {
    roomCodes = [];
  }
  const keys = [
    IDENTITY_KEY,
    ROOM_INDEX_KEY,
    SETTINGS_KEY,
    ...roomCodes.map((code) => `duo.room.${code}.v1`),
    ...GAME_IDS.map((gameId) => `duo.tutorial.${gameId}.v1`),
  ];
  await Promise.all(keys.map((key) => SecureStore.deleteItemAsync(key)));
}
