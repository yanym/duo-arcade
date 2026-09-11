import { describe, expect, it } from "vitest";

import {
  advanceMeteorDashClock,
  catchMeteor,
  createMeteorDashState,
  getMeteorDashView,
  type GameOptions,
  type MeteorDashState,
} from "../src/index";

const options: GameOptions = { pace: "standard", difficulty: "standard", length: "short" };

function unwrap(result: ReturnType<typeof catchMeteor>): MeteorDashState {
  if (!result.ok || result.state.kind !== "meteor_dash") throw new Error("expected meteor dash state");
  return result.state;
}

function openRound(state: MeteorDashState): MeteorDashState {
  return advanceMeteorDashClock(state, state.turnDeadline);
}

describe("meteor dash", () => {
  it("keeps the target hidden until the server opens the catch window", () => {
    let state = createMeteorDashState(1_000, 44, options);
    expect(state.targetCell).toBeNull();
    expect(catchMeteor(state, 0, 0, 1_100)).toEqual({ ok: false, reason: "too_early" });
    state = openRound(state);
    expect(state.phase).toBe("catching");
    expect(state.targetCell).toBeGreaterThanOrEqual(0);
    expect(state.targetCell).toBeLessThan(state.cellCount);
  });

  it("hides each response and timing until the round resolves", () => {
    let state = openRound(createMeteorDashState(1_000, 55, options));
    state = unwrap(catchMeteor(state, 0, state.targetCell!, state.catchStartedAt + 120));
    expect(getMeteorDashView(state, 0).responses[0]?.reactionMs).toBe(120);
    expect(getMeteorDashView(state, 1).responses[0]).toBeNull();
    expect(getMeteorDashView(state, null).responses).toEqual([null, null]);
    state = unwrap(catchMeteor(state, 1, state.targetCell!, state.catchStartedAt + 260));
    expect(state.roundWinner).toBe(0);
    expect(getMeteorDashView(state, 1).responses[0]?.reactionMs).toBe(120);
  });

  it("rejects invalid and duplicate cells", () => {
    let state = openRound(createMeteorDashState(1_000, 66, options));
    expect(catchMeteor(state, 0, -1, state.catchStartedAt + 10)).toEqual({ ok: false, reason: "invalid_cell" });
    state = unwrap(catchMeteor(state, 0, state.targetCell!, state.catchStartedAt + 20));
    expect(catchMeteor(state, 0, state.targetCell!, state.catchStartedAt + 30)).toEqual({ ok: false, reason: "already_chosen" });
  });

  it("treats near-simultaneous correct catches as a fair draw", () => {
    let state = openRound(createMeteorDashState(1_000, 77, options));
    state = unwrap(catchMeteor(state, 0, state.targetCell!, state.catchStartedAt + 100));
    state = unwrap(catchMeteor(state, 1, state.targetCell!, state.catchStartedAt + 130));
    expect([state.roundWinner, state.scores[0], state.scores[1]]).toEqual([null, 0, 0]);
  });

  it("awards a correct catch over a miss and can end early", () => {
    let state = createMeteorDashState(1_000, 88, options);
    while (!state.result) {
      state = openRound(state);
      const wrong = (state.targetCell! + 1) % state.cellCount;
      state = unwrap(catchMeteor(state, 0, state.targetCell!, state.catchStartedAt + 80));
      state = unwrap(catchMeteor(state, 1, wrong, state.catchStartedAt + 90));
      if (!state.result) state = advanceMeteorDashClock(state, state.turnDeadline);
    }
    expect(state.result).toEqual({ kind: "win", winnerSeat: 0, reason: "meteor_dash_score" });
    expect(state.round).toBe(3);
  });

  it("resolves missing catches at the deadline", () => {
    let state = openRound(createMeteorDashState(1_000, 99, options));
    state = unwrap(catchMeteor(state, 1, state.targetCell!, state.catchStartedAt + 70));
    state = advanceMeteorDashClock(state, state.turnDeadline);
    expect([state.roundWinner, state.scores[1]]).toEqual([1, 1]);
  });
});
