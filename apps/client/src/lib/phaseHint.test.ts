import { describe, expect, it } from "vitest";
import { createGameState, DEFAULT_GAME_OPTIONS, PLAYABLE_GAME_IDS, type Seat } from "@duo/game-core";
import { phaseHint } from "./phaseHint";
import { translate } from "../i18n";

describe("room lifecycle guidance", () => {
  it("does not tell expert Pulse players to budget resources that do not exist", () => {
    const game = createGameState("pulse_pass", 0, 1000, 42, { ...DEFAULT_GAME_OPTIONS, difficulty: "hard" });
    const hint = translate(phaseHint({ gameId: "pulse_pass", game, phase: "playing", mode: "duo", rematchVotes: [] }, 0), "en");
    expect(hint).toContain("No vents at this difficulty");
    expect(hint).not.toContain("limited for the whole match");
  });
  for (const gameId of PLAYABLE_GAME_IDS) {
    const room: Parameters<typeof phaseHint>[0] = { gameId, game: createGameState(gameId, 0, 1000, 42), phase: "completed", mode: "duo", rematchVotes: [] };
    for (const ownSeat of [0, 1] as Seat[]) {
      it(`${gameId}: seat ${ownSeat} sees whose rematch decision is pending`, () => {
        expect(phaseHint({ ...room, rematchVotes: [ownSeat] }, ownSeat)).toBe("你的重赛意愿已同步，正在等待对方回应");
        expect(phaseHint({ ...room, rematchVotes: [ownSeat === 0 ? 1 : 0] }, ownSeat)).toBe("对方已经同意重赛，现在轮到你决定");
        expect(phaseHint(room, ownSeat)).toBe("看看结果，或者两人同意再来一局");
        expect(phaseHint({ ...room, mode: "ai" }, ownSeat)).toBe("查看结果，或立即和 AI 再来一局");
      });
    }
    it(`${gameId}: recovery takes priority over gameplay instructions`, () => {
      expect(phaseHint({ ...room, phase: "reconnect_grace" }, 0)).toBe("等待好友回来；倒计时结束后本局会自动结算");
    });
  }
});
