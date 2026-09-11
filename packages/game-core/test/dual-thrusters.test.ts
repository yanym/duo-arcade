import { describe, expect, it } from "vitest";

import {
  advanceDualThrustersClock,
  chooseThrusterPower,
  createDualThrustersState,
  getDualThrustersView,
  type DualThrustersState,
  type GameOptions,
  type ThrusterPower,
} from "../src/index";

const options: GameOptions = { pace: "standard", difficulty: "standard", length: "short" };

function unwrap(result: ReturnType<typeof chooseThrusterPower>): DualThrustersState {
  if (!result.ok || result.state.kind !== "dual_thrusters") throw new Error("expected dual thrusters state");
  return result.state;
}

function solution(state: DualThrustersState): [ThrusterPower, ThrusterPower] {
  const delta = state.targetLane - state.shipLane - state.drift;
  return delta >= 0 ? [delta as ThrusterPower, 0] : [0, -delta as ThrusterPower];
}

describe("dual thrusters", () => {
  it("maps options and generates a reachable active gate", () => {
    const state = createDualThrustersState(1_000, 42, options);
    expect([state.totalGates, state.laneCount, state.maxHull, state.burnDurationMs]).toEqual([5, 7, 3, 10_000]);
    const needed = state.targetLane - state.shipLane - state.drift;
    expect(Math.abs(needed)).toBeLessThanOrEqual(2);
    expect(needed).not.toBe(0);
    expect(createDualThrustersState(1_000, 42, options).targetLane).toBe(state.targetLane);
  });

  it("keeps the partner power secret until the gate resolves", () => {
    let state = createDualThrustersState(1_000, 7, options);
    state = unwrap(chooseThrusterPower(state, 0, 2, 1_100));
    expect(getDualThrustersView(state, 0).powers).toEqual([2, null]);
    expect(getDualThrustersView(state, 1).powers).toEqual([null, null]);
    expect(getDualThrustersView(state, null).powers).toEqual([null, null]);
    state = unwrap(chooseThrusterPower(state, 1, 1, 1_200));
    expect(getDualThrustersView(state, 1).powers).toEqual([2, 1]);
  });

  it("rejects invalid and duplicate power choices", () => {
    let state = createDualThrustersState(1_000, 9, options);
    expect(chooseThrusterPower(state, 0, 3 as ThrusterPower, 1_100)).toEqual({ ok: false, reason: "invalid_power" });
    state = unwrap(chooseThrusterPower(state, 0, 1, 1_100));
    expect(chooseThrusterPower(state, 0, 0, 1_200)).toEqual({ ok: false, reason: "already_chosen" });
  });

  it("combines both engines with inertia to clear a gate", () => {
    let state = createDualThrustersState(1_000, 14, options);
    const [left, right] = solution(state);
    state = unwrap(chooseThrusterPower(state, 0, left, 1_100));
    state = unwrap(chooseThrusterPower(state, 1, right, 1_200));
    expect(state.gateOutcome).toBe("gate_cleared");
    expect(state.shipLane).toBe(state.targetLane);
    expect(state.clearedGates).toBe(1);
    expect(state.score).toBeGreaterThan(0);
    const previousTarget = state.targetLane;
    state = advanceDualThrustersClock(state, state.turnDeadline);
    expect([state.phase, state.gate]).toEqual(["planning", 2]);
    expect(Math.abs(state.targetLane - previousTarget - state.drift)).toBeLessThanOrEqual(2);
  });

  it("damages and recenters the shuttle after a collision or timeout", () => {
    let state = createDualThrustersState(1_000, 18, { ...options, difficulty: "hard" });
    const wrong: [ThrusterPower, ThrusterPower] = state.targetLane > state.shipLane ? [0, 2] : [2, 0];
    state = unwrap(chooseThrusterPower(state, 0, wrong[0], 1_100));
    state = unwrap(chooseThrusterPower(state, 1, wrong[1], 1_200));
    expect([state.gateOutcome, state.hull, state.drift]).toEqual(["gate_hit", 1, 0]);
    state = advanceDualThrustersClock(state, state.turnDeadline);
    state = advanceDualThrustersClock(state, state.turnDeadline);
    expect(state.result).toEqual({ kind: "failure", score: 0, reason: "shuttle_lost" });
    expect(state.gateOutcome).toBe("burn_timeout");
  });

  it("can clear every gate and finish successfully", () => {
    let state = createDualThrustersState(1_000, 23, options);
    while (!state.result) {
      const [left, right] = solution(state);
      state = unwrap(chooseThrusterPower(state, 0, left, state.turnDeadline - 100));
      state = unwrap(chooseThrusterPower(state, 1, right, state.turnDeadline - 90));
      if (!state.result) state = advanceDualThrustersClock(state, state.turnDeadline);
    }
    expect(state.result.kind).toBe("success");
    expect(state.result.reason).toBe("dual_thrusters_complete");
    expect(state.clearedGates).toBe(5);
  });
});
