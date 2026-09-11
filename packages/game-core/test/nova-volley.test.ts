import { describe, expect, it } from "vitest";

import {
  advanceNovaVolleyClock,
  createNovaVolleyState,
  moveNovaPaddle,
  strikeNovaBall,
  type GameOptions,
  type NovaVolleyState,
} from "../src/index";

const options: GameOptions = { pace: "standard", difficulty: "standard", length: "short" };

function unwrap(
  result: ReturnType<typeof moveNovaPaddle> | ReturnType<typeof strikeNovaBall>,
): NovaVolleyState {
  if (!result.ok || result.state.kind !== "nova_volley") throw new Error("expected nova volley state");
  return result.state;
}

function align(state: NovaVolleyState, now: number): NovaVolleyState {
  let next = state;
  while (next.paddleLanes[next.receiverSeat] !== next.incomingLane) {
    const direction = next.paddleLanes[next.receiverSeat] < next.incomingLane ? 1 : -1;
    next = unwrap(moveNovaPaddle(next, next.receiverSeat, direction, now));
  }
  return next;
}

describe("nova volley", () => {
  it("is deterministic and maps pace, difficulty and length independently", () => {
    const first = createNovaVolleyState(0, 1_000, 42, options);
    expect(first).toEqual(createNovaVolleyState(0, 1_000, 42, options));
    expect([first.targetScore, first.laneCount, first.baseFlightMs, first.strikeWindowMs])
      .toEqual([3, 4, 2_000, 900]);

    const hard = createNovaVolleyState(1, 0, 7, {
      pace: "blitz",
      difficulty: "hard",
      length: "long",
    });
    expect([hard.targetScore, hard.laneCount, hard.baseFlightMs, hard.strikeWindowMs])
      .toEqual([7, 5, 1_400, 600]);
  });

  it("starts away from the paddle and enforces receiver ownership and lane edges", () => {
    let state = createNovaVolleyState(0, 1_000, 3, options);
    expect(state.incomingLane).not.toBe(state.paddleLanes[0]);
    expect(moveNovaPaddle(state, 1, 1, 1_100)).toEqual({ ok: false, reason: "wrong_role" });
    state = { ...state, paddleLanes: [0, state.paddleLanes[1]] };
    expect(moveNovaPaddle(state, 0, -1, 1_100)).toEqual({ ok: false, reason: "paddle_edge" });
  });

  it("opens a server strike window and rejects early or invalid strikes", () => {
    let state = createNovaVolleyState(0, 1_000, 5, options);
    expect(strikeNovaBall(state, 0, 1, 1_100)).toEqual({ ok: false, reason: "too_early" });
    state = align(state, 1_100);
    state = advanceNovaVolleyClock(state, state.turnDeadline);
    expect(state.phase).toBe("strike_window");
    expect(strikeNovaBall(state, 1, 1, state.turnDeadline - 1)).toEqual({ ok: false, reason: "wrong_role" });
    expect(strikeNovaBall(state, 0, 99, state.turnDeadline - 1)).toEqual({ ok: false, reason: "invalid_lane" });
  });

  it("returns an aligned ball into a chosen lane and accelerates the rally", () => {
    let state = align(createNovaVolleyState(0, 1_000, 11, options), 1_100);
    state = advanceNovaVolleyClock(state, state.turnDeadline);
    state = unwrap(strikeNovaBall(state, 0, 3, state.turnDeadline - 100));
    expect([state.phase, state.receiverSeat, state.incomingLane, state.rallyCount])
      .toEqual(["approach", 1, 3, 1]);
    expect(state.successfulReturns).toEqual([1, 0]);
    expect(state.currentFlightMs).toBe(state.baseFlightMs - 85);
  });

  it("awards a point for a misaligned return and lets the loser receive next", () => {
    let state = createNovaVolleyState(0, 1_000, 19, options);
    state = { ...state, paddleLanes: [state.incomingLane === 0 ? 1 : 0, state.paddleLanes[1]] };
    state = advanceNovaVolleyClock(state, state.turnDeadline);
    state = unwrap(strikeNovaBall(state, 0, 2, state.turnDeadline - 1));
    expect([state.phase, state.lastOutcome, state.pointWinner, ...state.scores])
      .toEqual(["point_result", "misaligned_return", 1, 0, 1]);

    state = advanceNovaVolleyClock(state, state.turnDeadline);
    expect([state.phase, state.receiverSeat, state.rallyCount, state.serveNumber])
      .toEqual(["approach", 0, 0, 2]);
    expect(state.incomingLane).not.toBe(state.paddleLanes[0]);
  });

  it("awards a point to the opponent when the strike window expires", () => {
    let state = createNovaVolleyState(1, 1_000, 23, options);
    state = advanceNovaVolleyClock(state, state.turnDeadline);
    state = advanceNovaVolleyClock(state, state.turnDeadline);
    expect([state.lastOutcome, state.pointWinner, ...state.scores])
      .toEqual(["return_timeout", 0, 1, 0]);
  });

  it("ends a short match at three points and retains the best rally", () => {
    let state = createNovaVolleyState(0, 1_000, 31, options);
    for (let point = 0; point < 3; point += 1) {
      if (state.receiverSeat === 0) {
        // Seat 0 returns once into a lane away from seat 1's paddle.
        state = align(state, state.turnDeadline - 1);
        state = advanceNovaVolleyClock(state, state.turnDeadline);
        const target = state.paddleLanes[1] === 0 ? 1 : 0;
        state = unwrap(strikeNovaBall(state, 0, target, state.turnDeadline - 1));
      }

      // Seat 1 deliberately misses; the point loser receives the following serve.
      state = advanceNovaVolleyClock(state, state.turnDeadline);
      state = unwrap(strikeNovaBall(state, 1, 0, state.turnDeadline - 1));
      if (!state.result) state = advanceNovaVolleyClock(state, state.turnDeadline);
    }
    expect(state.result).toEqual({ kind: "win", winnerSeat: 0, reason: "nova_volley_score" });
    expect(state.scores).toEqual([3, 0]);
    expect(state.bestRally).toBe(1);
    expect(state.successfulReturns).toEqual([1, 0]);
  });
});
