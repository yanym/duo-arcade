import { describe, expect, it } from "vitest";

import {
  advanceNeonDashClock,
  createNeonDashState,
  dodgeNeonObstacle,
  getNeonDashView,
  requiredMoveForObstacle,
  shiftGameClock,
  type GameOptions,
  type NeonDashState,
} from "../src/index";

const options: GameOptions = { pace: "standard", difficulty: "standard", length: "short" };

function unwrap(result: ReturnType<typeof dodgeNeonObstacle>): NeonDashState {
  if (!result.ok || result.state.kind !== "neon_dash") throw new Error("expected neon dash state");
  return result.state;
}

function reveal(state: NeonDashState): NeonDashState {
  return advanceNeonDashClock(state, state.turnDeadline);
}

describe("neon dash", () => {
  it("maps option axes and starts behind a deterministic random signal", () => {
    const state = createNeonDashState(1_000, 42, options);
    expect(createNeonDashState(1_000, 42, options)).toEqual(state);
    expect([state.totalRounds, state.availableMoves.length, state.maxLives, state.responseWindowMs])
      .toEqual([5, 4, 3, 2_200]);
    expect(state.obstacle).toBeNull();
    expect(state.countdownMs).toBeGreaterThanOrEqual(1_600);
    expect(state.countdownMs).toBeLessThanOrEqual(2_050);

    const easy = createNeonDashState(0, 7, { pace: "relaxed", difficulty: "easy", length: "long" });
    const hard = createNeonDashState(0, 7, { pace: "blitz", difficulty: "hard", length: "standard" });
    expect([easy.totalRounds, easy.availableMoves, easy.maxLives, easy.responseWindowMs])
      .toEqual([9, ["jump", "slide"], 4, 3_000]);
    expect([hard.totalRounds, hard.availableMoves.length, hard.maxLives, hard.responseWindowMs])
      .toEqual([7, 5, 2, 1_600]);
  });

  it("rejects anticipation, unavailable moves and duplicate responses", () => {
    let state = createNeonDashState(0, 3, { ...options, difficulty: "easy" });
    expect(dodgeNeonObstacle(state, 0, "jump", 10)).toEqual({ ok: false, reason: "too_early" });
    state = reveal(state);
    expect(dodgeNeonObstacle(state, 0, "brake", state.signalStartedAt + 1)).toEqual({ ok: false, reason: "invalid_move" });
    state = unwrap(dodgeNeonObstacle(state, 0, requiredMoveForObstacle(state.obstacle!), state.signalStartedAt + 100));
    expect(dodgeNeonObstacle(state, 0, "jump", state.signalStartedAt + 200)).toEqual({ ok: false, reason: "already_chosen" });
  });

  it("keeps each response private until both runners finish", () => {
    let state = reveal(createNeonDashState(0, 11, options));
    const correct = requiredMoveForObstacle(state.obstacle!);
    state = unwrap(dodgeNeonObstacle(state, 0, correct, state.signalStartedAt + 120));
    expect(getNeonDashView(state, 0).responses[0]?.move).toBe(correct);
    expect(getNeonDashView(state, 0).responses[1]).toBeNull();
    expect(getNeonDashView(state, 1).responses).toEqual([null, null]);
    expect(getNeonDashView(state, null).responses).toEqual([null, null]);
    state = unwrap(dodgeNeonObstacle(state, 1, correct, state.signalStartedAt + 300));
    expect(getNeonDashView(state, 0).responses[1]?.reactionMs).toBe(300);
  });

  it("scores accuracy first, speed second, and applies a 40ms fair tie", () => {
    let state = reveal(createNeonDashState(0, 17, options));
    const correct = requiredMoveForObstacle(state.obstacle!);
    state = unwrap(dodgeNeonObstacle(state, 0, correct, state.signalStartedAt + 100));
    state = unwrap(dodgeNeonObstacle(state, 1, correct, state.signalStartedAt + 130));
    expect([state.roundWinner, state.roundOutcome, state.scores[0], state.scores[1]])
      .toEqual([null, "photo_finish", 1, 1]);

    state = reveal(state);
    state = reveal(state);
    const required = requiredMoveForObstacle(state.obstacle!);
    const wrong = state.availableMoves.find((move) => move !== required)!;
    state = unwrap(dodgeNeonObstacle(state, 0, required, state.signalStartedAt + 500));
    state = unwrap(dodgeNeonObstacle(state, 1, wrong, state.signalStartedAt + 50));
    expect([state.roundWinner, state.roundOutcome, state.scores, state.lives])
      .toEqual([0, "single_clear", [3, 1], [3, 2]]);
  });

  it("treats unanswered windows as crashes and resets the next round", () => {
    let state = reveal(createNeonDashState(0, 23, options));
    state = advanceNeonDashClock(state, state.turnDeadline);
    expect([state.roundOutcome, state.lives, state.combos]).toEqual(["dash_timeout", [2, 2], [0, 0]]);
    state = advanceNeonDashClock(state, state.turnDeadline);
    expect([state.phase, state.round, state.obstacle, state.locked]).toEqual(["countdown", 2, null, [false, false]]);
  });

  it("moves the private reaction clock when a disconnect pauses play", () => {
    let state = reveal(createNeonDashState(0, 29, options));
    const oldSignal = state.signalStartedAt;
    state = shiftGameClock(state, state.turnDeadline + 5_000);
    expect(state.signalStartedAt).toBe(oldSignal + 5_000);
    const move = requiredMoveForObstacle(state.obstacle!);
    state = unwrap(dodgeNeonObstacle(state, 0, move, state.signalStartedAt + 250));
    expect(state.responses[0]?.reactionMs).toBe(250);
  });

  it("can complete a full race with combos and a clear winner", () => {
    let state = createNeonDashState(0, 37, { ...options, difficulty: "easy" });
    while (!state.result) {
      state = reveal(state);
      const move = requiredMoveForObstacle(state.obstacle!);
      state = unwrap(dodgeNeonObstacle(state, 0, move, state.signalStartedAt + 100));
      state = unwrap(dodgeNeonObstacle(state, 1, move, state.signalStartedAt + 300));
      if (!state.result) state = advanceNeonDashClock(state, state.turnDeadline);
    }
    expect([state.result.kind, state.result.reason]).toEqual(["win", "neon_dash_score"]);
    if (state.result.kind !== "win") throw new Error("expected a race winner");
    expect(state.result.winnerSeat).toBe(0);
    expect(state.bestCombos).toEqual([5, 5]);
    expect(state.scores).toEqual([10, 5]);
  });
});
