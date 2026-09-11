import {
  otherSeat,
  type GameActionResult,
  type GameOptions,
  type PrismHeistOutcome,
  type PrismHeistState,
  type PrismHeistViewState,
  type Seat,
} from "./types";

const RESULT_REVEAL_MS = 1_600;

type HeistConfig = Pick<
  PrismHeistState,
  "totalCorridors" | "laneCount" | "maxIntegrity" | "approachDurationMs" | "breachWindowMs"
>;

function heistConfig(options: GameOptions): HeistConfig {
  const difficulty = {
    easy: { laneCount: 3 as const, maxIntegrity: 4 as const, breachWindowMs: 2_400 },
    standard: { laneCount: 4 as const, maxIntegrity: 3 as const, breachWindowMs: 1_500 },
    hard: { laneCount: 5 as const, maxIntegrity: 2 as const, breachWindowMs: 900 },
  }[options.difficulty];
  return {
    ...difficulty,
    totalCorridors: { short: 4 as const, standard: 6 as const, long: 8 as const }[options.length],
    approachDurationMs: { relaxed: 12_000, standard: 8_000, blitz: 5_000 }[options.pace],
  };
}

function mixedValue(seed: number, index: number): number {
  let value = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}

function safeLaneFor(seed: number, corridor: number, laneCount: number): number {
  const center = Math.floor(laneCount / 2);
  const choices = Array.from({ length: laneCount }, (_, lane) => lane).filter((lane) => lane !== center);
  return choices[mixedValue(seed, corridor * 71) % choices.length]!;
}

export function createPrismHeistState(
  startingSeat: Seat,
  now: number,
  seed: number,
  options: GameOptions,
): PrismHeistState {
  const config = heistConfig(options);
  return {
    kind: "prism_heist",
    rulesVersion: 1,
    seed,
    corridor: 1,
    totalCorridors: config.totalCorridors,
    phase: "approach",
    scoutSeat: startingSeat,
    laneCount: config.laneCount,
    safeLane: safeLaneFor(seed, 1, config.laneCount),
    runnerLane: Math.floor(config.laneCount / 2),
    bypassLocked: false,
    dashLocked: false,
    integrity: config.maxIntegrity,
    maxIntegrity: config.maxIntegrity,
    cleanBreaches: 0,
    moves: 0,
    totalSyncs: 0,
    score: 0,
    lastOutcome: null,
    approachDurationMs: config.approachDurationMs,
    breachWindowMs: config.breachWindowMs,
    turnDeadline: now + config.approachDurationMs,
    result: null,
  };
}

export function moveHeistRunner(
  state: PrismHeistState,
  actor: Seat,
  direction: -1 | 1,
  now: number,
): GameActionResult {
  if (state.result) return { ok: false, reason: "game_finished" };
  if (state.phase !== "approach") return { ok: false, reason: "wrong_phase" };
  if (actor === state.scoutSeat) return { ok: false, reason: "wrong_role" };
  if (now >= state.turnDeadline) return { ok: false, reason: "turn_expired" };
  if (direction !== -1 && direction !== 1) return { ok: false, reason: "invalid_move" };
  const runnerLane = state.runnerLane + direction;
  if (runnerLane < 0 || runnerLane >= state.laneCount) return { ok: false, reason: "tracker_edge" };
  return { ok: true, state: { ...state, runnerLane, moves: state.moves + 1 } };
}

function resolveBreach(state: PrismHeistState, now: number, synced: boolean): PrismHeistState {
  const clean = synced && state.runnerLane === state.safeLane;
  const outcome: PrismHeistOutcome = !synced ? "sync_missed" : clean ? "clean_breach" : "laser_hit";
  const integrity = clean ? state.integrity : state.integrity - 1;
  const cleanBreaches = state.cleanBreaches + (clean ? 1 : 0);
  const totalSyncs = state.totalSyncs + (synced ? 1 : 0);
  const timeBonus = clean ? Math.max(0, Math.round((state.turnDeadline - now) / 20)) : 0;
  const score = state.score + (clean ? 500 + timeBonus : 0);
  const failed = integrity <= 0;
  const finished = state.corridor >= state.totalCorridors;
  return {
    ...state,
    phase: "corridor_result",
    integrity,
    cleanBreaches,
    totalSyncs,
    score,
    lastOutcome: outcome,
    turnDeadline: now + RESULT_REVEAL_MS,
    result: failed
      ? { kind: "failure", score, reason: "heist_failed" }
      : finished
        ? { kind: "success", score: score + integrity * 180, reason: "prism_heist_complete" }
        : null,
  };
}

function lockBreach(
  state: PrismHeistState,
  actor: Seat,
  kind: "bypass" | "dash",
  now: number,
): GameActionResult {
  if (state.result) return { ok: false, reason: "game_finished" };
  if (state.phase !== "breach") return { ok: false, reason: "wrong_phase" };
  if (now >= state.turnDeadline) return { ok: false, reason: "turn_expired" };
  const expectsScout = kind === "bypass";
  if ((actor === state.scoutSeat) !== expectsScout) return { ok: false, reason: "wrong_role" };
  if ((kind === "bypass" && state.bypassLocked) || (kind === "dash" && state.dashLocked)) {
    return { ok: false, reason: "already_chosen" };
  }
  const next = {
    ...state,
    bypassLocked: state.bypassLocked || kind === "bypass",
    dashLocked: state.dashLocked || kind === "dash",
  };
  return {
    ok: true,
    state: next.bypassLocked && next.dashLocked ? resolveBreach(next, now, true) : next,
  };
}

export function bypassHeistGrid(state: PrismHeistState, actor: Seat, now: number): GameActionResult {
  return lockBreach(state, actor, "bypass", now);
}

export function dashThroughHeist(state: PrismHeistState, actor: Seat, now: number): GameActionResult {
  return lockBreach(state, actor, "dash", now);
}

export function advancePrismHeistClock(state: PrismHeistState, now: number): PrismHeistState {
  if (state.result || now < state.turnDeadline) return state;
  if (state.phase === "approach") {
    return {
      ...state,
      phase: "breach",
      bypassLocked: false,
      dashLocked: false,
      turnDeadline: now + state.breachWindowMs,
    };
  }
  if (state.phase === "breach") return resolveBreach(state, now, false);
  const corridor = state.corridor + 1;
  const scoutSeat = otherSeat(state.scoutSeat);
  return {
    ...state,
    corridor,
    phase: "approach",
    scoutSeat,
    safeLane: safeLaneFor(state.seed, corridor, state.laneCount),
    runnerLane: Math.floor(state.laneCount / 2),
    bypassLocked: false,
    dashLocked: false,
    lastOutcome: null,
    turnDeadline: now + state.approachDurationMs,
  };
}

export function getPrismHeistView(
  state: PrismHeistState,
  viewerSeat: Seat | null,
): PrismHeistViewState {
  if (state.phase === "corridor_result" || state.result) return state;
  return {
    ...state,
    safeLane: viewerSeat === state.scoutSeat ? state.safeLane : null,
  };
}
