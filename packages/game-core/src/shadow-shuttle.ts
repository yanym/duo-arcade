import { roundsForLength } from "./options";
import {
  otherSeat,
  type GameActionResult,
  type GameOptions,
  type Seat,
  type ShadowShuffleOutcome,
  type ShadowShuttleState,
  type ShadowShuttleViewState,
} from "./types";

const MEMORIZE_MS = 2_200;
const RESULT_REVEAL_MS = 2_800;

function mix(seed: number, value: number): number {
  let mixed = (seed ^ Math.imul(value, 0x27d4eb2d)) >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 15), 0x85ebca6b);
  mixed = Math.imul(mixed ^ (mixed >>> 13), 0xc2b2ae35);
  return (mixed ^ (mixed >>> 16)) >>> 0;
}

function createShufflePlan(seed: number, round: number, podCount: number, swaps: number): [number, number][] {
  const plan: [number, number][] = [];
  let previous = -1;
  for (let step = 0; step < swaps; step += 1) {
    let left = mix(seed, round * 31 + step * 7) % (podCount - 1);
    if (left === previous) left = (left + 1) % (podCount - 1);
    plan.push([left, left + 1]);
    previous = left;
  }
  return plan;
}

export function createShadowShuttleState(
  infiltratorSeat: Seat,
  now: number,
  seed: number,
  options: GameOptions,
): ShadowShuttleState {
  const totalRounds = roundsForLength(options.length);
  const podCount = { easy: 4 as const, standard: 5 as const, hard: 6 as const }[options.difficulty];
  const swaps = { easy: 4, standard: 6, hard: 8 }[options.difficulty];
  const markDurationMs = { relaxed: 15_000, standard: 10_000, blitz: 7_000 }[options.pace];
  const guessDurationMs = { relaxed: 15_000, standard: 10_000, blitz: 7_000 }[options.pace];
  const swapDurationMs = { relaxed: 850, standard: 650, blitz: 500 }[options.pace];
  return {
    kind: "shadow_shuttle",
    rulesVersion: 1,
    seed,
    round: 1,
    totalRounds,
    phase: "marking",
    infiltratorSeat,
    podCount,
    targetPod: null,
    permutation: Array.from({ length: podCount }, (_, index) => index),
    shufflePlan: createShufflePlan(seed, 1, podCount, swaps),
    shuffleStep: 0,
    guessSlot: null,
    roundWinner: null,
    roundOutcome: null,
    scores: [0, 0],
    markDurationMs,
    guessDurationMs,
    swapDurationMs,
    turnDeadline: now + markDurationMs,
    result: null,
  };
}

function validPod(state: ShadowShuttleState, pod: number): boolean {
  return Number.isInteger(pod) && pod >= 0 && pod < state.podCount;
}

function resolveRound(
  state: ShadowShuttleState,
  winner: Seat,
  outcome: ShadowShuffleOutcome,
  now: number,
  guessSlot: number | null = null,
): ShadowShuttleState {
  const scores: [number, number] = [...state.scores];
  scores[winner] += 1;
  const majority = Math.floor(state.totalRounds / 2) + 1;
  const finished = scores[winner] >= majority || state.round >= state.totalRounds;
  return {
    ...state,
    phase: "round_result",
    guessSlot,
    roundWinner: winner,
    roundOutcome: outcome,
    scores,
    turnDeadline: now + RESULT_REVEAL_MS,
    result: finished ? { kind: "win", winnerSeat: winner, reason: "shadow_shuttle_score" } : null,
  };
}

export function markShadowPod(
  state: ShadowShuttleState,
  actor: Seat,
  pod: number,
  now: number,
): GameActionResult {
  if (state.result) return { ok: false, reason: "game_finished" };
  if (now >= state.turnDeadline) return { ok: false, reason: "turn_expired" };
  if (state.phase !== "marking") return { ok: false, reason: "wrong_phase" };
  if (actor !== state.infiltratorSeat) return { ok: false, reason: "wrong_role" };
  if (!validPod(state, pod)) return { ok: false, reason: "invalid_pod" };
  return {
    ok: true,
    state: {
      ...state,
      targetPod: state.permutation[pod]!,
      phase: "memorizing",
      turnDeadline: now + MEMORIZE_MS,
    },
  };
}

export function guessShadowPod(
  state: ShadowShuttleState,
  actor: Seat,
  slot: number,
  now: number,
): GameActionResult {
  if (state.result) return { ok: false, reason: "game_finished" };
  if (now >= state.turnDeadline) return { ok: false, reason: "turn_expired" };
  if (state.phase !== "guessing") return { ok: false, reason: "wrong_phase" };
  if (actor === state.infiltratorSeat) return { ok: false, reason: "wrong_role" };
  if (!validPod(state, slot)) return { ok: false, reason: "invalid_pod" };
  const found = state.permutation[slot] === state.targetPod;
  return {
    ok: true,
    state: resolveRound(
      state,
      found ? actor : state.infiltratorSeat,
      found ? "found" : "escaped",
      now,
      slot,
    ),
  };
}

export function advanceShadowShuttleClock(state: ShadowShuttleState, now: number): ShadowShuttleState {
  if (state.result || now < state.turnDeadline) return state;
  if (state.phase === "marking") {
    return resolveRound(state, otherSeat(state.infiltratorSeat), "mark_timeout", now);
  }
  if (state.phase === "memorizing") {
    return { ...state, phase: "shuffling", turnDeadline: now + state.swapDurationMs };
  }
  if (state.phase === "shuffling") {
    const permutation = [...state.permutation];
    const [left, right] = state.shufflePlan[state.shuffleStep]!;
    [permutation[left], permutation[right]] = [permutation[right]!, permutation[left]!];
    const shuffleStep = state.shuffleStep + 1;
    const complete = shuffleStep >= state.shufflePlan.length;
    return {
      ...state,
      permutation,
      shuffleStep,
      phase: complete ? "guessing" : "shuffling",
      turnDeadline: now + (complete ? state.guessDurationMs : state.swapDurationMs),
    };
  }
  if (state.phase === "guessing") {
    return resolveRound(state, state.infiltratorSeat, "guess_timeout", now);
  }

  const round = state.round + 1;
  const swaps = state.shufflePlan.length;
  return {
    ...state,
    round,
    phase: "marking",
    infiltratorSeat: otherSeat(state.infiltratorSeat),
    targetPod: null,
    permutation: Array.from({ length: state.podCount }, (_, index) => index),
    shufflePlan: createShufflePlan(state.seed, round, state.podCount, swaps),
    shuffleStep: 0,
    guessSlot: null,
    roundWinner: null,
    roundOutcome: null,
    turnDeadline: now + state.markDurationMs,
  };
}

export function getShadowShuttleView(
  state: ShadowShuttleState,
  viewerSeat: Seat | null,
): ShadowShuttleViewState {
  const publicReveal = state.phase === "memorizing" || state.phase === "round_result" || state.result !== null;
  const ownsTarget = viewerSeat !== null && viewerSeat === state.infiltratorSeat;
  return {
    ...state,
    targetPod: viewerSeat === null && state.phase !== "round_result" && !state.result
      ? null
      : publicReveal || ownsTarget ? state.targetPod : null,
  };
}
