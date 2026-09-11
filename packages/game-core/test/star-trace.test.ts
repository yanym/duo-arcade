import { describe, expect, it } from "vitest";

import {
  advanceStarTraceClock,
  createStarTraceState,
  getStarTraceView,
  moveStarTrace,
  type GameOptions,
  type MazeDirection,
  type Seat,
  type StarTraceState,
} from "../src/index";

const options: GameOptions = { pace: "standard", difficulty: "standard", length: "short" };

function unwrap(result: ReturnType<typeof moveStarTrace>): StarTraceState {
  if (!result.ok || result.state.kind !== "star_trace") throw new Error("expected star trace state");
  return result.state;
}

function routeToNext(state: StarTraceState): MazeDirection[] {
  const target = state.checkpoints[state.currentTarget]!;
  const route: MazeDirection[] = [];
  const horizontal = target.x - state.cursor.x;
  const vertical = target.y - state.cursor.y;
  for (let index = 0; index < Math.abs(horizontal); index += 1) route.push(horizontal > 0 ? "right" : "left");
  for (let index = 0; index < Math.abs(vertical); index += 1) route.push(vertical > 0 ? "down" : "up");
  return route;
}

function completeStage(state: StarTraceState, actor: Seat, now: number): StarTraceState {
  while (state.phase === "tracing" && !state.result) {
    for (const direction of routeToNext(state)) state = unwrap(moveStarTrace(state, actor, direction, now));
  }
  return state;
}

describe("star trace", () => {
  it("maps options to a deterministic chart with a usable ink budget", () => {
    const state = createStarTraceState(0, 1_000, 42, options);
    expect([state.totalStages, state.gridSize, state.checkpointCount, state.stageDurationMs]).toEqual([2, 9, 4, 45_000]);
    expect(state.checkpoints).toHaveLength(4);
    expect(state.maxInk).toBeGreaterThan(8);
    expect(state.trail).toEqual([state.start]);
    expect(createStarTraceState(0, 1_000, 42, options)).toEqual(state);
  });

  it("shows the chart only to the guide until stage reveal", () => {
    const state = createStarTraceState(1, 1_000, 7, options);
    expect(getStarTraceView(state, 1).checkpoints).toEqual(state.checkpoints);
    expect(getStarTraceView(state, 0).checkpoints).toBeNull();
    expect(getStarTraceView(state, null).checkpoints).toBeNull();
  });

  it("enforces roles, stage timing and chart boundaries", () => {
    let state = createStarTraceState(0, 1_000, 8, options);
    expect(moveStarTrace(state, 0, "up", 1_100)).toEqual({ ok: false, reason: "wrong_role" });
    expect(moveStarTrace(state, 1, "up", state.turnDeadline)).toEqual({ ok: false, reason: "turn_expired" });
    state = { ...state, cursor: { x: 0, y: 0 } };
    expect(moveStarTrace(state, 1, "left", 1_100)).toEqual({ ok: false, reason: "invalid_position" });
    expect(moveStarTrace({ ...state, phase: "stage_result" }, 1, "right", 1_100)).toEqual({ ok: false, reason: "wrong_phase" });
  });

  it("records a public trail, reveals the chart and swaps roles", () => {
    let state = createStarTraceState(0, 1_000, 11, options);
    state = completeStage(state, 1, 2_000);
    expect([state.phase, state.completedStages, state.currentTarget, state.lastOutcome]).toEqual(["stage_result", 1, 4, "charted"]);
    expect(getStarTraceView(state, 1).checkpoints).toEqual(state.checkpoints);
    const priorGuide = state.guideSeat;
    state = advanceStarTraceClock(state, state.turnDeadline);
    expect([state.stage, state.phase, state.guideSeat, state.currentTarget]).toEqual([2, "tracing", priorGuide === 0 ? 1 : 0, 0]);
    expect(state.trail).toEqual([state.start]);
  });

  it("fails when ink is depleted away from the next star", () => {
    let state = createStarTraceState(0, 1_000, 13, options);
    const target = state.checkpoints[0]!;
    const direction: MazeDirection = state.cursor.x === 0 ? "right" : state.cursor.x === state.gridSize - 1 ? "left" : target.x === state.cursor.x + 1 && target.y === state.cursor.y ? "left" : "right";
    state = { ...state, ink: 1 };
    state = unwrap(moveStarTrace(state, 1, direction, 1_100));
    expect([state.lastOutcome, state.result?.kind, state.result?.reason]).toEqual(["ink_depleted", "failure", "trace_lost"]);
  });

  it("fails and reveals the map when the stage timer expires", () => {
    const state = createStarTraceState(0, 1_000, 17, options);
    const expired = advanceStarTraceClock(state, state.turnDeadline);
    expect(expired.lastOutcome).toBe("trace_timeout");
    expect(expired.result).toEqual({ kind: "failure", score: 0, reason: "timeout" });
    expect(getStarTraceView(expired, 1).checkpoints).toEqual(expired.checkpoints);
  });

  it("can trace every private chart and complete the mission", () => {
    let state = createStarTraceState(0, 1_000, 29, options);
    while (!state.result) {
      const tracer: Seat = state.guideSeat === 0 ? 1 : 0;
      state = completeStage(state, tracer, state.turnDeadline - 1_000);
      if (!state.result) state = advanceStarTraceClock(state, state.turnDeadline);
    }
    expect(state.result.kind).toBe("success");
    expect(state.result.reason).toBe("star_trace_complete");
    expect(state.completedStages).toBe(2);
    expect(state.moves).toBeGreaterThan(0);
  });
});
