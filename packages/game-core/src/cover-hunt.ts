import { roundsForLength } from "./options";
import {
  otherSeat,
  type CoverHuntState,
  type CoverHuntViewState,
  type CoverRoundOutcome,
  type GameActionResult,
  type GameOptions,
  type Seat,
} from "./types";

const ROUND_REVEAL_MS = 3_000;

function configForOptions(options: GameOptions): Pick<
  CoverHuntState,
  "totalRounds" | "covers" | "scanCharges" | "hideDurationMs" | "huntDurationMs"
> {
  const pace = {
    relaxed: { hideDurationMs: 20_000, huntDurationMs: 30_000 },
    standard: { hideDurationMs: 12_000, huntDurationMs: 20_000 },
    blitz: { hideDurationMs: 7_000, huntDurationMs: 12_000 },
  }[options.pace];
  const difficulty = {
    easy: { covers: 4 as const, scanCharges: 2 },
    standard: { covers: 5 as const, scanCharges: 1 },
    hard: { covers: 6 as const, scanCharges: 0 },
  }[options.difficulty];
  return {
    ...pace,
    ...difficulty,
    totalRounds: roundsForLength(options.length),
  };
}

function scanChargesForCovers(covers: CoverHuntState["covers"]): number {
  return covers === 4 ? 2 : covers === 5 ? 1 : 0;
}

export function createCoverHuntState(
  hunterSeat: Seat,
  now: number,
  options: GameOptions,
): CoverHuntState {
  const config = configForOptions(options);
  return {
    kind: "cover_hunt",
    rulesVersion: 1,
    round: 1,
    totalRounds: config.totalRounds,
    covers: config.covers,
    phase: "hiding",
    hunterSeat,
    hiddenSpot: null,
    scanCharges: config.scanCharges,
    scanFeedback: null,
    shotSpot: null,
    roundWinner: null,
    roundOutcome: null,
    scores: [0, 0],
    hideDurationMs: config.hideDurationMs,
    huntDurationMs: config.huntDurationMs,
    turnDeadline: now + config.hideDurationMs,
    result: null,
  };
}

function isValidCover(state: CoverHuntState, cover: number): boolean {
  return Number.isInteger(cover) && cover >= 0 && cover < state.covers;
}

export function hideBehindCover(
  state: CoverHuntState,
  actor: Seat,
  cover: number,
  now: number,
): GameActionResult {
  if (state.result) return { ok: false, reason: "game_finished" };
  if (now >= state.turnDeadline) return { ok: false, reason: "turn_expired" };
  if (state.phase !== "hiding") return { ok: false, reason: "wrong_phase" };
  if (actor === state.hunterSeat) return { ok: false, reason: "wrong_role" };
  if (!isValidCover(state, cover)) return { ok: false, reason: "cover_out_of_range" };
  return {
    ok: true,
    state: {
      ...state,
      phase: "hunting",
      hiddenSpot: cover,
      scanFeedback: null,
      shotSpot: null,
      roundWinner: null,
      roundOutcome: null,
      turnDeadline: now + state.huntDurationMs,
    },
  };
}

export function scanCover(
  state: CoverHuntState,
  actor: Seat,
  cover: number,
  now: number,
): GameActionResult {
  if (state.result) return { ok: false, reason: "game_finished" };
  if (now >= state.turnDeadline) return { ok: false, reason: "turn_expired" };
  if (state.phase !== "hunting") return { ok: false, reason: "wrong_phase" };
  if (actor !== state.hunterSeat) return { ok: false, reason: "wrong_role" };
  if (!isValidCover(state, cover)) return { ok: false, reason: "cover_out_of_range" };
  if (state.scanCharges <= 0) return { ok: false, reason: "no_scans_left" };
  const distance = Math.abs(cover - state.hiddenSpot!);
  const signal = distance === 0 ? "hot" : distance === 1 ? "warm" : "cold";
  return {
    ok: true,
    state: {
      ...state,
      scanCharges: state.scanCharges - 1,
      scanFeedback: { cover, signal },
    },
  };
}

function awardRound(
  state: CoverHuntState,
  winner: Seat,
  outcome: CoverRoundOutcome,
  now: number,
  shotSpot: number | null,
): CoverHuntState {
  const scores: [number, number] = [...state.scores];
  scores[winner] += 1;
  const targetScore = Math.floor(state.totalRounds / 2) + 1;
  const matchFinished = scores[winner] >= targetScore || state.round >= state.totalRounds;
  return {
    ...state,
    phase: "round_result",
    scores,
    shotSpot,
    roundWinner: winner,
    roundOutcome: outcome,
    turnDeadline: now + ROUND_REVEAL_MS,
    result: matchFinished
      ? { kind: "win", winnerSeat: winner, reason: "cover_hunt_score" }
      : null,
  };
}

export function shootCover(
  state: CoverHuntState,
  actor: Seat,
  cover: number,
  now: number,
): GameActionResult {
  if (state.result) return { ok: false, reason: "game_finished" };
  if (now >= state.turnDeadline) return { ok: false, reason: "turn_expired" };
  if (state.phase !== "hunting") return { ok: false, reason: "wrong_phase" };
  if (actor !== state.hunterSeat) return { ok: false, reason: "wrong_role" };
  if (!isValidCover(state, cover)) return { ok: false, reason: "cover_out_of_range" };
  const hit = cover === state.hiddenSpot;
  return {
    ok: true,
    state: awardRound(
      state,
      hit ? state.hunterSeat : otherSeat(state.hunterSeat),
      hit ? "hit" : "miss",
      now,
      cover,
    ),
  };
}

export function advanceCoverHuntClock(state: CoverHuntState, now: number): CoverHuntState {
  if (state.result || now < state.turnDeadline) return state;
  if (state.phase === "hiding") {
    return awardRound(state, state.hunterSeat, "hide_timeout", now, null);
  }
  if (state.phase === "hunting") {
    return awardRound(state, otherSeat(state.hunterSeat), "hunt_timeout", now, null);
  }
  const hunterSeat = otherSeat(state.hunterSeat);
  return {
    ...state,
    round: state.round + 1,
    phase: "hiding",
    hunterSeat,
    hiddenSpot: null,
    scanCharges: scanChargesForCovers(state.covers),
    scanFeedback: null,
    shotSpot: null,
    roundWinner: null,
    roundOutcome: null,
    turnDeadline: now + state.hideDurationMs,
  };
}

export function getCoverHuntView(
  state: CoverHuntState,
  viewerSeat: Seat | null,
): CoverHuntViewState {
  const isReveal = state.phase === "round_result" || state.result !== null;
  const isHider = viewerSeat !== null && viewerSeat !== state.hunterSeat;
  return {
    ...state,
    hiddenSpot: isReveal || isHider ? state.hiddenSpot : null,
    scanFeedback: viewerSeat === state.hunterSeat ? state.scanFeedback : null,
  };
}
