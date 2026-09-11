import { describe, expect, it } from "vitest";

import {
  advanceTrajectoryInterceptClock,
  captureTrajectory,
  createTrajectoryInterceptState,
  getTrajectoryInterceptView,
  moveInterceptCursor,
  type GameOptions,
  type Seat,
  type TrajectoryInterceptState,
} from "../src/index";

const options: GameOptions = { pace: "standard", difficulty: "standard", length: "short" };

function unwrap(result: ReturnType<typeof moveInterceptCursor> | ReturnType<typeof captureTrajectory>): TrajectoryInterceptState {
  if (!result.ok || result.state.kind !== "trajectory_intercept") throw new Error("expected trajectory intercept state");
  return result.state;
}

function align(state: TrajectoryInterceptState, seat: Seat, target: number, now: number): TrajectoryInterceptState {
  let next = state;
  while (next.cursors[seat] !== target) {
    const direction = next.cursors[seat] < target ? 1 : -1;
    next = unwrap(moveInterceptCursor(next, seat, direction, now));
  }
  return next;
}

describe("trajectory intercept", () => {
  it("maps options and delays the deterministic target signal", () => {
    const state = createTrajectoryInterceptState(1_000, 42, options);
    expect([state.totalRounds, state.laneCount, state.baseCountdownMs, state.interceptWindowMs]).toEqual([5, 7, 1_900, 3_800]);
    expect(state.targetLane).toBeNull();
    expect(state.countdownMs).toBeGreaterThanOrEqual(1_900);
    expect(state.countdownMs).toBeLessThan(2_550);
    const signaled = advanceTrajectoryInterceptClock(state, state.turnDeadline);
    expect(signaled.phase).toBe("intercepting");
    expect(signaled.targetLane).toBeGreaterThanOrEqual(0);
    expect(signaled.targetLane).toBeLessThan(7);
    expect(createTrajectoryInterceptState(1_000, 42, options)).toEqual(state);
  });

  it("keeps cursor positions and responses private until reveal", () => {
    let state = createTrajectoryInterceptState(1_000, 7, options);
    state = advanceTrajectoryInterceptClock(state, state.turnDeadline);
    expect(getTrajectoryInterceptView(state, 0).cursors).toEqual([state.cursors[0], null]);
    expect(getTrajectoryInterceptView(state, 1).cursors).toEqual([null, state.cursors[1]]);
    expect(getTrajectoryInterceptView(state, null).cursors).toEqual([null, null]);
    state = unwrap(captureTrajectory(state, 0, state.interceptStartedAt + 200));
    expect(getTrajectoryInterceptView(state, 0).responses[0]).not.toBeNull();
    expect(getTrajectoryInterceptView(state, 1).responses[0]).toBeNull();
  });

  it("rejects early, invalid, edge and post-lock movement", () => {
    let state = createTrajectoryInterceptState(1_000, 8, options);
    expect(moveInterceptCursor(state, 0, 1, 1_100)).toEqual({ ok: false, reason: "too_early" });
    state = advanceTrajectoryInterceptClock(state, state.turnDeadline);
    state = { ...state, cursors: [0, state.cursors[1]] };
    expect(moveInterceptCursor(state, 0, -1, state.interceptStartedAt + 10)).toEqual({ ok: false, reason: "tracker_edge" });
    expect(moveInterceptCursor(state, 0, 0 as -1, state.interceptStartedAt + 10)).toEqual({ ok: false, reason: "invalid_move" });
    state = unwrap(captureTrajectory(state, 0, state.interceptStartedAt + 20));
    expect(moveInterceptCursor(state, 0, 1, state.interceptStartedAt + 30)).toEqual({ ok: false, reason: "already_chosen" });
  });

  it("treats two correct captures within 40ms as a fair draw", () => {
    let state = createTrajectoryInterceptState(1_000, 11, options);
    state = advanceTrajectoryInterceptClock(state, state.turnDeadline);
    state = align(state, 0, state.targetLane!, state.interceptStartedAt + 20);
    state = align(state, 1, state.targetLane!, state.interceptStartedAt + 20);
    state = unwrap(captureTrajectory(state, 0, state.interceptStartedAt + 300));
    state = unwrap(captureTrajectory(state, 1, state.interceptStartedAt + 335));
    expect([state.phase, state.roundOutcome, state.roundWinner]).toEqual(["round_result", "near_tie", null]);
    expect(state.scores).toEqual([0, 0]);
    expect(state.responses[0]?.reactionMs).toBe(300);
  });

  it("awards the only correct interceptor", () => {
    let state = createTrajectoryInterceptState(1_000, 13, options);
    state = advanceTrajectoryInterceptClock(state, state.turnDeadline);
    state = align(state, 0, state.targetLane!, state.interceptStartedAt + 20);
    if (state.cursors[1] === state.targetLane) {
      const direction = state.cursors[1] === 0 ? 1 : -1;
      state = unwrap(moveInterceptCursor(state, 1, direction, state.interceptStartedAt + 20));
    }
    state = unwrap(captureTrajectory(state, 0, state.interceptStartedAt + 400));
    state = unwrap(captureTrajectory(state, 1, state.interceptStartedAt + 200));
    expect([state.roundWinner, state.roundOutcome, state.scores[0]]).toEqual([0, "captured", 1]);
  });

  it("resolves unanswered windows without exposing phantom responses", () => {
    let state = createTrajectoryInterceptState(1_000, 17, options);
    state = advanceTrajectoryInterceptClock(state, state.turnDeadline);
    state = advanceTrajectoryInterceptClock(state, state.turnDeadline);
    expect([state.phase, state.roundOutcome, state.roundWinner]).toEqual(["round_result", "intercept_timeout", null]);
    expect(state.responses).toEqual([null, null]);
  });

  it("advances through every round and produces a match winner", () => {
    let state = createTrajectoryInterceptState(1_000, 23, options);
    while (!state.result) {
      state = advanceTrajectoryInterceptClock(state, state.turnDeadline);
      state = align(state, 0, state.targetLane!, state.interceptStartedAt + 10);
      if (state.cursors[1] === state.targetLane) {
        const direction = state.cursors[1] === state.laneCount - 1 ? -1 : 1;
        state = unwrap(moveInterceptCursor(state, 1, direction, state.interceptStartedAt + 10));
      }
      state = unwrap(captureTrajectory(state, 0, state.interceptStartedAt + 300));
      state = unwrap(captureTrajectory(state, 1, state.interceptStartedAt + 310));
      if (!state.result) state = advanceTrajectoryInterceptClock(state, state.turnDeadline);
    }
    expect(state.result).toEqual({ kind: "win", winnerSeat: 0, reason: "trajectory_intercept_score" });
    expect(state.scores).toEqual([5, 0]);
  });
});
