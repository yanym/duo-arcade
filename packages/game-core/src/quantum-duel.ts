import { roundsForLength } from "./options";
import {
  DUEL_MOVES,
  type DuelMove,
  type DuelRoundOutcome,
  type GameActionResult,
  type GameOptions,
  type QuantumDuelState,
  type QuantumDuelViewState,
  type Seat,
} from "./types";

const REVEAL_MS = 3_000;

function moveWins(first: DuelMove, second: DuelMove): boolean {
  return (
    (first === "strike" && second === "charge") ||
    (first === "guard" && second === "strike") ||
    (first === "charge" && second === "guard")
  );
}

function finishRound(
  state: QuantumDuelState,
  winner: Seat | null,
  outcome: DuelRoundOutcome,
  now: number,
): QuantumDuelState {
  const scores: [number, number] = [...state.scores];
  if (winner !== null) scores[winner] += 1;
  const targetScore = Math.floor(state.totalRounds / 2) + 1;
  const majorityWinner = scores[0] >= targetScore ? 0 : scores[1] >= targetScore ? 1 : null;
  const isLastRound = state.round >= state.totalRounds;
  const finalWinner = majorityWinner ?? (
    isLastRound && scores[0] !== scores[1] ? (scores[0] > scores[1] ? 0 : 1) : null
  );
  return {
    ...state,
    phase: "round_result",
    roundWinner: winner,
    roundOutcome: outcome,
    scores,
    turnDeadline: now + REVEAL_MS,
    result: finalWinner !== null
      ? { kind: "win", winnerSeat: finalWinner, reason: "quantum_duel_score" }
      : isLastRound ? { kind: "draw", reason: "duel_tied" } : null,
  };
}

export function createQuantumDuelState(now: number, options: GameOptions): QuantumDuelState {
  const chooseDurationMs = { relaxed: 30_000, standard: 20_000, blitz: 12_000 }[options.pace];
  return {
    kind: "quantum_duel",
    rulesVersion: 1,
    round: 1,
    totalRounds: roundsForLength(options.length),
    phase: "choosing",
    choices: [null, null],
    locked: [false, false],
    roundWinner: null,
    roundOutcome: null,
    scores: [0, 0],
    chooseDurationMs,
    turnDeadline: now + chooseDurationMs,
    result: null,
  };
}

export function chooseDuelMove(
  state: QuantumDuelState,
  actor: Seat,
  move: DuelMove,
  now: number,
): GameActionResult {
  if (state.result) return { ok: false, reason: "game_finished" };
  if (now >= state.turnDeadline) return { ok: false, reason: "turn_expired" };
  if (state.phase !== "choosing") return { ok: false, reason: "wrong_phase" };
  if (!DUEL_MOVES.includes(move)) return { ok: false, reason: "invalid_move" };
  if (state.locked[actor]) return { ok: false, reason: "already_chosen" };

  const choices: QuantumDuelState["choices"] = [...state.choices];
  const locked: QuantumDuelState["locked"] = [...state.locked];
  choices[actor] = move;
  locked[actor] = true;
  if (!locked[0] || !locked[1]) {
    return { ok: true, state: { ...state, choices, locked } };
  }

  const winner = choices[0] === choices[1] ? null : moveWins(choices[0]!, choices[1]!) ? 0 : 1;
  return {
    ok: true,
    state: finishRound(
      { ...state, choices, locked },
      winner,
      winner === null ? "draw" : "decisive",
      now,
    ),
  };
}

export function advanceQuantumDuelClock(state: QuantumDuelState, now: number): QuantumDuelState {
  if (state.result || now < state.turnDeadline) return state;
  if (state.phase === "choosing") {
    const winner = state.locked[0] === state.locked[1] ? null : state.locked[0] ? 0 : 1;
    return finishRound(
      state,
      winner,
      winner === null ? "double_timeout" : "choice_timeout",
      now,
    );
  }
  return {
    ...state,
    round: state.round + 1,
    phase: "choosing",
    choices: [null, null],
    locked: [false, false],
    roundWinner: null,
    roundOutcome: null,
    turnDeadline: now + state.chooseDurationMs,
  };
}

export function getQuantumDuelView(
  state: QuantumDuelState,
  viewerSeat: Seat | null,
): QuantumDuelViewState {
  if (state.phase === "round_result" || state.result) return state;
  const choices: QuantumDuelState["choices"] = [null, null];
  if (viewerSeat !== null) choices[viewerSeat] = state.choices[viewerSeat];
  return { ...state, choices };
}
