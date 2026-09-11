import { describe, expect, it } from "vitest";
import type { RoomView } from "@duo/protocol";
import { roomControlConfirmed, type PendingRoomControl } from "./roomControl";

const room = {
  phase: "ready", round: 1, rematchVotes: [],
  players: [{ seat: 0, ready: false }, { seat: 1, ready: true }],
} as unknown as RoomView;
const ready: PendingRoomControl = { kind: "ready", value: true, seat: 0, round: 1 };

describe("multiplayer control acknowledgement", () => {
  it("does not accept only a partner's ready state", () => {
    expect(roomControlConfirmed(ready, room)).toBe(false);
  });
  it("accepts our ready state or the resulting game start", () => {
    expect(roomControlConfirmed({ ...ready, seat: 1 }, room)).toBe(true);
    expect(roomControlConfirmed(ready, { ...room, phase: "playing" })).toBe(true);
  });
  it("waits for ready cancellation to reach the server", () => {
    expect(roomControlConfirmed({ ...ready, seat: 1, value: false }, room)).toBe(false);
    expect(roomControlConfirmed({ ...ready, value: false }, room)).toBe(true);
  });
  it("does not accept a partner's rematch vote as our own", () => {
    const control = { ...ready, kind: "rematch" as const };
    expect(roomControlConfirmed(control, { ...room, rematchVotes: [1] })).toBe(false);
    expect(roomControlConfirmed(control, { ...room, rematchVotes: [0] })).toBe(true);
  });
  it("accepts the new round even when rematch votes have been reset", () => {
    expect(roomControlConfirmed({ ...ready, kind: "rematch" }, { ...room, round: 2 })).toBe(true);
  });
  it("acknowledges resignation only after the room reaches its result", () => {
    const resign: PendingRoomControl = { kind: "resign", seat: 0, round: 1 };
    expect(roomControlConfirmed(resign, room)).toBe(false);
    expect(roomControlConfirmed(resign, { ...room, phase: "completed" })).toBe(true);
  });
});
