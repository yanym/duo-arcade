import { describe, expect, it } from "vitest";

import {
  adjustDropBrake,
  advanceDropRescueClock,
  createDropRescueState,
  getDropRescueView,
  lockDropControl,
  moveDropPod,
  type DropRescueState,
  type GameActionResult,
  type GameOptions,
  type Seat,
} from "../src/index";

const options: GameOptions = { pace: "standard", difficulty: "standard", length: "short" };

function unwrap(result: GameActionResult): DropRescueState {
  if (!result.ok || result.state.kind !== "drop_rescue") throw new Error("expected drop rescue state");
  return result.state;
}

function softLand(state: DropRescueState, now: number): DropRescueState {
  const pilot = state.pilotSeat;
  const engineer: Seat = pilot === 0 ? 1 : 0;
  const desiredPodLane = state.targetLane - state.wind;
  while (state.podLane !== desiredPodLane) {
    state = unwrap(moveDropPod(state, pilot, state.podLane < desiredPodLane ? 1 : -1, now++));
  }
  const desiredBrake = state.descentSpeed - state.targetSpeed;
  while (state.brakePower !== desiredBrake) {
    state = unwrap(adjustDropBrake(state, engineer, state.brakePower < desiredBrake ? 1 : -1, now++));
  }
  state = unwrap(lockDropControl(state, pilot, now++));
  return unwrap(lockDropControl(state, engineer, now));
}

function lockBoth(state: DropRescueState, now: number): DropRescueState {
  state = unwrap(lockDropControl(state, 0, now));
  return unwrap(lockDropControl(state, 1, now + 1));
}

describe("drop rescue", () => {
  it("splits lane and velocity telemetry between roles until reveal", () => {
    let state = createDropRescueState(0, 1_000, 701, options);
    expect(getDropRescueView(state, 0)).toMatchObject({ targetLane: state.targetLane, wind: state.wind, descentSpeed: null, targetSpeed: null });
    expect(getDropRescueView(state, 1)).toMatchObject({ targetLane: null, wind: null, descentSpeed: state.descentSpeed, targetSpeed: state.targetSpeed });
    expect(getDropRescueView(state, null)).toMatchObject({ targetLane: null, wind: null, descentSpeed: null, targetSpeed: null });
    state = softLand(state, 1_100);
    expect(getDropRescueView(state, null)).toMatchObject({ targetLane: state.targetLane, wind: state.wind, descentSpeed: state.descentSpeed, targetSpeed: state.targetSpeed });
  });

  it("generates deterministic, non-trivial and reachable telemetry across all settings", () => {
    const configurations: GameOptions[] = [
      { pace: "relaxed", difficulty: "easy", length: "short" },
      { pace: "standard", difficulty: "standard", length: "standard" },
      { pace: "blitz", difficulty: "hard", length: "long" },
    ];
    for (const config of configurations) {
      for (let seed = 1; seed <= 120; seed++) {
        const state = createDropRescueState(seed % 2 as Seat, 1_000, seed, config);
        const duplicate = createDropRescueState(seed % 2 as Seat, 1_000, seed, config);
        expect(state).toEqual(duplicate);
        const desiredLane = state.targetLane - state.wind;
        const desiredBrake = state.descentSpeed - state.targetSpeed;
        expect(desiredLane).toBeGreaterThanOrEqual(0);
        expect(desiredLane).toBeLessThan(state.laneCount);
        expect(state.podLane).not.toBe(desiredLane);
        expect(Math.abs(state.podLane - desiredLane)).toBeLessThanOrEqual(2);
        expect(desiredBrake).toBeGreaterThanOrEqual(0);
        expect(desiredBrake).toBeLessThanOrEqual(3);
      }
    }
  });

  it("enforces role ownership, control limits, fuel and one final lock", () => {
    let state = createDropRescueState(0, 1_000, 702, options);
    expect(moveDropPod(state, 1, 1, 1_100)).toEqual({ ok: false, reason: "wrong_role" });
    expect(adjustDropBrake(state, 0, 1, 1_100)).toEqual({ ok: false, reason: "wrong_role" });
    expect(moveDropPod({ ...state, podLane: 0 }, 0, -1, 1_100)).toEqual({ ok: false, reason: "pod_edge" });
    expect(adjustDropBrake({ ...state, brakePower: 3 }, 1, 1, 1_100)).toEqual({ ok: false, reason: "brake_limit" });
    expect(moveDropPod({ ...state, propellant: 0 }, 0, 1, 1_100)).toEqual({ ok: false, reason: "no_propellant" });
    state = unwrap(lockDropControl(state, 0, 1_100));
    expect(moveDropPod(state, 0, 1, 1_101)).toEqual({ ok: false, reason: "already_chosen" });
    expect(lockDropControl(state, 0, 1_102)).toEqual({ ok: false, reason: "already_chosen" });
  });

  it("resolves a coordinated soft landing and swaps roles", () => {
    let state = createDropRescueState(0, 1_000, 703, options);
    state = softLand(state, 1_100);
    expect([state.phase, state.lastOutcome, state.softLandings, state.hull]).toEqual(["landing_result", "soft_landing", 1, 3]);
    expect(state.finalLane).toBe(state.targetLane);
    expect(state.finalSpeed).toBe(state.targetSpeed);
    state = advanceDropRescueClock(state, state.turnDeadline);
    expect([state.phase, state.landing, state.pilotSeat]).toEqual(["descent", 2, 1]);
  });

  it("distinguishes lateral, velocity and double faults", () => {
    let base = createDropRescueState(0, 1_000, 704, options);
    const idealPodLane = base.targetLane - base.wind;
    const wrongPodLane = Array.from({ length: base.laneCount }, (_, lane) => lane)
      .find((lane) => Math.min(base.laneCount - 1, Math.max(0, lane + base.wind)) !== base.targetLane)!;
    let offPad = { ...base, podLane: wrongPodLane };
    const desiredBrake = offPad.descentSpeed - offPad.targetSpeed;
    while (offPad.brakePower < desiredBrake) offPad = unwrap(adjustDropBrake(offPad, 1, 1, 1_100));
    offPad = lockBoth(offPad, 1_200);
    expect([offPad.lastOutcome, offPad.hull]).toEqual(["off_pad", 2]);

    let hard: DropRescueState = { ...base, podLane: idealPodLane, brakePower: desiredBrake === 0 ? 1 : 0 };
    hard = lockBoth(hard, 1_300);
    expect([hard.lastOutcome, hard.hull]).toEqual(["hard_landing", 2]);

    let double: DropRescueState = { ...base, podLane: wrongPodLane, brakePower: desiredBrake === 0 ? 1 : 0 };
    double = lockBoth(double, 1_400);
    expect([double.lastOutcome, double.hull]).toEqual(["double_fault", 1]);
  });

  it("penalizes timeout and can complete a full rescue route", () => {
    let timedOut = createDropRescueState(0, 1_000, 706, options);
    timedOut = advanceDropRescueClock(timedOut, timedOut.turnDeadline);
    expect([timedOut.phase, timedOut.lastOutcome, timedOut.roughLandings]).toEqual(["landing_result", "descent_timeout", 1]);

    let success = createDropRescueState(0, 1_000, 707, options);
    while (!success.result) {
      success = softLand(success, success.turnDeadline - 100);
      if (!success.result) success = advanceDropRescueClock(success, success.turnDeadline);
    }
    expect(success.result).toMatchObject({ kind: "success", reason: "drop_rescue_complete" });
    expect(success.softLandings).toBe(4);
  });
});
