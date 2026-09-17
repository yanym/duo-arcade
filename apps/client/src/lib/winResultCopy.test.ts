import { describe, expect, it } from "vitest";
import type { GameResult, Seat } from "@duo/game-core";
import { successResultCopy, winResultCopy } from "./winResultCopy";

type Reason = Extract<GameResult, { kind: "win" }>["reason"];
const scoreReasons: Reason[] = [
  "five_in_a_row", "disc_majority", "cover_hunt_score", "quantum_duel_score",
  "rhythm_gravity_score", "shadow_shuttle_score", "meteor_dash_score", "trajectory_intercept_score",
  "neon_dash_score", "signal_bluff_score", "nova_volley_score", "pulse_pass_score",
];

describe("result copy from each player's perspective", () => {
  for (const winnerSeat of [0, 1] as Seat[]) {
    for (const reason of scoreReasons) {
      it(`${reason}, winner seat ${winnerSeat}: identifies who actually led`, () => {
        const result = { kind: "win" as const, winnerSeat, reason };
        expect(winResultCopy(result, winnerSeat).detail.startsWith("你")).toBe(true);
        expect(winResultCopy(result, winnerSeat === 0 ? 1 : 0).detail.startsWith("对方")).toBe(true);
        expect(winResultCopy(result, winnerSeat).title).toBe("你赢了！");
        expect(winResultCopy(result, winnerSeat === 0 ? 1 : 0).title).toBe("对方获胜");
      });
    }
  }
  for (const reason of ["timeout", "resigned", "opponent_left"] as Reason[]) {
    it(`${reason}: attributes interruption to the correct player`, () => {
      const result = { kind: "win" as const, winnerSeat: 0 as const, reason };
      expect(winResultCopy(result, 0).detail.startsWith("对方")).toBe(true);
      expect(winResultCopy(result, 1).detail.startsWith("你")).toBe(true);
      expect(winResultCopy(result, 1).title).toBe("对方获胜");
    });
  }

  it("describes sync-tap's lower-is-better measurement as an error, not a generic score", () => {
    expect(successResultCopy({ kind: "success", score: 78, reason: "rounds_complete" })).toEqual({
      title: "同频挑战完成！",
      detail: "双方平均同步误差：78ms",
    });
  });
});
