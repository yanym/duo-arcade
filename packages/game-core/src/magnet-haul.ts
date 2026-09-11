import type { GameActionResult, GameOptions, MagnetHaulState, Seat } from "./types";

const CHECKPOINT_REVEAL_MS = 1_400;

type MagnetConfig = Pick<
  MagnetHaulState,
  "totalCheckpoints" | "laneCount" | "tensionLimit" | "checkpointDurationMs"
> & { batteryBuffer: number };

function magnetConfig(options: GameOptions): MagnetConfig {
  const difficulty = {
    easy: { laneCount: 5 as const, tensionLimit: 3 as const, batteryBuffer: 20 },
    standard: { laneCount: 7 as const, tensionLimit: 2 as const, batteryBuffer: 14 },
    hard: { laneCount: 9 as const, tensionLimit: 1 as const, batteryBuffer: 10 },
  }[options.difficulty];
  return {
    ...difficulty,
    totalCheckpoints: { short: 4 as const, standard: 6 as const, long: 8 as const }[options.length],
    checkpointDurationMs: { relaxed: 20_000, standard: 14_000, blitz: 10_000 }[options.pace],
  };
}

function mixedValue(seed: number, index: number): number {
  let value = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}

function nextTarget(
  seed: number,
  checkpoint: number,
  laneCount: number,
  tensionLimit: number,
  previous: [number, number],
): [number, number] {
  const candidates: [number, number][] = [];
  for (let left = 0; left < laneCount; left += 1) {
    for (let right = 0; right < laneCount; right += 1) {
      const distance = Math.abs(left - previous[0]) + Math.abs(right - previous[1]);
      if (Math.abs(left - right) <= tensionLimit && distance >= 2) candidates.push([left, right]);
    }
  }
  return candidates[mixedValue(seed, checkpoint * 67) % candidates.length]!;
}

export function createMagnetHaulState(
  now: number,
  seed: number,
  options: GameOptions,
): MagnetHaulState {
  const config = magnetConfig(options);
  let cursor: [number, number] = [Math.floor(config.laneCount / 2), Math.floor(config.laneCount / 2)];
  const initial = [...cursor] as [number, number];
  let optimalMoves = 0;
  let target = cursor;
  for (let checkpoint = 1; checkpoint <= config.totalCheckpoints; checkpoint += 1) {
    target = nextTarget(seed, checkpoint, config.laneCount, config.tensionLimit, cursor);
    optimalMoves += Math.abs(target[0] - cursor[0]) + Math.abs(target[1] - cursor[1]);
    cursor = target;
  }
  const maxBattery = optimalMoves + config.batteryBuffer;
  return {
    kind: "magnet_haul",
    rulesVersion: 1,
    seed,
    checkpoint: 1,
    totalCheckpoints: config.totalCheckpoints,
    phase: "moving",
    laneCount: config.laneCount,
    magnetPositions: initial,
    targetPositions: nextTarget(seed, 1, config.laneCount, config.tensionLimit, initial),
    tensionLimit: config.tensionLimit,
    battery: maxBattery,
    maxBattery,
    completedCheckpoints: 0,
    moves: 0,
    score: 0,
    checkpointDurationMs: config.checkpointDurationMs,
    lastActorSeat: null,
    lastMove: null,
    lastOutcome: null,
    turnDeadline: now + config.checkpointDurationMs,
    result: null,
  };
}

export function moveMagnet(
  state: MagnetHaulState,
  actor: Seat,
  direction: -1 | 1,
  now: number,
): GameActionResult {
  if (state.result) return { ok: false, reason: "game_finished" };
  if (state.phase !== "moving") return { ok: false, reason: "wrong_phase" };
  if (now >= state.turnDeadline) return { ok: false, reason: "turn_expired" };
  if (direction !== -1 && direction !== 1) return { ok: false, reason: "invalid_move" };
  const from = state.magnetPositions[actor];
  const to = from + direction;
  if (to < 0 || to >= state.laneCount) return { ok: false, reason: "invalid_position" };
  const positions = [...state.magnetPositions] as [number, number];
  positions[actor] = to;
  if (Math.abs(positions[0] - positions[1]) > state.tensionLimit) {
    return { ok: false, reason: "tension_limit" };
  }

  const battery = state.battery - 1;
  const moves = state.moves + 1;
  const aligned = positions[0] === state.targetPositions[0] && positions[1] === state.targetPositions[1];
  if (aligned) {
    const completedCheckpoints = state.completedCheckpoints + 1;
    const timeBonus = Math.max(0, Math.floor((state.turnDeadline - now) / 1_000)) * 4;
    const score = state.score + 200 + Math.max(0, battery) * 2 + timeBonus;
    const result = state.checkpoint >= state.totalCheckpoints
      ? { kind: "success" as const, score, reason: "magnet_haul_complete" as const }
      : null;
    return {
      ok: true,
      state: {
        ...state,
        phase: "checkpoint_result",
        magnetPositions: positions,
        battery: Math.max(0, battery),
        completedCheckpoints,
        moves,
        score,
        lastActorSeat: actor,
        lastMove: { seat: actor, from, to },
        lastOutcome: "aligned",
        turnDeadline: now + CHECKPOINT_REVEAL_MS,
        result,
      },
    };
  }

  if (battery <= 0) {
    return {
      ok: true,
      state: {
        ...state,
        magnetPositions: positions,
        battery: 0,
        moves,
        lastActorSeat: actor,
        lastMove: { seat: actor, from, to },
        lastOutcome: "battery_depleted",
        result: { kind: "failure", score: state.score, reason: "magnet_lost" },
      },
    };
  }

  return {
    ok: true,
    state: {
      ...state,
      magnetPositions: positions,
      battery,
      moves,
      score: state.score + 2,
      lastActorSeat: actor,
      lastMove: { seat: actor, from, to },
    },
  };
}

export function advanceMagnetHaulClock(state: MagnetHaulState, now: number): MagnetHaulState {
  if (state.result || now < state.turnDeadline) return state;
  if (state.phase === "moving") {
    return {
      ...state,
      lastOutcome: "haul_timeout",
      result: { kind: "failure", score: state.score, reason: "timeout" },
    };
  }
  const checkpoint = state.checkpoint + 1;
  return {
    ...state,
    checkpoint,
    phase: "moving",
    targetPositions: nextTarget(state.seed, checkpoint, state.laneCount, state.tensionLimit, state.magnetPositions),
    lastActorSeat: null,
    lastMove: null,
    lastOutcome: null,
    turnDeadline: now + state.checkpointDurationMs,
  };
}
