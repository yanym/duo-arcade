import { describe, expect, it } from "vitest";

import {
  GOMOKU_CELL_COUNT,
  createGomokuState,
  findWinningLine,
  finishByTimeout,
  placeStone,
  toCellIndex,
  type GomokuState,
  type Piece,
} from "../src/index";

function boardWith(cells: Array<[number, number]>): Piece[] {
  const board = Array.from({ length: GOMOKU_CELL_COUNT }, () => 0 as Piece);
  for (const [row, col] of cells) {
    board[toCellIndex(row, col)] = 1;
  }
  return board;
}

describe("gomoku rules", () => {
  it("detects five on every axis", () => {
    const cases: Array<Array<[number, number]>> = [
      [[7, 3], [7, 4], [7, 5], [7, 6], [7, 7]],
      [[3, 7], [4, 7], [5, 7], [6, 7], [7, 7]],
      [[3, 3], [4, 4], [5, 5], [6, 6], [7, 7]],
      [[3, 9], [4, 8], [5, 7], [6, 6], [7, 5]],
    ];

    for (const positions of cases) {
      const [lastRow, lastCol] = positions[positions.length - 1] ?? [-1, -1];
      expect(findWinningLine(boardWith(positions), lastRow, lastCol, 1)).toHaveLength(5);
    }
  });

  it("accepts six in a row in casual rules", () => {
    const cells: Array<[number, number]> = [
      [2, 2], [2, 3], [2, 4], [2, 5], [2, 6], [2, 7],
    ];
    expect(findWinningLine(boardWith(cells), 2, 4, 1)).toHaveLength(6);
  });

  it("rejects an occupied cell and the wrong turn", () => {
    const start = createGomokuState(0, 1_000);
    const first = placeStone(start, 0, 7, 7, 2_000);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    expect(placeStone(first.state, 0, 7, 8, 3_000)).toEqual({
      ok: false,
      reason: "not_your_turn",
    });
    expect(placeStone(first.state, 1, 7, 7, 3_000)).toEqual({
      ok: false,
      reason: "cell_occupied",
    });
  });

  it("uses the server deadline for timeout", () => {
    const start = createGomokuState(1, 1_000, 5_000);
    const expired = finishByTimeout(start, 6_000);
    expect(expired.result).toEqual({ kind: "win", winnerSeat: 0, reason: "timeout" });
  });

  it("locks a completed game", () => {
    const complete: GomokuState = {
      ...createGomokuState(0, 1_000),
      result: { kind: "win", winnerSeat: 0, reason: "five_in_a_row" },
    };
    expect(placeStone(complete, 1, 0, 0, 2_000)).toEqual({
      ok: false,
      reason: "game_finished",
    });
  });
});
