import { describe, expect, it } from "vitest";

import { createReversiState, getReversiLegalMoves, placeDisc } from "../src/index";

describe("reversi rules", () => {
  it("exposes the four legal opening moves", () => {
    const game = createReversiState(0, 1_000);
    expect(getReversiLegalMoves(game, 0)).toEqual([19, 26, 37, 44]);
  });

  it("places a disc, flips the enclosed line, and changes turn", () => {
    const game = createReversiState(0, 1_000);
    const outcome = placeDisc(game, 0, 2, 3, 2_000);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok || outcome.state.kind !== "reversi") return;
    expect(outcome.state.board[19]).toBe(1);
    expect(outcome.state.board[27]).toBe(1);
    expect(outcome.state.currentSeat).toBe(1);
  });

  it("rejects a move that encloses no opposing disc", () => {
    const game = createReversiState(0, 1_000);
    expect(placeDisc(game, 0, 0, 0, 2_000)).toEqual({ ok: false, reason: "illegal_move" });
  });
});
