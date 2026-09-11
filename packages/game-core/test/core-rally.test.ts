import { describe, expect, it } from "vitest";

import {
  advanceCoreRallyClock,
  createCoreRallyState,
  moveCorePaddle,
  returnCoreRally,
  type CoreRallyState,
  type GameOptions,
} from "../src/index";

const options: GameOptions = { pace: "standard", difficulty: "standard", length: "short" };

function unwrap(result: ReturnType<typeof moveCorePaddle> | ReturnType<typeof returnCoreRally>): CoreRallyState {
  if (!result.ok || result.state.kind !== "core_rally") throw new Error("expected core rally state");
  return result.state;
}

function align(state: CoreRallyState, now: number): CoreRallyState {
  let next = state;
  while (next.paddleLanes[next.receiverSeat] !== next.incomingLane) {
    const direction = next.paddleLanes[next.receiverSeat] < next.incomingLane ? 1 : -1;
    next = unwrap(moveCorePaddle(next, next.receiverSeat, direction, now));
  }
  return next;
}

describe("core rally", () => {
  it("uses deterministic lanes and maps all three option axes", () => {
    const first = createCoreRallyState(0, 1_000, 42, options);
    const second = createCoreRallyState(0, 1_000, 42, options);
    expect(first).toEqual(second);
    expect([first.targetReturns, first.laneCount, first.maxStability]).toEqual([6, 4, 3]);
    const hard = createCoreRallyState(1, 0, 7, { pace: "blitz", difficulty: "hard", length: "long" });
    expect([hard.targetReturns, hard.laneCount, hard.maxStability, hard.flightDurationMs, hard.returnWindowMs])
      .toEqual([14, 5, 2, 1_400, 650]);
  });

  it("enforces receiver ownership, lane edges and the server return window", () => {
    let state = createCoreRallyState(0, 1_000, 3, options);
    expect(moveCorePaddle(state, 1, 1, 1_100)).toEqual({ ok: false, reason: "wrong_role" });
    state = { ...state, paddleLanes: [0, state.paddleLanes[1]] };
    expect(moveCorePaddle(state, 0, -1, 1_100)).toEqual({ ok: false, reason: "paddle_edge" });
    expect(returnCoreRally(state, 0, 1_100)).toEqual({ ok: false, reason: "too_early" });
    state = advanceCoreRallyClock(state, state.turnDeadline);
    expect(state.phase).toBe("return_window");
    expect(returnCoreRally(state, 1, state.strikeAt)).toEqual({ ok: false, reason: "wrong_role" });
  });

  it("returns an aligned core, scores timing, and swaps the receiver", () => {
    let state = align(createCoreRallyState(0, 1_000, 11, options), 1_100);
    state = advanceCoreRallyClock(state, state.turnDeadline);
    state = unwrap(returnCoreRally(state, 0, state.strikeAt));
    expect([state.lastOutcome, state.successfulReturns, state.combo, state.stability]).toEqual(["returned", 1, 1, 3]);
    expect(state.score).toBeGreaterThan(200);
    state = advanceCoreRallyClock(state, state.turnDeadline);
    expect([state.phase, state.receiverSeat, state.rally]).toEqual(["approach", 1, 2]);
  });

  it("loses stability for a wrong lane or timeout and eventually fails", () => {
    let state = createCoreRallyState(0, 1_000, 19, { ...options, difficulty: "hard" });
    state = { ...state, paddleLanes: [state.incomingLane === 0 ? 1 : 0, state.paddleLanes[1]] };
    state = advanceCoreRallyClock(state, state.turnDeadline);
    state = unwrap(returnCoreRally(state, 0, state.strikeAt));
    expect([state.lastOutcome, state.stability]).toEqual(["missed_lane", 1]);
    state = advanceCoreRallyClock(state, state.turnDeadline);
    state = advanceCoreRallyClock(state, state.turnDeadline);
    state = advanceCoreRallyClock(state, state.turnDeadline);
    expect(state.result).toEqual({ kind: "failure", score: 0, reason: "core_lost" });
  });

  it("can complete a full cooperative rally", () => {
    let state = createCoreRallyState(0, 1_000, 31, { ...options, difficulty: "easy" });
    while (!state.result) {
      state = align(state, state.turnDeadline - 1);
      state = advanceCoreRallyClock(state, state.turnDeadline);
      state = unwrap(returnCoreRally(state, state.receiverSeat, state.strikeAt));
      if (!state.result) state = advanceCoreRallyClock(state, state.turnDeadline);
    }
    expect(state.result.kind).toBe("success");
    expect(state.successfulReturns).toBe(state.targetReturns);
    expect(state.bestCombo).toBe(state.targetReturns);
  });
});
