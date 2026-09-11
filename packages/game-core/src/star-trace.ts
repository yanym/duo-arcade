import type {
  GameActionResult,
  GameOptions,
  MazeDirection,
  Seat,
  StarTracePoint,
  StarTraceState,
  StarTraceViewState,
} from "./types";

const STAGE_REVEAL_MS = 1_600;

type StarTraceConfig = Pick<
  StarTraceState,
  "totalStages" | "gridSize" | "checkpointCount" | "stageDurationMs"
> & { inkBuffer: number };

function traceConfig(options: GameOptions): StarTraceConfig {
  const difficulty = {
    easy: { gridSize: 7 as const, checkpointCount: 3 as const, inkBuffer: 12 },
    standard: { gridSize: 9 as const, checkpointCount: 4 as const, inkBuffer: 8 },
    hard: { gridSize: 11 as const, checkpointCount: 5 as const, inkBuffer: 5 },
  }[options.difficulty];
  return {
    ...difficulty,
    totalStages: { short: 2 as const, standard: 3 as const, long: 4 as const }[options.length],
    stageDurationMs: { relaxed: 60_000, standard: 45_000, blitz: 32_000 }[options.pace],
  };
}

function mixedValue(seed: number, index: number): number {
  let value = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}

function samePoint(a: StarTracePoint, b: StarTracePoint): boolean {
  return a.x === b.x && a.y === b.y;
}

function createChart(seed: number, stage: number, size: number, checkpointCount: number, inkBuffer: number) {
  const stageSeed = mixedValue(seed, stage * 101);
  const margin = 1;
  let point: StarTracePoint = {
    x: margin + mixedValue(stageSeed, 1) % (size - margin * 2),
    y: margin + mixedValue(stageSeed, 2) % (size - margin * 2),
  };
  const start = { ...point };
  const checkpoints: StarTracePoint[] = [];
  let optimalSteps = 0;
  let previousDirection = -1;

  for (let index = 0; index < checkpointCount; index += 1) {
    const candidates = [
      { direction: 0, dx: 0, dy: -1, room: point.y },
      { direction: 1, dx: 1, dy: 0, room: size - 1 - point.x },
      { direction: 2, dx: 0, dy: 1, room: size - 1 - point.y },
      { direction: 3, dx: -1, dy: 0, room: point.x },
    ].filter((candidate) => candidate.room >= 2 && candidate.direction !== (previousDirection + 2) % 4);
    const pool = candidates.length > 0 ? candidates : [
      { direction: 0, dx: 0, dy: -1, room: point.y },
      { direction: 1, dx: 1, dy: 0, room: size - 1 - point.x },
      { direction: 2, dx: 0, dy: 1, room: size - 1 - point.y },
      { direction: 3, dx: -1, dy: 0, room: point.x },
    ].filter((candidate) => candidate.room >= 2);
    const choice = pool[mixedValue(stageSeed, 20 + index * 2) % pool.length]!;
    const maxDistance = Math.min(choice.room, size >= 11 ? 4 : 3);
    const distance = 2 + mixedValue(stageSeed, 21 + index * 2) % Math.max(1, maxDistance - 1);
    point = { x: point.x + choice.dx * distance, y: point.y + choice.dy * distance };
    if (checkpoints.some((checkpoint) => samePoint(checkpoint, point))) {
      point = { x: point.x - choice.dx, y: point.y - choice.dy };
      optimalSteps += distance - 1;
    } else {
      optimalSteps += distance;
    }
    checkpoints.push({ ...point });
    previousDirection = choice.direction;
  }

  return { start, checkpoints, maxInk: optimalSteps + inkBuffer };
}

export function createStarTraceState(
  startingSeat: Seat,
  now: number,
  seed: number,
  options: GameOptions,
): StarTraceState {
  const config = traceConfig(options);
  const chart = createChart(seed, 1, config.gridSize, config.checkpointCount, config.inkBuffer);
  return {
    kind: "star_trace",
    rulesVersion: 1,
    seed,
    stage: 1,
    totalStages: config.totalStages,
    phase: "tracing",
    guideSeat: startingSeat,
    gridSize: config.gridSize,
    start: chart.start,
    cursor: chart.start,
    checkpoints: chart.checkpoints,
    checkpointCount: config.checkpointCount,
    currentTarget: 0,
    trail: [chart.start],
    ink: chart.maxInk,
    maxInk: chart.maxInk,
    moves: 0,
    completedStages: 0,
    score: 0,
    stageDurationMs: config.stageDurationMs,
    lastOutcome: null,
    lastMove: null,
    turnDeadline: now + config.stageDurationMs,
    result: null,
  };
}

function movePoint(point: StarTracePoint, direction: MazeDirection): StarTracePoint {
  if (direction === "up") return { x: point.x, y: point.y - 1 };
  if (direction === "right") return { x: point.x + 1, y: point.y };
  if (direction === "down") return { x: point.x, y: point.y + 1 };
  return { x: point.x - 1, y: point.y };
}

export function moveStarTrace(
  state: StarTraceState,
  actor: Seat,
  direction: MazeDirection,
  now: number,
): GameActionResult {
  if (state.result) return { ok: false, reason: "game_finished" };
  if (state.phase !== "tracing") return { ok: false, reason: "wrong_phase" };
  if (now >= state.turnDeadline) return { ok: false, reason: "turn_expired" };
  if (actor === state.guideSeat) return { ok: false, reason: "wrong_role" };
  const cursor = movePoint(state.cursor, direction);
  if (cursor.x < 0 || cursor.y < 0 || cursor.x >= state.gridSize || cursor.y >= state.gridSize) {
    return { ok: false, reason: "invalid_position" };
  }

  const ink = state.ink - 1;
  const reached = samePoint(cursor, state.checkpoints[state.currentTarget]!);
  const currentTarget = state.currentTarget + (reached ? 1 : 0);
  const completed = currentTarget >= state.checkpoints.length;
  const moves = state.moves + 1;
  const trail = [...state.trail, cursor];

  if (completed) {
    const completedStages = state.completedStages + 1;
    const timeBonus = Math.max(0, Math.floor((state.turnDeadline - now) / 1_000)) * 5;
    const score = state.score + 250 + Math.max(0, ink) * 10 + timeBonus;
    const result = state.stage >= state.totalStages
      ? { kind: "success" as const, score, reason: "star_trace_complete" as const }
      : null;
    return {
      ok: true,
      state: {
        ...state,
        phase: "stage_result",
        cursor,
        currentTarget,
        trail,
        ink: Math.max(0, ink),
        moves,
        completedStages,
        score,
        lastOutcome: "charted",
        lastMove: direction,
        turnDeadline: now + STAGE_REVEAL_MS,
        result,
      },
    };
  }

  if (ink <= 0) {
    return {
      ok: true,
      state: {
        ...state,
        phase: "stage_result",
        cursor,
        trail,
        ink: 0,
        moves,
        lastOutcome: "ink_depleted",
        lastMove: direction,
        result: { kind: "failure", score: state.score, reason: "trace_lost" },
      },
    };
  }

  return {
    ok: true,
    state: {
      ...state,
      cursor,
      currentTarget,
      trail,
      ink,
      moves,
      score: state.score + (reached ? 30 : 1),
      lastMove: direction,
    },
  };
}

export function advanceStarTraceClock(state: StarTraceState, now: number): StarTraceState {
  if (state.result || now < state.turnDeadline) return state;
  if (state.phase === "tracing") {
    return {
      ...state,
      phase: "stage_result",
      lastOutcome: "trace_timeout",
      result: { kind: "failure", score: state.score, reason: "timeout" },
    };
  }
  const stage = state.stage + 1;
  const inkBuffer = state.gridSize === 7 ? 12 : state.gridSize === 9 ? 8 : 5;
  const chart = createChart(state.seed, stage, state.gridSize, state.checkpointCount, inkBuffer);
  return {
    ...state,
    stage,
    phase: "tracing",
    guideSeat: state.guideSeat === 0 ? 1 : 0,
    start: chart.start,
    cursor: chart.start,
    checkpoints: chart.checkpoints,
    currentTarget: 0,
    trail: [chart.start],
    ink: chart.maxInk,
    maxInk: chart.maxInk,
    lastOutcome: null,
    lastMove: null,
    turnDeadline: now + state.stageDurationMs,
  };
}

export function getStarTraceView(state: StarTraceState, viewerSeat: Seat | null): StarTraceViewState {
  if (state.phase === "stage_result" || state.result || viewerSeat === state.guideSeat) return state;
  return { ...state, checkpoints: null };
}
