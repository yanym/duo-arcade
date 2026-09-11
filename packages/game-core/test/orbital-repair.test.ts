import { describe, expect, it } from "vitest";

import {
  advanceOrbitalRepairClock,
  createOrbitalRepairState,
  getOrbitalRepairView,
  launchRepairPulse,
  rotateOrbitRing,
  type GameOptions,
  type OrbitalRepairState,
  type OrbitRing,
} from "../src/index";

const options: GameOptions = { pace: "standard", difficulty: "standard", length: "short" };

function unwrap(result: ReturnType<typeof rotateOrbitRing> | ReturnType<typeof launchRepairPulse>): OrbitalRepairState {
  if (!result.ok || result.state.kind !== "orbital_repair") throw new Error("expected orbital repair state");
  return result.state;
}

function align(state: OrbitalRepairState, now = 1_100): OrbitalRepairState {
  let next = state;
  for (let ring = 0; ring < state.ringCount; ring += 1) {
    const turns = (state.targetSlots[ring]! - state.currentSlots[ring]! + state.slotCount) % state.slotCount;
    for (let turn = 0; turn < turns; turn += 1) {
      next = unwrap(rotateOrbitRing(next, next.engineerSeat, ring as OrbitRing, "clockwise", now + turn));
    }
  }
  return next;
}

describe("orbital repair", () => {
  it("keeps the blueprint private from the engineer and spectators", () => {
    const state = createOrbitalRepairState(0, 1_000, 57, options);
    expect(getOrbitalRepairView(state, 0).targetSlots).toBeNull();
    expect(getOrbitalRepairView(state, 1).targetSlots).toEqual(state.targetSlots);
    expect(getOrbitalRepairView(state, null).targetSlots).toBeNull();
  });

  it("aligns all rings, reveals the blueprint, and swaps roles", () => {
    let state = createOrbitalRepairState(0, 1_000, 71, options);
    state = align(state);
    state = unwrap(launchRepairPulse(state, 1, 1_500));
    expect(state.phase).toBe("stage_result");
    expect(state.lastLaunchCorrect).toBe(true);
    expect(getOrbitalRepairView(state, 0).targetSlots).toEqual(state.targetSlots);

    state = advanceOrbitalRepairClock(state, state.turnDeadline);
    expect([state.stage, state.engineerSeat, state.phase]).toEqual([2, 1, "aligning"]);
    expect(state.stageRotations).toBe(0);
  });

  it("overloads after the configured number of bad launches", () => {
    const state = createOrbitalRepairState(0, 1_000, 83, { ...options, difficulty: "hard" });
    const failed = unwrap(launchRepairPulse(state, 1, 1_100));
    expect(failed.result).toEqual({ kind: "failure", score: 0, reason: "reactor_overload" });
  });

  it("enforces roles, active rings, and stage timeout", () => {
    const state = createOrbitalRepairState(0, 1_000, 97, { ...options, difficulty: "easy" });
    expect(rotateOrbitRing(state, 1, 0, "clockwise", 1_100)).toEqual({ ok: false, reason: "wrong_role" });
    expect(rotateOrbitRing(state, 0, 2, "clockwise", 1_100)).toEqual({ ok: false, reason: "invalid_ring" });
    expect(launchRepairPulse(state, 0, 1_100)).toEqual({ ok: false, reason: "wrong_role" });
    expect(advanceOrbitalRepairClock(state, state.turnDeadline).result).toEqual({
      kind: "failure",
      score: 0,
      reason: "timeout",
    });
  });
});
