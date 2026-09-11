import { describe, expect, it } from "vitest";

import { createSyncTapState, tapInSync } from "../src/index";

describe("sync tap rules", () => {
  it("rejects early taps and records only one tap per player", () => {
    const game = createSyncTapState(1_000);
    expect(tapInSync(game, 0, 2_000)).toEqual({ ok: false, reason: "too_early" });
    const first = tapInSync(game, 0, 3_600);
    expect(first.ok).toBe(true);
    if (!first.ok || first.state.kind !== "sync_tap") return;
    expect(tapInSync(first.state, 0, 3_700)).toEqual({ ok: false, reason: "already_tapped" });
  });

  it("scores the server-side delta and advances a round", () => {
    const game = createSyncTapState(1_000);
    const first = tapInSync(game, 0, 3_600);
    if (!first.ok || first.state.kind !== "sync_tap") throw new Error("first tap failed");
    const second = tapInSync(first.state, 1, 3_720);
    expect(second.ok).toBe(true);
    if (!second.ok || second.state.kind !== "sync_tap") return;
    expect(second.state.lastDeltaMs).toBe(120);
    expect(second.state.roundScores).toEqual([90]);
    expect(second.state.round).toBe(2);
  });

  it("returns the average after round five", () => {
    const game = {
      ...createSyncTapState(1_000),
      round: 5,
      roundScores: [90, 80, 70, 60],
    };
    const first = tapInSync(game, 0, 3_600);
    if (!first.ok || first.state.kind !== "sync_tap") throw new Error("first tap failed");
    const second = tapInSync(first.state, 1, 3_600);
    expect(second.ok).toBe(true);
    if (!second.ok || second.state.kind !== "sync_tap") return;
    expect(second.state.result).toEqual({ kind: "success", score: 80, reason: "rounds_complete" });
  });
});
