import { describe, expect, it } from "vitest";

import {
  advanceQuantumDuelClock,
  chooseDuelMove,
  createQuantumDuelState,
  getQuantumDuelView,
  type GameOptions,
  type QuantumDuelState,
} from "../src/index";

const options: GameOptions = { pace: "standard", difficulty: "standard", length: "short" };

function stateOf(result: ReturnType<typeof chooseDuelMove>): QuantumDuelState {
  if (!result.ok || result.state.kind !== "quantum_duel") throw new Error("expected duel state");
  return result.state;
}

describe("quantum duel", () => {
  it("hides a locked move until both players choose", () => {
    let state = createQuantumDuelState(1_000, options);
    state = stateOf(chooseDuelMove(state, 0, "strike", 1_100));
    expect(getQuantumDuelView(state, 0).choices).toEqual(["strike", null]);
    expect(getQuantumDuelView(state, 1).choices).toEqual([null, null]);
    expect(getQuantumDuelView(state, null).choices).toEqual([null, null]);

    state = stateOf(chooseDuelMove(state, 1, "charge", 1_200));
    expect(state.roundWinner).toBe(0);
    expect(getQuantumDuelView(state, 1).choices).toEqual(["strike", "charge"]);
  });

  it("implements the three-way matchup and ends a best-of-three early", () => {
    let state = createQuantumDuelState(1_000, options);
    state = stateOf(chooseDuelMove(state, 0, "guard", 1_100));
    state = stateOf(chooseDuelMove(state, 1, "strike", 1_200));
    expect(state.scores).toEqual([1, 0]);
    state = advanceQuantumDuelClock(state, state.turnDeadline);
    state = stateOf(chooseDuelMove(state, 0, "charge", state.turnDeadline - 10));
    state = stateOf(chooseDuelMove(state, 1, "guard", state.turnDeadline - 5));
    expect(state.result).toEqual({ kind: "win", winnerSeat: 0, reason: "quantum_duel_score" });
  });

  it("awards a choice timeout and draws when neither locks", () => {
    let state = createQuantumDuelState(1_000, options);
    state = stateOf(chooseDuelMove(state, 1, "strike", 1_100));
    state = advanceQuantumDuelClock(state, state.turnDeadline);
    expect([state.roundWinner, state.roundOutcome]).toEqual([1, "choice_timeout"]);

    state = advanceQuantumDuelClock(state, state.turnDeadline);
    state = advanceQuantumDuelClock(state, state.turnDeadline);
    expect([state.roundWinner, state.roundOutcome]).toEqual([null, "double_timeout"]);
  });
});
