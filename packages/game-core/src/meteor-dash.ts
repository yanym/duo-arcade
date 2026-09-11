import type {
  GameActionResult,
  GameOptions,
  MeteorDashState,
  MeteorDashViewState,
  MeteorResponse,
  Seat,
} from "./types";

const RESULT_REVEAL_MS = 1_600;
const FAIR_DRAW_MS = 35;

function meteorConfig(options: GameOptions): Pick<
  MeteorDashState,
  "totalRounds" | "cellCount" | "countdownMs" | "catchWindowMs"
> {
  return {
    totalRounds: { short: 5 as const, standard: 7 as const, long: 9 as const }[options.length],
    cellCount: { easy: 4 as const, standard: 6 as const, hard: 8 as const }[options.difficulty],
    countdownMs: { relaxed: 2_200, standard: 1_600, blitz: 1_100 }[options.pace],
    catchWindowMs: { easy: 2_500, standard: 1_800, hard: 1_200 }[options.difficulty],
  };
}

function targetFor(seed: number, round: number, cellCount: number): number {
  let mixed = (seed ^ Math.imul(round, 0x27d4eb2d)) >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1) >>> 0;
  mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
  return ((mixed ^ (mixed >>> 14)) >>> 0) % cellCount;
}

export function createMeteorDashState(
  now: number,
  seed: number,
  options: GameOptions,
): MeteorDashState {
  const config = meteorConfig(options);
  return {
    kind: "meteor_dash",
    rulesVersion: 1,
    seed,
    round: 1,
    totalRounds: config.totalRounds,
    phase: "signal",
    cellCount: config.cellCount,
    targetCell: null,
    catchStartedAt: 0,
    responses: [null, null],
    locked: [false, false],
    scores: [0, 0],
    roundWinner: null,
    countdownMs: config.countdownMs,
    catchWindowMs: config.catchWindowMs,
    turnDeadline: now + config.countdownMs,
    result: null,
  };
}

function roundWinnerFor(responses: MeteorDashState["responses"]): Seat | null {
  const [first, second] = responses;
  if (first?.correct && !second?.correct) return 0;
  if (second?.correct && !first?.correct) return 1;
  if (!first?.correct || !second?.correct) return null;
  const difference = first.reactionMs - second.reactionMs;
  if (Math.abs(difference) <= FAIR_DRAW_MS) return null;
  return difference < 0 ? 0 : 1;
}

function resolveRound(state: MeteorDashState, now: number): MeteorDashState {
  const roundWinner = roundWinnerFor(state.responses);
  const scores: [number, number] = [...state.scores];
  if (roundWinner !== null) scores[roundWinner] += 1;
  const remaining = state.totalRounds - state.round;
  const finished = remaining === 0 || Math.abs(scores[0] - scores[1]) > remaining;
  const winnerSeat: Seat | null = scores[0] === scores[1] ? null : scores[0] > scores[1] ? 0 : 1;
  return {
    ...state,
    phase: "round_result",
    scores,
    roundWinner,
    turnDeadline: now + RESULT_REVEAL_MS,
    result: finished
      ? winnerSeat === null
        ? { kind: "draw", reason: "meteor_tied" }
        : { kind: "win", winnerSeat, reason: "meteor_dash_score" }
      : null,
  };
}

export function catchMeteor(
  state: MeteorDashState,
  actor: Seat,
  cell: number,
  now: number,
): GameActionResult {
  if (state.result) return { ok: false, reason: "game_finished" };
  if (state.phase === "signal") return { ok: false, reason: "too_early" };
  if (state.phase !== "catching") return { ok: false, reason: "wrong_phase" };
  if (now >= state.turnDeadline) return { ok: false, reason: "turn_expired" };
  if (!Number.isInteger(cell) || cell < 0 || cell >= state.cellCount) return { ok: false, reason: "invalid_cell" };
  if (state.locked[actor]) return { ok: false, reason: "already_chosen" };

  const response: MeteorResponse = {
    cell,
    reactionMs: Math.max(0, now - state.catchStartedAt),
    correct: cell === state.targetCell,
  };
  const responses: [MeteorResponse | null, MeteorResponse | null] = [...state.responses];
  const locked: [boolean, boolean] = [...state.locked];
  responses[actor] = response;
  locked[actor] = true;
  const next = { ...state, responses, locked };
  return { ok: true, state: locked[0] && locked[1] ? resolveRound(next, now) : next };
}

export function advanceMeteorDashClock(state: MeteorDashState, now: number): MeteorDashState {
  if (state.result || now < state.turnDeadline) return state;
  if (state.phase === "signal") {
    return {
      ...state,
      phase: "catching",
      targetCell: targetFor(state.seed, state.round, state.cellCount),
      catchStartedAt: now,
      turnDeadline: now + state.catchWindowMs,
    };
  }
  if (state.phase === "catching") return resolveRound(state, now);

  return {
    ...state,
    round: state.round + 1,
    phase: "signal",
    targetCell: null,
    catchStartedAt: 0,
    responses: [null, null],
    locked: [false, false],
    roundWinner: null,
    turnDeadline: now + state.countdownMs,
  };
}

export function getMeteorDashView(
  state: MeteorDashState,
  viewerSeat: Seat | null,
): MeteorDashViewState {
  if (state.phase === "round_result" || state.result) return state;
  return {
    ...state,
    responses: viewerSeat === null
      ? [null, null]
      : viewerSeat === 0
        ? [state.responses[0], null]
        : [null, state.responses[1]],
  };
}
