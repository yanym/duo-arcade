import {
  SYNC_COUNTDOWN_MS,
  SYNC_ROUNDS,
  SYNC_TAP_WINDOW_MS,
  type GameActionResult,
  type Seat,
  type SyncTapState,
} from "./types";

export function createSyncTapState(
  now: number,
  totalRounds: SyncTapState["totalRounds"] = SYNC_ROUNDS,
  countdownMs = SYNC_COUNTDOWN_MS,
  tapWindowMs = SYNC_TAP_WINDOW_MS,
): SyncTapState {
  const goAt = now + countdownMs;
  return {
    kind: "sync_tap",
    rulesVersion: 1,
    round: 1,
    totalRounds,
    countdownMs,
    tapWindowMs,
    goAt,
    taps: [null, null],
    lastDeltaMs: null,
    roundScores: [],
    turnDeadline: goAt + tapWindowMs,
    result: null,
  };
}

export function tapInSync(state: SyncTapState, actor: Seat, now: number): GameActionResult {
  if (state.result) return { ok: false, reason: "game_finished" };
  if (now >= state.turnDeadline) return { ok: false, reason: "turn_expired" };
  if (now < state.goAt) return { ok: false, reason: "too_early" };
  if (state.taps[actor] !== null) return { ok: false, reason: "already_tapped" };
  const taps: [number | null, number | null] = [...state.taps];
  taps[actor] = now;
  if (taps[0] === null || taps[1] === null) return { ok: true, state: { ...state, taps } };

  const delta = Math.abs(taps[0] - taps[1]);
  const score = Math.max(0, 100 - Math.floor(delta / 12));
  const roundScores = [...state.roundScores, score];
  if (state.round >= state.totalRounds) {
    const average = Math.round(roundScores.reduce((sum, value) => sum + value, 0) / roundScores.length);
    return {
      ok: true,
      state: {
        ...state,
        taps,
        lastDeltaMs: delta,
        roundScores,
        result: { kind: "success", score: average, reason: "rounds_complete" },
      },
    };
  }
  const goAt = now + state.countdownMs;
  return {
    ok: true,
    state: {
      ...state,
      round: state.round + 1,
      goAt,
      taps: [null, null],
      lastDeltaMs: delta,
      roundScores,
      turnDeadline: goAt + state.tapWindowMs,
    },
  };
}
