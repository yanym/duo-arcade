import { describe, expect, it } from "vitest";

import {
  advanceSignalBluffClock,
  claimSignal,
  createSignalBluffState,
  getSignalBluffView,
  judgeSignal,
  otherSeat,
  scanSignal,
  type GameOptions,
  type SignalBluffState,
} from "../src/index";

const options: GameOptions = { pace: "standard", difficulty: "standard", length: "short" };

function unwrap(
  result: ReturnType<typeof claimSignal> | ReturnType<typeof scanSignal> | ReturnType<typeof judgeSignal>,
): SignalBluffState {
  if (!result.ok || result.state.kind !== "signal_bluff") throw new Error("expected signal bluff state");
  return result.state;
}

describe("signal bluff", () => {
  it("maps options and deterministically creates a private dossier", () => {
    const first = createSignalBluffState(0, 1_000, 42, options);
    expect(createSignalBluffState(0, 1_000, 42, options)).toEqual(first);
    expect([first.totalRounds, first.signalCount, first.availableSignals.length, first.scanCharges, first.claimDurationMs, first.judgeDurationMs])
      .toEqual([5, 4, 4, [1, 1], 20_000, 14_000]);

    const easy = createSignalBluffState(1, 0, 7, { pace: "relaxed", difficulty: "easy", length: "long" });
    const hard = createSignalBluffState(1, 0, 7, { pace: "blitz", difficulty: "hard", length: "standard" });
    expect([easy.totalRounds, easy.signalCount, easy.scanCharges, easy.claimDurationMs, easy.judgeDurationMs])
      .toEqual([9, 3, [2, 2], 30_000, 20_000]);
    expect([hard.totalRounds, hard.signalCount, hard.scanCharges, hard.claimDurationMs, hard.judgeDurationMs])
      .toEqual([7, 5, [0, 0], 12_000, 9_000]);
  });

  it("reveals the truth only to the current sender", () => {
    const state = createSignalBluffState(1, 1_000, 5, options);
    expect(getSignalBluffView(state, 1).truthSignal).toBe(state.truthSignal);
    expect(getSignalBluffView(state, 0).truthSignal).toBeNull();
    expect(getSignalBluffView(state, null).truthSignal).toBeNull();
  });

  it("enforces sender ownership and the configured signal set", () => {
    const state = createSignalBluffState(0, 1_000, 9, { ...options, difficulty: "easy" });
    expect(claimSignal(state, 1, state.truthSignal, 1_100)).toEqual({ ok: false, reason: "wrong_role" });
    expect(claimSignal(state, 0, "spiral", 1_100)).toEqual({ ok: false, reason: "invalid_symbol" });
    const claimed = unwrap(claimSignal(state, 0, state.truthSignal, 1_100));
    expect([claimed.phase, claimed.claimSignal, claimed.turnDeadline]).toEqual(["judging", state.truthSignal, 1_100 + state.judgeDurationMs]);
    expect(claimSignal(claimed, 0, state.truthSignal, 1_200)).toEqual({ ok: false, reason: "wrong_phase" });
  });

  it("spends a limited scan and keeps its parity hint private to the judge", () => {
    let state = createSignalBluffState(0, 1_000, 13, options);
    state = unwrap(claimSignal(state, 0, state.availableSignals[0]!, 1_100));
    expect(scanSignal(state, 0, 1_200)).toEqual({ ok: false, reason: "wrong_role" });
    state = unwrap(scanSignal(state, 1, 1_200));
    expect([state.scanned, state.scanCharges[1]]).toEqual([true, 0]);
    expect(state.scanHint === "group_a" || state.scanHint === "group_b").toBe(true);
    expect(getSignalBluffView(state, 1).scanHint).toBe(state.scanHint);
    expect(getSignalBluffView(state, 0).scanHint).toBeNull();
    expect(getSignalBluffView(state, null).scanHint).toBeNull();
    expect(scanSignal(state, 1, 1_300)).toEqual({ ok: false, reason: "already_chosen" });
  });

  it("awards the player who correctly trusts truth or exposes a bluff", () => {
    let state = createSignalBluffState(0, 1_000, 17, options);
    state = unwrap(claimSignal(state, 0, state.truthSignal, 1_100));
    state = unwrap(judgeSignal(state, 1, "trust", 1_200));
    expect([state.roundWinner, state.roundOutcome, state.scores]).toEqual([1, "truth_trusted", [0, 1]]);
    expect(getSignalBluffView(state, 1).truthSignal).toBe(state.truthSignal);

    state = advanceSignalBluffClock(state, state.turnDeadline);
    const bluff = state.availableSignals.find((signal) => signal !== state.truthSignal)!;
    state = unwrap(claimSignal(state, state.senderSeat, bluff, state.turnDeadline - 1));
    const judge = otherSeat(state.senderSeat);
    state = unwrap(judgeSignal(state, judge, "challenge", state.turnDeadline - 1));
    expect([state.roundWinner, state.roundOutcome, state.scores[judge]]).toEqual([judge, "bluff_exposed", 1]);
  });

  it("assigns claim and judgment timeouts to the other side", () => {
    let claimTimeout = createSignalBluffState(0, 1_000, 23, options);
    claimTimeout = advanceSignalBluffClock(claimTimeout, claimTimeout.turnDeadline);
    expect([claimTimeout.roundWinner, claimTimeout.roundOutcome, claimTimeout.scores]).toEqual([1, "claim_timeout", [0, 1]]);

    let judgeTimeout = createSignalBluffState(0, 1_000, 23, options);
    judgeTimeout = unwrap(claimSignal(judgeTimeout, 0, judgeTimeout.truthSignal, 1_100));
    judgeTimeout = advanceSignalBluffClock(judgeTimeout, judgeTimeout.turnDeadline);
    expect([judgeTimeout.roundWinner, judgeTimeout.roundOutcome, judgeTimeout.scores]).toEqual([0, "judge_timeout", [1, 0]]);
  });

  it("swaps roles and can finish a complete bluff match", () => {
    let state = createSignalBluffState(0, 1_000, 31, options);
    const senders = new Set<number>();
    while (!state.result) {
      senders.add(state.senderSeat);
      state = unwrap(claimSignal(state, state.senderSeat, state.truthSignal, state.turnDeadline - 2));
      const verdict = state.senderSeat === 0 ? "challenge" : "trust";
      state = unwrap(judgeSignal(state, otherSeat(state.senderSeat), verdict, state.turnDeadline - 2));
      if (!state.result) state = advanceSignalBluffClock(state, state.turnDeadline);
    }
    expect(senders.size).toBe(2);
    expect([state.result.kind, state.result.reason]).toEqual(["win", "signal_bluff_score"]);
    if (state.result.kind !== "win") throw new Error("expected signal bluff winner");
    expect(state.result.winnerSeat).toBe(0);
    expect(state.scores).toEqual([3, 0]);
  });
});
