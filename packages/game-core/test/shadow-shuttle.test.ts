import { describe, expect, it } from "vitest";

import {
  advanceShadowShuttleClock,
  createShadowShuttleState,
  getShadowShuttleView,
  guessShadowPod,
  markShadowPod,
  type GameOptions,
  type ShadowShuttleState,
} from "../src/index";

const options: GameOptions = { pace: "standard", difficulty: "standard", length: "short" };

function unwrap(result: ReturnType<typeof markShadowPod> | ReturnType<typeof guessShadowPod>): ShadowShuttleState {
  if (!result.ok || result.state.kind !== "shadow_shuttle") throw new Error("expected shadow shuttle state");
  return result.state;
}

function finishShuffle(state: ShadowShuttleState): ShadowShuttleState {
  let next = advanceShadowShuttleClock(state, state.turnDeadline);
  while (next.phase === "shuffling") next = advanceShadowShuttleClock(next, next.turnDeadline);
  return next;
}

describe("shadow shuttle", () => {
  it("reveals the marked pod for memorizing, then hides it during shuffling", () => {
    let state = createShadowShuttleState(0, 1_000, 41, options);
    state = unwrap(markShadowPod(state, 0, 2, 1_100));
    expect(state.phase).toBe("memorizing");
    expect(getShadowShuttleView(state, 1).targetPod).toBe(state.targetPod);
    expect(getShadowShuttleView(state, null).targetPod).toBeNull();

    state = advanceShadowShuttleClock(state, state.turnDeadline);
    expect(state.phase).toBe("shuffling");
    expect(getShadowShuttleView(state, 0).targetPod).toBe(state.targetPod);
    expect(getShadowShuttleView(state, 1).targetPod).toBeNull();
  });

  it("applies every deterministic swap and awards a correct guess", () => {
    let state = createShadowShuttleState(0, 1_000, 53, options);
    state = unwrap(markShadowPod(state, 0, 3, 1_100));
    state = finishShuffle(state);
    expect(state.phase).toBe("guessing");
    expect(state.shuffleStep).toBe(state.shufflePlan.length);
    const correctSlot = state.permutation.indexOf(state.targetPod!);
    state = unwrap(guessShadowPod(state, 1, correctSlot, state.turnDeadline - 1));
    expect([state.roundOutcome, state.roundWinner, state.scores]).toEqual(["found", 1, [0, 1]]);
    expect(getShadowShuttleView(state, 1).targetPod).not.toBeNull();
  });

  it("awards the round to the infiltrator after a wrong guess and swaps roles", () => {
    let state = createShadowShuttleState(0, 1_000, 67, options);
    state = finishShuffle(unwrap(markShadowPod(state, 0, 0, 1_100)));
    const correctSlot = state.permutation.indexOf(state.targetPod!);
    state = unwrap(guessShadowPod(state, 1, (correctSlot + 1) % state.podCount, state.turnDeadline - 1));
    expect([state.roundOutcome, state.roundWinner]).toEqual(["escaped", 0]);
    state = advanceShadowShuttleClock(state, state.turnDeadline);
    expect([state.round, state.infiltratorSeat, state.phase]).toEqual([2, 1, "marking"]);
  });

  it("enforces roles and resolves both decision timeouts", () => {
    let state = createShadowShuttleState(0, 1_000, 79, options);
    expect(markShadowPod(state, 1, 0, 1_100)).toEqual({ ok: false, reason: "wrong_role" });
    state = advanceShadowShuttleClock(state, state.turnDeadline);
    expect([state.roundOutcome, state.roundWinner]).toEqual(["mark_timeout", 1]);

    state = createShadowShuttleState(0, 1_000, 83, options);
    state = finishShuffle(unwrap(markShadowPod(state, 0, 1, 1_100)));
    state = advanceShadowShuttleClock(state, state.turnDeadline);
    expect([state.roundOutcome, state.roundWinner]).toEqual(["guess_timeout", 0]);
  });
});
