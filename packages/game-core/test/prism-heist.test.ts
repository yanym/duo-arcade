import { describe, expect, it } from "vitest";

import {
  advancePrismHeistClock,
  bypassHeistGrid,
  createPrismHeistState,
  dashThroughHeist,
  getPrismHeistView,
  moveHeistRunner,
  otherSeat,
  type GameOptions,
  type PrismHeistState,
} from "../src/index";

const options: GameOptions = { pace: "standard", difficulty: "standard", length: "short" };

function unwrap(
  result: ReturnType<typeof moveHeistRunner> | ReturnType<typeof bypassHeistGrid> | ReturnType<typeof dashThroughHeist>,
): PrismHeistState {
  if (!result.ok || result.state.kind !== "prism_heist") throw new Error("expected prism heist state");
  return result.state;
}

function alignRunner(state: PrismHeistState, now: number): PrismHeistState {
  let next = state;
  const runner = otherSeat(state.scoutSeat);
  while (next.runnerLane !== next.safeLane) {
    next = unwrap(moveHeistRunner(next, runner, next.safeLane > next.runnerLane ? 1 : -1, now));
  }
  return next;
}

describe("prism heist", () => {
  it("maps all commercial options and creates deterministic safe routes", () => {
    const first = createPrismHeistState(0, 1_000, 71, options);
    expect(createPrismHeistState(0, 1_000, 71, options)).toEqual(first);
    expect([first.totalCorridors, first.laneCount, first.maxIntegrity, first.approachDurationMs, first.breachWindowMs])
      .toEqual([4, 4, 3, 8_000, 1_500]);
    const easy = createPrismHeistState(1, 0, 9, { pace: "relaxed", difficulty: "easy", length: "long" });
    const hard = createPrismHeistState(1, 0, 9, { pace: "blitz", difficulty: "hard", length: "standard" });
    expect([easy.totalCorridors, easy.laneCount, easy.maxIntegrity, easy.approachDurationMs, easy.breachWindowMs])
      .toEqual([8, 3, 4, 12_000, 2_400]);
    expect([hard.totalCorridors, hard.laneCount, hard.maxIntegrity, hard.approachDurationMs, hard.breachWindowMs])
      .toEqual([6, 5, 2, 5_000, 900]);
    expect(first.safeLane).not.toBe(first.runnerLane);
  });

  it("only sends the safe lane to the scout until corridor resolution", () => {
    let state = createPrismHeistState(1, 1_000, 13, options);
    expect(getPrismHeistView(state, 1).safeLane).toBe(state.safeLane);
    expect(getPrismHeistView(state, 0).safeLane).toBeNull();
    expect(getPrismHeistView(state, null).safeLane).toBeNull();
    state = advancePrismHeistClock(state, state.turnDeadline);
    state = unwrap(bypassHeistGrid(state, 1, state.turnDeadline - 100));
    state = unwrap(dashThroughHeist(state, 0, state.turnDeadline - 50));
    expect(getPrismHeistView(state, 0).safeLane).toBe(state.safeLane);
  });

  it("enforces runner ownership, approach timing, and track boundaries", () => {
    let state = createPrismHeistState(0, 1_000, 17, options);
    expect(moveHeistRunner(state, 0, 1, 1_100)).toEqual({ ok: false, reason: "wrong_role" });
    const runner = 1;
    while (state.runnerLane > 0) state = unwrap(moveHeistRunner(state, runner, -1, 1_100));
    expect(moveHeistRunner(state, runner, -1, 1_200)).toEqual({ ok: false, reason: "tracker_edge" });
    state = advancePrismHeistClock(state, state.turnDeadline);
    expect(moveHeistRunner(state, runner, 1, state.turnDeadline - 1)).toEqual({ ok: false, reason: "wrong_phase" });
  });

  it("requires the two different roles to lock one action each", () => {
    let state = createPrismHeistState(0, 1_000, 23, options);
    state = advancePrismHeistClock(state, state.turnDeadline);
    expect(dashThroughHeist(state, 0, state.turnDeadline - 200)).toEqual({ ok: false, reason: "wrong_role" });
    expect(bypassHeistGrid(state, 1, state.turnDeadline - 200)).toEqual({ ok: false, reason: "wrong_role" });
    state = unwrap(bypassHeistGrid(state, 0, state.turnDeadline - 150));
    expect(state.bypassLocked).toBe(true);
    expect(bypassHeistGrid(state, 0, state.turnDeadline - 100)).toEqual({ ok: false, reason: "already_chosen" });
    state = unwrap(dashThroughHeist(state, 1, state.turnDeadline - 50));
    expect([state.phase, state.lastOutcome, state.integrity]).toEqual(["corridor_result", "laser_hit", 2]);
  });

  it("clears a corridor when the runner aligns and both players synchronize", () => {
    let state = createPrismHeistState(0, 1_000, 31, options);
    state = alignRunner(state, state.turnDeadline - 1_000);
    state = advancePrismHeistClock(state, state.turnDeadline);
    state = unwrap(dashThroughHeist(state, 1, state.turnDeadline - 250));
    state = unwrap(bypassHeistGrid(state, 0, state.turnDeadline - 200));
    expect([state.lastOutcome, state.cleanBreaches, state.totalSyncs, state.integrity]).toEqual(["clean_breach", 1, 1, 3]);
    expect(state.score).toBeGreaterThan(500);
  });

  it("penalizes a missed breach window and can fail the mission", () => {
    let state = createPrismHeistState(0, 1_000, 37, { ...options, difficulty: "hard", length: "standard" });
    for (let failure = 0; failure < 2; failure += 1) {
      state = advancePrismHeistClock(state, state.turnDeadline);
      state = advancePrismHeistClock(state, state.turnDeadline);
      if (!state.result) state = advancePrismHeistClock(state, state.turnDeadline);
    }
    expect([state.lastOutcome, state.integrity, state.result?.kind, state.result?.reason])
      .toEqual(["sync_missed", 0, "failure", "heist_failed"]);
  });

  it("swaps roles after each corridor and completes a full clean heist", () => {
    let state = createPrismHeistState(0, 1_000, 43, options);
    const scouts = new Set<number>();
    while (!state.result) {
      scouts.add(state.scoutSeat);
      state = alignRunner(state, state.turnDeadline - 1_000);
      state = advancePrismHeistClock(state, state.turnDeadline);
      state = unwrap(bypassHeistGrid(state, state.scoutSeat, state.turnDeadline - 200));
      state = unwrap(dashThroughHeist(state, otherSeat(state.scoutSeat), state.turnDeadline - 150));
      if (!state.result) state = advancePrismHeistClock(state, state.turnDeadline);
    }
    expect(scouts.size).toBe(2);
    expect([state.result.kind, state.result.reason, state.cleanBreaches, state.integrity])
      .toEqual(["success", "prism_heist_complete", 4, 3]);
    expect(state.score).toBeGreaterThan(2_000);
  });
});
