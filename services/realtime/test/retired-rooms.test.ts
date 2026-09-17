import { env } from "cloudflare:workers";
import { reset, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { createGameState, DEFAULT_GAME_OPTIONS, RETIRED_GAME_IDS, type GameId } from "@duo/game-core";
import { PROTOCOL_VERSION, type RoomPhase, type ServerMessage } from "@duo/protocol";
import { hashToken } from "../src/crypto";
import type { GameRoom } from "../src/room";
import type { StoredRoom } from "../src/types";
import worker from "../src/index";

afterEach(() => reset());

async function fixture(gameId: GameId, phase: RoomPhase, both = true) {
  const stub = env.GAME_ROOMS.get(env.GAME_ROOMS.newUniqueId());
  const tokens = [crypto.randomUUID(), crypto.randomUUID()] as const;
  const hashes = await Promise.all(tokens.map(hashToken));
  const now = Date.now();
  const room: StoredRoom = {
    code: "ABCDEF", gameId, mode: "duo", ai: null, options: DEFAULT_GAME_OPTIONS,
    startingSeat: 0, phase, version: 7, seq: 6, round: 1,
    players: [
      { id: "player-a", nickname: "Alex", seat: 0, ready: true, tokenHash: hashes[0]!, disconnectedAt: null, isAi: false },
      both ? { id: "player-b", nickname: "Sam", seat: 1, ready: true, tokenHash: hashes[1]!, disconnectedAt: null, isAi: false } : null,
    ],
    game: createGameState(gameId, 0, now, 123, DEFAULT_GAME_OPTIONS),
    rematchVotes: [], pausedTurnRemainingMs: null, expiresAt: now + 60_000,
    createdAt: now, updatedAt: now,
  };
  await runInDurableObject(stub, (_instance, state) => {
    state.storage.sql.exec("INSERT INTO room_state (id, state_json) VALUES (1, ?)", JSON.stringify(room));
  });
  return { stub, tokens, room };
}

async function stored(stub: DurableObjectStub<GameRoom>) {
  return await runInDurableObject(stub, (_instance, state) => {
    const row = state.storage.sql.exec<{ state_json: string }>("SELECT state_json FROM room_state WHERE id = 1").one();
    return JSON.parse(row.state_json) as StoredRoom;
  });
}

async function connect(stub: DurableObjectStub<GameRoom>, token: string) {
  const response = await stub.fetch("https://test.invalid/socket", {
    headers: { Upgrade: "websocket", "Sec-WebSocket-Protocol": `duo-v${PROTOCOL_VERSION}, seat.${token}` },
  });
  expect(response.status).toBe(101);
  const socket = response.webSocket!;
  const messages: ServerMessage[] = [];
  socket.addEventListener("message", (event) => { messages.push(JSON.parse(String(event.data)) as ServerMessage); });
  socket.accept();
  return { socket, messages };
}

describe("retired saved rooms in the Workers runtime", () => {
  it.each(RETIRED_GAME_IDS)("closes all new-round paths for %s while preserving recovery", async (gameId) => {
    const { stub, tokens, room } = await fixture(gameId, "waiting", false);
    expect(await stub.joinRoom("new-player", "New player")).toEqual({ ok: false, code: "game_retired" });
    expect(await stored(stub)).toEqual(room);

    const resumed = await stub.joinRoom("player-a", "Alex", tokens[0]);
    expect(resumed.ok).toBe(true);
    if (!resumed.ok) throw new Error("Expected existing seat recovery");
    const a = await connect(stub, resumed.value.seatToken);
    const beforeReady = await stored(stub);
    a.socket.send(JSON.stringify({ type: "set_ready", ready: true }));
    await expect.poll(() => a.messages.some((message) => message.type === "action_rejected" && message.reason === "game_retired")).toBe(true);
    expect(await stored(stub)).toEqual(beforeReady);

    // Model a room saved with both players ready before the catalogue changed.
    await runInDurableObject(stub, (_instance, state) => {
      const ready = { ...beforeReady, phase: "ready", players: [beforeReady.players[0], {
        id: "player-b", nickname: "Sam", seat: 1, ready: true,
        tokenHash: room.players[0]!.tokenHash, disconnectedAt: null, isAi: false,
      }] };
      state.storage.sql.exec("UPDATE room_state SET state_json = ? WHERE id = 1", JSON.stringify(ready));
    });
    const b = await connect(stub, tokens[0]);
    expect((await stored(stub)).phase).toBe("ready");
    expect((await stub.getRoom())?.players.every((player) => player?.connected)).toBe(true);

    // A running saved round remains playable and resumable, not forcibly deleted.
    await runInDurableObject(stub, (_instance, state) => {
      const running: StoredRoom = { ...beforeReady, phase: "reconnect_grace", pausedTurnRemainingMs: 20_000,
        players: [ { ...beforeReady.players[0]!, disconnectedAt: Date.now() }, null ] };
      // Keep the second occupied seat, as actual active rooms always have two players.
      const saved = JSON.parse(state.storage.sql.exec<{ state_json: string }>("SELECT state_json FROM room_state WHERE id = 1").one().state_json) as StoredRoom;
      running.players[1] = saved.players[1];
      state.storage.sql.exec("UPDATE room_state SET state_json = ? WHERE id = 1", JSON.stringify(running));
    });
    const recovered = await connect(stub, resumed.value.seatToken);
    expect((await stored(stub)).phase).toBe("playing");
    recovered.socket.send(JSON.stringify({ type: "resign" }));
    await expect.poll(async () => (await stored(stub)).phase).toBe("completed");
    const completed = await stored(stub);
    expect(completed.game.result).not.toBeNull();
    recovered.socket.send(JSON.stringify({ type: "rematch_vote", accept: true }));
    await expect.poll(() => recovered.messages.some((message) => message.type === "action_rejected" && message.reason === "game_retired")).toBe(true);
    expect(await stored(stub)).toEqual(completed);
    a.socket.close(); b.socket.close(); recovered.socket.close();
  });

  it("returns a recoverable 410 error for an old invitation over HTTP", async () => {
    const { room } = await fixture("split_maze", "waiting", false);
    const stub = env.GAME_ROOMS.getByName(room.code);
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec("INSERT INTO room_state (id, state_json) VALUES (1, ?)", JSON.stringify(room));
    });
    const response = await worker.fetch(new Request(`https://test.invalid/api/rooms/${room.code}/join`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId: "new-player-123", nickname: "New player" }),
    }), env);
    expect(response.status).toBe(410);
    expect(await response.json()).toMatchObject({ error: "game_retired", message: "这款游戏已下架，请选择其他游戏" });
    expect(await stored(stub)).toEqual(room);
  });

  it("still starts and rematches a retained game", async () => {
    const { stub, tokens } = await fixture("gomoku", "ready");
    const a = await connect(stub, tokens[0]);
    const b = await connect(stub, tokens[1]);
    expect((await stored(stub)).phase).toBe("playing");
    a.socket.send(JSON.stringify({ type: "resign" }));
    await expect.poll(async () => (await stored(stub)).phase).toBe("completed");
    a.socket.send(JSON.stringify({ type: "rematch_vote", accept: true }));
    b.socket.send(JSON.stringify({ type: "rematch_vote", accept: true }));
    await expect.poll(async () => (await stored(stub)).round).toBe(2);
    expect((await stored(stub)).phase).toBe("playing");
    a.socket.close(); b.socket.close();
  });
});
