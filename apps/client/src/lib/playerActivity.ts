import type { GameViewState, Seat } from "@duo/game-core";
import type { RoomView } from "@duo/protocol";

const COMPETITIVE_GAMES = new Set<GameViewState["kind"]>([
  "gomoku", "reversi", "cover_hunt", "quantum_duel", "rhythm_gravity", "shadow_shuttle",
  "meteor_dash", "trajectory_intercept", "neon_dash", "signal_bluff", "nova_volley", "pulse_pass",
]);

export function isCompetitive(room: RoomView): boolean {
  return COMPETITIVE_GAMES.has(room.game.kind);
}

export function isTimedActionExpired(room: RoomView, now: number): boolean {
  if (now < room.game.turnDeadline) return false;
  if (room.game.kind === "ember_crew") return room.game.phase === "planning";
  if (room.game.kind === "gomoku" || room.game.kind === "reversi" || room.game.kind === "split_maze") return true;
  if (room.game.kind === "sync_tap") return true;
  if (room.game.kind === "cover_hunt") return room.game.phase === "hiding" || room.game.phase === "hunting";
  if (room.game.kind === "starship_defuse") return true;
  if (room.game.kind === "quantum_duel") return room.game.phase === "choosing";
  if (room.game.kind === "starway_escort") return room.game.phase === "planning";
  if (room.game.kind === "orbital_repair") return room.game.phase === "aligning";
  if (room.game.kind === "rhythm_gravity") return room.game.phase === "beat";
  if (room.game.kind === "shadow_shuttle") return room.game.phase === "marking" || room.game.phase === "guessing";
  if (room.game.kind === "echo_relay") return room.game.phase === "transmitting";
  if (room.game.kind === "core_rally") return room.game.phase !== "rally_result";
  if (room.game.kind === "skyline_rescue") return room.game.phase === "planning";
  if (room.game.kind === "meteor_dash") return room.game.phase === "catching";
  if (room.game.kind === "dual_thrusters") return room.game.phase === "planning";
  if (room.game.kind === "fog_sonar") return room.game.phase === "navigating";
  if (room.game.kind === "storm_grid") return room.game.phase === "charging" || room.game.phase === "discharge_window";
  if (room.game.kind === "trajectory_intercept") return room.game.phase === "intercepting";
  if (room.game.kind === "star_trace") return room.game.phase === "tracing";
  if (room.game.kind === "magnet_haul") return room.game.phase === "moving";
  if (room.game.kind === "neon_dash") return room.game.phase === "reacting";
  if (room.game.kind === "signal_bluff") return room.game.phase === "claiming" || room.game.phase === "judging";
  if (room.game.kind === "prism_heist") return room.game.phase === "approach" || room.game.phase === "breach";
  if (room.game.kind === "nova_volley") return room.game.phase === "approach" || room.game.phase === "strike_window";
  if (room.game.kind === "pulse_pass") return room.game.phase === "handling";
  if (room.game.kind === "drop_rescue") return room.game.phase === "descent";
  if (room.game.kind === "lumen_bridge") return room.game.phase === "aligning" || room.game.phase === "resonance";
  return false;
}

function currentSeat(room: RoomView): Seat | null {
  if (room.game.kind === "gomoku" || room.game.kind === "reversi") return room.game.currentSeat;
  if (room.game.kind === "cover_hunt") {
    if (room.game.phase === "hiding") return room.game.hunterSeat === 0 ? 1 : 0;
    if (room.game.phase === "hunting") return room.game.hunterSeat;
  }
  if (room.game.kind === "starship_defuse") return room.game.operatorSeat;
  if (room.game.kind === "echo_relay") return room.game.decoderSeat === 0 ? 1 : 0;
  if (room.game.kind === "core_rally") return room.game.receiverSeat;
  if (room.game.kind === "fog_sonar") return room.game.sonarSeat === 0 ? 1 : 0;
  return null;
}

/**
 * Drives the player-presence emphasis in the room header. This must mirror the
 * actionable controls, otherwise a partner can look "active" while only the
 * other device is able to advance the game.
 */
export function isSeatActive(room: RoomView, seat: Seat, now: number): boolean {
  if (room.phase !== "playing") return false;
  if (isTimedActionExpired(room, now)) return false;
  if (room.game.kind === "ember_crew") return room.game.phase === "planning" && !room.game.locked[seat];
  if (room.game.kind === "sync_tap") return now >= room.game.goAt && room.game.taps[seat] === null;
  if (room.game.kind === "echo_relay") return room.game.phase === "transmitting" && seat !== room.game.decoderSeat;
  if (room.game.kind === "orbital_repair") return room.game.phase === "aligning";
  if (room.game.kind === "quantum_duel") return room.game.phase === "choosing" && !room.game.locked[seat];
  if (room.game.kind === "starway_escort") return room.game.phase === "planning" && !room.game.locked[seat];
  if (room.game.kind === "rhythm_gravity") return room.game.phase === "beat" && !room.game.locked[seat];
  if (room.game.kind === "shadow_shuttle") {
    if (room.game.phase === "marking") return seat === room.game.infiltratorSeat;
    if (room.game.phase === "guessing") return seat !== room.game.infiltratorSeat;
    return false;
  }
  if (room.game.kind === "core_rally") return room.game.phase !== "rally_result" && seat === room.game.receiverSeat;
  if (room.game.kind === "skyline_rescue") return room.game.phase === "planning" && !room.game.locked[seat];
  if (room.game.kind === "meteor_dash") return room.game.phase === "catching" && !room.game.locked[seat];
  if (room.game.kind === "dual_thrusters") return room.game.phase === "planning" && !room.game.locked[seat];
  if (room.game.kind === "fog_sonar") {
    return room.game.phase === "navigating" && (seat !== room.game.sonarSeat || room.game.pulseCharges > 0);
  }
  if (room.game.kind === "storm_grid") {
    if (room.game.phase === "charging") return seat !== room.game.sensorSeat;
    return room.game.phase === "discharge_window";
  }
  if (room.game.kind === "trajectory_intercept") return room.game.phase === "intercepting" && !room.game.locked[seat];
  if (room.game.kind === "star_trace") return room.game.phase === "tracing" && seat !== room.game.guideSeat;
  if (room.game.kind === "magnet_haul") return room.game.phase === "moving";
  if (room.game.kind === "lumen_bridge") {
    if (room.game.phase === "aligning") return true;
    return room.game.phase === "resonance" && !room.game.confirmations[seat];
  }
  if (room.game.kind === "neon_dash") return room.game.phase === "reacting" && !room.game.locked[seat];
  if (room.game.kind === "signal_bluff") {
    if (room.game.phase === "claiming") return seat === room.game.senderSeat;
    if (room.game.phase === "judging") return seat !== room.game.senderSeat;
    return false;
  }
  if (room.game.kind === "prism_heist") {
    if (room.game.phase === "approach") return seat !== room.game.scoutSeat;
    if (room.game.phase === "breach") return seat === room.game.scoutSeat ? !room.game.bypassLocked : !room.game.dashLocked;
    return false;
  }
  if (room.game.kind === "nova_volley") return room.game.phase !== "point_result" && seat === room.game.receiverSeat;
  if (room.game.kind === "pulse_pass") return room.game.phase === "handling" && seat === room.game.holderSeat;
  if (room.game.kind === "drop_rescue") return room.game.phase === "descent" && !room.game.locked[seat];

  const activeSeat = currentSeat(room);
  return activeSeat === null ? !isCompetitive(room) : activeSeat === seat;
}
