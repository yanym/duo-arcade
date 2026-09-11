import type {
  GameActionResult,
  GameOptions,
  Seat,
  StormGridState,
  StormGridViewState,
} from "./types";

const RESULT_REVEAL_MS = 1_500;

function stormConfig(options: GameOptions): Pick<
  StormGridState,
  "totalWaves" | "nodeCount" | "maxIntegrity" | "chargeDurationMs" | "dischargeWindowMs"
> {
  const difficulty = {
    easy: { nodeCount: 4 as const, maxIntegrity: 4 as const, dischargeWindowMs: 2_200 },
    standard: { nodeCount: 5 as const, maxIntegrity: 3 as const, dischargeWindowMs: 1_600 },
    hard: { nodeCount: 6 as const, maxIntegrity: 2 as const, dischargeWindowMs: 1_000 },
  }[options.difficulty];
  return {
    ...difficulty,
    totalWaves: { short: 4 as const, standard: 6 as const, long: 8 as const }[options.length],
    chargeDurationMs: { relaxed: 8_000, standard: 6_000, blitz: 4_000 }[options.pace],
  };
}

function mixedValue(seed: number, wave: number, channel: number): number {
  let value = (seed ^ Math.imul(wave * 7 + channel + 1, 0x9e3779b1)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}

function targetFor(seed: number, wave: number, nodeCount: number) {
  return {
    targetNode: mixedValue(seed, wave, 0) % nodeCount,
    targetPolarity: (mixedValue(seed, wave, 1) & 1) === 0 ? "positive" as const : "negative" as const,
  };
}

export function createStormGridState(
  startingSeat: Seat,
  now: number,
  seed: number,
  options: GameOptions,
): StormGridState {
  const config = stormConfig(options);
  const target = targetFor(seed, 1, config.nodeCount);
  return {
    kind: "storm_grid",
    rulesVersion: 1,
    seed,
    wave: 1,
    totalWaves: config.totalWaves,
    phase: "charging",
    sensorSeat: startingSeat,
    nodeCount: config.nodeCount,
    selectorNode: mixedValue(seed, 1, 2) % config.nodeCount,
    polarity: (mixedValue(seed, 1, 3) & 1) === 0 ? "positive" : "negative",
    ...target,
    integrity: config.maxIntegrity,
    maxIntegrity: config.maxIntegrity,
    stabilizedWaves: 0,
    faults: 0,
    totalAdjustments: 0,
    score: 0,
    chargeDurationMs: config.chargeDurationMs,
    dischargeWindowMs: config.dischargeWindowMs,
    windowStartedAt: 0,
    waveOutcome: null,
    lastAccuracyMs: null,
    turnDeadline: now + config.chargeDurationMs,
    result: null,
  };
}

function canAdjust(state: StormGridState, actor: Seat, now: number): GameActionResult | null {
  if (state.result) return { ok: false, reason: "game_finished" };
  if (state.phase === "wave_result") return { ok: false, reason: "wrong_phase" };
  if (now >= state.turnDeadline) return { ok: false, reason: "turn_expired" };
  if (actor === state.sensorSeat) return { ok: false, reason: "wrong_role" };
  return null;
}

export function shiftGridSelector(
  state: StormGridState,
  actor: Seat,
  direction: -1 | 1,
  now: number,
): GameActionResult {
  const rejected = canAdjust(state, actor, now);
  if (rejected) return rejected;
  if (direction !== -1 && direction !== 1) return { ok: false, reason: "invalid_move" };
  return {
    ok: true,
    state: {
      ...state,
      selectorNode: (state.selectorNode + direction + state.nodeCount) % state.nodeCount,
      totalAdjustments: state.totalAdjustments + 1,
    },
  };
}

export function toggleGridPolarity(
  state: StormGridState,
  actor: Seat,
  now: number,
): GameActionResult {
  const rejected = canAdjust(state, actor, now);
  if (rejected) return rejected;
  return {
    ok: true,
    state: {
      ...state,
      polarity: state.polarity === "positive" ? "negative" : "positive",
      totalAdjustments: state.totalAdjustments + 1,
    },
  };
}

function resolveWave(state: StormGridState, now: number, timedOut: boolean): StormGridState {
  const aligned = !timedOut && state.selectorNode === state.targetNode && state.polarity === state.targetPolarity;
  const integrity = state.integrity - (aligned ? 0 : 1);
  const stabilizedWaves = state.stabilizedWaves + (aligned ? 1 : 0);
  const faults = state.faults + (aligned ? 0 : 1);
  const accuracy = timedOut ? null : Math.abs(now - (state.windowStartedAt + state.dischargeWindowMs / 2));
  const score = state.score + (aligned
    ? 260 + state.integrity * 30 + Math.max(0, 100 - Math.round((accuracy ?? 0) / 8))
    : 0);
  const finished = state.wave >= state.totalWaves;
  const result = integrity <= 0
    ? { kind: "failure" as const, score, reason: "grid_collapsed" as const }
    : finished
      ? { kind: "success" as const, score, reason: "storm_grid_complete" as const }
      : null;
  return {
    ...state,
    phase: "wave_result",
    integrity,
    stabilizedWaves,
    faults,
    score,
    waveOutcome: timedOut ? "surge_timeout" : aligned ? "stabilized" : "misrouted",
    lastAccuracyMs: accuracy,
    turnDeadline: now + RESULT_REVEAL_MS,
    result,
  };
}

export function dischargeStormGrid(
  state: StormGridState,
  actor: Seat,
  now: number,
): GameActionResult {
  if (state.result) return { ok: false, reason: "game_finished" };
  if (actor !== state.sensorSeat) return { ok: false, reason: "wrong_role" };
  if (state.phase === "charging") return { ok: false, reason: now >= state.turnDeadline ? "turn_expired" : "too_early" };
  if (state.phase !== "discharge_window") return { ok: false, reason: "wrong_phase" };
  if (now >= state.turnDeadline) return { ok: false, reason: "turn_expired" };
  return { ok: true, state: resolveWave(state, now, false) };
}

export function advanceStormGridClock(state: StormGridState, now: number): StormGridState {
  if (state.result || now < state.turnDeadline) return state;
  if (state.phase === "charging") {
    return {
      ...state,
      phase: "discharge_window",
      windowStartedAt: now,
      turnDeadline: now + state.dischargeWindowMs,
    };
  }
  if (state.phase === "discharge_window") return resolveWave(state, now, true);
  const wave = state.wave + 1;
  return {
    ...state,
    wave,
    phase: "charging",
    sensorSeat: state.sensorSeat === 0 ? 1 : 0,
    ...targetFor(state.seed, wave, state.nodeCount),
    windowStartedAt: 0,
    waveOutcome: null,
    lastAccuracyMs: null,
    turnDeadline: now + state.chargeDurationMs,
  };
}

export function getStormGridView(
  state: StormGridState,
  viewerSeat: Seat | null,
): StormGridViewState {
  if (state.phase === "wave_result" || state.result || viewerSeat === state.sensorSeat) return state;
  return { ...state, targetNode: null, targetPolarity: null };
}
