import { describe, expect, it } from "vitest";
import { GAME_IDS, PLAYABLE_GAME_IDS, RETIRED_GAME_IDS, createGameState, getGameView, isPlayableGameId, DEFAULT_GAME_OPTIONS } from "../src";

describe("curated game library and transport secrecy", () => {
  it("retires instruction-relay games but still decodes saved game states", () => {
    expect(PLAYABLE_GAME_IDS).toHaveLength(10);
    expect(RETIRED_GAME_IDS).toHaveLength(19);
    expect(isPlayableGameId("split_maze")).toBe(false);
    expect(isPlayableGameId("star_trace")).toBe(false);
    expect(isPlayableGameId("ember_crew")).toBe(true);
    expect(isPlayableGameId("unknown")).toBe(false);
    for (const id of GAME_IDS) expect(createGameState(id, 0, 1000, 42, DEFAULT_GAME_OPTIONS).kind).toBe(id);
  });
  it.each(GAME_IDS)("does not send the deterministic secret seed for %s", (id) => {
    const game = createGameState(id, 0, 1000, 9361, DEFAULT_GAME_OPTIONS);
    for (const seat of [0, 1, null] as const) {
      const view = getGameView(game, seat);
      if ("seed" in view) expect(view.seed).toBe(0);
    }
    if ("seed" in game) expect(game.seed).toBe(9361);
  });
});
