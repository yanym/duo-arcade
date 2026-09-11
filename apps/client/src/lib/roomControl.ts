import type { RoomView } from "@duo/protocol";

type PendingRoomControlBase = {
  seat: 0 | 1;
  round: number;
};

export type PendingRoomControl = PendingRoomControlBase & (
  | { kind: "ready" | "rematch"; value: boolean }
  | { kind: "resign" }
);

/** A partner's snapshot is not an acknowledgement of our own choice. */
export function roomControlConfirmed(control: PendingRoomControl, room: Pick<RoomView, "phase" | "round" | "players" | "rematchVotes">): boolean {
  if (control.kind === "ready") {
    return (room.phase !== "waiting" && room.phase !== "ready") || room.players[control.seat]?.ready === control.value;
  }
  if (control.kind === "resign") return room.phase === "completed" || room.round !== control.round;
  return room.round !== control.round || room.rematchVotes.includes(control.seat) === control.value;
}
