import { describe, expect, it } from "vitest";

import {
  advanceCoverHuntClock,
  createCoverHuntState,
  getCoverHuntView,
  hideBehindCover,
  scanCover,
  shootCover,
  type CoverHuntState,
  type GameOptions,
} from "../src/index";

const options: GameOptions = { pace: "standard", difficulty: "standard", length: "short" };

function stateOf(result: ReturnType<typeof hideBehindCover> | ReturnType<typeof scanCover> | ReturnType<typeof shootCover>): CoverHuntState {
  if (!result.ok || result.state.kind !== "cover_hunt") throw new Error("expected cover hunt state");
  return result.state;
}

describe("cover hunt", () => {
  for (const difficulty of ["easy", "standard", "hard"] as const) {
    it(`preserves a usable clue budget for both hunters in ${difficulty} mode`, () => {
      let state = createCoverHuntState(0, 1_000, { ...options, difficulty });
      const budget = difficulty === "easy" ? 2 : 1;
      for (let round = 0; round < 2; round++) {
        const hunter = state.hunterSeat;
        expect(state.scanCharges).toBe(budget);
        state = stateOf(hideBehindCover(state, hunter === 0 ? 1 : 0, 0, state.turnDeadline - 1));
        for (let scan = 0; scan < budget; scan++) {
          state = stateOf(scanCover(state, hunter, 0, state.turnDeadline - 1));
          expect(state.scanFeedback).toEqual({ cover: 0, signal: "hot" });
        }
        expect(scanCover(state, hunter, 0, state.turnDeadline - 1)).toEqual({ ok: false, reason: "no_scans_left" });
        state = stateOf(shootCover(state, hunter, 0, state.turnDeadline - 1));
        expect(state.roundOutcome).toBe("hit");
        state = advanceCoverHuntClock(state, state.turnDeadline);
      }
      expect(state.scores).toEqual([1, 1]);
    });
  }

  it("keeps the hiding spot and scan signal private to the correct player", () => {
    let state = createCoverHuntState(0, 1_000, options);
    state = stateOf(hideBehindCover(state, 1, 3, 1_200));

    expect(getCoverHuntView(state, 0).hiddenSpot).toBeNull();
    expect(getCoverHuntView(state, null).hiddenSpot).toBeNull();
    expect(getCoverHuntView(state, 1).hiddenSpot).toBe(3);

    state = stateOf(scanCover(state, 0, 2, 1_400));
    expect(getCoverHuntView(state, 0).scanFeedback).toEqual({ cover: 2, signal: "warm" });
    expect(getCoverHuntView(state, 1).scanFeedback).toBeNull();
  });

  it("validates roles and completes a best-of-three with alternating hunters", () => {
    let state = createCoverHuntState(0, 1_000, options);
    expect(hideBehindCover(state, 0, 2, 1_100)).toEqual({ ok: false, reason: "wrong_role" });

    state = stateOf(hideBehindCover(state, 1, 2, 1_100));
    expect(shootCover(state, 1, 2, 1_200)).toEqual({ ok: false, reason: "wrong_role" });
    state = stateOf(shootCover(state, 0, 2, 1_300));
    expect(state.scores).toEqual([1, 0]);
    expect(getCoverHuntView(state, 0).hiddenSpot).toBe(2);

    state = advanceCoverHuntClock(state, state.turnDeadline);
    expect([state.round, state.hunterSeat, state.phase]).toEqual([2, 1, "hiding"]);
    state = stateOf(hideBehindCover(state, 0, 0, state.turnDeadline - 10));
    state = stateOf(shootCover(state, 1, 1, state.turnDeadline - 10));
    expect(state.scores).toEqual([2, 0]);
    expect(state.result).toEqual({ kind: "win", winnerSeat: 0, reason: "cover_hunt_score" });
  });

  it("awards hide and hunt timeouts to the correct role", () => {
    let state = createCoverHuntState(0, 10_000, options);
    state = advanceCoverHuntClock(state, state.turnDeadline);
    expect([state.roundOutcome, state.roundWinner]).toEqual(["hide_timeout", 0]);

    state = advanceCoverHuntClock(state, state.turnDeadline);
    state = stateOf(hideBehindCover(state, 0, 1, state.turnDeadline - 1));
    state = advanceCoverHuntClock(state, state.turnDeadline);
    expect([state.roundOutcome, state.roundWinner]).toEqual(["hunt_timeout", 0]);
  });
});
