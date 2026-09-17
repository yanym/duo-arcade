import { env } from "cloudflare:workers";
import { evictDurableObject, reset } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_GAME_OPTIONS, type Seat } from "@duo/game-core";
import { PROTOCOL_VERSION, type ClientMessage, type ServerMessage } from "@duo/protocol";

afterEach(() => reset());

describe("Ember two-player confirmation over real WebSockets", () => {
  for (const planFirst of [0, 1] as const) {
    for (const commitFirst of [0, 1] as const) {
      it.each([false, true])(`accepts shared-version actions (plan first: ${planFirst}, confirm first: ${commitFirst}, eviction: %s)`, async (evict) => {
        const stub = env.GAME_ROOMS.get(env.GAME_ROOMS.newUniqueId());
        const created = await stub.createRoom("ABCDEF", "player-alpha", "Alex", "ember_crew",
          { ...DEFAULT_GAME_OPTIONS, pace: "relaxed", length: "short" }, "duo", undefined, PROTOCOL_VERSION);
        if (!created.ok) throw new Error(created.code);
        const joined = await stub.joinRoom("player-beta", "Sam", undefined, PROTOCOL_VERSION);
        if (!joined.ok) throw new Error(joined.code);
        const clients = await Promise.all([created.value, joined.value].map(async (session) => {
          const response = await stub.fetch("https://test.invalid/socket", {
            headers: { Upgrade: "websocket", "Sec-WebSocket-Protocol": `duo-v${PROTOCOL_VERSION}, seat.${session.seatToken}` },
          });
          expect(response.status).toBe(101);
          const socket = response.webSocket!;
          const messages: ServerMessage[] = [];
          socket.addEventListener("message", (event) => { messages.push(JSON.parse(String(event.data)) as ServerMessage); });
          socket.accept();
          return { socket, messages };
        }));
        const send = (seat: Seat, message: ClientMessage) => clients[seat]!.socket.send(JSON.stringify(message));
        const acknowledged = async (seat: Seat, actionId: string) => {
          await expect.poll(() => clients[seat]!.messages.find((message) =>
            (message.type === "action_acknowledged" || message.type === "action_rejected") && message.actionId === actionId),
          ).toMatchObject({ type: "action_acknowledged", actionId });
        };
        const sharedSnapshot = async (version: number) => {
          for (const client of clients) {
            await expect.poll(() => client.messages.some((message) =>
              message.type === "state_snapshot" && message.room.version === version)).toBe(true);
          }
          const rooms = clients.map((client) => client.messages.find((message) =>
            message.type === "state_snapshot" && message.room.version === version));
          expect(rooms[0]).toEqual(rooms[1]);
        };
        try {
          send(0, { type: "set_ready", ready: true });
          send(1, { type: "set_ready", ready: true });
          await expect.poll(async () => (await stub.getRoom())?.phase).toBe("playing");
          const initial = (await stub.getRoom())!;
          await sharedSnapshot(initial.version);
          const plans = ([0, 1] as const).map((seat) => ({
            type: "game_action" as const, actionId: crypto.randomUUID(), expectedVersion: initial.version,
            payload: { kind: "ember_plan" as const, round: 1, operation: "move" as const, cell: seat === 0 ? 15 : 19 },
          }));
          // No await between sends; either player may reach the server first.
          send(planFirst, plans[planFirst]!);
          send(planFirst === 0 ? 1 : 0, plans[planFirst === 0 ? 1 : 0]!);
          await Promise.all(plans.map((plan, seat) => acknowledged(seat as Seat, plan.actionId)));
          await sharedSnapshot(initial.version + 2);

          const beforeDuplicate = clients[0]!.messages.length;
          send(0, plans[0]!);
          await expect.poll(() => clients[0]!.messages.slice(beforeDuplicate).find((message) =>
            message.type === "action_acknowledged" && message.actionId === plans[0]!.actionId),
          ).toMatchObject({ version: initial.version + 2 });
          const stale = { ...plans[0]!, actionId: crypto.randomUUID() };
          send(0, stale);
          await expect.poll(() => clients[0]!.messages.find((message) =>
            message.type === "action_rejected" && message.actionId === stale.actionId),
          ).toMatchObject({ reason: "stale_version", currentVersion: initial.version + 2 });
          if (evict) await evictDurableObject(stub);

          const commits = ([0, 1] as const).map(() => ({
            type: "game_action" as const, actionId: crypto.randomUUID(), expectedVersion: initial.version + 2,
            payload: { kind: "ember_commit" as const, round: 1 },
          }));
          send(commitFirst, commits[commitFirst]!);
          send(commitFirst === 0 ? 1 : 0, commits[commitFirst === 0 ? 1 : 0]!);
          await Promise.all(commits.map((commit, seat) => acknowledged(seat as Seat, commit.actionId)));
          await sharedSnapshot(initial.version + 4);
          expect((await stub.getRoom())?.game).toMatchObject({
            kind: "ember_crew", round: 1, phase: "round_result", locked: [true, true], positions: [15, 19],
          });
          expect(clients.flatMap((client) => client.messages.filter((message) => message.type === "action_rejected")))
            .toEqual([expect.objectContaining({ actionId: stale.actionId, reason: "stale_version" })]);
        } finally {
          clients.forEach((client) => client.socket.close());
        }
      }, 15_000);
    }
  }
});
