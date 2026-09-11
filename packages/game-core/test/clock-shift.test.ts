import { describe, expect, it } from "vitest";

import {
  advanceCoreRallyClock,
  advanceMeteorDashClock,
  createCoreRallyState,
  createMeteorDashState,
  createRhythmGravityState,
  shiftGameClock,
  type GameOptions,
} from "../src/index";

const options: GameOptions = { pace: "standard", difficulty: "standard", length: "short" };

describe("paused clock shifting", () => {
  it("shifts the rhythm target together with its deadline", () => {
    const state = createRhythmGravityState(1_000, options);
    const shifted = shiftGameClock(state, state.turnDeadline + 5_000);
    expect(shifted.beatAt).toBe(state.beatAt + 5_000);
    expect(shifted.turnDeadline).toBe(state.turnDeadline + 5_000);
  });

  it("shifts the core return center together with its deadline", () => {
    const approaching = createCoreRallyState(0, 1_000, 12, options);
    const window = advanceCoreRallyClock(approaching, approaching.turnDeadline);
    const shifted = shiftGameClock(window, window.turnDeadline + 4_000);
    expect(shifted.strikeAt).toBe(window.strikeAt + 4_000);
    expect(shifted.turnDeadline).toBe(window.turnDeadline + 4_000);
  });

  it("shifts the meteor reaction origin together with its deadline", () => {
    const signal = createMeteorDashState(1_000, 77, options);
    const catching = advanceMeteorDashClock(signal, signal.turnDeadline);
    const shifted = shiftGameClock(catching, catching.turnDeadline + 3_000);
    expect(shifted.catchStartedAt).toBe(catching.catchStartedAt + 3_000);
    expect(shifted.turnDeadline).toBe(catching.turnDeadline + 3_000);
  });
});
