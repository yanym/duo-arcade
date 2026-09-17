import { env } from "cloudflare:workers";
import { reset, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_GAME_OPTIONS } from "@duo/game-core";
import { CLIENT_PROTOCOL_HEADER, PROTOCOL_VERSION } from "@duo/protocol";
import worker from "../src/index";
import type { GameRoom } from "../src/room";

afterEach(() => reset());

async function readSaved(stub: DurableObjectStub<GameRoom>) {
  return await runInDurableObject(stub, (_instance, state) =>
    state.storage.sql.exec<{ state_json: string }>("SELECT state_json FROM room_state WHERE id = 1").one().state_json);
}

async function emberRoom() {
  const stub = env.GAME_ROOMS.getByName("ABCDEF");
  const session = await stub.createRoom("ABCDEF", "player-alpha", "Alex", "ember_crew", DEFAULT_GAME_OPTIONS, "duo", undefined, PROTOCOL_VERSION);
  if (!session.ok) throw new Error(session.code);
  return { stub, session: session.value };
}

describe("per-game protocol compatibility", () => {
  it.each([undefined, "27", "26", "999", "invalid"])("rejects unsupported Ember creation from protocol %s", async (version) => {
    const headers = new Headers({ "Content-Type": "application/json" });
    if (version !== undefined) headers.set(CLIENT_PROTOCOL_HEADER, version);
    const response = await worker.fetch(new Request("https://test.invalid/api/rooms", {
      method: "POST", headers,
      body: JSON.stringify({ playerId: "player-alpha", nickname: "Alex", gameId: "ember_crew" }),
    }), env);
    expect(response.status).toBe(426);
    expect(await response.json()).toMatchObject({ error: "protocol_mismatch" });
  });

  it("never returns unknown Ember state to an old preview or join request", async () => {
    const { stub, session } = await emberRoom();
    const before = await readSaved(stub);
    for (const protocol of [undefined, "27"]) {
      const headers = new Headers({ "Content-Type": "application/json" });
      if (protocol !== undefined) headers.set(CLIENT_PROTOCOL_HEADER, protocol);
      const preview = await worker.fetch(new Request("https://test.invalid/api/rooms/ABCDEF", { headers }), env);
      expect(preview.status).toBe(426);
      const body = await preview.json();
      expect(body).toMatchObject({ error: "protocol_mismatch" });
      expect(body).not.toHaveProperty("room");
      for (const identity of [
        { playerId: "player-beta", nickname: "Sam" },
        { playerId: session.playerId, nickname: "Alex", resumeToken: session.seatToken },
      ]) {
        const join = await worker.fetch(new Request("https://test.invalid/api/rooms/ABCDEF/join", {
          method: "POST", headers, body: JSON.stringify(identity),
        }), env);
        expect(join.status).toBe(426);
        expect(await join.json()).toMatchObject({ error: "protocol_mismatch" });
        expect(await readSaved(stub)).toBe(before);
      }
    }
    const preview = await worker.fetch(new Request("https://test.invalid/api/rooms/ABCDEF", {
      headers: { [CLIENT_PROTOCOL_HEADER]: String(PROTOCOL_VERSION) },
    }), env);
    expect(preview.status).toBe(200);
    expect(await preview.json()).toMatchObject({ room: { gameId: "ember_crew", game: { seed: 0 } } });
    const joined = await stub.joinRoom("player-beta", "Sam", undefined, PROTOCOL_VERSION);
    expect(joined.ok).toBe(true);
  });

  it("rejects old Ember sockets without consuming the seat token, and accepts current sockets", async () => {
    const { stub, session } = await emberRoom();
    const before = await readSaved(stub);
    const old = await stub.fetch("https://test.invalid/socket", {
      headers: { Upgrade: "websocket", "Sec-WebSocket-Protocol": `duo-v27, seat.${session.seatToken}` },
    });
    expect(old.status).toBe(426);
    expect(old.webSocket).toBeNull();
    expect(await readSaved(stub)).toBe(before);
    const current = await stub.fetch("https://test.invalid/socket", {
      headers: { Upgrade: "websocket", "Sec-WebSocket-Protocol": `duo-v${PROTOCOL_VERSION}, seat.${session.seatToken}` },
    });
    expect(current.status).toBe(101);
    current.webSocket!.accept();
    current.webSocket!.close();
  });

  it("continues to accept protocol 27 for games it already understands", async () => {
    const stub = env.GAME_ROOMS.getByName("GOMOKU");
    const created = await stub.createRoom("GOMOKU", "player-alpha", "Alex", "gomoku");
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error(created.code);
    const response = await stub.fetch("https://test.invalid/socket", {
      headers: { Upgrade: "websocket", "Sec-WebSocket-Protocol": `duo-v27, seat.${created.value.seatToken}` },
    });
    expect(response.status).toBe(101);
    response.webSocket!.accept();
    response.webSocket!.close();
  });

  it("allows the capability header through browser CORS preflight", async () => {
    const response = await worker.fetch(new Request("https://test.invalid/api/rooms", {
      method: "OPTIONS", headers: { Origin: "http://localhost:8081", "Access-Control-Request-Headers": CLIENT_PROTOCOL_HEADER },
    }), env);
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain(CLIENT_PROTOCOL_HEADER);
  });
});
