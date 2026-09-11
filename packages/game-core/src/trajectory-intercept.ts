import type {
  GameActionResult,
  GameOptions,
  Seat,
  TrajectoryInterceptState,
  TrajectoryInterceptViewState,
} from "./types";

const FAIR_DRAW_MS = 40;
const RESULT_REVEAL_MS = 1_600;

function mixedValue(seed: number, round: number, channel: number): number {
  let value = (seed ^ Math.imul(round * 11 + channel + 1, 0x9e3779b1)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}

function roundSetup(seed: number, round: number, laneCount: number, baseCountdownMs: number) {
  return {
    cursors: [mixedValue(seed, round, 1) % laneCount, mixedValue(seed, round, 2) % laneCount] as [number, number],
    countdownMs: baseCountdownMs + mixedValue(seed, round, 3) % 650,
  };
}

export function createTrajectoryInterceptState(
  now: number,
  seed: number,
  options: GameOptions,
): TrajectoryInterceptState {
  const laneCount = { easy: 5 as const, standard: 7 as const, hard: 9 as const }[options.difficulty];
  const totalRounds = { short: 5 as const, standard: 7 as const, long: 9 as const }[options.length];
  const baseCountdownMs = { relaxed: 2_500, standard: 1_900, blitz: 1_300 }[options.pace];
  const interceptWindowMs = { easy: 5_000, standard: 3_800, hard: 2_800 }[options.difficulty];
  const setup = roundSetup(seed, 1, laneCount, baseCountdownMs);
  return {
    kind: "trajectory_intercept",
    rulesVersion: 1,
    seed,
    round: 1,
    totalRounds,
    phase: "signal",
    laneCount,
    targetLane: null,
    cursors: setup.cursors,
    responses: [null, null],
    locked: [false, false],
    scores: [0, 0],
    roundWinner: null,
    roundOutcome: null,
    baseCountdownMs,
    countdownMs: setup.countdownMs,
    interceptWindowMs,
    interceptStartedAt: 0,
    lastActorSeat: null,
    turnDeadline: now + setup.countdownMs,
    result: null,
  };
}

export function moveInterceptCursor(
  state: TrajectoryInterceptState,
  actor: Seat,
  direction: -1 | 1,
  now: number,
): GameActionResult {
  if (state.result) return { ok: false, reason: "game_finished" };
  if (state.phase !== "intercepting") return { ok: false, reason: state.phase === "signal" ? "too_early" : "wrong_phase" };
  if (now >= state.turnDeadline) return { ok: false, reason: "turn_expired" };
  if (state.locked[actor]) return { ok: false, reason: "already_chosen" };
  if (direction !== -1 && direction !== 1) return { ok: false, reason: "invalid_move" };
  const next = state.cursors[actor] + direction;
  if (next < 0 || next >= state.laneCount) return { ok: false, reason: "tracker_edge" };
  const cursors: TrajectoryInterceptState["cursors"] = [...state.cursors];
  cursors[actor] = next;
  return { ok: true, state: { ...state, cursors, lastActorSeat: actor } };
}

function resolveRound(state: TrajectoryInterceptState, now: number, timedOut: boolean): TrajectoryInterceptState {
  const [first, second] = state.responses;
  let winner: Seat | null = null;
  let roundOutcome: TrajectoryInterceptState["roundOutcome"] = timedOut ? "intercept_timeout" : "missed";
  if (first?.correct && second?.correct) {
    const delta = Math.abs(first.reactionMs - second.reactionMs);
    if (delta <= FAIR_DRAW_MS) roundOutcome = "near_tie";
    else {
      winner = first.reactionMs < second.reactionMs ? 0 : 1;
      roundOutcome = "captured";
    }
  } else if (first?.correct || second?.correct) {
    winner = first?.correct ? 0 : 1;
    roundOutcome = "captured";
  }
  const scores: TrajectoryInterceptState["scores"] = [...state.scores];
  if (winner !== null) scores[winner] += 1;
  const finished = state.round >= state.totalRounds;
  const result = finished
    ? scores[0] === scores[1]
      ? { kind: "draw" as const, reason: "intercept_tied" as const }
      : { kind: "win" as const, winnerSeat: scores[0] > scores[1] ? 0 as const : 1 as const, reason: "trajectory_intercept_score" as const }
    : null;
  return {
    ...state,
    phase: "round_result",
    scores,
    roundWinner: winner,
    roundOutcome,
    locked: [true, true],
    turnDeadline: now + RESULT_REVEAL_MS,
    result,
  };
}

export function captureTrajectory(
  state: TrajectoryInterceptState,
  actor: Seat,
  now: number,
): GameActionResult {
  if (state.result) return { ok: false, reason: "game_finished" };
  if (state.phase !== "intercepting") return { ok: false, reason: state.phase === "signal" ? "too_early" : "wrong_phase" };
  if (now >= state.turnDeadline) return { ok: false, reason: "turn_expired" };
  if (state.locked[actor]) return { ok: false, reason: "already_chosen" };
  const responses: TrajectoryInterceptState["responses"] = [...state.responses];
  const locked: TrajectoryInterceptState["locked"] = [...state.locked];
  responses[actor] = {
    lane: state.cursors[actor],
    reactionMs: Math.max(0, now - state.interceptStartedAt),
    correct: state.cursors[actor] === state.targetLane,
  };
  locked[actor] = true;
  const next = { ...state, responses, locked, lastActorSeat: actor };
  return { ok: true, state: locked[0] && locked[1] ? resolveRound(next, now, false) : next };
}

export function advanceTrajectoryInterceptClock(
  state: TrajectoryInterceptState,
  now: number,
): TrajectoryInterceptState {
  if (state.result || now < state.turnDeadline) return state;
  if (state.phase === "signal") {
    return {
      ...state,
      phase: "intercepting",
      targetLane: mixedValue(state.seed, state.round, 0) % state.laneCount,
      interceptStartedAt: now,
      turnDeadline: now + state.interceptWindowMs,
    };
  }
  if (state.phase === "intercepting") return resolveRound(state, now, true);
  const round = state.round + 1;
  const setup = roundSetup(state.seed, round, state.laneCount, state.baseCountdownMs);
  return {
    ...state,
    round,
    phase: "signal",
    targetLane: null,
    cursors: setup.cursors,
    responses: [null, null],
    locked: [false, false],
    roundWinner: null,
    roundOutcome: null,
    countdownMs: setup.countdownMs,
    interceptStartedAt: 0,
    lastActorSeat: null,
    turnDeadline: now + setup.countdownMs,
  };
}

export function getTrajectoryInterceptView(
  state: TrajectoryInterceptState,
  viewerSeat: Seat | null,
): TrajectoryInterceptViewState {
  if (state.phase === "round_result" || state.result) return state;
  const cursors: TrajectoryInterceptViewState["cursors"] = viewerSeat === null
    ? [null, null]
    : viewerSeat === 0 ? [state.cursors[0], null] : [null, state.cursors[1]];
  const responses: TrajectoryInterceptViewState["responses"] = viewerSeat === null
    ? [null, null]
    : viewerSeat === 0 ? [state.responses[0], null] : [null, state.responses[1]];
  return { ...state, cursors, responses };
}
