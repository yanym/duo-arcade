import {
  otherSeat,
  type GameActionResult,
  type GameOptions,
  type NovaVolleyOutcome,
  type NovaVolleyState,
  type Seat,
} from "./types";

const POINT_RESULT_DURATION_MS = 1_500;
const MIN_FLIGHT_DURATION_MS = 850;
const RALLY_ACCELERATION_MS = 85;

function volleyConfig(options: GameOptions): Pick<
  NovaVolleyState,
  "targetScore" | "laneCount" | "baseFlightMs" | "strikeWindowMs"
> {
  return {
    targetScore: { short: 3 as const, standard: 5 as const, long: 7 as const }[options.length],
    ...{
      easy: { laneCount: 3 as const, strikeWindowMs: 1_400 },
      standard: { laneCount: 4 as const, strikeWindowMs: 900 },
      hard: { laneCount: 5 as const, strikeWindowMs: 600 },
    }[options.difficulty],
    baseFlightMs: { relaxed: 2_800, standard: 2_000, blitz: 1_400 }[options.pace],
  };
}

function mix(seed: number, index: number): number {
  let value = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}

function serveLane(seed: number, serveNumber: number, laneCount: number, avoidLane: number): number {
  const value = mix(seed, serveNumber * 43);
  let lane = value % laneCount;
  if (lane === avoidLane) lane = (lane + 1 + (value % (laneCount - 1))) % laneCount;
  return lane;
}

function acceleratedFlight(baseFlightMs: number, rallyCount: number): number {
  return Math.max(MIN_FLIGHT_DURATION_MS, baseFlightMs - rallyCount * RALLY_ACCELERATION_MS);
}

export function createNovaVolleyState(
  receiverSeat: Seat,
  now: number,
  seed: number,
  options: GameOptions,
): NovaVolleyState {
  const config = volleyConfig(options);
  const center = Math.floor((config.laneCount - 1) / 2);
  return {
    kind: "nova_volley",
    rulesVersion: 1,
    seed,
    phase: "approach",
    receiverSeat,
    laneCount: config.laneCount,
    incomingLane: serveLane(seed, 1, config.laneCount, center),
    paddleLanes: [center, center],
    scores: [0, 0],
    targetScore: config.targetScore,
    serveNumber: 1,
    rallyCount: 0,
    bestRally: 0,
    successfulReturns: [0, 0],
    totalMoves: [0, 0],
    pointWinner: null,
    lastOutcome: null,
    baseFlightMs: config.baseFlightMs,
    currentFlightMs: config.baseFlightMs,
    strikeWindowMs: config.strikeWindowMs,
    turnDeadline: now + config.baseFlightMs,
    result: null,
  };
}

export function moveNovaPaddle(
  state: NovaVolleyState,
  actor: Seat,
  direction: -1 | 1,
  now: number,
): GameActionResult {
  if (state.result) return { ok: false, reason: "game_finished" };
  if (state.phase === "point_result") return { ok: false, reason: "wrong_phase" };
  if (actor !== state.receiverSeat) return { ok: false, reason: "wrong_role" };
  if (now >= state.turnDeadline) return { ok: false, reason: "turn_expired" };
  const nextLane = state.paddleLanes[actor] + direction;
  if (nextLane < 0 || nextLane >= state.laneCount) return { ok: false, reason: "paddle_edge" };
  const paddleLanes: [number, number] = [...state.paddleLanes];
  const totalMoves: [number, number] = [...state.totalMoves];
  paddleLanes[actor] = nextLane;
  totalMoves[actor] += 1;
  return { ok: true, state: { ...state, paddleLanes, totalMoves } };
}

function scorePoint(
  state: NovaVolleyState,
  winnerSeat: Seat,
  outcome: NovaVolleyOutcome,
  now: number,
): NovaVolleyState {
  const scores: [number, number] = [...state.scores];
  scores[winnerSeat] += 1;
  const wonMatch = scores[winnerSeat] >= state.targetScore;
  return {
    ...state,
    phase: "point_result",
    scores,
    bestRally: Math.max(state.bestRally, state.rallyCount),
    pointWinner: winnerSeat,
    lastOutcome: outcome,
    turnDeadline: now + POINT_RESULT_DURATION_MS,
    result: wonMatch
      ? { kind: "win", winnerSeat, reason: "nova_volley_score" }
      : null,
  };
}

export function strikeNovaBall(
  state: NovaVolleyState,
  actor: Seat,
  targetLane: number,
  now: number,
): GameActionResult {
  if (state.result) return { ok: false, reason: "game_finished" };
  if (state.phase === "approach") return { ok: false, reason: "too_early" };
  if (state.phase !== "strike_window") return { ok: false, reason: "wrong_phase" };
  if (actor !== state.receiverSeat) return { ok: false, reason: "wrong_role" };
  if (now >= state.turnDeadline) return { ok: false, reason: "turn_expired" };
  if (!Number.isSafeInteger(targetLane) || targetLane < 0 || targetLane >= state.laneCount) {
    return { ok: false, reason: "invalid_lane" };
  }
  if (state.paddleLanes[actor] !== state.incomingLane) {
    return { ok: true, state: scorePoint(state, otherSeat(actor), "misaligned_return", now) };
  }

  const rallyCount = state.rallyCount + 1;
  const successfulReturns: [number, number] = [...state.successfulReturns];
  successfulReturns[actor] += 1;
  const currentFlightMs = acceleratedFlight(state.baseFlightMs, rallyCount);
  return {
    ok: true,
    state: {
      ...state,
      phase: "approach",
      receiverSeat: otherSeat(actor),
      incomingLane: targetLane,
      rallyCount,
      bestRally: Math.max(state.bestRally, rallyCount),
      successfulReturns,
      pointWinner: null,
      lastOutcome: null,
      currentFlightMs,
      turnDeadline: now + currentFlightMs,
    },
  };
}

export function advanceNovaVolleyClock(state: NovaVolleyState, now: number): NovaVolleyState {
  if (state.result || now < state.turnDeadline) return state;
  if (state.phase === "approach") {
    return {
      ...state,
      phase: "strike_window",
      turnDeadline: now + state.strikeWindowMs,
    };
  }
  if (state.phase === "strike_window") {
    return scorePoint(state, otherSeat(state.receiverSeat), "return_timeout", now);
  }

  const receiverSeat = otherSeat(state.pointWinner!);
  const serveNumber = state.serveNumber + 1;
  const incomingLane = serveLane(
    state.seed,
    serveNumber,
    state.laneCount,
    state.paddleLanes[receiverSeat],
  );
  return {
    ...state,
    phase: "approach",
    receiverSeat,
    incomingLane,
    serveNumber,
    rallyCount: 0,
    pointWinner: null,
    lastOutcome: null,
    currentFlightMs: state.baseFlightMs,
    turnDeadline: now + state.baseFlightMs,
  };
}
