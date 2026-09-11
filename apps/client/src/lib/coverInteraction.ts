import type { CoverHuntViewState, Seat } from "@duo/game-core";
import type { RoomPhase } from "@duo/protocol";

/** An exhausted scan must never silently become the player's only shot. */
export function coverAction(
  game: Pick<CoverHuntViewState, "phase" | "hunterSeat" | "scanCharges" | "result">,
  ownSeat: Seat,
  phase: RoomPhase,
  tool: "scan" | "shoot",
): "hide" | "scan" | "shoot" | null {
  if (phase !== "playing" || game.result) return null;
  const isHunter = ownSeat === game.hunterSeat;
  if (game.phase === "hiding") return isHunter ? null : "hide";
  if (game.phase !== "hunting" || !isHunter) return null;
  return tool === "shoot" ? "shoot" : game.scanCharges > 0 ? "scan" : null;
}

/** Percentage positions keep every cover separate, including six-cover games. */
export function coverPlacement(index: number, covers: number, compact: boolean) {
  const columns = Math.ceil(covers / 2);
  return compact
    ? { left: 4 + (index % columns) * (92 / columns), bottom: index < columns ? 52 : 16, width: 92 / columns - 3, height: 30 }
    : { left: 3 + index * (79 / (covers - 1)), bottom: 16, width: 15, height: 45 };
}
