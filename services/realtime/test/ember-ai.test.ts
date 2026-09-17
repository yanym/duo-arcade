import { env } from "cloudflare:workers";
import { evictDurableObject, reset, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { createEmberCrewState, DEFAULT_AI_OPTIONS, DEFAULT_GAME_OPTIONS, type GameAction } from "@duo/game-core";
import { PROTOCOL_VERSION, type ServerMessage } from "@duo/protocol";
import type { GameRoom } from "../src/room";
import type { StoredRoom } from "../src/types";

afterEach(() => reset());

async function stored(stub: DurableObjectStub<GameRoom>) {
  return runInDurableObject(stub, (_instance, state) => JSON.parse(state.storage.sql
    .exec<{ state_json: string }>("SELECT state_json FROM room_state WHERE id = 1").one().state_json) as StoredRoom);
}

describe("Ember human/AI coordination over real WebSockets", () => {
  it.each([false, true])("revises, waits for confirmation, and resolves a shared route (eviction: %s)", async (evict) => {
    const stub = env.GAME_ROOMS.get(env.GAME_ROOMS.newUniqueId());
    const created = await stub.createRoom("ABCDEF", "human-player", "Alex", "ember_crew", DEFAULT_GAME_OPTIONS, "ai", DEFAULT_AI_OPTIONS, PROTOCOL_VERSION);
    if (!created.ok) throw new Error(created.code);
    // Start from a deterministic mid-mission board. Everything after this setup
    // uses the production socket handler, real AI scheduler and real alarm clock.
    const initial = await stored(stub);
    const game = createEmberCrewState(Date.now(), 42, DEFAULT_GAME_OPTIONS);
    game.positions = [16, 22];
    game.carrying = [false, true];
    game.civilians = [1];
    game.fire = Array(25).fill(0);
    game.fire[17] = 1;
    game.forecast = [17];
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec("UPDATE room_state SET state_json = ? WHERE id = 1", JSON.stringify({
        ...initial, phase: "reconnect_grace", pausedTurnRemainingMs: 60_000, game,
        players: [{ ...initial.players[0]!, ready: true, disconnectedAt: Date.now() }, initial.players[1]],
      }));
    });
    const response = await stub.fetch("https://test.invalid/socket", {
      headers: { Upgrade: "websocket", "Sec-WebSocket-Protocol": `duo-v${PROTOCOL_VERSION}, seat.${created.value.seatToken}` },
    });
    expect(response.status).toBe(101);
    const socket = response.webSocket!;
    const messages: ServerMessage[] = [];
    socket.addEventListener("message", (event) => { messages.push(JSON.parse(String(event.data)) as ServerMessage); });
    socket.accept();
    const settledPlan = async (operation: string, cell: number) => {
      await expect.poll(async () => {
        const room = await stored(stub);
        if (room.game.kind !== "ember_crew") throw new Error("Wrong game");
        return { plan: room.game.plans[1], locked: room.game.locked[1], pending: room.ai?.pendingAction };
      }, { timeout: 6000 }).toEqual({ plan: { operation, cell }, locked: false, pending: null });
    };
    const send = async (action: GameAction) => {
      const room = await stored(stub);
      const actionId = crypto.randomUUID();
      socket.send(JSON.stringify({ type: "game_action", actionId, expectedVersion: room.version, payload: action }));
      await expect.poll(() => messages.some((message) => message.type === "action_acknowledged" && message.actionId === actionId)).toBe(true);
    };

    try {
      await settledPlan("move", 21);
      await send({ kind: "ember_plan", round: 1, operation: "move", cell: 17 });
      await settledPlan("extinguish", 17);
      if (evict) {
        const before = await stored(stub);
        await evictDurableObject(stub);
        expect(await stored(stub)).toEqual(before);
      }
      await send({ kind: "ember_plan", round: 1, operation: "move", cell: 21 });
      await settledPlan("move", 21);
      await send({ kind: "ember_plan", round: 1, operation: "move", cell: 17 });
      await settledPlan("extinguish", 17);
      await send({ kind: "ember_commit", round: 1 });
      if (evict) await evictDurableObject(stub);
      await expect.poll(async () => (await stored(stub)).game, { timeout: 6000 }).toMatchObject({
        phase: "round_result", positions: [17, 22], water: [4, 3], locked: [true, true],
      });
      const finished = await stored(stub);
      expect(finished.game.kind === "ember_crew" && finished.game.fire[17]).toBe(0);
      expect(messages.filter((message) => message.type === "action_rejected")).toEqual([]);
      await expect.poll(() => messages.some((message) => message.type === "state_snapshot" && message.room.game.kind === "ember_crew" &&
        message.room.game.phase === "round_result" && message.room.game.positions[0] === 17)).toBe(true);
    } finally {
      socket.close();
    }
  }, 30_000);
});
