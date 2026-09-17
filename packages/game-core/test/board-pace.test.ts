import { describe, expect, it } from "vitest";
import { applyGameAction, createGameState, DEFAULT_GAME_OPTIONS, GAME_PACES, getReversiLegalMoves, turnDurationForPace, type GameState } from "../src/index";

describe("board-game pace across turns", () => {
  for (const gameId of ["gomoku", "reversi"] as const) {
    it.each(GAME_PACES)(`${gameId} preserves %s time after every move and serialization`, (pace) => {
      let now = 1000;
      let game = createGameState(gameId, 0, now, 42, { ...DEFAULT_GAME_OPTIONS, pace });
      const duration = turnDurationForPace(pace);
      expect(game.turnDeadline - now).toBe(duration);
      let passes = 0;
      for (let move = 0; move < (gameId === "reversi" ? 60 : 8) && !game.result; move++) {
        game = JSON.parse(JSON.stringify(game)) as GameState;
        if (game.kind !== "gomoku" && game.kind !== "reversi") throw new Error("Wrong game");
        now += 1000;
        const cell = game.kind === "reversi" ? getReversiLegalMoves(game, game.currentSeat)[0]! : move;
        const action = game.kind === "reversi"
          ? { kind: "place_disc" as const, row: Math.floor(cell / 8), col: cell % 8 }
          : { kind: "place_stone" as const, row: Math.floor(cell / 15), col: cell % 15 };
        const outcome = applyGameAction(game, game.currentSeat, action, now);
        expect(outcome.ok).toBe(true);
        if (!outcome.ok) throw new Error(outcome.reason);
        game = outcome.state;
        if (game.kind === "reversi" && game.passedSeat !== null) passes++;
        if (!game.result) expect(game.turnDeadline - now).toBe(duration);
      }
      if (gameId === "reversi") {
        expect(game.result).not.toBeNull();
        expect(passes).toBeGreaterThan(0);
      }
    });
  }
});
