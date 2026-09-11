import { describe, expect, it } from "vitest";

import {
  advanceRhythmGravityClock,
  createRhythmGravityState,
  getRhythmGravityView,
  tapRhythmGravity,
  type GameOptions,
  type RhythmGravityState,
} from "../src/index";

const options: GameOptions = { pace: "standard", difficulty: "standard", length: "short" };

function unwrap(result: ReturnType<typeof tapRhythmGravity>): RhythmGravityState {
  if (!result.ok || result.state.kind !== "rhythm_gravity") throw new Error("expected rhythm gravity state");
  return result.state;
}

describe("rhythm gravity", () => {
  it("hides the first player's timing until both taps resolve", () => {
    let state = createRhythmGravityState(1_000, options);
    state = unwrap(tapRhythmGravity(state, 0, state.beatAt + 30));
    expect(getRhythmGravityView(state, 0).taps[0]).toBe(30);
    expect(getRhythmGravityView(state, 1).taps[0]).toBeNull();
    expect(getRhythmGravityView(state, null).taps).toEqual([null, null]);

    state = unwrap(tapRhythmGravity(state, 1, state.beatAt + 170));
    expect(state.phase).toBe("round_result");
    expect(state.roundWinner).toBe(0);
    expect(state.corePosition).toBe(1);
    expect(getRhythmGravityView(state, 1).taps).toEqual([30, 170]);
  });

  it("rejects early and duplicate taps", () => {
    let state = createRhythmGravityState(1_000, options);
    expect(tapRhythmGravity(state, 0, state.beatAt - 500)).toEqual({ ok: false, reason: "too_early" });
    state = unwrap(tapRhythmGravity(state, 0, state.beatAt));
    expect(tapRhythmGravity(state, 0, state.beatAt + 10)).toEqual({ ok: false, reason: "already_tapped" });
  });

  it("awards a missed beat to the player who tapped", () => {
    let state = createRhythmGravityState(1_000, options);
    state = unwrap(tapRhythmGravity(state, 1, state.beatAt + 50));
    state = advanceRhythmGravityClock(state, state.turnDeadline);
    expect([state.roundWinner, state.corePosition, state.accuracies[0]]).toEqual([1, -1, null]);
  });

  it("ends a short match when one player pulls the core three steps", () => {
    let state = createRhythmGravityState(1_000, options);
    for (let round = 1; round <= 3; round += 1) {
      state = unwrap(tapRhythmGravity(state, 0, state.beatAt + 5));
      state = unwrap(tapRhythmGravity(state, 1, state.beatAt + 100));
      if (round < 3) state = advanceRhythmGravityClock(state, state.turnDeadline);
    }
    expect(state.result).toEqual({ kind: "win", winnerSeat: 0, reason: "rhythm_gravity_score" });
  });
});
