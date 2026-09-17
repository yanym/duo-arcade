import type { AiMemory, AiOptions, GameAction, GameId, GameOptions, GameState, Seat } from "@duo/game-core";
import type { RoomMode, RoomPhase } from "@duo/protocol";

export type StoredPlayer = {
  id: string;
  nickname: string;
  seat: Seat;
  ready: boolean;
  tokenHash: string;
  disconnectedAt: number | null;
  isAi: boolean;
};

export type StoredAiState = {
  seat: Seat;
  options: AiOptions;
  memory: AiMemory;
  decisionNonce: number;
  scheduledVersion: number | null;
  nextActionAt: number | null;
  pendingAction: GameAction | null;
};

export type StoredRoom = {
  code: string;
  gameId: GameId;
  mode: RoomMode;
  ai: StoredAiState | null;
  options: GameOptions;
  startingSeat: Seat;
  phase: RoomPhase;
  version: number;
  seq: number;
  round: number;
  players: [StoredPlayer | null, StoredPlayer | null];
  game: GameState;
  rematchVotes: Seat[];
  pausedTurnRemainingMs: number | null;
  expiresAt: number;
  createdAt: number;
  updatedAt: number;
};

export type RoomRpcErrorCode =
  | "protocol_mismatch"
  | "game_retired"
  | "room_exists"
  | "room_not_found"
  | "room_full"
  | "invalid_resume_token";

export type RoomRpcResult<T> = { ok: true; value: T } | { ok: false; code: RoomRpcErrorCode };

export type SocketAttachment = {
  playerId: string;
  seat: Seat;
  lastReactionAt: number;
};
