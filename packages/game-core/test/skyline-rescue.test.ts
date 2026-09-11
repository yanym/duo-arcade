import { describe, expect, it } from "vitest";

import {
  advanceSkylineRescueClock,
  chooseRescueAim,
  chooseRescuePressure,
  createSkylineRescueState,
  getSkylineRescueView,
  type GameOptions,
  type SkylineRescueState,
} from "../src/index";

const options: GameOptions = { pace: "standard", difficulty: "standard", length: "short" };

function unwrap(result: ReturnType<typeof chooseRescueAim>): SkylineRescueState {
  if (!result.ok || result.state.kind !== "skyline_rescue") throw new Error("expected skyline rescue state");
  return result.state;
}

function containWave(state: SkylineRescueState, now: number): SkylineRescueState {
  const guide = state.pumpSeat === 0 ? 1 : 0;
  let next = unwrap(chooseRescueAim(state, guide, state.priorityZone, now));
  next = unwrap(chooseRescuePressure(next, state.pumpSeat, state.requiredPressure, now + 1));
  return next;
}

describe("skyline rescue", () => {
  it("splits private zone and pressure intelligence", () => {
    let state = createSkylineRescueState(0, 1_000, 61, options);
    expect(getSkylineRescueView(state, 0)).toMatchObject({ priorityZone: null, requiredPressure: state.requiredPressure });
    expect(getSkylineRescueView(state, 1)).toMatchObject({ priorityZone: state.priorityZone, requiredPressure: null });
    expect(getSkylineRescueView(state, null)).toMatchObject({ priorityZone: null, requiredPressure: null });
    state = unwrap(chooseRescuePressure(state, 0, state.requiredPressure, 1_100));
    expect(getSkylineRescueView(state, 1).pressureChoice).toBeNull();
  });

  it("enforces roles, values, water budget and one lock per player", () => {
    let state = createSkylineRescueState(0, 1_000, 72, options);
    expect(chooseRescueAim(state, 0, 1, 1_100)).toEqual({ ok: false, reason: "wrong_role" });
    expect(chooseRescuePressure(state, 1, 2, 1_100)).toEqual({ ok: false, reason: "wrong_role" });
    expect(chooseRescuePressure(state, 0, 4 as 3, 1_100)).toEqual({ ok: false, reason: "invalid_pressure" });
    state = { ...state, water: 1 };
    expect(chooseRescuePressure(state, 0, 2, 1_100)).toEqual({ ok: false, reason: "insufficient_water" });
    state = unwrap(chooseRescuePressure(state, 0, 1, 1_100));
    expect(chooseRescuePressure(state, 0, 1, 1_200)).toEqual({ ok: false, reason: "already_chosen" });
  });

  it("contains a correctly coordinated wave and reveals the plan", () => {
    let state = createSkylineRescueState(0, 1_000, 83, options);
    state = containWave(state, 1_100);
    expect([state.phase, state.waveOutcome, state.containedWaves, state.integrity]).toEqual(["wave_result", "contained", 1, 4]);
    expect(getSkylineRescueView(state, null)).toMatchObject({ priorityZone: state.priorityZone, requiredPressure: state.requiredPressure });
    const previousPump = state.pumpSeat;
    state = advanceSkylineRescueClock(state, state.turnDeadline);
    expect([state.phase, state.wave, state.pumpSeat]).toEqual(["planning", 2, previousPump === 0 ? 1 : 0]);
  });

  it("damages the tower for wrong choices and planning timeout", () => {
    let state = createSkylineRescueState(0, 1_000, 94, options);
    const wrongZone = ((state.priorityZone + 1) % 3) as 0 | 1 | 2;
    state = unwrap(chooseRescueAim(state, 1, wrongZone, 1_100));
    state = unwrap(chooseRescuePressure(state, 0, state.requiredPressure, 1_101));
    expect([state.waveOutcome, state.integrity, state.mistakes]).toEqual(["wrong_zone", 3, 1]);
    state = advanceSkylineRescueClock(state, state.turnDeadline);
    state = advanceSkylineRescueClock(state, state.turnDeadline);
    expect([state.waveOutcome, state.integrity]).toEqual(["dispatch_timeout", 2]);
  });

  it("can finish every wave successfully or fail when tower integrity is lost", () => {
    let success = createSkylineRescueState(0, 1_000, 105, options);
    while (!success.result) {
      success = containWave(success, success.turnDeadline - 2);
      if (!success.result) success = advanceSkylineRescueClock(success, success.turnDeadline);
    }
    expect(success.result.kind).toBe("success");
    expect(success.containedWaves).toBe(4);

    let failed = createSkylineRescueState(0, 1_000, 116, { ...options, difficulty: "hard" });
    while (!failed.result) {
      failed = advanceSkylineRescueClock(failed, failed.turnDeadline);
      if (!failed.result) failed = advanceSkylineRescueClock(failed, failed.turnDeadline);
    }
    expect(failed.result).toMatchObject({ kind: "failure", reason: "tower_lost" });
  });
});
