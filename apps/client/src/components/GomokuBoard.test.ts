import { describe, expect, it } from "vitest";

import { GOMOKU_SIZE } from "@duo/game-core";

import { nextGomokuFocusIndex } from "@/lib/gomokuKeyboard";

function emptyBoard(): number[] {
  return Array.from({ length: GOMOKU_SIZE * GOMOKU_SIZE }, () => 0);
}

describe("gomoku keyboard navigation", () => {
  it("moves spatially and never wraps across a row edge", () => {
    const board = emptyBoard();
    expect(nextGomokuFocusIndex(board, 7 * GOMOKU_SIZE + 7, "ArrowUp")).toBe(6 * GOMOKU_SIZE + 7);
    expect(nextGomokuFocusIndex(board, 7 * GOMOKU_SIZE + 7, "ArrowRight")).toBe(7 * GOMOKU_SIZE + 8);
    expect(nextGomokuFocusIndex(board, 2 * GOMOKU_SIZE + 14, "ArrowRight")).toBe(2 * GOMOKU_SIZE + 14);
  });

  it("skips occupied cells in the requested direction", () => {
    const board = emptyBoard();
    const current = 7 * GOMOKU_SIZE + 7;
    board[current + 1] = 1;
    board[current + 2] = 2;
    expect(nextGomokuFocusIndex(board, current, "ArrowRight")).toBe(current + 3);
  });

  it("supports row Home and End without focusing occupied intersections", () => {
    const board = emptyBoard();
    const current = 4 * GOMOKU_SIZE + 7;
    board[4 * GOMOKU_SIZE] = 1;
    board[5 * GOMOKU_SIZE - 1] = 2;
    expect(nextGomokuFocusIndex(board, current, "Home")).toBe(4 * GOMOKU_SIZE + 1);
    expect(nextGomokuFocusIndex(board, current, "End")).toBe(5 * GOMOKU_SIZE - 2);
  });

  it("ignores unrelated keys", () => {
    expect(nextGomokuFocusIndex(emptyBoard(), 42, "Escape")).toBe(42);
  });
});
