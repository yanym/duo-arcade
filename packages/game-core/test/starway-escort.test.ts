import { describe, expect, it } from "vitest";

import {
  advanceStarwayEscortClock,
  chooseEscortRoute,
  chooseEscortShield,
  createStarwayEscortState,
  getStarwayEscortView,
  type GameOptions,
  type StarwayEscortState,
} from "../src/index";

const options: GameOptions = { pace: "standard", difficulty: "standard", length: "short" };

function stateOf(result: ReturnType<typeof chooseEscortRoute>): StarwayEscortState {
  if (!result.ok || result.state.kind !== "starway_escort") throw new Error("expected escort state");
  return result.state;
}

describe("starway escort", () => {
  it("splits lane intelligence and hides the partner's plan", () => {
    let state = createStarwayEscortState(0, 1_000, 77, options);
    const pilot = getStarwayEscortView(state, 0);
    const shield = getStarwayEscortView(state, 1);
    expect([pilot.energyLane, pilot.obstacleLane]).toEqual([state.energyLane, null]);
    expect([shield.energyLane, shield.obstacleLane]).toEqual([null, state.obstacleLane]);
    expect(getStarwayEscortView(state, null)).toMatchObject({ energyLane: null, obstacleLane: null });

    state = stateOf(chooseEscortRoute(state, 0, state.energyLane, 1_100));
    expect(getStarwayEscortView(state, 0).routeChoice).toBe(state.energyLane);
    expect(getStarwayEscortView(state, 1).routeChoice).toBeNull();
    state = stateOf(chooseEscortShield(state, 1, state.obstacleLane, 1_200));
    expect(state.sectorOutcome).toBe("energy_collected");
    expect(getStarwayEscortView(state, 1).energyLane).toBe(state.energyLane);
  });

  it("swaps roles and fails after unshielded hull impacts", () => {
    let state = createStarwayEscortState(0, 1_000, 93, { ...options, difficulty: "hard" });
    state = stateOf(chooseEscortRoute(state, 0, state.obstacleLane, 1_100));
    state = stateOf(chooseEscortShield(state, 1, state.energyLane, 1_200));
    expect([state.hull, state.sectorOutcome]).toEqual([1, "hull_hit"]);

    state = advanceStarwayEscortClock(state, state.turnDeadline);
    expect([state.sector, state.pilotSeat]).toEqual([2, 1]);
    state = stateOf(chooseEscortRoute(state, 1, state.obstacleLane, state.turnDeadline - 20));
    state = stateOf(chooseEscortShield(state, 0, state.energyLane, state.turnDeadline - 10));
    expect(state.result).toEqual({ kind: "failure", score: 0, reason: "hull_lost" });
  });

  it("rejects crossed roles and fails on planning timeout", () => {
    const state = createStarwayEscortState(0, 1_000, 22, options);
    expect(chooseEscortShield(state, 0, 1, 1_100)).toEqual({ ok: false, reason: "wrong_role" });
    expect(advanceStarwayEscortClock(state, state.turnDeadline).result).toEqual({
      kind: "failure",
      score: 0,
      reason: "timeout",
    });
  });
});
