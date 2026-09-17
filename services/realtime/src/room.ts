import { DurableObject } from "cloudflare:workers";

import {
  DEFAULT_AI_OPTIONS,
  DEFAULT_GAME_OPTIONS,
  EMPTY_AI_MEMORY,
  advanceGameClock,
  aiPlanDelayMs,
  applyGameAction,
  chooseAiAction,
  createAiRandom,
  createGameState,
  finishByDeparture,
  getGameRoleLabel,
  getGameSeatMarker,
  getGameView,
  isCompetitiveGame,
  isPlayableGameId,
  normalizeAiOptions,
  normalizeGameOptions,
  otherSeat,
  resignGame,
  shiftGameClock,
  suggestedAiTeamAction,
  turnDurationForPace,
  updateAiMemory,
  type AiOptions,
  type GameId,
  type GameOptions,
  type Seat,
} from "@duo/game-core";
import {
  COMPATIBLE_PROTOCOL_VERSIONS,
  LEGACY_HTTP_PROTOCOL_VERSION,
  supportsGameProtocol,
  parseClientMessage,
  type PlayerView,
  type RoomMode,
  type RoomSessionResponse,
  type RoomView,
  type ServerMessage,
} from "@duo/protocol";

import { hashToken, randomToken, secureHashEqual } from "./crypto";
import type { RoomRpcResult, SocketAttachment, StoredAiState, StoredPlayer, StoredRoom } from "./types";

const RECONNECT_GRACE_MS = 60_000;
const MAX_SOCKET_MESSAGE_BYTES = 4 * 1024;
const REACTION_COOLDOWN_MS = 800;
const WAITING_ROOM_TTL_MS = 2 * 60 * 60 * 1_000;
const COMPLETED_ROOM_TTL_MS = 60 * 60 * 1_000;

function randomSeat(): Seat {
  return crypto.getRandomValues(new Uint8Array(1))[0]! % 2 === 0 ? 0 : 1;
}

function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!;
}

function deterministicAiSeed(room: StoredRoom): number {
  let hash = 2_166_136_261;
  const input = `${room.code}:${room.round}:${room.version}:${room.ai?.decisionNonce ?? 0}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

export class GameRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    void this.ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS room_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          state_json TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS processed_actions (
          action_id TEXT PRIMARY KEY,
          created_at INTEGER NOT NULL
        );
      `);
    });
  }

  async createRoom(
    code: string,
    playerId: string,
    nickname: string,
    gameId: GameId,
    options: GameOptions = DEFAULT_GAME_OPTIONS,
    mode: RoomMode = "duo",
    aiOptions: AiOptions = DEFAULT_AI_OPTIONS,
    clientProtocol = LEGACY_HTTP_PROTOCOL_VERSION,
  ): Promise<RoomRpcResult<RoomSessionResponse>> {
    if (!isPlayableGameId(gameId)) return { ok: false, code: "game_retired" };
    if (!supportsGameProtocol(gameId, clientProtocol)) return { ok: false, code: "protocol_mismatch" };
    if (this.readRoom()) {
      return { ok: false, code: "room_exists" };
    }

    const now = Date.now();
    const seatToken = randomToken();
    const tokenHash = await hashToken(seatToken);
    const startingSeat = randomSeat();
    const creator: StoredPlayer = {
      id: playerId,
      nickname,
      seat: 0,
      ready: false,
      tokenHash,
      disconnectedAt: null,
      isAi: false,
    };
    const normalizedOptions = normalizeGameOptions(options);
    const initialGame = createGameState(gameId, startingSeat, now, randomSeed(), normalizedOptions);
    const ai = mode === "ai"
      ? {
          seat: 1 as Seat,
          options: normalizeAiOptions(aiOptions),
          memory: { ...EMPTY_AI_MEMORY },
          decisionNonce: 0,
          scheduledVersion: null,
          nextActionAt: null,
          pendingAction: null,
        } satisfies StoredAiState
      : null;
    const aiPlayer: StoredPlayer | null = ai
      ? {
          id: `ai-${code}`,
          nickname: isCompetitiveGame(initialGame) ? "AI 对手" : "AI 搭档",
          seat: ai.seat,
          ready: true,
          tokenHash: await hashToken(randomToken()),
          disconnectedAt: null,
          isAi: true,
        }
      : null;
    const room: StoredRoom = {
      code,
      gameId,
      mode,
      ai,
      options: normalizedOptions,
      startingSeat,
      phase: aiPlayer ? "ready" : "waiting",
      version: 1,
      seq: 0,
      round: 1,
      players: [creator, aiPlayer],
      game: initialGame,
      rematchVotes: [],
      pausedTurnRemainingMs: null,
      expiresAt: now + WAITING_ROOM_TTL_MS,
      createdAt: now,
      updatedAt: now,
    };

    try {
      this.ctx.storage.sql.exec(
        "INSERT INTO room_state (id, state_json) VALUES (1, ?)",
        JSON.stringify(room),
      );
    } catch {
      return { ok: false, code: "room_exists" };
    }
    await this.syncAlarm(room);

    return {
      ok: true,
      value: {
        room: this.toRoomView(room, 0),
        playerId,
        seat: 0,
        seatToken,
      },
    };
  }

  async joinRoom(
    playerId: string,
    nickname: string,
    resumeToken?: string,
    clientProtocol = LEGACY_HTTP_PROTOCOL_VERSION,
  ): Promise<RoomRpcResult<RoomSessionResponse>> {
    const rotatedToken = randomToken();
    const rotatedTokenHash = await hashToken(rotatedToken);
    const resumeTokenHash = resumeToken ? await hashToken(resumeToken) : null;
    const room = this.readRoom();
    if (!room) {
      return { ok: false, code: "room_not_found" };
    }
    if (this.isInactiveExpired(room)) {
      await this.purgeRoom();
      return { ok: false, code: "room_not_found" };
    }

    // Reject before rotating credentials or occupying a seat an old client cannot render.
    if (!supportsGameProtocol(room.gameId, clientProtocol)) return { ok: false, code: "protocol_mismatch" };
    const existing = room.players.find((player) => player?.id === playerId) ?? null;
    if (existing) {
      if (!resumeTokenHash || !secureHashEqual(existing.tokenHash, resumeTokenHash)) {
        return { ok: false, code: "invalid_resume_token" };
      }

      existing.tokenHash = rotatedTokenHash;
      existing.nickname = nickname;
      const now = Date.now();
      room.version += 1;
      room.updatedAt = now;
      this.refreshExpiration(room, now);
      this.writeRoom(room);
      this.broadcastState(room);
      await this.syncAlarm(room);
      return {
        ok: true,
        value: {
          room: this.toRoomView(room, existing.seat),
          playerId,
          seat: existing.seat,
          seatToken: rotatedToken,
        },
      };
    }

    // Existing players may recover a saved match, but retirement closes admission.
    if (!isPlayableGameId(room.gameId)) return { ok: false, code: "game_retired" };

    const openSeat = room.players[0] ? (room.players[1] ? null : 1) : 0;
    if (openSeat === null) {
      return { ok: false, code: "room_full" };
    }

    const seat = openSeat as Seat;
    room.players[seat] = {
      id: playerId,
      nickname,
      seat,
      ready: false,
      tokenHash: rotatedTokenHash,
      disconnectedAt: null,
      isAi: false,
    };
    room.phase = room.players.every(Boolean) ? "ready" : "waiting";
    const now = Date.now();
    room.version += 1;
    room.updatedAt = now;
    this.refreshExpiration(room, now);
    this.writeRoom(room);
    this.broadcastState(room);
    await this.syncAlarm(room);

    return {
      ok: true,
      value: { room: this.toRoomView(room, seat), playerId, seat, seatToken: rotatedToken },
    };
  }

  async getRoom(): Promise<RoomView | null> {
    const room = this.readRoom();
    if (room && this.isInactiveExpired(room)) {
      await this.purgeRoom();
      return null;
    }
    return room ? this.toRoomView(room, null) : null;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    const protocols = (request.headers.get("Sec-WebSocket-Protocol") ?? "")
      .split(",")
      .map((value) => value.trim());
    const selectedProtocol = COMPATIBLE_PROTOCOL_VERSIONS
      .map((version) => `duo-v${version}`)
      .find((protocol) => protocols.includes(protocol));
    const tokenProtocol = protocols.find((value) => value.startsWith("seat."));
    if (!selectedProtocol || !tokenProtocol) {
      return new Response("Missing room credentials", { status: 401 });
    }

    const token = tokenProtocol.slice("seat.".length);
    const tokenHash = await hashToken(token);
    const room = this.readRoom();
    if (room && this.isInactiveExpired(room)) {
      await this.purgeRoom();
      return new Response("Room expired", { status: 404 });
    }
    const player = room?.players.find(
      (candidate) => candidate && secureHashEqual(candidate.tokenHash, tokenHash),
    );
    if (!room || !player) {
      return new Response("Invalid room credentials", { status: 401 });
    }
    if (!supportsGameProtocol(room.gameId, Number(selectedProtocol.slice("duo-v".length)))) {
      return new Response("Update the app to play this game", { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const attachment: SocketAttachment = {
      playerId: player.id,
      seat: player.seat,
      lastReactionAt: 0,
    };
    server.serializeAttachment(attachment);
    this.ctx.acceptWebSocket(server, [this.playerTag(player.id)]);

    const resumedRoom = await this.markConnected(room, player.seat);
    this.send(server, { type: "state_snapshot", room: this.toRoomView(resumedRoom, player.seat) });
    this.broadcastState(resumedRoom);

    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: { "Sec-WebSocket-Protocol": selectedProtocol },
    });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string" || new TextEncoder().encode(message).byteLength > MAX_SOCKET_MESSAGE_BYTES) {
      this.send(ws, { type: "error", code: "invalid_message", message: "消息格式不受支持" });
      return;
    }

    let decoded: unknown;
    try {
      decoded = JSON.parse(message) as unknown;
    } catch {
      this.send(ws, { type: "error", code: "invalid_json", message: "消息不是有效 JSON" });
      return;
    }

    const input = parseClientMessage(decoded);
    const attachment = ws.deserializeAttachment() as SocketAttachment | null;
    const room = this.readRoom();
    if (!input || !attachment || !room) {
      this.send(ws, { type: "error", code: "invalid_message", message: "无法处理该消息" });
      return;
    }

    const actor = room.players[attachment.seat];
    if (!actor || actor.id !== attachment.playerId) {
      this.send(ws, { type: "error", code: "seat_mismatch", message: "座位凭证已失效" });
      return;
    }

    if (input.type === "request_snapshot") {
      this.send(ws, { type: "state_snapshot", room: this.toRoomView(room, attachment.seat) });
      return;
    }

    if (input.type === "reaction") {
      const now = Date.now();
      if (now - attachment.lastReactionAt < REACTION_COOLDOWN_MS) {
        return;
      }
      const nextAttachment = { ...attachment, lastReactionAt: now };
      ws.serializeAttachment(nextAttachment);
      this.broadcast({ type: "reaction", fromSeat: attachment.seat, reactionId: input.reactionId });
      return;
    }

    if (input.type === "set_ready") {
      if (!isPlayableGameId(room.gameId)) {
        this.reject(ws, "game_retired", room.version);
        return;
      }
      if (room.phase !== "waiting" && room.phase !== "ready") {
        this.reject(ws, "room_not_ready", room.version);
        return;
      }
      actor.ready = input.ready;
      room.version += 1;
      room.seq += 1;
      room.updatedAt = Date.now();
      if (room.players.every((player) => player?.ready) && this.allPlayersConnected(room)) {
        room.phase = "playing";
        room.game = createGameState(
          room.gameId,
          room.startingSeat,
          Date.now(),
          randomSeed(),
          room.options,
        );
      } else {
        room.phase = room.players.every(Boolean) ? "ready" : "waiting";
        this.refreshExpiration(room, room.updatedAt);
      }
      this.writeRoom(room);
      this.broadcastState(room);
      await this.syncAlarm(room);
      return;
    }

    if (input.type === "game_action") {
      if (this.hasProcessedAction(input.actionId)) {
        this.send(ws, { type: "state_snapshot", room: this.toRoomView(room, attachment.seat) });
        this.send(ws, { type: "action_acknowledged", actionId: input.actionId, version: room.version });
        return;
      }
      if (room.phase !== "playing") {
        this.reject(ws, input.actionId, "game_not_playing", room.version);
        return;
      }
      const acceptsConcurrentMazeMove =
        room.game.kind === "split_maze" &&
        input.payload.kind === "maze_move" &&
        input.expectedVersion === room.version - 1;
      const acceptsConcurrentSyncTap =
        room.game.kind === "sync_tap" &&
        input.payload.kind === "sync_tap" &&
        input.expectedVersion === room.version - 1 &&
        room.game.taps[attachment.seat] === null &&
        room.game.taps[otherSeat(attachment.seat)] !== null;
      const acceptsConcurrentDuelChoice =
        room.game.kind === "quantum_duel" &&
        input.payload.kind === "duel_choose" &&
        input.expectedVersion === room.version - 1 &&
        !room.game.locked[attachment.seat] &&
        room.game.locked[otherSeat(attachment.seat)];
      const acceptsConcurrentEscortChoice =
        room.game.kind === "starway_escort" &&
        (input.payload.kind === "escort_route" || input.payload.kind === "escort_shield") &&
        input.expectedVersion === room.version - 1 &&
        !room.game.locked[attachment.seat] &&
        room.game.locked[otherSeat(attachment.seat)];
      const acceptsConcurrentRhythmTap =
        room.game.kind === "rhythm_gravity" &&
        input.payload.kind === "rhythm_gravity_tap" &&
        input.expectedVersion === room.version - 1 &&
        !room.game.locked[attachment.seat] &&
        room.game.locked[otherSeat(attachment.seat)];
      const acceptsConcurrentRescueChoice =
        room.game.kind === "skyline_rescue" &&
        (input.payload.kind === "rescue_aim" || input.payload.kind === "rescue_pressure") &&
        input.expectedVersion === room.version - 1 &&
        !room.game.locked[attachment.seat] &&
        room.game.locked[otherSeat(attachment.seat)];
      const acceptsConcurrentMeteorCatch =
        room.game.kind === "meteor_dash" &&
        input.payload.kind === "meteor_catch" &&
        input.expectedVersion === room.version - 1 &&
        !room.game.locked[attachment.seat] &&
        room.game.locked[otherSeat(attachment.seat)];
      const acceptsConcurrentThrusterBurn =
        room.game.kind === "dual_thrusters" &&
        input.payload.kind === "thruster_burn" &&
        input.expectedVersion === room.version - 1 &&
        !room.game.locked[attachment.seat] &&
        room.game.locked[otherSeat(attachment.seat)];
      const acceptsConcurrentInterceptAction =
        room.game.kind === "trajectory_intercept" &&
        (input.payload.kind === "intercept_move" || input.payload.kind === "intercept_capture") &&
        input.expectedVersion === room.version - 1 &&
        room.game.phase === "intercepting" &&
        room.game.lastActorSeat === otherSeat(attachment.seat) &&
        !room.game.locked[attachment.seat];
      const acceptsConcurrentMagnetMove =
        room.game.kind === "magnet_haul" &&
        input.payload.kind === "magnet_move" &&
        input.expectedVersion === room.version - 1 &&
        room.game.phase === "moving" &&
        room.game.lastActorSeat === otherSeat(attachment.seat);
      const acceptsConcurrentBridgeAction =
        room.game.kind === "lumen_bridge" &&
        input.expectedVersion === room.version - 1 &&
        ((input.payload.kind === "bridge_adjust" &&
          room.game.phase === "aligning" &&
          room.game.lastActorSeat === otherSeat(attachment.seat)) ||
          (input.payload.kind === "bridge_lock" &&
            room.game.phase === "resonance" &&
            !room.game.confirmations[attachment.seat] &&
            room.game.confirmations[otherSeat(attachment.seat)]));
      const acceptsConcurrentNeonDodge =
        room.game.kind === "neon_dash" &&
        input.payload.kind === "neon_dodge" &&
        input.expectedVersion === room.version - 1 &&
        room.game.phase === "reacting" &&
        !room.game.locked[attachment.seat] &&
        room.game.locked[otherSeat(attachment.seat)];
      const acceptsConcurrentHeistLock =
        room.game.kind === "prism_heist" &&
        input.expectedVersion === room.version - 1 &&
        room.game.phase === "breach" &&
        ((input.payload.kind === "heist_bypass" &&
          attachment.seat === room.game.scoutSeat &&
          !room.game.bypassLocked &&
          room.game.dashLocked) ||
          (input.payload.kind === "heist_dash" &&
            attachment.seat !== room.game.scoutSeat &&
            !room.game.dashLocked &&
            room.game.bypassLocked));
      const acceptsConcurrentDropAction =
        room.game.kind === "drop_rescue" &&
        (input.payload.kind === "drop_move" || input.payload.kind === "drop_brake" || input.payload.kind === "drop_lock") &&
        input.expectedVersion === room.version - 1 &&
        room.game.phase === "descent" &&
        !room.game.locked[attachment.seat];
      const acceptsConcurrentEmberAction =
        room.game.kind === "ember_crew" &&
        (input.payload.kind === "ember_plan" || input.payload.kind === "ember_commit") &&
        input.payload.round === room.game.round &&
        input.expectedVersion === room.version - 1 &&
        room.game.phase === "planning" &&
        room.game.lastActorSeat === otherSeat(attachment.seat) &&
        !room.game.locked[attachment.seat];
      if (
        input.expectedVersion !== room.version &&
        !acceptsConcurrentMazeMove &&
        !acceptsConcurrentSyncTap &&
        !acceptsConcurrentDuelChoice &&
        !acceptsConcurrentEscortChoice &&
        !acceptsConcurrentRhythmTap &&
        !acceptsConcurrentRescueChoice &&
        !acceptsConcurrentMeteorCatch &&
        !acceptsConcurrentThrusterBurn &&
        !acceptsConcurrentInterceptAction &&
        !acceptsConcurrentMagnetMove &&
        !acceptsConcurrentBridgeAction &&
        !acceptsConcurrentNeonDodge &&
        !acceptsConcurrentHeistLock &&
        !acceptsConcurrentDropAction &&
        !acceptsConcurrentEmberAction
      ) {
        this.reject(ws, input.actionId, "stale_version", room.version);
        return;
      }

      const now = Date.now();
      const outcome = applyGameAction(room.game, attachment.seat, input.payload, now);
      if (!outcome.ok) {
        if (outcome.reason === "turn_expired") {
          room.game = advanceGameClock(room.game, now);
          room.phase = room.game.result ? "completed" : "playing";
          room.version += 1;
          room.seq += 1;
          room.updatedAt = now;
          this.refreshExpiration(room, now);
          this.writeRoom(room);
          this.broadcastState(room);
          this.reject(ws, input.actionId, "turn_expired", room.version);
          await this.syncAlarm(room);
          return;
        }
        this.reject(ws, input.actionId, outcome.reason, room.version);
        return;
      }

      room.game = outcome.state;
      room.phase = room.game.result ? "completed" : "playing";
      room.version += 1;
      room.seq += 1;
      room.updatedAt = now;
      this.refreshExpiration(room, now);
      this.writeRoomWithAction(room, input.actionId, now);
      this.broadcastState(room);
      this.send(ws, { type: "action_acknowledged", actionId: input.actionId, version: room.version });
      await this.syncAlarm(room);
      return;
    }

    if (input.type === "resign") {
      if (room.phase !== "playing" && room.phase !== "reconnect_grace") {
        this.reject(ws, "game_not_playing", room.version);
        return;
      }
      room.game = resignGame(room.game, attachment.seat);
      room.phase = "completed";
      room.version += 1;
      room.seq += 1;
      room.updatedAt = Date.now();
      this.refreshExpiration(room, room.updatedAt);
      this.writeRoom(room);
      this.broadcastState(room);
      await this.syncAlarm(room);
      return;
    }

    if (input.type === "rematch_vote") {
      if (!isPlayableGameId(room.gameId)) {
        this.reject(ws, "game_retired", room.version);
        return;
      }
      if (room.phase !== "completed") {
        this.reject(ws, "game_not_completed", room.version);
        return;
      }
      room.rematchVotes = input.accept
        ? Array.from(new Set([...room.rematchVotes, attachment.seat]))
        : room.rematchVotes.filter((seat) => seat !== attachment.seat);
      if (input.accept && room.ai) {
        room.rematchVotes = Array.from(new Set([...room.rematchVotes, room.ai.seat]));
      }
      room.version += 1;
      room.seq += 1;
      room.updatedAt = Date.now();

      if (room.rematchVotes.length === 2 && this.allPlayersConnected(room)) {
        room.round += 1;
        room.rematchVotes = [];
        room.startingSeat = otherSeat(room.startingSeat);
        room.game = createGameState(
          room.gameId,
          room.startingSeat,
          Date.now(),
          randomSeed(),
          room.options,
        );
        room.phase = "playing";
      }
      this.refreshExpiration(room, room.updatedAt);
      this.writeRoom(room);
      this.broadcastState(room);
      await this.syncAlarm(room);
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const attachment = ws.deserializeAttachment() as SocketAttachment | null;
    const room = this.readRoom();
    if (!attachment || !room || this.hasOpenSocket(attachment.playerId, ws)) {
      return;
    }
    if (room.phase !== "playing" && room.phase !== "reconnect_grace") {
      this.broadcastState(room);
      return;
    }

    const player = room.players[attachment.seat];
    if (!player || player.id !== attachment.playerId) {
      return;
    }

    const now = Date.now();
    if (room.phase === "playing") {
      room.pausedTurnRemainingMs = Math.max(1_000, room.game.turnDeadline - now);
      room.phase = "reconnect_grace";
    }
    player.disconnectedAt ??= now;
    room.version += 1;
    room.seq += 1;
    room.updatedAt = now;
    this.writeRoom(room);
    this.broadcastState(room);
    await this.syncAlarm(room);
  }

  webSocketError(ws: WebSocket): void {
    ws.close(1011, "socket_error");
  }

  async alarm(): Promise<void> {
    const room = this.readRoom();
    if (!room) {
      return;
    }
    const now = Date.now();

    if (this.isInactiveExpired(room, now)) {
      await this.purgeRoom();
      return;
    }

    if (room.phase === "reconnect_grace") {
      const disconnected = room.players.filter(
        (player): player is StoredPlayer => Boolean(player?.disconnectedAt),
      );
      const expired = disconnected.filter(
        (player) => player.disconnectedAt !== null && player.disconnectedAt + RECONNECT_GRACE_MS <= now,
      );
      if (expired.length > 0) {
        const bothLeft = expired.length === 2;
        room.game = finishByDeparture(
          room.game,
          bothLeft ? expired.map((player) => player.seat) : [expired[0]!.seat],
        );
        room.phase = "completed";
        room.version += 1;
        room.seq += 1;
        room.updatedAt = now;
        this.refreshExpiration(room, now);
        this.writeRoom(room);
        this.broadcastState(room);
      }
    } else if (room.phase === "playing") {
      const aiActionApplied = this.applyScheduledAiAction(room, now);
      if (aiActionApplied) {
        this.broadcastState(room);
      } else if (room.game.turnDeadline <= now) {
        room.game = advanceGameClock(room.game, now);
        room.phase = room.game.result ? "completed" : "playing";
        room.version += 1;
        room.seq += 1;
        room.updatedAt = now;
        this.refreshExpiration(room, now);
        this.writeRoom(room);
        this.broadcastState(room);
      }
    }

    await this.syncAlarm(room);
  }

  private readRoom(): StoredRoom | null {
    const row = this.ctx.storage.sql
      .exec<{ state_json: string }>("SELECT state_json FROM room_state WHERE id = 1")
      .toArray()[0];
    if (!row) return null;
    const room = JSON.parse(row.state_json) as StoredRoom;
    room.mode ??= "duo";
    room.ai = room.mode === "ai" && room.ai
      ? {
          ...room.ai,
          options: normalizeAiOptions(room.ai.options),
          memory: room.ai.memory ?? { ...EMPTY_AI_MEMORY },
          decisionNonce: room.ai.decisionNonce ?? 0,
          scheduledVersion: room.ai.scheduledVersion ?? null,
          nextActionAt: room.ai.nextActionAt ?? null,
          pendingAction: room.ai.pendingAction ?? null,
        }
      : null;
    for (const player of room.players) {
      if (player) player.isAi ??= false;
    }
    room.options = normalizeGameOptions(room.options ?? DEFAULT_GAME_OPTIONS);
    if (room.game.kind === "gomoku" || room.game.kind === "reversi") {
      // Restore the next-turn budget of old saved matches without changing the
      // current deadline or the remaining time preserved during a disconnect.
      room.game.turnDurationMs ??= turnDurationForPace(room.options.pace);
    }
    room.expiresAt ??= room.updatedAt + (
      room.phase === "completed" ? COMPLETED_ROOM_TTL_MS : WAITING_ROOM_TTL_MS
    );
    return room;
  }

  private writeRoom(room: StoredRoom): void {
    this.prepareAiSchedule(room);
    this.ctx.storage.sql.exec(
      "UPDATE room_state SET state_json = ? WHERE id = 1",
      JSON.stringify(room),
    );
  }

  private writeRoomWithAction(room: StoredRoom, actionId: string, now: number): void {
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        "INSERT INTO processed_actions (action_id, created_at) VALUES (?, ?)",
        actionId,
        now,
      );
      this.writeRoom(room);
      this.ctx.storage.sql.exec(`
        DELETE FROM processed_actions
        WHERE action_id NOT IN (
          SELECT action_id FROM processed_actions ORDER BY created_at DESC LIMIT 128
        )
      `);
    });
  }

  private hasProcessedAction(actionId: string): boolean {
    return Boolean(
      this.ctx.storage.sql
        .exec<{ action_id: string }>(
          "SELECT action_id FROM processed_actions WHERE action_id = ? LIMIT 1",
          actionId,
        )
        .toArray()[0],
    );
  }

  private toRoomView(room: StoredRoom, viewerSeat: Seat | null): RoomView {
    const canShareAiCoordination = Boolean(
      room.ai && viewerSeat !== null && !isCompetitiveGame(room.game),
    );
    const players = room.players.map((player): PlayerView | null =>
      player
        ? {
            id: player.id,
            nickname: player.nickname,
            seat: player.seat,
            ready: player.ready,
            connected: player.isAi || this.hasOpenSocket(player.id),
            piece: getGameSeatMarker(room.game, player.seat),
            roleLabel: getGameRoleLabel(room.game, player.seat),
            isAi: player.isAi,
          }
        : null,
    );
    const reconnectDeadlines = room.players
      .map((player) => player?.disconnectedAt ? player.disconnectedAt + RECONNECT_GRACE_MS : null)
      .filter((deadline): deadline is number => deadline !== null);
    return {
      code: room.code,
      gameId: room.gameId,
      mode: room.mode,
      ai: room.ai
        ? {
            seat: room.ai.seat,
            options: room.ai.options,
            status: room.phase === "playing" && room.ai.pendingAction ? "thinking" : "waiting",
            intent: canShareAiCoordination ? room.ai.pendingAction : null,
            suggestion: canShareAiCoordination && viewerSeat !== null
              ? suggestedAiTeamAction(room.game, viewerSeat)
              : null,
          }
        : null,
      options: room.options,
      phase: room.phase,
      version: room.version,
      seq: room.seq,
      round: room.round,
      players,
      game: getGameView(room.game, viewerSeat),
      rematchVotes: room.rematchVotes,
      reconnectDeadline: room.phase === "reconnect_grace" && reconnectDeadlines.length > 0
        ? Math.min(...reconnectDeadlines)
        : null,
    };
  }

  private playerTag(playerId: string): string {
    return `player-${playerId}`;
  }

  private hasOpenSocket(playerId: string, excluding?: WebSocket): boolean {
    return this.ctx
      .getWebSockets(this.playerTag(playerId))
      .some((socket) => socket !== excluding && socket.readyState === WebSocket.OPEN);
  }

  private allPlayersConnected(room: StoredRoom): boolean {
    return room.players.every((player) => player && (player.isAi || this.hasOpenSocket(player.id)));
  }

  private async markConnected(room: StoredRoom, seat: Seat): Promise<StoredRoom> {
    const player = room.players[seat];
    if (!player) {
      return room;
    }
    if (player.disconnectedAt === null) {
      if (room.phase === "waiting" || room.phase === "ready") {
        const now = Date.now();
        if (isPlayableGameId(room.gameId) && room.players.every((candidate) => candidate?.ready) && this.allPlayersConnected(room)) {
          room.phase = "playing";
          room.game = createGameState(
            room.gameId,
            room.startingSeat,
            now,
            randomSeed(),
            room.options,
          );
          room.version += 1;
          room.seq += 1;
        }
        room.updatedAt = now;
        this.refreshExpiration(room, now);
        this.writeRoom(room);
        await this.syncAlarm(room);
      }
      return room;
    }
    player.disconnectedAt = null;

    const stillDisconnected = room.players.some((candidate) => candidate?.disconnectedAt !== null);
    if (room.phase === "reconnect_grace" && !stillDisconnected) {
      room.phase = "playing";
      room.game = shiftGameClock(
        room.game,
        Date.now() + (room.pausedTurnRemainingMs ?? 30_000),
      );
      room.pausedTurnRemainingMs = null;
    }
    room.version += 1;
    room.seq += 1;
    room.updatedAt = Date.now();
    this.writeRoom(room);
    await this.syncAlarm(room);
    return room;
  }

  private reject(ws: WebSocket, reason: string, currentVersion: number): void;
  private reject(ws: WebSocket, actionId: string, reason: string, currentVersion: number): void;
  private reject(
    ws: WebSocket,
    actionIdOrReason: string,
    reasonOrVersion: string | number,
    maybeVersion?: number,
  ): void {
    const actionId = typeof reasonOrVersion === "string" ? actionIdOrReason : undefined;
    const reason = typeof reasonOrVersion === "string" ? reasonOrVersion : actionIdOrReason;
    const currentVersion = typeof reasonOrVersion === "number" ? reasonOrVersion : maybeVersion!;
    this.send(ws, { type: "action_rejected", actionId, reason, currentVersion });
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private broadcast(message: ServerMessage): void {
    const payload = JSON.stringify(message);
    for (const socket of this.ctx.getWebSockets()) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(payload);
      }
    }
  }

  private broadcastState(room: StoredRoom): void {
    for (const socket of this.ctx.getWebSockets()) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      const attachment = socket.deserializeAttachment() as SocketAttachment | null;
      this.send(socket, {
        type: "state_snapshot",
        room: this.toRoomView(room, attachment?.seat ?? null),
      });
    }
  }

  private async syncAlarm(room: StoredRoom): Promise<void> {
    if (room.phase === "playing") {
      const nextDeadline = room.ai?.nextActionAt === null || room.ai?.nextActionAt === undefined
        ? room.game.turnDeadline
        : Math.min(room.game.turnDeadline, room.ai.nextActionAt);
      await this.ctx.storage.setAlarm(nextDeadline);
      return;
    }
    if (room.phase === "reconnect_grace") {
      const deadlines = room.players
        .map((player) => (player?.disconnectedAt ? player.disconnectedAt + RECONNECT_GRACE_MS : null))
        .filter((deadline): deadline is number => deadline !== null);
      if (deadlines.length > 0) {
        await this.ctx.storage.setAlarm(Math.min(...deadlines));
        return;
      }
    }
    if (room.phase === "waiting" || room.phase === "ready" || room.phase === "completed") {
      await this.ctx.storage.setAlarm(room.expiresAt);
      return;
    }
    await this.ctx.storage.deleteAlarm();
  }

  private refreshExpiration(room: StoredRoom, now: number): void {
    if (room.phase === "waiting" || room.phase === "ready") {
      room.expiresAt = now + WAITING_ROOM_TTL_MS;
    } else if (room.phase === "completed") {
      room.expiresAt = now + COMPLETED_ROOM_TTL_MS;
    }
  }

  private prepareAiSchedule(room: StoredRoom): void {
    const ai = room.ai;
    if (!ai) return;

    ai.options = normalizeAiOptions(ai.options);
    ai.memory = updateAiMemory(room.game, ai.seat, ai.memory);
    if (room.phase !== "playing" || room.game.result) {
      ai.scheduledVersion = null;
      ai.nextActionAt = null;
      ai.pendingAction = null;
      return;
    }
    if (ai.scheduledVersion === room.version) return;

    ai.scheduledVersion = room.version;
    ai.nextActionAt = null;
    ai.pendingAction = null;
    if (room.game.turnDeadline <= room.updatedAt + 25) return;

    const random = createAiRandom(deterministicAiSeed(room));
    const plan = chooseAiAction(room.game, ai.seat, ai.options, random, ai.memory);
    if (!plan) return;
    const requestedDelay = aiPlanDelayMs(room.game, plan, ai.options, random, room.updatedAt);
    ai.pendingAction = plan.action;
    ai.nextActionAt = Math.max(
      room.updatedAt + 1,
      Math.min(room.game.turnDeadline - 25, room.updatedAt + requestedDelay),
    );
  }

  private applyScheduledAiAction(room: StoredRoom, now: number): boolean {
    const ai = room.ai;
    if (
      !ai ||
      ai.pendingAction === null ||
      ai.nextActionAt === null ||
      ai.scheduledVersion !== room.version ||
      ai.nextActionAt > now ||
      ai.nextActionAt >= room.game.turnDeadline
    ) {
      return false;
    }

    const action = ai.pendingAction;
    const actionAt = ai.nextActionAt;
    const actionId = `ai:${room.round}:${room.version}:${ai.decisionNonce}`;
    ai.pendingAction = null;
    ai.nextActionAt = null;
    ai.decisionNonce += 1;

    const outcome = applyGameAction(room.game, ai.seat, action, actionAt);
    if (!outcome.ok) {
      // Keep this state from hot-looping. The normal game deadline remains the recovery path.
      ai.scheduledVersion = room.version;
      console.warn(JSON.stringify({
        event: "ai_action_rejected",
        room: room.code,
        game: room.gameId,
        reason: outcome.reason,
      }));
      this.writeRoom(room);
      return false;
    }

    room.game = outcome.state;
    room.phase = room.game.result ? "completed" : "playing";
    room.version += 1;
    room.seq += 1;
    room.updatedAt = Math.max(now, actionAt);
    this.refreshExpiration(room, room.updatedAt);
    this.writeRoomWithAction(room, actionId, actionAt);
    return true;
  }

  private isInactiveExpired(room: StoredRoom, now = Date.now()): boolean {
    return (
      (room.phase === "waiting" || room.phase === "ready" || room.phase === "completed") &&
      room.expiresAt <= now
    );
  }

  private async purgeRoom(): Promise<void> {
    for (const socket of this.ctx.getWebSockets()) {
      socket.close(1001, "room_expired");
    }
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }
}
