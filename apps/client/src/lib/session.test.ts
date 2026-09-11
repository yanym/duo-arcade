import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearSessionMemory, getRecentRoomCodes, getRoomSession, localizeGeneratedNickname, removeRoomSession, saveRoomSession } from "./session";

vi.mock("react-native", () => ({ Platform: { OS: "web" } }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "test-player" }));
vi.mock("expo-secure-store", () => ({}));

const previous = { playerId: "player", seat: 0 as const, seatToken: "old-test-token" };
const current = { ...previous, seatToken: "new-test-token" };
const key = "duo.room.ABC234.v1";
let persisted: Map<string, string>;
let legacy: Map<string, string>;
let failWrite: boolean;
let failDelete: boolean;

beforeEach(() => {
  clearSessionMemory();
  persisted = new Map();
  legacy = new Map();
  failWrite = false;
  failDelete = false;
  vi.stubGlobal("localStorage", {
    getItem: (name: string) => persisted.get(name) ?? null,
    setItem: (name: string, value: string) => {
      if (failWrite) throw new Error("Quota exceeded");
      persisted.set(name, value);
    },
    removeItem: (name: string) => {
      if (failDelete) throw new Error("Storage unavailable");
      persisted.delete(name);
    },
  });
  vi.stubGlobal("sessionStorage", {
    getItem: (name: string) => legacy.get(name) ?? null,
    removeItem: (name: string) => legacy.delete(name),
  });
});

afterEach(() => {
  clearSessionMemory();
  vi.unstubAllGlobals();
});

describe("seat recovery when browser storage becomes unavailable", () => {
  it("localizes only generated guest names and preserves names typed by players", () => {
    expect(localizeGeneratedNickname("晴朗海獭", "en")).toBe("Sunny Otter");
    expect(localizeGeneratedNickname("Sunny Otter", "zh")).toBe("晴朗海獭");
    expect(localizeGeneratedNickname("小明", "en")).toBe("小明");
  });

  it("uses the new seat token even if old persistent data cannot be overwritten", async () => {
    persisted.set(key, JSON.stringify(previous));
    failWrite = true;
    await saveRoomSession("ABC234", current);
    expect(await getRoomSession("abc234")).toEqual(current);
    expect(JSON.parse(persisted.get(key)!)).toEqual(previous);
  });

  it("continues reading cross-tab changes when persistence works", async () => {
    await saveRoomSession("ABC234", previous);
    persisted.set(key, JSON.stringify(current));
    expect(await getRoomSession("ABC234")).toEqual(current);
  });

  it("does not resurrect an invalid seat when deletion fails", async () => {
    persisted.set(key, JSON.stringify(previous));
    legacy.set(key, JSON.stringify(previous));
    failDelete = true;
    await removeRoomSession("ABC234");
    expect(await getRoomSession("ABC234")).toBeNull();
    expect(legacy.has(key)).toBe(false);
  });

  it("returns to persistent storage after the next successful save", async () => {
    failWrite = true;
    await saveRoomSession("ABC234", previous);
    failWrite = false;
    await saveRoomSession("ABC234", current);
    clearSessionMemory();
    expect(await getRoomSession("ABC234")).toEqual(current);
  });

  it("moves a resumed room to the front of the recent-room recovery list", async () => {
    await saveRoomSession("ABC234", previous);
    await saveRoomSession("DEF567", previous);
    await saveRoomSession("GHJ789", previous);
    await saveRoomSession("ABC234", current);
    expect(await getRecentRoomCodes()).toEqual(["ABC234", "GHJ789", "DEF567"]);
  });
});
