import { describe, expect, it } from "vitest";

import {
  advancePulsePassClock,
  chargePulseCore,
  createPulsePassState,
  getPulsePassView,
  ventPulseCore,
  type GameOptions,
  type PulsePassState,
} from "../src/index";

const options: GameOptions = { pace: "standard", difficulty: "standard", length: "short" };

function unwrap(
  result: ReturnType<typeof chargePulseCore> | ReturnType<typeof ventPulseCore>,
): PulsePassState {
  if (!result.ok || result.state.kind !== "pulse_pass") throw new Error("expected pulse pass state");
  return result.state;
}

describe("pulse pass", () => {
  it("is deterministic and maps all three option axes", () => {
    const first = createPulsePassState(0, 1_000, 42, options);
    expect(first).toEqual(createPulsePassState(0, 1_000, 42, options));
    expect([first.totalRounds, first.availablePowers, first.initialVentCharges, first.turnDurationMs])
      .toEqual([3, [1, 2, 3], 1, 14_000]);
    expect(first.burstAt).toBeGreaterThanOrEqual(8);
    expect(first.burstAt).toBeLessThanOrEqual(10);

    const easy = createPulsePassState(1, 0, 7, { pace: "relaxed", difficulty: "easy", length: "long" });
    expect([easy.totalRounds, easy.availablePowers, easy.initialVentCharges, easy.turnDurationMs, easy.burstMin, easy.burstMax])
      .toEqual([7, [1, 2], 2, 20_000, 9, 11]);
  });

  it("keeps the burst threshold secret until a round resolves", () => {
    let state = createPulsePassState(0, 1_000, 8, options);
    expect(getPulsePassView(state).burstAt).toBeNull();
    state = { ...state, charge: state.burstAt - 1 };
    state = unwrap(chargePulseCore(state, 0, 1, 1_100));
    expect(state.phase).toBe("round_result");
    expect(getPulsePassView(state).burstAt).toBe(state.burstAt);
  });

  it("enforces holder ownership, legal power and deadline", () => {
    const state = createPulsePassState(0, 1_000, 9, options);
    expect(chargePulseCore(state, 1, 1, 1_100)).toEqual({ ok: false, reason: "not_your_turn" });
    expect(chargePulseCore(state, 0, 4 as 1, 1_100)).toEqual({ ok: false, reason: "invalid_power" });
    expect(chargePulseCore(state, 0, 1, state.turnDeadline)).toEqual({ ok: false, reason: "turn_expired" });
  });

  it("passes a safely charged core and exposes only a coarse heat band", () => {
    let state = createPulsePassState(0, 1_000, 10, options);
    state = unwrap(chargePulseCore(state, 0, 3, 1_100));
    expect([state.holderSeat, state.charge, state.passes, state.totalPasses, state.lastPower])
      .toEqual([1, 3, 1, 1, 3]);
    expect(state.totalPower).toEqual([3, 0]);
    expect(["stable", "warm", "critical"]).toContain(state.heatBand);
  });

  it("spends a finite vent to cool the core and pass it", () => {
    let state = createPulsePassState(0, 1_000, 11, options);
    state = { ...state, charge: 5 };
    state = unwrap(ventPulseCore(state, 0, 1_100));
    expect([state.holderSeat, state.charge, state.ventCharges[0], state.ventsUsed[0]])
      .toEqual([1, 3, 0, 1]);
    expect(ventPulseCore({ ...state, holderSeat: 0 }, 0, 1_200)).toEqual({ ok: false, reason: "no_vents_left" });
  });

  it("awards a point to the opponent on burst or holder timeout", () => {
    let burst = createPulsePassState(0, 1_000, 12, options);
    burst = { ...burst, charge: burst.burstAt - 2 };
    burst = unwrap(chargePulseCore(burst, 0, 2, 1_100));
    expect([burst.roundOutcome, burst.roundWinner, ...burst.scores]).toEqual(["burst", 1, 0, 1]);

    let timed = createPulsePassState(1, 1_000, 13, options);
    timed = advancePulsePassClock(timed, timed.turnDeadline);
    expect([timed.roundOutcome, timed.roundWinner, ...timed.scores]).toEqual(["holder_timeout", 0, 1, 0]);
  });

  it("alternates opening holders, preserves match vents and ends a best-of-three match", () => {
    let state = createPulsePassState(0, 1_000, 14, options);
    state = { ...state, ventCharges: [0, 1] };
    for (let point = 0; point < 2; point += 1) {
      state = { ...state, holderSeat: 1, charge: state.burstAt - 1 };
      state = unwrap(chargePulseCore(state, 1, 1, state.turnDeadline - 1));
      if (!state.result) {
        state = advancePulsePassClock(state, state.turnDeadline);
        expect(state.holderSeat).toBe(state.round % 2 === 1 ? 0 : 1);
        expect(state.ventCharges).toEqual([0, 1]);
      }
    }
    expect(state.result).toEqual({ kind: "win", winnerSeat: 0, reason: "pulse_pass_score" });
    expect(state.scores).toEqual([2, 0]);
  });
});
