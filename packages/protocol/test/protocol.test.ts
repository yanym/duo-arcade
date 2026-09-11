import { describe, expect, it } from "vitest";

import { COMPATIBLE_PROTOCOL_VERSIONS, PROTOCOL_VERSION, parseClientMessage } from "../src/index";

const envelope = { type: "game_action", actionId: "12345678", expectedVersion: 4 };

describe("protocol parser", () => {
  it("keeps exactly one backward-compatible protocol during rolling updates", () => {
    expect([...COMPATIBLE_PROTOCOL_VERSIONS]).toEqual([PROTOCOL_VERSION, PROTOCOL_VERSION - 1]);
  });

  it.each([
    { kind: "place_stone", row: 7, col: 8 },
    { kind: "place_disc", row: 2, col: 3 },
    { kind: "maze_move", direction: "left" },
    { kind: "sync_tap" },
    { kind: "cover_hide", cover: 4 },
    { kind: "cover_scan", cover: 2 },
    { kind: "cover_shoot", cover: 0 },
    { kind: "defuse_press", symbol: "diamond" },
    { kind: "duel_choose", move: "guard" },
    { kind: "escort_route", lane: 0 },
    { kind: "escort_shield", lane: 2 },
    { kind: "orbit_rotate", ring: 1, direction: "clockwise" },
    { kind: "orbit_launch" },
    { kind: "rhythm_gravity_tap" },
    { kind: "shadow_mark", pod: 3 },
    { kind: "shadow_guess", slot: 2 },
    { kind: "echo_press", tone: "nova" },
    { kind: "core_move", direction: -1 },
    { kind: "core_return" },
    { kind: "rescue_aim", zone: 2 },
    { kind: "rescue_pressure", pressure: 3 },
    { kind: "meteor_catch", cell: 7 },
    { kind: "thruster_burn", power: 2 },
    { kind: "sonar_ping", direction: "up" },
    { kind: "fog_steer", direction: "left" },
    { kind: "grid_shift", direction: 1 },
    { kind: "grid_toggle" },
    { kind: "grid_discharge" },
    { kind: "intercept_move", direction: -1 },
    { kind: "intercept_capture" },
    { kind: "star_trace_move", direction: "down" },
    { kind: "magnet_move", direction: 1 },
    { kind: "bridge_adjust", direction: -1 },
    { kind: "bridge_lock" },
    { kind: "neon_dodge", move: "dodge_left" },
    { kind: "signal_claim", signal: "spiral" },
    { kind: "signal_scan" },
    { kind: "signal_judge", verdict: "challenge" },
    { kind: "heist_move", direction: -1 },
    { kind: "heist_bypass" },
    { kind: "heist_dash" },
    { kind: "volley_move", direction: 1 },
    { kind: "volley_strike", lane: 4 },
    { kind: "pulse_charge", power: 3 },
    { kind: "pulse_vent" },
    { kind: "drop_move", direction: -1 },
    { kind: "drop_brake", direction: 1 },
    { kind: "drop_lock" },
  ])("accepts $kind", (payload) => {
    expect(parseClientMessage({ ...envelope, payload })).toEqual({ ...envelope, payload });
  });

  it("rejects unknown actions and malformed coordinates", () => {
    expect(parseClientMessage({ ...envelope, payload: { kind: "drop", column: 2 } })).toBeNull();
    expect(parseClientMessage({ ...envelope, payload: { kind: "place_disc", row: 2.5, col: 3 } })).toBeNull();
    expect(parseClientMessage({ ...envelope, payload: { kind: "maze_move", direction: "diagonal" } })).toBeNull();
    expect(parseClientMessage({ ...envelope, payload: { kind: "echo_press", tone: "silence" } })).toBeNull();
    expect(parseClientMessage({ ...envelope, payload: { kind: "core_move", direction: 0 } })).toBeNull();
    expect(parseClientMessage({ ...envelope, payload: { kind: "rescue_aim", zone: 3 } })).toBeNull();
    expect(parseClientMessage({ ...envelope, payload: { kind: "rescue_pressure", pressure: 0 } })).toBeNull();
    expect(parseClientMessage({ ...envelope, payload: { kind: "meteor_catch", cell: 1.5 } })).toBeNull();
    expect(parseClientMessage({ ...envelope, payload: { kind: "thruster_burn", power: 3 } })).toBeNull();
    expect(parseClientMessage({ ...envelope, payload: { kind: "sonar_ping", direction: "forward" } })).toBeNull();
    expect(parseClientMessage({ ...envelope, payload: { kind: "grid_shift", direction: 0 } })).toBeNull();
    expect(parseClientMessage({ ...envelope, payload: { kind: "intercept_move", direction: 2 } })).toBeNull();
    expect(parseClientMessage({ ...envelope, payload: { kind: "star_trace_move", direction: "near" } })).toBeNull();
    expect(parseClientMessage({ ...envelope, payload: { kind: "magnet_move", direction: 0 } })).toBeNull();
    expect(parseClientMessage({ ...envelope, payload: { kind: "bridge_adjust", direction: 0 } })).toBeNull();
    expect(parseClientMessage({ ...envelope, payload: { kind: "neon_dodge", move: "teleport" } })).toBeNull();
    expect(parseClientMessage({ ...envelope, payload: { kind: "signal_claim", signal: "meteor" } })).toBeNull();
    expect(parseClientMessage({ ...envelope, payload: { kind: "signal_judge", verdict: "maybe" } })).toBeNull();
    expect(parseClientMessage({ ...envelope, payload: { kind: "heist_move", direction: 0 } })).toBeNull();
    expect(parseClientMessage({ ...envelope, payload: { kind: "volley_move", direction: 0 } })).toBeNull();
    expect(parseClientMessage({ ...envelope, payload: { kind: "volley_strike", lane: 1.5 } })).toBeNull();
    expect(parseClientMessage({ ...envelope, payload: { kind: "pulse_charge", power: 4 } })).toBeNull();
    expect(parseClientMessage({ ...envelope, payload: { kind: "drop_move", direction: 0 } })).toBeNull();
    expect(parseClientMessage({ ...envelope, payload: { kind: "drop_brake", direction: 2 } })).toBeNull();
  });
});
