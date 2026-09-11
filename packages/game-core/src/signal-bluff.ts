import {
  SIGNAL_RUNES,
  otherSeat,
  type GameActionResult,
  type GameOptions,
  type Seat,
  type SignalBluffOutcome,
  type SignalBluffState,
  type SignalBluffViewState,
  type SignalRune,
  type SignalVerdict,
} from "./types";

const ROUND_REVEAL_MS = 1_600;

type BluffConfig = Pick<
  SignalBluffState,
  "totalRounds" | "signalCount" | "claimDurationMs" | "judgeDurationMs"
> & { scanCharges: number };

function bluffConfig(options: GameOptions): BluffConfig {
  const difficulty = {
    easy: { signalCount: 3 as const, scanCharges: 2 },
    standard: { signalCount: 4 as const, scanCharges: 1 },
    hard: { signalCount: 5 as const, scanCharges: 0 },
  }[options.difficulty];
  const pace = {
    relaxed: { claimDurationMs: 30_000, judgeDurationMs: 20_000 },
    standard: { claimDurationMs: 20_000, judgeDurationMs: 14_000 },
    blitz: { claimDurationMs: 12_000, judgeDurationMs: 9_000 },
  }[options.pace];
  return {
    ...difficulty,
    ...pace,
    totalRounds: { short: 5 as const, standard: 7 as const, long: 9 as const }[options.length],
  };
}

function mixedValue(seed: number, index: number): number {
  let value = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}

function truthFor(seed: number, round: number, availableSignals: SignalRune[]): SignalRune {
  return availableSignals[mixedValue(seed, round * 53) % availableSignals.length]!;
}

function scanHintFor(signal: SignalRune, availableSignals: SignalRune[]): "group_a" | "group_b" {
  return availableSignals.indexOf(signal) % 2 === 0 ? "group_a" : "group_b";
}

export function createSignalBluffState(
  startingSeat: Seat,
  now: number,
  seed: number,
  options: GameOptions,
): SignalBluffState {
  const config = bluffConfig(options);
  const availableSignals = SIGNAL_RUNES.slice(0, config.signalCount);
  return {
    kind: "signal_bluff",
    rulesVersion: 1,
    seed,
    round: 1,
    totalRounds: config.totalRounds,
    phase: "claiming",
    senderSeat: startingSeat,
    signalCount: config.signalCount,
    availableSignals,
    truthSignal: truthFor(seed, 1, availableSignals),
    claimSignal: null,
    verdict: null,
    scanCharges: [config.scanCharges, config.scanCharges],
    scanned: false,
    scanHint: null,
    scores: [0, 0],
    roundWinner: null,
    roundOutcome: null,
    claimDurationMs: config.claimDurationMs,
    judgeDurationMs: config.judgeDurationMs,
    turnDeadline: now + config.claimDurationMs,
    result: null,
  };
}

function finishRound(
  state: SignalBluffState,
  winner: Seat,
  outcome: SignalBluffOutcome,
  now: number,
  verdict: SignalVerdict | null = state.verdict,
): SignalBluffState {
  const scores = [...state.scores] as [number, number];
  scores[winner] += 1;
  const remaining = state.totalRounds - state.round;
  const finished = remaining === 0 || Math.abs(scores[0] - scores[1]) > remaining;
  const winnerSeat: Seat | null = scores[0] === scores[1] ? null : scores[0] > scores[1] ? 0 : 1;
  return {
    ...state,
    phase: "round_result",
    verdict,
    scores,
    roundWinner: winner,
    roundOutcome: outcome,
    turnDeadline: now + ROUND_REVEAL_MS,
    result: finished
      ? winnerSeat === null
        ? { kind: "draw", reason: "signal_bluff_tied" }
        : { kind: "win", winnerSeat, reason: "signal_bluff_score" }
      : null,
  };
}

export function claimSignal(
  state: SignalBluffState,
  actor: Seat,
  signal: SignalRune,
  now: number,
): GameActionResult {
  if (state.result) return { ok: false, reason: "game_finished" };
  if (state.phase !== "claiming") return { ok: false, reason: "wrong_phase" };
  if (actor !== state.senderSeat) return { ok: false, reason: "wrong_role" };
  if (now >= state.turnDeadline) return { ok: false, reason: "turn_expired" };
  if (!state.availableSignals.includes(signal)) return { ok: false, reason: "invalid_symbol" };
  return {
    ok: true,
    state: {
      ...state,
      phase: "judging",
      claimSignal: signal,
      turnDeadline: now + state.judgeDurationMs,
    },
  };
}

export function scanSignal(state: SignalBluffState, actor: Seat, now: number): GameActionResult {
  if (state.result) return { ok: false, reason: "game_finished" };
  if (state.phase !== "judging") return { ok: false, reason: "wrong_phase" };
  if (actor === state.senderSeat) return { ok: false, reason: "wrong_role" };
  if (now >= state.turnDeadline) return { ok: false, reason: "turn_expired" };
  if (state.scanned) return { ok: false, reason: "already_chosen" };
  if (state.scanCharges[actor] <= 0) return { ok: false, reason: "no_scans_left" };
  const scanCharges = [...state.scanCharges] as [number, number];
  scanCharges[actor] -= 1;
  return {
    ok: true,
    state: {
      ...state,
      scanCharges,
      scanned: true,
      scanHint: scanHintFor(state.truthSignal, state.availableSignals),
    },
  };
}

export function judgeSignal(
  state: SignalBluffState,
  actor: Seat,
  verdict: SignalVerdict,
  now: number,
): GameActionResult {
  if (state.result) return { ok: false, reason: "game_finished" };
  if (state.phase !== "judging") return { ok: false, reason: "wrong_phase" };
  if (actor === state.senderSeat) return { ok: false, reason: "wrong_role" };
  if (now >= state.turnDeadline) return { ok: false, reason: "turn_expired" };
  if (verdict !== "trust" && verdict !== "challenge") return { ok: false, reason: "invalid_move" };
  const truthful = state.claimSignal === state.truthSignal;
  const judgeCorrect = (verdict === "trust" && truthful) || (verdict === "challenge" && !truthful);
  const outcome: SignalBluffOutcome = truthful
    ? verdict === "trust" ? "truth_trusted" : "truth_challenged"
    : verdict === "trust" ? "bluff_believed" : "bluff_exposed";
  return {
    ok: true,
    state: finishRound(state, judgeCorrect ? actor : state.senderSeat, outcome, now, verdict),
  };
}

export function advanceSignalBluffClock(state: SignalBluffState, now: number): SignalBluffState {
  if (state.result || now < state.turnDeadline) return state;
  if (state.phase === "claiming") {
    return finishRound(state, otherSeat(state.senderSeat), "claim_timeout", now);
  }
  if (state.phase === "judging") {
    return finishRound(state, state.senderSeat, "judge_timeout", now);
  }
  const round = state.round + 1;
  const senderSeat = otherSeat(state.senderSeat);
  return {
    ...state,
    round,
    phase: "claiming",
    senderSeat,
    truthSignal: truthFor(state.seed, round, state.availableSignals),
    claimSignal: null,
    verdict: null,
    scanned: false,
    scanHint: null,
    roundWinner: null,
    roundOutcome: null,
    turnDeadline: now + state.claimDurationMs,
  };
}

export function getSignalBluffView(
  state: SignalBluffState,
  viewerSeat: Seat | null,
): SignalBluffViewState {
  if (state.phase === "round_result" || state.result) return state;
  return {
    ...state,
    truthSignal: viewerSeat === state.senderSeat ? state.truthSignal : null,
    scanHint: viewerSeat !== null && viewerSeat !== state.senderSeat ? state.scanHint : null,
  };
}
