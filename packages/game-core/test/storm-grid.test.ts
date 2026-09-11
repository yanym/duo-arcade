import { describe, expect, it } from "vitest";

import {
  advanceStormGridClock,
  createStormGridState,
  dischargeStormGrid,
  getStormGridView,
  shiftGridSelector,
  toggleGridPolarity,
  type GameOptions,
  type StormGridState,
} from "../src/index";

const options: GameOptions = { pace: "standard", difficulty: "standard", length: "short" };

function unwrap(result: ReturnType<typeof shiftGridSelector> | ReturnType<typeof toggleGridPolarity> | ReturnType<typeof dischargeStormGrid>): StormGridState {
  if (!result.ok || result.state.kind !== "storm_grid") throw new Error("expected storm grid state");
  return result.state;
}

function align(state: StormGridState, now: number): StormGridState {
  const operator = state.sensorSeat === 0 ? 1 : 0;
  let next = state;
  while (next.selectorNode !== next.targetNode) next = unwrap(shiftGridSelector(next, operator, 1, now));
  if (next.polarity !== next.targetPolarity) next = unwrap(toggleGridPolarity(next, operator, now));
  return next;
}

describe("storm grid", () => {
  it("maps all room options and generates deterministic targets", () => {
    const state = createStormGridState(1, 1_000, 42, options);
    expect([state.totalWaves, state.nodeCount, state.maxIntegrity, state.chargeDurationMs, state.dischargeWindowMs]).toEqual([4, 5, 3, 6_000, 1_600]);
    expect(state.targetNode).toBeGreaterThanOrEqual(0);
    expect(state.targetNode).toBeLessThan(5);
    expect(createStormGridState(1, 1_000, 42, options)).toEqual(state);
  });

  it("keeps the target node and polarity private to the sensor", () => {
    const state = createStormGridState(0, 1_000, 7, options);
    expect(getStormGridView(state, 0).targetNode).toBe(state.targetNode);
    expect(getStormGridView(state, 0).targetPolarity).toBe(state.targetPolarity);
    expect(getStormGridView(state, 1).targetNode).toBeNull();
    expect(getStormGridView(state, 1).targetPolarity).toBeNull();
    expect(getStormGridView(state, null).targetNode).toBeNull();
  });

  it("lets only the grid operator rotate and toggle the route", () => {
    let state = createStormGridState(0, 1_000, 8, options);
    expect(shiftGridSelector(state, 0, 1, 1_100)).toEqual({ ok: false, reason: "wrong_role" });
    expect(toggleGridPolarity(state, 0, 1_100)).toEqual({ ok: false, reason: "wrong_role" });
    const originalNode = state.selectorNode;
    const originalPolarity = state.polarity;
    state = unwrap(shiftGridSelector(state, 1, -1, 1_100));
    expect(state.selectorNode).toBe((originalNode - 1 + state.nodeCount) % state.nodeCount);
    state = unwrap(toggleGridPolarity(state, 1, 1_200));
    expect(state.polarity).not.toBe(originalPolarity);
    expect(state.totalAdjustments).toBe(2);
  });

  it("opens a server-timed discharge window and rejects early or wrong-role firing", () => {
    let state = createStormGridState(0, 1_000, 11, options);
    expect(dischargeStormGrid(state, 0, 1_100)).toEqual({ ok: false, reason: "too_early" });
    state = advanceStormGridClock(state, state.turnDeadline);
    expect([state.phase, state.windowStartedAt, state.turnDeadline - state.windowStartedAt]).toEqual(["discharge_window", 7_000, 1_600]);
    expect(dischargeStormGrid(state, 1, state.windowStartedAt + 100)).toEqual({ ok: false, reason: "wrong_role" });
  });

  it("stabilizes an aligned route and reveals timing accuracy", () => {
    let state = createStormGridState(0, 1_000, 13, options);
    state = align(state, 1_100);
    state = advanceStormGridClock(state, state.turnDeadline);
    state = unwrap(dischargeStormGrid(state, 0, state.windowStartedAt + state.dischargeWindowMs / 2));
    expect([state.phase, state.waveOutcome, state.stabilizedWaves, state.lastAccuracyMs]).toEqual(["wave_result", "stabilized", 1, 0]);
    expect(state.score).toBeGreaterThan(0);
    expect(getStormGridView(state, 1).targetNode).toBe(state.targetNode);
  });

  it("damages the grid on a bad route or missed discharge", () => {
    let state = createStormGridState(0, 1_000, 17, { ...options, difficulty: "hard" });
    state = { ...state, selectorNode: (state.targetNode + 1) % state.nodeCount };
    state = advanceStormGridClock(state, state.turnDeadline);
    state = unwrap(dischargeStormGrid(state, 0, state.windowStartedAt + 100));
    expect([state.waveOutcome, state.integrity, state.faults]).toEqual(["misrouted", 1, 1]);
    state = advanceStormGridClock(state, state.turnDeadline);
    state = advanceStormGridClock(state, state.turnDeadline);
    state = advanceStormGridClock(state, state.turnDeadline);
    expect(state.result).toEqual({ kind: "failure", score: 0, reason: "grid_collapsed" });
    expect(state.waveOutcome).toBe("surge_timeout");
  });

  it("swaps roles after each wave and can complete a full mission", () => {
    let state = createStormGridState(0, 1_000, 23, options);
    const firstSensor = state.sensorSeat;
    while (!state.result) {
      state = align(state, state.turnDeadline - 100);
      state = advanceStormGridClock(state, state.turnDeadline);
      state = unwrap(dischargeStormGrid(state, state.sensorSeat, state.windowStartedAt + state.dischargeWindowMs / 2));
      if (!state.result) {
        state = advanceStormGridClock(state, state.turnDeadline);
        if (state.wave === 2) expect(state.sensorSeat).not.toBe(firstSensor);
      }
    }
    expect(state.result.kind).toBe("success");
    expect(state.result.reason).toBe("storm_grid_complete");
    expect(state.stabilizedWaves).toBe(4);
    expect(state.faults).toBe(0);
  });
});
