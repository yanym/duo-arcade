import { describe, expect, it } from "vitest";
import type { RoomView } from "@duo/protocol";

import { isCompetitive, isSeatActive, isTimedActionExpired } from "./playerActivity";

function room(phase: RoomView["phase"], game: object): RoomView {
  return { phase, game: { turnDeadline: 10_000, ...game } } as RoomView;
}

describe("player activity emphasis", () => {
  it("never presents either player as actionable outside live gameplay", () => {
    const readyRoom = room("ready", { kind: "gomoku", currentSeat: 0 });
    expect(isSeatActive(readyRoom, 0, 0)).toBe(false);
    expect(isSeatActive(readyRoom, 1, 0)).toBe(false);
  });

  it("emphasizes only the current player in turn-based competition", () => {
    const activeRoom = room("playing", { kind: "gomoku", currentSeat: 1 });
    expect(isCompetitive(activeRoom)).toBe(true);
    expect(isSeatActive(activeRoom, 0, 0)).toBe(false);
    expect(isSeatActive(activeRoom, 1, 0)).toBe(true);
  });

  it("emphasizes only the operator who can advance a defuse sequence", () => {
    const activeRoom = room("playing", { kind: "starship_defuse", operatorSeat: 0 });
    expect(isCompetitive(activeRoom)).toBe(false);
    expect(isSeatActive(activeRoom, 0, 0)).toBe(true);
    expect(isSeatActive(activeRoom, 1, 0)).toBe(false);
  });

  it("keeps both players active when both controls remain useful", () => {
    const activeRoom = room("playing", { kind: "split_maze" });
    expect(isSeatActive(activeRoom, 0, 0)).toBe(true);
    expect(isSeatActive(activeRoom, 1, 0)).toBe(true);
  });

  it("does not claim a sync tap is actionable before the shared start", () => {
    const activeRoom = room("playing", { kind: "sync_tap", goAt: 2_000, turnDeadline: 3_000, taps: [null, 2_100] });
    expect(isSeatActive(activeRoom, 0, 1_999)).toBe(false);
    expect(isSeatActive(activeRoom, 0, 2_000)).toBe(true);
    expect(isSeatActive(activeRoom, 1, 2_000)).toBe(false);
    expect(isSeatActive(activeRoom, 0, 3_000)).toBe(false);
  });

  it("clears activity emphasis during automatic round transitions", () => {
    const transitionRoom = room("playing", { kind: "echo_relay", phase: "stage_result", decoderSeat: 0 });
    expect(isSeatActive(transitionRoom, 0, 0)).toBe(false);
    expect(isSeatActive(transitionRoom, 1, 0)).toBe(false);
  });

  it("moves emphasis between the private-information roles", () => {
    const claiming = room("playing", { kind: "signal_bluff", phase: "claiming", senderSeat: 1, turnDeadline: 5_000 });
    expect(isSeatActive(claiming, 0, 0)).toBe(false);
    expect(isSeatActive(claiming, 1, 0)).toBe(true);

    const judging = room("playing", { kind: "signal_bluff", phase: "judging", senderSeat: 1, turnDeadline: 5_000 });
    expect(isSeatActive(judging, 0, 0)).toBe(true);
    expect(isSeatActive(judging, 1, 0)).toBe(false);
  });

  it("replaces action emphasis with a settlement wait when a fast window expires", () => {
    const activeRoom = room("playing", {
      kind: "drop_rescue",
      phase: "descent",
      locked: [false, false],
      turnDeadline: 2_000,
    });
    expect(isTimedActionExpired(activeRoom, 1_999)).toBe(false);
    expect(isSeatActive(activeRoom, 0, 1_999)).toBe(true);
    expect(isTimedActionExpired(activeRoom, 2_000)).toBe(true);
    expect(isSeatActive(activeRoom, 0, 2_000)).toBe(false);
  });

  it("does not treat an automatic result reveal timer as an action timeout", () => {
    const resultRoom = room("playing", {
      kind: "neon_dash",
      phase: "round_result",
      locked: [true, true],
      turnDeadline: 2_000,
    });
    expect(isTimedActionExpired(resultRoom, 2_000)).toBe(false);
  });

  it("closes slow turn-based controls at their shared deadline", () => {
    const activeRoom = room("playing", { kind: "gomoku", currentSeat: 0, turnDeadline: 2_000 });
    expect(isTimedActionExpired(activeRoom, 1_999)).toBe(false);
    expect(isTimedActionExpired(activeRoom, 2_000)).toBe(true);
    expect(isSeatActive(activeRoom, 0, 2_000)).toBe(false);
  });

  it("keeps automatic memory and shuffle phases unblocked", () => {
    const memorizing = room("playing", { kind: "shadow_shuttle", phase: "memorizing", turnDeadline: 2_000 });
    const shuffling = room("playing", { kind: "shadow_shuttle", phase: "shuffling", turnDeadline: 2_000 });
    expect(isTimedActionExpired(memorizing, 2_000)).toBe(false);
    expect(isTimedActionExpired(shuffling, 2_000)).toBe(false);
  });

  it("distinguishes cover selection from its automatic reveal", () => {
    const hunting = room("playing", { kind: "cover_hunt", phase: "hunting", turnDeadline: 2_000 });
    const reveal = room("playing", { kind: "cover_hunt", phase: "round_result", turnDeadline: 2_000 });
    expect(isTimedActionExpired(hunting, 2_000)).toBe(true);
    expect(isTimedActionExpired(reveal, 2_000)).toBe(false);
  });

  it.each([
    ["gomoku", {}],
    ["reversi", {}],
    ["split_maze", {}],
    ["sync_tap", {}],
    ["cover_hunt", { phase: "hunting" }],
    ["starship_defuse", {}],
    ["echo_relay", { phase: "transmitting" }],
    ["core_rally", { phase: "return_window" }],
    ["skyline_rescue", { phase: "planning" }],
    ["meteor_dash", { phase: "catching" }],
    ["dual_thrusters", { phase: "planning" }],
    ["fog_sonar", { phase: "navigating" }],
    ["storm_grid", { phase: "discharge_window" }],
    ["trajectory_intercept", { phase: "intercepting" }],
    ["star_trace", { phase: "tracing" }],
    ["magnet_haul", { phase: "moving" }],
    ["lumen_bridge", { phase: "resonance" }],
    ["neon_dash", { phase: "reacting" }],
    ["signal_bluff", { phase: "judging" }],
    ["prism_heist", { phase: "breach" }],
    ["nova_volley", { phase: "strike_window" }],
    ["pulse_pass", { phase: "handling" }],
    ["drop_rescue", { phase: "descent" }],
    ["quantum_duel", { phase: "choosing" }],
    ["starway_escort", { phase: "planning" }],
    ["orbital_repair", { phase: "aligning" }],
    ["rhythm_gravity", { phase: "beat" }],
    ["shadow_shuttle", { phase: "guessing" }],
  ] as const)("closes %s controls exactly at the authoritative deadline", (kind, extra) => {
    const actionRoom = room("playing", { kind, ...extra, turnDeadline: 2_000 });
    expect(isTimedActionExpired(actionRoom, 1_999)).toBe(false);
    expect(isTimedActionExpired(actionRoom, 2_000)).toBe(true);
  });

  it.each([
    ["cover_hunt", "round_result"],
    ["echo_relay", "stage_result"],
    ["core_rally", "rally_result"],
    ["skyline_rescue", "wave_result"],
    ["meteor_dash", "round_result"],
    ["dual_thrusters", "gate_result"],
    ["fog_sonar", "zone_result"],
    ["storm_grid", "wave_result"],
    ["trajectory_intercept", "round_result"],
    ["star_trace", "stage_result"],
    ["magnet_haul", "checkpoint_result"],
    ["lumen_bridge", "stage_result"],
    ["neon_dash", "round_result"],
    ["signal_bluff", "round_result"],
    ["prism_heist", "corridor_result"],
    ["nova_volley", "point_result"],
    ["pulse_pass", "round_result"],
    ["drop_rescue", "landing_result"],
    ["quantum_duel", "round_result"],
    ["starway_escort", "sector_result"],
    ["orbital_repair", "stage_result"],
    ["rhythm_gravity", "round_result"],
    ["shadow_shuttle", "round_result"],
  ] as const)("keeps %s automatic %s phase visible after its timer", (kind, phase) => {
    expect(isTimedActionExpired(room("playing", { kind, phase, turnDeadline: 2_000 }), 2_000)).toBe(false);
  });
});
