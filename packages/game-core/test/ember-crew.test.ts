import { describe, expect, it } from "vitest";
import { advanceEmberCrewClock, chooseEmberPlan, commitEmberAction, createEmberCrewState, planEmberAction, validateEmberPlan, type EmberCrewState, type EmberPlan } from "../src/ember-crew";
import { DEFAULT_GAME_OPTIONS, type Seat } from "../src/types";

function planned(state: EmberCrewState, seat: Seat, plan: EmberPlan): EmberCrewState {
  const result = planEmberAction(state, seat, state.round, plan, state.turnDeadline - 100);
  if (!result.ok) throw new Error(result.reason);
  return result.state;
}
function confirmed(state: EmberCrewState, seat: Seat): EmberCrewState {
  const result = commitEmberAction(state, seat, state.round, state.turnDeadline - 50);
  if (!result.ok) throw new Error(result.reason);
  return result.state;
}
function fixture(): EmberCrewState {
  return { ...createEmberCrewState(1000, 42, DEFAULT_GAME_OPTIONS), fire: Array(25).fill(0), forecast: [] };
}

describe("Ember Crew simultaneous cooperation", () => {
  it.each([0, 1] as Seat[])("lets one crew clear the other's route regardless of confirmation order: %s", (first) => {
    let game = { ...fixture(), positions: [16, 22] as [number, number] };
    game.fire[17] = 2;
    const before = JSON.parse(JSON.stringify(game)) as EmberCrewState;
    game = planned(game, 0, { operation: "move", cell: 17 });
    game = planned(game, 1, { operation: "extinguish", cell: 17 });
    expect(game.positions).toEqual([16, 22]);
    expect(game.plans.map((plan) => plan?.cell)).toEqual([17, 17]);
    game = confirmed(game, first);
    expect(game.phase).toBe("planning");
    game = confirmed(game, first === 0 ? 1 : 0);
    expect(game.phase).toBe("round_result");
    expect(game.positions).toEqual([17, 22]);
    expect(game.water).toEqual([4, 3]);
    expect(before.fire[17]).toBe(2);
  });

  it("permits revising your plan before confirmation, never after", () => {
    const game = planned(planned(fixture(), 0, { operation: "move", cell: 15 }), 0, { operation: "move", cell: 21 });
    expect(game.plans[0]?.cell).toBe(21);
    const locked = confirmed(game, 0);
    expect(planEmberAction(locked, 0, 1, { operation: "wait", cell: 20 }, 1200)).toEqual({ ok: false, reason: "already_chosen" });
    expect(commitEmberAction(locked, 0, 1, 1200)).toEqual({ ok: false, reason: "already_chosen" });
  });

  it("never executes an unconfirmed draft when time runs out", () => {
    let game = planned(fixture(), 0, { operation: "move", cell: 15 });
    game = confirmed(planned(game, 1, { operation: "move", cell: 19 }), 1);
    const next = advanceEmberCrewClock(game, game.turnDeadline);
    expect(next.positions).toEqual([20, 19]);
    expect(next.report[0]).toBe("未确认，本轮留守");
    expect(next.phase).toBe("round_result");
    expect(planEmberAction(game, 0, 1, { operation: "move", cell: 15 }, game.turnDeadline).ok).toBe(false);
  });

  it("rejects delayed actions for a prior round and resets plans after the reveal", () => {
    let game = advanceEmberCrewClock(fixture(), 100_000);
    game = advanceEmberCrewClock(game, game.turnDeadline);
    expect(game.round).toBe(2);
    expect(game.plans).toEqual([null, null]);
    expect(game.locked).toEqual([false, false]);
    expect(planEmberAction(game, 0, 1, { operation: "move", cell: 15 }, game.turnDeadline - 1)).toEqual({ ok: false, reason: "wrong_phase" });
    expect(commitEmberAction(game, 0, 1, game.turnDeadline - 1)).toEqual({ ok: false, reason: "wrong_phase" });
  });

  it("saves the second tank when both target the same fire", () => {
    let game = { ...fixture(), positions: [16, 22] as [number, number] };
    game.fire[17] = 2;
    for (const seat of [0, 1] as Seat[]) game = planned(game, seat, { operation: "extinguish", cell: 17 });
    game = confirmed(confirmed(game, 0), 1);
    expect(game.water[0] + game.water[1]).toBe(7);
    expect(game.fire[17]).toBe(0);
  });

  it("shares limited water without losing or creating supplies", () => {
    let game = { ...fixture(), positions: [20, 21] as [number, number], water: [4, 3] as [number, number] };
    game = confirmed(planned(game, 0, { operation: "share", cell: 20 }), 0);
    game = confirmed(planned(game, 1, { operation: "wait", cell: 21 }), 1);
    expect(game.water).toEqual([3, 4]);
    expect(validateEmberPlan(game, 1, { operation: "refill", cell: 21 })).toBe("illegal_move");
  });

  it("does not teleport through fire and applies the displayed forecast", () => {
    let game = { ...fixture(), forecast: [16] };
    game.fire[15] = 1;
    game = confirmed(planned(game, 0, { operation: "move", cell: 15 }), 0);
    game = confirmed(planned(game, 1, { operation: "wait", cell: 24 }), 1);
    expect(game.positions[0]).toBe(20);
    expect(game.fire[16]).toBe(1);
    expect(game.report[0]).toBe("道路仍有火，留在原地");
  });

  it("keeps a freshly cleared route safe and cancels spread without a surviving local source", () => {
    let game = { ...fixture(), positions: [16, 22] as [number, number], forecast: [17, 18] };
    game.fire[17] = 2;
    game.fire[0] = 1;
    game = confirmed(planned(game, 0, { operation: "move", cell: 17 }), 0);
    game = confirmed(planned(game, 1, { operation: "extinguish", cell: 17 }), 1);
    expect(game.fire[17]).toBe(0);
    expect(game.fire[18]).toBe(0);
    expect(game.positions[0]).toBe(17);
  });

  it("rescues by reaching a resident then returning to a station, with a shared victory", () => {
    let game = { ...fixture(), civilians: [15], target: 1 };
    game = confirmed(planned(game, 0, { operation: "move", cell: 15 }), 0);
    game = confirmed(planned(game, 1, { operation: "wait", cell: 24 }), 1);
    expect(game.carrying[0]).toBe(true);
    expect(game.civilians).toEqual([]);
    expect(game.rescued).toBe(0);
    game = advanceEmberCrewClock(game, game.turnDeadline);
    game = confirmed(planned(game, 0, { operation: "move", cell: 20 }), 0);
    game = confirmed(planned(game, 1, { operation: "wait", cell: 24 }), 1);
    expect(game.carrying[0]).toBe(false);
    expect(game.rescued).toBe(1);
    expect(game.result).toMatchObject({ kind: "success", reason: "ember_crew_complete" });
    expect(advanceEmberCrewClock(game, game.turnDeadline + 9999)).toBe(game);
  });

  it("ends on building collapse and on the final round", () => {
    const game = { ...fixture(), integrity: 1 };
    game.fire[0] = 2; game.fire[1] = 2;
    expect(advanceEmberCrewClock(game, game.turnDeadline).result).toMatchObject({ kind: "failure", reason: "building_lost" });
    const final = { ...fixture(), round: fixture().maxRounds };
    expect(advanceEmberCrewClock(final, final.turnDeadline).result).toMatchObject({ kind: "failure", reason: "timeout" });
  });

  it("AI chooses legal public-board plans through complete missions", () => {
    const outcomes: Record<string, number> = {};
    for (const difficulty of ["easy", "standard", "hard"] as const) {
      for (const length of ["short", "standard", "long"] as const) {
        let wins = 0;
        for (let seed = 0; seed < 30; seed++) {
          let game = createEmberCrewState(0, seed, { ...DEFAULT_GAME_OPTIONS, difficulty, length });
          for (let step = 0; step < 100 && !game.result; step++) {
            for (const seat of (game.round % 2 ? [0, 1] : [1, 0]) as Seat[]) {
              const plan = chooseEmberPlan(game, seat);
              expect(validateEmberPlan(game, seat, plan)).toBeNull();
              game = planned(game, seat, plan);
            }
            game = confirmed(confirmed(game, 0), 1);
            game = advanceEmberCrewClock(game, game.turnDeadline);
          }
          expect(game.result).not.toBeNull();
          expect(game.water.every((amount) => amount >= 0 && amount <= 4)).toBe(true);
          if (game.result?.kind === "success") {
            wins++;
            const layoutKey = `${difficulty}/${length}/layout${(seed >>> 1) % 3}`;
            outcomes[layoutKey] = (outcomes[layoutKey] ?? 0) + 1;
          }
          else if (game.result) {
            const reason = `${difficulty}/${length}/${game.result.reason}`;
            outcomes[reason] = (outcomes[reason] ?? 0) + 1;
          }
        }
        outcomes[`${difficulty}/${length}`] = wins;
      }
    }
    // These are independent actors using only the public board and partner plans.
    expect(outcomes["standard/standard"], JSON.stringify(outcomes)).toBeGreaterThanOrEqual(20);
    expect(outcomes["hard/long"], JSON.stringify(outcomes)).toBeGreaterThanOrEqual(5);
    // Aggregate wins must not conceal an unusable map. Each layout gets ten
    // missions here, including both reflections and distinct fire forecasts.
    for (let layout = 0; layout < 3; layout++) {
      expect(outcomes[`standard/standard/layout${layout}`] ?? 0, JSON.stringify(outcomes)).toBeGreaterThanOrEqual(6);
      expect(outcomes[`standard/short/layout${layout}`] ?? 0, JSON.stringify(outcomes)).toBeGreaterThanOrEqual(8);
    }
  });
});
