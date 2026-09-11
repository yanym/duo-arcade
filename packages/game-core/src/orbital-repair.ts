import { roundsForLength } from "./options";
import {
  otherSeat,
  type GameActionResult,
  type GameOptions,
  type OrbitDirection,
  type OrbitalRepairState,
  type OrbitalRepairViewState,
  type OrbitRing,
  type Seat,
} from "./types";

const RESULT_REVEAL_MS = 3_000;

function mix(seed: number, value: number): number {
  let mixed = (seed ^ Math.imul(value, 0x45d9f3b)) >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x45d9f3b);
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x45d9f3b);
  return (mixed ^ (mixed >>> 16)) >>> 0;
}

function stageLayout(
  seed: number,
  stage: number,
  slotCount: 4 | 6,
): Pick<OrbitalRepairState, "currentSlots" | "targetSlots"> {
  const targetSlots: [number, number, number] = [0, 1, 2].map(
    (ring) => mix(seed, stage * 17 + ring) % slotCount,
  ) as [number, number, number];
  const currentSlots: [number, number, number] = targetSlots.map(
    (target, ring) => (target + 1 + (mix(seed, stage * 29 + ring + 11) % (slotCount - 1))) % slotCount,
  ) as [number, number, number];
  return { currentSlots, targetSlots };
}

export function createOrbitalRepairState(
  engineerSeat: Seat,
  now: number,
  seed: number,
  options: GameOptions,
): OrbitalRepairState {
  const totalStages = roundsForLength(options.length);
  const ringCount = options.difficulty === "easy" ? 2 : 3;
  const slotCount = options.difficulty === "hard" ? 6 : 4;
  const maxStrikes = { easy: 3 as const, standard: 2 as const, hard: 1 as const }[options.difficulty];
  const stageDurationMs = { relaxed: 50_000, standard: 35_000, blitz: 22_000 }[options.pace];
  return {
    kind: "orbital_repair",
    rulesVersion: 1,
    seed,
    stage: 1,
    totalStages,
    phase: "aligning",
    engineerSeat,
    ringCount,
    slotCount,
    ...stageLayout(seed, 1, slotCount),
    stageRotations: 0,
    totalRotations: 0,
    launchAttempts: 0,
    strikes: 0,
    maxStrikes,
    lastLaunchCorrect: null,
    stageDurationMs,
    turnDeadline: now + stageDurationMs,
    result: null,
  };
}

function validRing(state: OrbitalRepairState, ring: number): ring is OrbitRing {
  return Number.isInteger(ring) && ring >= 0 && ring < state.ringCount;
}

export function rotateOrbitRing(
  state: OrbitalRepairState,
  actor: Seat,
  ring: OrbitRing,
  direction: OrbitDirection,
  now: number,
): GameActionResult {
  if (state.result) return { ok: false, reason: "game_finished" };
  if (now >= state.turnDeadline) return { ok: false, reason: "turn_expired" };
  if (state.phase !== "aligning") return { ok: false, reason: "wrong_phase" };
  if (actor !== state.engineerSeat) return { ok: false, reason: "wrong_role" };
  if (!validRing(state, ring)) return { ok: false, reason: "invalid_ring" };
  if (direction !== "clockwise" && direction !== "counterclockwise") {
    return { ok: false, reason: "invalid_move" };
  }

  const currentSlots: [number, number, number] = [...state.currentSlots];
  const delta = direction === "clockwise" ? 1 : -1;
  currentSlots[ring] = (currentSlots[ring] + delta + state.slotCount) % state.slotCount;
  return {
    ok: true,
    state: {
      ...state,
      currentSlots,
      stageRotations: state.stageRotations + 1,
      totalRotations: state.totalRotations + 1,
      lastLaunchCorrect: null,
    },
  };
}

export function launchRepairPulse(
  state: OrbitalRepairState,
  actor: Seat,
  now: number,
): GameActionResult {
  if (state.result) return { ok: false, reason: "game_finished" };
  if (now >= state.turnDeadline) return { ok: false, reason: "turn_expired" };
  if (state.phase !== "aligning") return { ok: false, reason: "wrong_phase" };
  if (actor === state.engineerSeat) return { ok: false, reason: "wrong_role" };

  const correct = state.currentSlots
    .slice(0, state.ringCount)
    .every((slot, ring) => slot === state.targetSlots[ring]);
  const launchAttempts = state.launchAttempts + 1;
  if (!correct) {
    const strikes = state.strikes + 1;
    return {
      ok: true,
      state: {
        ...state,
        strikes,
        launchAttempts,
        lastLaunchCorrect: false,
        result: strikes >= state.maxStrikes
          ? {
              kind: "failure",
              score: Math.max(0, (state.stage - 1) * 300 - state.totalRotations * 5),
              reason: "reactor_overload",
            }
          : null,
      },
    };
  }

  const complete = state.stage >= state.totalStages;
  return {
    ok: true,
    state: {
      ...state,
      phase: "stage_result",
      launchAttempts,
      lastLaunchCorrect: true,
      turnDeadline: now + RESULT_REVEAL_MS,
      result: complete
        ? {
            kind: "success",
            score: Math.max(
              0,
              state.totalStages * 300 + (state.maxStrikes - state.strikes) * 100 - state.totalRotations * 5,
            ),
            reason: "relay_repaired",
          }
        : null,
    },
  };
}

export function advanceOrbitalRepairClock(state: OrbitalRepairState, now: number): OrbitalRepairState {
  if (state.result || now < state.turnDeadline) return state;
  if (state.phase === "aligning") {
    return {
      ...state,
      result: {
        kind: "failure",
        score: Math.max(0, (state.stage - 1) * 300 - state.totalRotations * 5),
        reason: "timeout",
      },
    };
  }

  const stage = state.stage + 1;
  return {
    ...state,
    stage,
    phase: "aligning",
    engineerSeat: otherSeat(state.engineerSeat),
    ...stageLayout(state.seed, stage, state.slotCount),
    stageRotations: 0,
    lastLaunchCorrect: null,
    turnDeadline: now + state.stageDurationMs,
  };
}

export function getOrbitalRepairView(
  state: OrbitalRepairState,
  viewerSeat: Seat | null,
): OrbitalRepairViewState {
  const reveal = state.phase === "stage_result" || state.result !== null;
  const isLauncher = viewerSeat !== null && viewerSeat !== state.engineerSeat;
  return {
    ...state,
    targetSlots: reveal || isLauncher ? state.targetSlots : null,
  };
}
