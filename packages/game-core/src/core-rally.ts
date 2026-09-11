import {
  otherSeat,
  type CoreRallyOutcome,
  type CoreRallyState,
  type GameActionResult,
  type GameOptions,
  type Seat,
} from "./types";

const RESULT_DURATION_MS = 1_200;

function rallyConfig(options: GameOptions): Pick<
  CoreRallyState,
  "targetReturns" | "laneCount" | "maxStability" | "flightDurationMs" | "returnWindowMs"
> {
  const difficulty = {
    easy: { laneCount: 3 as const, maxStability: 4 as const, returnWindowMs: 1_200 },
    standard: { laneCount: 4 as const, maxStability: 3 as const, returnWindowMs: 900 },
    hard: { laneCount: 5 as const, maxStability: 2 as const, returnWindowMs: 650 },
  }[options.difficulty];
  return {
    ...difficulty,
    targetReturns: { short: 6 as const, standard: 10 as const, long: 14 as const }[options.length],
    flightDurationMs: { relaxed: 2_600, standard: 1_900, blitz: 1_400 }[options.pace],
  };
}

function laneFor(seed: number, rally: number, laneCount: number, previous: number | null): number {
  let value = (seed ^ Math.imul(rally, 0x9e3779b1)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35) >>> 0;
  let lane = ((value ^ (value >>> 16)) >>> 0) % laneCount;
  if (previous !== null && lane === previous) lane = (lane + 1 + (rally % (laneCount - 1))) % laneCount;
  return lane;
}

export function createCoreRallyState(
  receiverSeat: Seat,
  now: number,
  seed: number,
  options: GameOptions,
): CoreRallyState {
  const config = rallyConfig(options);
  const center = Math.floor((config.laneCount - 1) / 2);
  return {
    kind: "core_rally",
    rulesVersion: 1,
    seed,
    rally: 1,
    targetReturns: config.targetReturns,
    phase: "approach",
    receiverSeat,
    laneCount: config.laneCount,
    incomingLane: laneFor(seed, 1, config.laneCount, null),
    paddleLanes: [center, center],
    stability: config.maxStability,
    maxStability: config.maxStability,
    successfulReturns: 0,
    totalAttempts: 0,
    totalMoves: 0,
    combo: 0,
    bestCombo: 0,
    score: 0,
    flightDurationMs: config.flightDurationMs,
    returnWindowMs: config.returnWindowMs,
    strikeAt: 0,
    lastOutcome: null,
    lastAccuracyMs: null,
    turnDeadline: now + config.flightDurationMs,
    result: null,
  };
}

export function moveCorePaddle(
  state: CoreRallyState,
  actor: Seat,
  direction: -1 | 1,
  now: number,
): GameActionResult {
  if (state.result) return { ok: false, reason: "game_finished" };
  if (state.phase === "rally_result") return { ok: false, reason: "wrong_phase" };
  if (actor !== state.receiverSeat) return { ok: false, reason: "wrong_role" };
  if (now >= state.turnDeadline) return { ok: false, reason: "turn_expired" };
  const nextLane = state.paddleLanes[actor] + direction;
  if (nextLane < 0 || nextLane >= state.laneCount) return { ok: false, reason: "paddle_edge" };
  const paddleLanes: [number, number] = [...state.paddleLanes];
  paddleLanes[actor] = nextLane;
  return { ok: true, state: { ...state, paddleLanes, totalMoves: state.totalMoves + 1 } };
}

function resolveRally(
  state: CoreRallyState,
  now: number,
  outcome: CoreRallyOutcome,
  accuracyMs: number | null,
): CoreRallyState {
  const returned = outcome === "returned";
  const successfulReturns = state.successfulReturns + (returned ? 1 : 0);
  const stability = state.stability - (returned ? 0 : 1);
  const combo = returned ? state.combo + 1 : 0;
  const bestCombo = Math.max(state.bestCombo, combo);
  const precision = accuracyMs === null ? 0 : Math.max(20, 120 - Math.round(accuracyMs / 6));
  const score = state.score + (returned ? 100 + precision + combo * 8 : 0);
  const success = successfulReturns >= state.targetReturns;
  const failed = stability <= 0;
  return {
    ...state,
    phase: "rally_result",
    stability,
    successfulReturns,
    totalAttempts: state.totalAttempts + 1,
    combo,
    bestCombo,
    score,
    lastOutcome: outcome,
    lastAccuracyMs: accuracyMs,
    turnDeadline: now + RESULT_DURATION_MS,
    result: success
      ? {
          kind: "success",
          score: score + stability * 120 + bestCombo * 25,
          reason: "core_rally_complete",
        }
      : failed
        ? { kind: "failure", score, reason: "core_lost" }
        : null,
  };
}

export function returnCoreRally(
  state: CoreRallyState,
  actor: Seat,
  now: number,
): GameActionResult {
  if (state.result) return { ok: false, reason: "game_finished" };
  if (state.phase === "approach") return { ok: false, reason: "too_early" };
  if (state.phase !== "return_window") return { ok: false, reason: "wrong_phase" };
  if (actor !== state.receiverSeat) return { ok: false, reason: "wrong_role" };
  if (now >= state.turnDeadline) return { ok: false, reason: "turn_expired" };
  const aligned = state.paddleLanes[actor] === state.incomingLane;
  const accuracyMs = Math.abs(now - state.strikeAt);
  return {
    ok: true,
    state: resolveRally(state, now, aligned ? "returned" : "missed_lane", accuracyMs),
  };
}

export function advanceCoreRallyClock(state: CoreRallyState, now: number): CoreRallyState {
  if (state.result || now < state.turnDeadline) return state;
  if (state.phase === "approach") {
    const strikeAt = now + Math.round(state.returnWindowMs / 2);
    return {
      ...state,
      phase: "return_window",
      strikeAt,
      turnDeadline: now + state.returnWindowMs,
    };
  }
  if (state.phase === "return_window") return resolveRally(state, now, "timed_out", null);

  const rally = state.rally + 1;
  return {
    ...state,
    rally,
    phase: "approach",
    receiverSeat: otherSeat(state.receiverSeat),
    incomingLane: laneFor(state.seed, rally, state.laneCount, state.incomingLane),
    strikeAt: 0,
    lastOutcome: null,
    lastAccuracyMs: null,
    turnDeadline: now + state.flightDurationMs,
  };
}
