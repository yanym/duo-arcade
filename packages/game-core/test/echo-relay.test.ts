import { describe, expect, it } from "vitest";

import {
  advanceEchoRelayClock,
  createEchoRelayState,
  getEchoRelayView,
  pressEchoTone,
  type EchoRelayState,
  type GameOptions,
} from "../src/index";

const options: GameOptions = { pace: "standard", difficulty: "easy", length: "short" };

function unwrap(result: ReturnType<typeof pressEchoTone>): EchoRelayState {
  if (!result.ok || result.state.kind !== "echo_relay") throw new Error("expected echo relay state");
  return result.state;
}

function completeStage(state: EchoRelayState, now: number): EchoRelayState {
  let next = state;
  const operator = next.decoderSeat === 0 ? 1 : 0;
  for (const tone of next.sequence) next = unwrap(pressEchoTone(next, operator, tone, now));
  return next;
}

describe("echo relay", () => {
  it("keeps the pulse sequence private while transmitting", () => {
    const state = createEchoRelayState(0, 1_000, 42, options);
    expect(getEchoRelayView(state, 0).sequence).toEqual(state.sequence);
    expect(getEchoRelayView(state, 1).sequence).toBeNull();
    expect(getEchoRelayView(state, null).sequence).toBeNull();
  });

  it("enforces roles, resets progress on interference, and counts a strike", () => {
    let state = createEchoRelayState(0, 1_000, 73, options);
    expect(pressEchoTone(state, 0, state.sequence[0]!, 1_100)).toEqual({ ok: false, reason: "wrong_role" });
    state = unwrap(pressEchoTone(state, 1, state.sequence[0]!, 1_100));
    expect(state.progress).toBe(1);
    const wrong = state.availableTones.find((tone) => tone !== state.sequence[1])!;
    state = unwrap(pressEchoTone(state, 1, wrong, 1_200));
    expect([state.progress, state.strikes, state.lastInput?.correct]).toEqual([0, 1, false]);
  });

  it("reveals a completed stage, then swaps roles on the server alarm", () => {
    let state = completeStage(createEchoRelayState(0, 1_000, 99, options), 1_200);
    expect([state.phase, state.completedStages]).toEqual(["stage_result", 1]);
    expect(getEchoRelayView(state, 1).sequence).toEqual(state.sequence);
    state = advanceEchoRelayClock(state, state.turnDeadline);
    expect([state.phase, state.stage, state.decoderSeat, state.progress]).toEqual(["transmitting", 2, 1, 0]);
    expect(getEchoRelayView(state, 0).sequence).toBeNull();
    expect(getEchoRelayView(state, 1).sequence).toEqual(state.sequence);
  });

  it("can fail on interference and finish every stage successfully", () => {
    let failed = createEchoRelayState(0, 1_000, 7, { ...options, difficulty: "hard" });
    const wrong = failed.availableTones.find((tone) => tone !== failed.sequence[0])!;
    failed = unwrap(pressEchoTone(failed, 1, wrong, 1_100));
    expect(failed.result).toEqual({ kind: "failure", score: 0, reason: "too_many_strikes" });

    let state = createEchoRelayState(0, 1_000, 101, options);
    while (!state.result) {
      state = completeStage(state, state.turnDeadline - 1);
      if (!state.result) state = advanceEchoRelayClock(state, state.turnDeadline);
    }
    expect(state.result.kind).toBe("success");
    expect(state.completedStages).toBe(3);
  });

  it("fails safely when the transmission timer expires", () => {
    const state = createEchoRelayState(0, 1_000, 17, options);
    const expired = advanceEchoRelayClock(state, state.turnDeadline);
    expect(expired.result).toEqual({ kind: "failure", score: 0, reason: "timeout" });
  });
});
