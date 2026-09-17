import { env } from "cloudflare:workers";
import { evictDurableObject, reset, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_GAME_OPTIONS, GAME_PACES, turnDurationForPace } from "@duo/game-core";
import { PROTOCOL_VERSION, type ServerMessage } from "@duo/protocol";
import type { StoredRoom } from "../src/types";

afterEach(() => reset());

describe("saved board-room pace recovery", () => {
  for (const gameId of ["gomoku", "reversi"] as const) {
    it.each(GAME_PACES)(`${gameId} restores legacy %s pace without extending the current turn`, async (pace) => {
      const stub = env.GAME_ROOMS.get(env.GAME_ROOMS.newUniqueId());
      const created = await stub.createRoom("ABCDEF", "player-alpha", "Alex", gameId, { ...DEFAULT_GAME_OPTIONS, pace });
      if (!created.ok) throw new Error(created.code);
      const joined = await stub.joinRoom("player-beta", "Sam");
      if (!joined.ok) throw new Error(joined.code);
      const clients = await Promise.all([created.value, joined.value].map(async (session) => {
        const response = await stub.fetch("https://test.invalid/socket", {
          headers: { Upgrade: "websocket", "Sec-WebSocket-Protocol": `duo-v${PROTOCOL_VERSION}, seat.${session.seatToken}` },
        });
        const socket = response.webSocket!;
        const messages: ServerMessage[] = [];
        socket.addEventListener("message", (event) => { messages.push(JSON.parse(String(event.data)) as ServerMessage); });
        socket.accept();
        return { socket, messages };
      }));
      try {
        clients.forEach((client) => client.socket.send(JSON.stringify({ type: "set_ready", ready: true })));
        await expect.poll(async () => (await stub.getRoom())?.phase).toBe("playing");
        // Represent an already-persisted pre-fix room, not a new-game fixture.
        const saved = await runInDurableObject(stub, (_instance, state) => {
          const room = JSON.parse(state.storage.sql.exec<{ state_json: string }>("SELECT state_json FROM room_state WHERE id = 1").one().state_json) as StoredRoom;
          if (room.game.kind !== "gomoku" && room.game.kind !== "reversi") throw new Error("Wrong game");
          delete room.game.turnDurationMs;
          state.storage.sql.exec("UPDATE room_state SET state_json = ? WHERE id = 1", JSON.stringify(room));
          return room;
        });
        await evictDurableObject(stub);
        const restored = (await stub.getRoom())!;
        expect(restored.game.turnDeadline).toBe(saved.game.turnDeadline);
        expect(restored.version).toBe(saved.version);
        if (restored.game.kind !== "gomoku" && restored.game.kind !== "reversi") throw new Error("Wrong game");
        expect(restored.game.turnDurationMs).toBe(turnDurationForPace(pace));
        const actor = clients[restored.game.currentSeat]!;
        const actionId = crypto.randomUUID();
        actor.socket.send(JSON.stringify({
          type: "game_action", actionId, expectedVersion: restored.version,
          payload: gameId === "gomoku" ? { kind: "place_stone", row: 7, col: 7 } : { kind: "place_disc", row: 2, col: 3 },
        }));
        await expect.poll(() => actor.messages.find((message) =>
          (message.type === "action_acknowledged" || message.type === "action_rejected") && message.actionId === actionId),
        ).toMatchObject({ type: "action_acknowledged", actionId });
        const after = await runInDurableObject(stub, (_instance, state) => JSON.parse(state.storage.sql
          .exec<{ state_json: string }>("SELECT state_json FROM room_state WHERE id = 1").one().state_json) as StoredRoom);
        expect(after.game.turnDeadline - after.updatedAt).toBe(turnDurationForPace(pace));
        expect(after.game).toMatchObject({ turnDurationMs: turnDurationForPace(pace), moveCount: 1 });
        for (const client of clients) {
          await expect.poll(() => client.messages.some((message) => message.type === "state_snapshot" &&
            message.room.version === after.version && message.room.game.turnDeadline === after.game.turnDeadline)).toBe(true);
        }
      } finally {
        clients.forEach((client) => client.socket.close());
      }
    });
  }
});
