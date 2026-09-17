import { GAME_IDS, type GameId } from "./types";

/** IDs remain decodable for saved rooms, but only this curated set can start a new room. */
export const PLAYABLE_GAME_IDS = [
  "ember_crew",
  "gomoku", "reversi", "cover_hunt", "quantum_duel", "meteor_dash",
  "neon_dash", "signal_bluff", "nova_volley", "pulse_pass",
] as const satisfies readonly GameId[];

export function isPlayableGameId(value: unknown): value is GameId {
  return typeof value === "string" && (PLAYABLE_GAME_IDS as readonly string[]).includes(value);
}

export const RETIRED_GAME_IDS = GAME_IDS.filter((id) => !isPlayableGameId(id));
