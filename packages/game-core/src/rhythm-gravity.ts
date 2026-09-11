import { roundsForLength } from "./options";
import type {
  GameActionResult,
  GameOptions,
  RhythmGravityState,
  RhythmGravityViewState,
  Seat,
} from "./types";

const RESULT_REVEAL_MS = 2_200;
const EARLY_GRACE_MS = 180;
const DRAW_ACCURACY_MS = 40;

export function createRhythmGravityState(now: number, options: GameOptions): RhythmGravityState {
  const totalRounds = roundsForLength(options.length);
  const countdownMs = { relaxed: 3_000, standard: 2_200, blitz: 1_600 }[options.pace];
  const tapWindowMs = { easy: 1_200, standard: 900, hard: 650 }[options.difficulty];
  const beatAt = now + countdownMs;
  return {
    kind: "rhythm_gravity",
    rulesVersion: 1,
    round: 1,
    totalRounds,
    phase: "beat",
    beatAt,
    taps: [null, null],
    locked: [false, false],
    accuracies: [null, null],
    roundWinner: null,
    corePosition: 0,
    pullLimit: 3,
    countdownMs,
    tapWindowMs,
    turnDeadline: beatAt + tapWindowMs,
    result: null,
  };
}

function resolveRound(state: RhythmGravityState, now: number): RhythmGravityState {
  const accuracies: [number | null, number | null] = [
    state.taps[0] === null ? null : Math.abs(state.taps[0]),
    state.taps[1] === null ? null : Math.abs(state.taps[1]),
  ];
  let roundWinner: Seat | null = null;
  if (accuracies[0] !== null && accuracies[1] === null) roundWinner = 0;
  else if (accuracies[1] !== null && accuracies[0] === null) roundWinner = 1;
  else if (accuracies[0] !== null && accuracies[1] !== null) {
    const difference = accuracies[0] - accuracies[1];
    if (Math.abs(difference) > DRAW_ACCURACY_MS) roundWinner = difference < 0 ? 0 : 1;
  }

  const corePosition = state.corePosition + (roundWinner === 0 ? 1 : roundWinner === 1 ? -1 : 0);
  const finished = Math.abs(corePosition) >= state.pullLimit || state.round >= state.totalRounds;
  const winnerSeat: Seat | null = corePosition > 0 ? 0 : corePosition < 0 ? 1 : null;
  return {
    ...state,
    phase: "round_result",
    accuracies,
    roundWinner,
    corePosition,
    turnDeadline: now + RESULT_REVEAL_MS,
    result: finished
      ? winnerSeat === null
        ? { kind: "draw", reason: "rhythm_tied" }
        : { kind: "win", winnerSeat, reason: "rhythm_gravity_score" }
      : null,
  };
}

export function tapRhythmGravity(
  state: RhythmGravityState,
  actor: Seat,
  now: number,
): GameActionResult {
  if (state.result) return { ok: false, reason: "game_finished" };
  if (state.phase !== "beat") return { ok: false, reason: "wrong_phase" };
  if (state.locked[actor]) return { ok: false, reason: "already_tapped" };
  if (now < state.beatAt - EARLY_GRACE_MS) return { ok: false, reason: "too_early" };
  if (now >= state.turnDeadline) return { ok: false, reason: "turn_expired" };

  const taps: [number | null, number | null] = [...state.taps];
  const locked: [boolean, boolean] = [...state.locked];
  taps[actor] = now - state.beatAt;
  locked[actor] = true;
  const next = { ...state, taps, locked };
  return { ok: true, state: locked[0] && locked[1] ? resolveRound(next, now) : next };
}

export function advanceRhythmGravityClock(state: RhythmGravityState, now: number): RhythmGravityState {
  if (state.result || now < state.turnDeadline) return state;
  if (state.phase === "beat") return resolveRound(state, now);

  const round = state.round + 1;
  const beatAt = now + state.countdownMs;
  return {
    ...state,
    round,
    phase: "beat",
    beatAt,
    taps: [null, null],
    locked: [false, false],
    accuracies: [null, null],
    roundWinner: null,
    turnDeadline: beatAt + state.tapWindowMs,
  };
}

export function getRhythmGravityView(
  state: RhythmGravityState,
  viewerSeat: Seat | null,
): RhythmGravityViewState {
  if (state.phase === "round_result" || state.result) return state;
  return {
    ...state,
    taps: viewerSeat === null
      ? [null, null]
      : viewerSeat === 0
        ? [state.taps[0], null]
        : [null, state.taps[1]],
  };
}
