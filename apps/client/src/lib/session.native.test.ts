import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearSessionMemory, getIdentity, getRoomSession, removeRoomSession, saveRoomSession } from "./session";

const mocks = vi.hoisted(() => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "native-test-player" }));
vi.mock("expo-secure-store", () => mocks);

beforeEach(() => {
  clearSessionMemory();
  mocks.getItemAsync.mockRejectedValue(new Error("keychain locked"));
  mocks.setItemAsync.mockRejectedValue(new Error("keychain locked"));
  mocks.deleteItemAsync.mockRejectedValue(new Error("keychain locked"));
});

afterEach(() => {
  clearSessionMemory();
  vi.clearAllMocks();
});

describe("native session recovery", () => {
  it("creates and retains a playable identity if secure storage is temporarily unavailable", async () => {
    const first = await getIdentity();
    const second = await getIdentity();
    expect(first).toEqual(second);
    expect(first.playerId).toBe("native-test-player");
  });

  it("keeps the active room credential available for the current launch", async () => {
    const session = { playerId: "native-test-player", seat: 1 as const, seatToken: "fresh-token" };
    await saveRoomSession("ABC234", session);
    expect(await getRoomSession("ABC234")).toEqual(session);

    await removeRoomSession("ABC234");
    expect(await getRoomSession("ABC234")).toBeNull();
  });
});
