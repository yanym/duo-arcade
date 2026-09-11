import type {
  GameActionResult,
  GameOptions,
  NeonDashMove,
  NeonDashOutcome,
  NeonDashResponse,
  NeonDashState,
  NeonDashViewState,
  NeonObstacle,
  Seat,
} from "./types";

const ROUND_REVEAL_MS = 1_400;
const FAIR_DRAW_MS = 40;

const MOVE_FOR_OBSTACLE: Record<NeonObstacle, NeonDashMove> = {
  low_barrier: "jump",
  high_arch: "slide",
  right_wall: "dodge_left",
  left_wall: "dodge_right",
  pulse_field: "brake",
};

type NeonConfig = Pick<NeonDashState, "totalRounds" | "availableMoves" | "maxLives" | "baseCountdownMs" | "responseWindowMs">;

function neonConfig(options: GameOptions): NeonConfig {
  const difficulty = {
    easy: { availableMoves: ["jump", "slide"] as NeonDashMove[], maxLives: 4 as const, responseWindowMs: 3_000 },
    standard: { availableMoves: ["jump", "slide", "dodge_left", "dodge_right"] as NeonDashMove[], maxLives: 3 as const, responseWindowMs: 2_200 },
    hard: { availableMoves: ["jump", "slide", "dodge_left", "dodge_right", "brake"] as NeonDashMove[], maxLives: 2 as const, responseWindowMs: 1_600 },
  }[options.difficulty];
  return {
    ...difficulty,
    totalRounds: { short: 5 as const, standard: 7 as const, long: 9 as const }[options.length],
    baseCountdownMs: { relaxed: 2_200, standard: 1_600, blitz: 1_000 }[options.pace],
  };
}

function mixedValue(seed: number, index: number): number {
  let value = (seed ^ Math.imul(index + 1, 0x27d4eb2d)) >>> 0;
  value = Math.imul(value ^ (value >>> 15), value | 1) >>> 0;
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return (value ^ (value >>> 14)) >>> 0;
}

function countdownFor(seed: number, round: number, baseCountdownMs: number): number {
  return baseCountdownMs + mixedValue(seed, round * 19) % 451;
}

function obstacleFor(seed: number, round: number, availableMoves: NeonDashMove[]): NeonObstacle {
  const candidates = (Object.keys(MOVE_FOR_OBSTACLE) as NeonObstacle[]).filter(
    (obstacle) => availableMoves.includes(MOVE_FOR_OBSTACLE[obstacle]),
  );
  return candidates[mixedValue(seed, round * 43) % candidates.length]!;
}

export function requiredMoveForObstacle(obstacle: NeonObstacle): NeonDashMove {
  return MOVE_FOR_OBSTACLE[obstacle];
}

export function createNeonDashState(now: number, seed: number, options: GameOptions): NeonDashState {
  const config = neonConfig(options);
  const countdownMs = countdownFor(seed, 1, config.baseCountdownMs);
  return {
    kind: "neon_dash",
    rulesVersion: 1,
    seed,
    round: 1,
    totalRounds: config.totalRounds,
    phase: "countdown",
    availableMoves: config.availableMoves,
    obstacle: null,
    signalStartedAt: 0,
    responses: [null, null],
    locked: [false, false],
    scores: [0, 0],
    lives: [config.maxLives, config.maxLives],
    maxLives: config.maxLives,
    combos: [0, 0],
    bestCombos: [0, 0],
    roundWinner: null,
    roundOutcome: null,
    baseCountdownMs: config.baseCountdownMs,
    countdownMs,
    responseWindowMs: config.responseWindowMs,
    turnDeadline: now + countdownMs,
    result: null,
  };
}

function winnerFor(responses: NeonDashState["responses"]): Seat | null {
  const [first, second] = responses;
  if (first?.correct && !second?.correct) return 0;
  if (second?.correct && !first?.correct) return 1;
  if (!first?.correct || !second?.correct) return null;
  const difference = first.reactionMs - second.reactionMs;
  if (Math.abs(difference) <= FAIR_DRAW_MS) return null;
  return difference < 0 ? 0 : 1;
}

function outcomeFor(responses: NeonDashState["responses"], roundWinner: Seat | null): NeonDashOutcome {
  const correctCount = responses.filter((response) => response?.correct).length;
  if (responses[0] === null && responses[1] === null) return "dash_timeout";
  if (correctCount === 2) return roundWinner === null ? "photo_finish" : "clean_pass";
  if (correctCount === 1) return "single_clear";
  return "double_crash";
}

function resolveRound(state: NeonDashState, now: number): NeonDashState {
  const roundWinner = winnerFor(state.responses);
  const scores = [...state.scores] as [number, number];
  const lives = [...state.lives] as [number, number];
  const combos = [...state.combos] as [number, number];
  const bestCombos = [...state.bestCombos] as [number, number];
  for (const seat of [0, 1] as const) {
    if (state.responses[seat]?.correct) {
      scores[seat] += 1;
      combos[seat] += 1;
      bestCombos[seat] = Math.max(bestCombos[seat], combos[seat]);
    } else {
      lives[seat] = Math.max(0, lives[seat] - 1);
      combos[seat] = 0;
    }
  }
  if (roundWinner !== null) scores[roundWinner] += 1;

  const finished = state.round >= state.totalRounds || lives[0] <= 0 || lives[1] <= 0;
  let winnerSeat: Seat | null = null;
  if (finished) {
    if (lives[0] <= 0 && lives[1] > 0) winnerSeat = 1;
    else if (lives[1] <= 0 && lives[0] > 0) winnerSeat = 0;
    else if (scores[0] !== scores[1]) winnerSeat = scores[0] > scores[1] ? 0 : 1;
    else if (lives[0] !== lives[1]) winnerSeat = lives[0] > lives[1] ? 0 : 1;
  }
  return {
    ...state,
    phase: "round_result",
    scores,
    lives,
    combos,
    bestCombos,
    roundWinner,
    roundOutcome: outcomeFor(state.responses, roundWinner),
    turnDeadline: now + ROUND_REVEAL_MS,
    result: finished
      ? winnerSeat === null
        ? { kind: "draw", reason: "neon_dash_tied" }
        : { kind: "win", winnerSeat, reason: "neon_dash_score" }
      : null,
  };
}

export function dodgeNeonObstacle(
  state: NeonDashState,
  actor: Seat,
  move: NeonDashMove,
  now: number,
): GameActionResult {
  if (state.result) return { ok: false, reason: "game_finished" };
  if (state.phase === "countdown") return { ok: false, reason: "too_early" };
  if (state.phase !== "reacting") return { ok: false, reason: "wrong_phase" };
  if (now >= state.turnDeadline) return { ok: false, reason: "turn_expired" };
  if (!state.availableMoves.includes(move)) return { ok: false, reason: "invalid_move" };
  if (state.locked[actor]) return { ok: false, reason: "already_chosen" };

  const response: NeonDashResponse = {
    move,
    reactionMs: Math.max(0, now - state.signalStartedAt),
    correct: state.obstacle !== null && move === requiredMoveForObstacle(state.obstacle),
  };
  const responses = [...state.responses] as [NeonDashResponse | null, NeonDashResponse | null];
  const locked = [...state.locked] as [boolean, boolean];
  responses[actor] = response;
  locked[actor] = true;
  const next = { ...state, responses, locked };
  return { ok: true, state: locked[0] && locked[1] ? resolveRound(next, now) : next };
}

export function advanceNeonDashClock(state: NeonDashState, now: number): NeonDashState {
  if (state.result || now < state.turnDeadline) return state;
  if (state.phase === "countdown") {
    return {
      ...state,
      phase: "reacting",
      obstacle: obstacleFor(state.seed, state.round, state.availableMoves),
      signalStartedAt: now,
      turnDeadline: now + state.responseWindowMs,
    };
  }
  if (state.phase === "reacting") return resolveRound(state, now);
  const round = state.round + 1;
  const countdownMs = countdownFor(state.seed, round, state.baseCountdownMs);
  return {
    ...state,
    round,
    phase: "countdown",
    obstacle: null,
    signalStartedAt: 0,
    responses: [null, null],
    locked: [false, false],
    roundWinner: null,
    roundOutcome: null,
    countdownMs,
    turnDeadline: now + countdownMs,
  };
}

export function getNeonDashView(state: NeonDashState, viewerSeat: Seat | null): NeonDashViewState {
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
