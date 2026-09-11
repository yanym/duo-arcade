import { describe, expect, it } from "vitest";

import {
  createDefuseState,
  expireDefuse,
  getDefuseView,
  pressDefuseSymbol,
  type DefuseState,
  type GameOptions,
} from "../src/index";

const options: GameOptions = { pace: "standard", difficulty: "easy", length: "short" };

function stateOf(result: ReturnType<typeof pressDefuseSymbol>): DefuseState {
  if (!result.ok || result.state.kind !== "starship_defuse") throw new Error("expected defuse state");
  return result.state;
}

describe("starship defuse", () => {
  it("shows the sequence only to the analyst", () => {
    const state = createDefuseState(0, 1_000, 42, options);
    expect(getDefuseView(state, 0).solution).toBeNull();
    expect(getDefuseView(state, null).solution).toBeNull();
    expect(getDefuseView(state, 1).solution).toEqual(state.solution);
  });

  it("rejects the analyst and swaps roles after a completed stage", () => {
    let state = createDefuseState(0, 1_000, 42, options);
    expect(pressDefuseSymbol(state, 1, state.solution[0]!, 1_100)).toEqual({ ok: false, reason: "wrong_role" });
    for (const symbol of state.solution) state = stateOf(pressDefuseSymbol(state, 0, symbol, 1_200));
    expect([state.stage, state.operatorSeat, state.progress]).toEqual([2, 1, 0]);
    expect(state.result).toBeNull();
  });

  it("ends on strikes and can complete all stages", () => {
    let failed = createDefuseState(0, 1_000, 7, { ...options, difficulty: "hard" });
    const wrong = failed.availableSymbols.find((symbol) => symbol !== failed.solution[0])!;
    failed = stateOf(pressDefuseSymbol(failed, 0, wrong, 1_100));
    expect(failed.result).toEqual({ kind: "failure", score: 0, reason: "too_many_strikes" });

    let state = createDefuseState(0, 1_000, 11, options);
    while (!state.result) {
      const operator = state.operatorSeat;
      for (const symbol of state.solution) state = stateOf(pressDefuseSymbol(state, operator, symbol, 1_500));
    }
    expect(state.result.kind).toBe("success");
    expect(state.stage).toBe(3);
  });

  it("fails safely when a stage times out", () => {
    const state = createDefuseState(0, 1_000, 9, options);
    expect(expireDefuse(state, state.turnDeadline).result).toEqual({ kind: "failure", score: 0, reason: "timeout" });
  });
});
