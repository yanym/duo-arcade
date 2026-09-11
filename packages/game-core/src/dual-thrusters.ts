import type {
  DualThrustersState,
  DualThrustersViewState,
  GameActionResult,
  GameOptions,
  Seat,
  ThrusterPower,
} from "./types";

const RESULT_REVEAL_MS = 1_500;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function thrusterConfig(options: GameOptions): Pick<
  DualThrustersState,
  "totalGates" | "laneCount" | "maxHull" | "burnDurationMs"
> {
  const difficulty = {
    easy: { laneCount: 5 as const, maxHull: 4 as const },
    standard: { laneCount: 7 as const, maxHull: 3 as const },
    hard: { laneCount: 9 as const, maxHull: 2 as const },
  }[options.difficulty];
  return {
    ...difficulty,
    totalGates: { short: 5 as const, standard: 7 as const, long: 9 as const }[options.length],
    burnDurationMs: { relaxed: 14_000, standard: 10_000, blitz: 7_000 }[options.pace],
  };
}

function mixedValue(seed: number, gate: number): number {
  let value = (seed ^ Math.imul(gate, 0x9e3779b1)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}

function targetFor(
  seed: number,
  gate: number,
  laneCount: number,
  shipLane: number,
  drift: number,
): number {
  const reachable = Array.from(
    new Set(
      [-2, -1, 0, 1, 2].map((thrust) =>
        clamp(shipLane + clamp(drift + thrust, -2, 2), 0, laneCount - 1),
      ),
    ),
  );
  const idleLane = clamp(shipLane + drift, 0, laneCount - 1);
  const activeTargets = reachable.filter((lane) => lane !== idleLane);
  const choices = activeTargets.length > 0 ? activeTargets : reachable;
  return choices[mixedValue(seed, gate) % choices.length]!;
}

export function createDualThrustersState(
  now: number,
  seed: number,
  options: GameOptions,
): DualThrustersState {
  const config = thrusterConfig(options);
  const shipLane = Math.floor(config.laneCount / 2);
  return {
    kind: "dual_thrusters",
    rulesVersion: 1,
    seed,
    gate: 1,
    totalGates: config.totalGates,
    phase: "planning",
    laneCount: config.laneCount,
    shipLane,
    targetLane: targetFor(seed, 1, config.laneCount, shipLane, 0),
    drift: 0,
    powers: [null, null],
    locked: [false, false],
    hull: config.maxHull,
    maxHull: config.maxHull,
    clearedGates: 0,
    collisions: 0,
    score: 0,
    burnDurationMs: config.burnDurationMs,
    gateOutcome: null,
    lastMovement: 0,
    turnDeadline: now + config.burnDurationMs,
    result: null,
  };
}

function resolveGate(state: DualThrustersState, now: number, timedOut: boolean): DualThrustersState {
  const leftPower = state.powers[0] ?? 0;
  const rightPower = state.powers[1] ?? 0;
  const thrust = leftPower - rightPower;
  const movement = clamp(state.drift + thrust, -2, 2);
  const predictedLane = clamp(state.shipLane + movement, 0, state.laneCount - 1);
  const nextDrift = predictedLane === 0 || predictedLane === state.laneCount - 1 ? 0 : movement;
  const cleared = !timedOut && predictedLane === state.targetLane;
  const hull = state.hull - (cleared ? 0 : 1);
  const clearedGates = state.clearedGates + (cleared ? 1 : 0);
  const collisions = state.collisions + (cleared ? 0 : 1);
  const score = state.score + (cleared
    ? 220 + state.hull * 20 + Math.max(0, 40 - (leftPower + rightPower) * 10)
    : 0);
  const finished = state.gate >= state.totalGates;
  const result = hull <= 0
    ? { kind: "failure" as const, score, reason: "shuttle_lost" as const }
    : finished
      ? { kind: "success" as const, score, reason: "dual_thrusters_complete" as const }
      : null;
  return {
    ...state,
    phase: "gate_result",
    shipLane: cleared ? predictedLane : state.targetLane,
    drift: cleared ? nextDrift : 0,
    hull,
    clearedGates,
    collisions,
    score,
    gateOutcome: timedOut ? "burn_timeout" : cleared ? "gate_cleared" : "gate_hit",
    lastMovement: movement,
    turnDeadline: now + RESULT_REVEAL_MS,
    result,
  };
}

export function chooseThrusterPower(
  state: DualThrustersState,
  actor: Seat,
  power: ThrusterPower,
  now: number,
): GameActionResult {
  if (state.result) return { ok: false, reason: "game_finished" };
  if (state.phase !== "planning") return { ok: false, reason: "wrong_phase" };
  if (now >= state.turnDeadline) return { ok: false, reason: "turn_expired" };
  if (power !== 0 && power !== 1 && power !== 2) return { ok: false, reason: "invalid_power" };
  if (state.locked[actor]) return { ok: false, reason: "already_chosen" };
  const powers: DualThrustersState["powers"] = [...state.powers];
  const locked: DualThrustersState["locked"] = [...state.locked];
  powers[actor] = power;
  locked[actor] = true;
  const next = { ...state, powers, locked };
  return { ok: true, state: locked[0] && locked[1] ? resolveGate(next, now, false) : next };
}

export function advanceDualThrustersClock(
  state: DualThrustersState,
  now: number,
): DualThrustersState {
  if (state.result || now < state.turnDeadline) return state;
  if (state.phase === "planning") return resolveGate(state, now, true);
  const gate = state.gate + 1;
  return {
    ...state,
    gate,
    phase: "planning",
    targetLane: targetFor(state.seed, gate, state.laneCount, state.shipLane, state.drift),
    powers: [null, null],
    locked: [false, false],
    gateOutcome: null,
    lastMovement: 0,
    turnDeadline: now + state.burnDurationMs,
  };
}

export function getDualThrustersView(
  state: DualThrustersState,
  viewerSeat: Seat | null,
): DualThrustersViewState {
  if (state.phase === "gate_result" || state.result) return state;
  return {
    ...state,
    powers: viewerSeat === null
      ? [null, null]
      : viewerSeat === 0
        ? [state.powers[0], null]
        : [null, state.powers[1]],
  };
}
