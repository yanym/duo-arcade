import type { AiOptions, GameAction, GameId, GameOptions, GameViewState, Seat } from "@duo/game-core";

export const PROTOCOL_VERSION = 27;
export const COMPATIBLE_PROTOCOL_VERSIONS = [PROTOCOL_VERSION, PROTOCOL_VERSION - 1] as const;

export type RoomMode = "duo" | "ai";

export type RoomPhase = "waiting" | "ready" | "playing" | "reconnect_grace" | "completed";

export type PlayerView = {
  id: string;
  nickname: string;
  seat: Seat;
  ready: boolean;
  connected: boolean;
  piece: 1 | 2;
  roleLabel: string;
  isAi: boolean;
};

export type RoomAiView = {
  seat: Seat;
  options: AiOptions;
  status: "waiting" | "thinking";
  intent: GameAction | null;
  suggestion: GameAction | null;
};

export type RoomView = {
  code: string;
  gameId: GameId;
  mode: RoomMode;
  ai: RoomAiView | null;
  options: GameOptions;
  phase: RoomPhase;
  version: number;
  seq: number;
  round: number;
  players: (PlayerView | null)[];
  game: GameViewState;
  rematchVotes: Seat[];
  reconnectDeadline: number | null;
};

export type PlayerRequest = {
  playerId: string;
  nickname: string;
};

export type CreateRoomRequest = PlayerRequest & {
  gameId: GameId;
  options?: Partial<GameOptions>;
  mode?: RoomMode;
  aiOptions?: Partial<AiOptions>;
};

export type JoinRoomRequest = PlayerRequest & {
  resumeToken?: string;
};

export type RoomSessionResponse = {
  room: RoomView;
  playerId: string;
  seat: Seat;
  seatToken: string;
};

export type ClientMessage =
  | { type: "set_ready"; ready: boolean }
  | {
      type: "game_action";
      actionId: string;
      expectedVersion: number;
      payload: GameAction;
    }
  | { type: "request_snapshot" }
  | { type: "rematch_vote"; accept: boolean }
  | { type: "resign" }
  | { type: "reaction"; reactionId: ReactionId };

export type ReactionId = "wave" | "wow" | "clap" | "gg";

export type ServerMessage =
  | { type: "state_snapshot"; room: RoomView }
  | { type: "action_acknowledged"; actionId: string; version: number }
  | { type: "action_rejected"; actionId?: string; reason: string; currentVersion: number }
  | { type: "reaction"; fromSeat: Seat; reactionId: ReactionId }
  | { type: "error"; code: string; message: string };

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function parseGameAction(value: unknown): GameAction | null {
  if (!isRecord(value) || typeof value.kind !== "string") return null;
  if (
    (value.kind === "place_stone" || value.kind === "place_disc") &&
    isSafeInteger(value.row) &&
    isSafeInteger(value.col)
  ) {
    return { kind: value.kind, row: value.row, col: value.col };
  }
  if (
    value.kind === "maze_move" &&
    (value.direction === "up" || value.direction === "right" ||
      value.direction === "down" || value.direction === "left")
  ) {
    return { kind: "maze_move", direction: value.direction };
  }
  if (value.kind === "sync_tap") return { kind: "sync_tap" };
  if (
    (value.kind === "cover_hide" || value.kind === "cover_scan" || value.kind === "cover_shoot") &&
    isSafeInteger(value.cover)
  ) {
    return { kind: value.kind, cover: value.cover };
  }
  if (
    value.kind === "defuse_press" &&
    (value.symbol === "triangle" || value.symbol === "diamond" || value.symbol === "circle" ||
      value.symbol === "square" || value.symbol === "wave" || value.symbol === "star")
  ) {
    return { kind: "defuse_press", symbol: value.symbol };
  }
  if (
    value.kind === "duel_choose" &&
    (value.move === "strike" || value.move === "guard" || value.move === "charge")
  ) {
    return { kind: "duel_choose", move: value.move };
  }
  if (
    (value.kind === "escort_route" || value.kind === "escort_shield") &&
    isSafeInteger(value.lane) && value.lane >= 0 && value.lane <= 2
  ) {
    return { kind: value.kind, lane: value.lane as 0 | 1 | 2 };
  }
  if (
    value.kind === "orbit_rotate" &&
    isSafeInteger(value.ring) && value.ring >= 0 && value.ring <= 2 &&
    (value.direction === "clockwise" || value.direction === "counterclockwise")
  ) {
    return { kind: "orbit_rotate", ring: value.ring as 0 | 1 | 2, direction: value.direction };
  }
  if (value.kind === "orbit_launch") return { kind: "orbit_launch" };
  if (value.kind === "rhythm_gravity_tap") return { kind: "rhythm_gravity_tap" };
  if (value.kind === "shadow_mark" && isSafeInteger(value.pod)) {
    return { kind: "shadow_mark", pod: value.pod };
  }
  if (value.kind === "shadow_guess" && isSafeInteger(value.slot)) {
    return { kind: "shadow_guess", slot: value.slot };
  }
  if (
    value.kind === "echo_press" &&
    (value.tone === "ember" || value.tone === "tide" || value.tone === "nova" ||
      value.tone === "bloom" || value.tone === "comet")
  ) {
    return { kind: "echo_press", tone: value.tone };
  }
  if (value.kind === "core_move" && (value.direction === -1 || value.direction === 1)) {
    return { kind: "core_move", direction: value.direction };
  }
  if (value.kind === "core_return") return { kind: "core_return" };
  if (value.kind === "rescue_aim" && isSafeInteger(value.zone) && value.zone >= 0 && value.zone <= 2) {
    return { kind: "rescue_aim", zone: value.zone as 0 | 1 | 2 };
  }
  if (
    value.kind === "rescue_pressure" &&
    isSafeInteger(value.pressure) && value.pressure >= 1 && value.pressure <= 3
  ) {
    return { kind: "rescue_pressure", pressure: value.pressure as 1 | 2 | 3 };
  }
  if (value.kind === "meteor_catch" && isSafeInteger(value.cell)) {
    return { kind: "meteor_catch", cell: value.cell };
  }
  if (value.kind === "thruster_burn" && (value.power === 0 || value.power === 1 || value.power === 2)) {
    return { kind: "thruster_burn", power: value.power };
  }
  if (
    (value.kind === "sonar_ping" || value.kind === "fog_steer") &&
    (value.direction === "up" || value.direction === "right" || value.direction === "down" || value.direction === "left")
  ) {
    return { kind: value.kind, direction: value.direction };
  }
  if (value.kind === "grid_shift" && (value.direction === -1 || value.direction === 1)) {
    return { kind: "grid_shift", direction: value.direction };
  }
  if (value.kind === "grid_toggle") return { kind: "grid_toggle" };
  if (value.kind === "grid_discharge") return { kind: "grid_discharge" };
  if (value.kind === "intercept_move" && (value.direction === -1 || value.direction === 1)) {
    return { kind: "intercept_move", direction: value.direction };
  }
  if (value.kind === "intercept_capture") return { kind: "intercept_capture" };
  if (
    value.kind === "star_trace_move" &&
    (value.direction === "up" || value.direction === "right" || value.direction === "down" || value.direction === "left")
  ) {
    return { kind: "star_trace_move", direction: value.direction };
  }
  if (value.kind === "magnet_move" && (value.direction === -1 || value.direction === 1)) {
    return { kind: "magnet_move", direction: value.direction };
  }
  if (value.kind === "bridge_adjust" && (value.direction === -1 || value.direction === 1)) {
    return { kind: "bridge_adjust", direction: value.direction };
  }
  if (value.kind === "bridge_lock") return { kind: "bridge_lock" };
  if (
    value.kind === "neon_dodge" &&
    (value.move === "jump" || value.move === "slide" || value.move === "dodge_left" || value.move === "dodge_right" || value.move === "brake")
  ) {
    return { kind: "neon_dodge", move: value.move };
  }
  if (
    value.kind === "signal_claim" &&
    (value.signal === "prism" || value.signal === "orbit" || value.signal === "wave" ||
      value.signal === "crown" || value.signal === "spiral")
  ) {
    return { kind: "signal_claim", signal: value.signal };
  }
  if (value.kind === "signal_scan") return { kind: "signal_scan" };
  if (
    value.kind === "signal_judge" &&
    (value.verdict === "trust" || value.verdict === "challenge")
  ) {
    return { kind: "signal_judge", verdict: value.verdict };
  }
  if (value.kind === "heist_move" && (value.direction === -1 || value.direction === 1)) {
    return { kind: "heist_move", direction: value.direction };
  }
  if (value.kind === "heist_bypass") return { kind: "heist_bypass" };
  if (value.kind === "heist_dash") return { kind: "heist_dash" };
  if (value.kind === "volley_move" && (value.direction === -1 || value.direction === 1)) {
    return { kind: "volley_move", direction: value.direction };
  }
  if (value.kind === "volley_strike" && isSafeInteger(value.lane)) {
    return { kind: "volley_strike", lane: value.lane };
  }
  if (value.kind === "pulse_charge" && (value.power === 1 || value.power === 2 || value.power === 3)) {
    return { kind: "pulse_charge", power: value.power };
  }
  if (value.kind === "pulse_vent") return { kind: "pulse_vent" };
  if (
    (value.kind === "drop_move" || value.kind === "drop_brake") &&
    (value.direction === -1 || value.direction === 1)
  ) {
    return { kind: value.kind, direction: value.direction };
  }
  if (value.kind === "drop_lock") return { kind: "drop_lock" };
  return null;
}

export function parseClientMessage(value: unknown): ClientMessage | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;
  switch (value.type) {
    case "set_ready":
      return typeof value.ready === "boolean" ? { type: "set_ready", ready: value.ready } : null;
    case "request_snapshot":
      return { type: "request_snapshot" };
    case "rematch_vote":
      return typeof value.accept === "boolean" ? { type: "rematch_vote", accept: value.accept } : null;
    case "resign":
      return { type: "resign" };
    case "reaction":
      return value.reactionId === "wave" || value.reactionId === "wow" ||
        value.reactionId === "clap" || value.reactionId === "gg"
        ? { type: "reaction", reactionId: value.reactionId }
        : null;
    case "game_action": {
      const payload = parseGameAction(value.payload);
      if (
        typeof value.actionId !== "string" ||
        value.actionId.length < 8 ||
        value.actionId.length > 80 ||
        !isSafeInteger(value.expectedVersion) ||
        !payload
      ) {
        return null;
      }
      return {
        type: "game_action",
        actionId: value.actionId,
        expectedVersion: value.expectedVersion,
        payload,
      };
    }
    default:
      return null;
  }
}
