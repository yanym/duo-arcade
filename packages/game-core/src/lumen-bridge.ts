import { otherSeat, type GameActionResult, type GameOptions, type LumenBridgeState, type Seat } from "./types";

const STAGE_REVEAL_MS = 1_400;

type LumenConfig = Pick<
  LumenBridgeState,
  "totalStages" | "laneCount" | "maxArc" | "maxStability" | "stageDurationMs" | "resonanceWindowMs"
> & { energyBuffer: number };

function lumenConfig(options: GameOptions): LumenConfig {
  const difficulty = {
    easy: { laneCount: 5 as const, maxArc: 1 as const, maxStability: 4 as const, resonanceWindowMs: 1_600, energyBuffer: 16 },
    standard: { laneCount: 7 as const, maxArc: 2 as const, maxStability: 3 as const, resonanceWindowMs: 1_100, energyBuffer: 12 },
    hard: { laneCount: 9 as const, maxArc: 3 as const, maxStability: 2 as const, resonanceWindowMs: 800, energyBuffer: 8 },
  }[options.difficulty];
  return {
    ...difficulty,
    totalStages: { short: 4 as const, standard: 6 as const, long: 8 as const }[options.length],
    stageDurationMs: { relaxed: 24_000, standard: 18_000, blitz: 14_000 }[options.pace],
  };
}

function mixedValue(seed: number, index: number): number {
  let value = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}

function targetFor(seed: number, stage: number, laneCount: number, currentBeamLane: number): number {
  const candidates = Array.from({ length: laneCount }, (_, lane) => lane).filter(
    (lane) => lane !== currentBeamLane && (laneCount <= 5 || Math.abs(lane - currentBeamLane) >= 2),
  );
  return candidates[mixedValue(seed, stage * 71) % candidates.length]!;
}

export function beamEndLane(state: Pick<LumenBridgeState, "originLane" | "arcOffset">): number {
  return state.originLane + state.arcOffset;
}

export function createLumenBridgeState(
  startingSeat: Seat,
  now: number,
  seed: number,
  options: GameOptions,
): LumenBridgeState {
  const config = lumenConfig(options);
  const originLane = Math.floor(config.laneCount / 2);
  const arcOffset = 0;
  const maxEnergy = config.totalStages * (config.laneCount - 1 + config.maxArc * 2) + config.energyBuffer;
  const stageDeadline = now + config.stageDurationMs;
  return {
    kind: "lumen_bridge",
    rulesVersion: 1,
    seed,
    stage: 1,
    totalStages: config.totalStages,
    phase: "aligning",
    originSeat: startingSeat,
    laneCount: config.laneCount,
    maxArc: config.maxArc,
    originLane,
    arcOffset,
    targetLane: targetFor(seed, 1, config.laneCount, originLane + arcOffset),
    energy: maxEnergy,
    maxEnergy,
    stability: config.maxStability,
    maxStability: config.maxStability,
    completedStages: 0,
    totalAdjustments: 0,
    score: 0,
    stageDurationMs: config.stageDurationMs,
    resonanceWindowMs: config.resonanceWindowMs,
    stageDeadline,
    resonanceStartedAt: 0,
    resonanceDeadline: 0,
    confirmations: [false, false],
    lastActorSeat: null,
    lastOutcome: null,
    turnDeadline: stageDeadline,
    result: null,
  };
}

export function adjustLumenBridge(
  state: LumenBridgeState,
  actor: Seat,
  direction: -1 | 1,
  now: number,
): GameActionResult {
  if (state.result) return { ok: false, reason: "game_finished" };
  if (state.phase !== "aligning") return { ok: false, reason: "wrong_phase" };
  if (now >= state.stageDeadline) return { ok: false, reason: "turn_expired" };
  if (direction !== -1 && direction !== 1) return { ok: false, reason: "invalid_move" };

  const controlsOrigin = actor === state.originSeat;
  const originLane = state.originLane + (controlsOrigin ? direction : 0);
  const arcOffset = state.arcOffset + (controlsOrigin ? 0 : direction);
  if (originLane < 0 || originLane >= state.laneCount || Math.abs(arcOffset) > state.maxArc) {
    return { ok: false, reason: "invalid_position" };
  }
  const endLane = originLane + arcOffset;
  if (endLane < 0 || endLane >= state.laneCount) return { ok: false, reason: "invalid_position" };

  const energy = state.energy - 1;
  const aligned = endLane === state.targetLane;
  if (!aligned && energy <= 0) {
    return {
      ok: true,
      state: {
        ...state,
        originLane,
        arcOffset,
        energy: 0,
        totalAdjustments: state.totalAdjustments + 1,
        lastActorSeat: actor,
        lastOutcome: "energy_depleted",
        result: { kind: "failure", score: state.score, reason: "bridge_lost" },
      },
    };
  }

  if (aligned) {
    const resonanceDeadline = Math.min(state.stageDeadline, now + state.resonanceWindowMs);
    return {
      ok: true,
      state: {
        ...state,
        phase: "resonance",
        originLane,
        arcOffset,
        energy: Math.max(0, energy),
        totalAdjustments: state.totalAdjustments + 1,
        score: state.score + 3,
        resonanceStartedAt: now,
        resonanceDeadline,
        confirmations: [false, false],
        lastActorSeat: actor,
        lastOutcome: null,
        turnDeadline: resonanceDeadline,
      },
    };
  }

  return {
    ok: true,
    state: {
      ...state,
      originLane,
      arcOffset,
      energy,
      totalAdjustments: state.totalAdjustments + 1,
      score: state.score + 3,
      lastActorSeat: actor,
      lastOutcome: null,
    },
  };
}

export function lockLumenBridge(state: LumenBridgeState, actor: Seat, now: number): GameActionResult {
  if (state.result) return { ok: false, reason: "game_finished" };
  if (state.phase !== "resonance") return { ok: false, reason: "wrong_phase" };
  if (now >= state.turnDeadline) return { ok: false, reason: "turn_expired" };
  if (state.confirmations[actor]) return { ok: false, reason: "already_chosen" };
  const confirmations = [...state.confirmations] as [boolean, boolean];
  confirmations[actor] = true;
  if (!confirmations[0] || !confirmations[1]) {
    return { ok: true, state: { ...state, confirmations, lastActorSeat: actor } };
  }

  const completedStages = state.completedStages + 1;
  const timeBonus = Math.max(0, Math.floor((state.stageDeadline - now) / 1_000)) * 5;
  const score = state.score + 220 + state.energy * 2 + state.stability * 30 + timeBonus;
  const result = state.stage >= state.totalStages
    ? { kind: "success" as const, score, reason: "lumen_bridge_complete" as const }
    : null;
  return {
    ok: true,
    state: {
      ...state,
      phase: "stage_result",
      completedStages,
      score,
      confirmations,
      lastActorSeat: actor,
      lastOutcome: "resonated",
      turnDeadline: now + STAGE_REVEAL_MS,
      result,
    },
  };
}

export function advanceLumenBridgeClock(state: LumenBridgeState, now: number): LumenBridgeState {
  if (state.result || now < state.turnDeadline) return state;
  if (state.phase === "stage_result") {
    const stage = state.stage + 1;
    const stageDeadline = now + state.stageDurationMs;
    return {
      ...state,
      stage,
      phase: "aligning",
      originSeat: otherSeat(state.originSeat),
      targetLane: targetFor(state.seed, stage, state.laneCount, beamEndLane(state)),
      stageDeadline,
      resonanceStartedAt: 0,
      resonanceDeadline: 0,
      confirmations: [false, false],
      lastActorSeat: null,
      lastOutcome: null,
      turnDeadline: stageDeadline,
    };
  }
  if (now >= state.stageDeadline) {
    return {
      ...state,
      lastOutcome: "bridge_timeout",
      result: { kind: "failure", score: state.score, reason: "timeout" },
    };
  }
  if (state.phase === "resonance") {
    const stability = state.stability - 1;
    return {
      ...state,
      phase: "aligning",
      stability,
      resonanceStartedAt: 0,
      resonanceDeadline: 0,
      confirmations: [false, false],
      lastActorSeat: null,
      lastOutcome: "desynced",
      turnDeadline: state.stageDeadline,
      result: stability <= 0
        ? { kind: "failure", score: state.score, reason: "bridge_lost" }
        : null,
    };
  }
  return {
    ...state,
    lastOutcome: "bridge_timeout",
    result: { kind: "failure", score: state.score, reason: "timeout" },
  };
}
