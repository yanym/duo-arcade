import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chooseEmberPlan } from "../packages/game-core/src/ember-crew.ts";
import { CLIENT_PROTOCOL_HEADER, PROTOCOL_VERSION } from "../packages/protocol/src/index.ts";

const base = process.env.DUO_API_URL ?? "http://127.0.0.1:8787";
async function request(path, body) {
  const response = await fetch(base + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", [CLIENT_PROTOCOL_HEADER]: String(PROTOCOL_VERSION) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10_000) });
  const data = await response.json();
  assert.equal(response.ok, true, JSON.stringify(data));
  return data;
}
const sessions = [];
const clients = [];
export let emberSmokeResult;
function connect(session) {
  const socket = new WebSocket(base.replace(/^http/, "ws") + `/api/rooms/${session.room.code}/socket`, [`duo-v${PROTOCOL_VERSION}`, `seat.${session.seatToken}`]);
  const messages = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    messages.push(message);
    if (process.env.EMBER_TRACE) console.log("receive", session.seat, message.type, message.actionId ?? message.room?.version, message.reason ?? message.room?.game.locked);
  });
  const client = { socket, messages, seat: session.seat, sent: [] };
  clients.push(client);
  return client;
}
async function waitFor(client, predicate, label, start = 0) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const found = client.messages.slice(start).find(predicate);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  throw new Error(`${label} timed out: ${JSON.stringify({ seat: client.seat, socketState: client.socket.readyState,
    sent: client.sent.slice(-4), received: client.messages.slice(start).map((message) => message.type === "state_snapshot"
      ? { type: message.type, version: message.room.version, phase: message.room.phase, round: message.room.game.round, locked: message.room.game.locked }
      : message).slice(-12) })}`);
}
const snapshot = (client, predicate, label, start = 0) => waitFor(client, (message) => message.type === "state_snapshot" && predicate(message.room), label, start).then((message) => message.room);
function send(client, value) {
  client.sent.push(value);
  if (process.env.EMBER_TRACE) console.log("send", client.seat, value);
  client.socket.send(JSON.stringify(value));
}
const action = (room, payload) => ({ type: "game_action", actionId: randomUUID(), expectedVersion: room.version, payload });
async function acknowledge(client, sent, label, start) {
  const response = await waitFor(client, (message) =>
    (message.type === "action_acknowledged" || message.type === "action_rejected") && message.actionId === sent.actionId, label, start);
  assert.equal(response.type, "action_acknowledged", JSON.stringify({ label, seat: client.seat, sent, response }));
  return response;
}

try {
  sessions.push(await request("/api/rooms", { gameId: "ember_crew", playerId: randomUUID(), nickname: "Rescue A", options: { difficulty: "standard", pace: "relaxed", length: "short" } }));
  sessions.push(await request(`/api/rooms/${sessions[0].room.code}/join`, { playerId: randomUUID(), nickname: "Rescue B" }));
  let pair = sessions.map(connect);
  await Promise.all(pair.map((client) => snapshot(client, () => true, "initial snapshot")));
  pair.forEach((client) => send(client, { type: "set_ready", ready: true }));
  let room = await snapshot(pair[0], (room) => room.phase === "playing", "both ready");
  let rounds = 0;
  while (!room.game.result) {
    const round = room.game.round;
    // Both clients decide from exactly the same room version: no hidden
    // sequencing advantage, and no retry that conceals a dropped action.
    const plans = [chooseEmberPlan(room.game, 0), chooseEmberPlan(room.game, 1)];
    const planActions = plans.map((plan) => action(room, { kind: "ember_plan", round, ...plan }));
    const start = pair.map((client) => client.messages.length);
    pair.forEach((client, seat) => send(client, planActions[seat]));
    await Promise.all(pair.map((client, seat) => acknowledge(client, planActions[seat], "concurrent plan acknowledgement", start[seat])));
    const plannedRooms = await Promise.all(pair.map((client, seat) => snapshot(client, (room) => room.game.round === round && room.game.plans.every(Boolean), "both plans visible", start[seat])));
    assert.deepEqual(plannedRooms[0].game, plannedRooms[1].game);
    assert.equal(plannedRooms[0].version, room.version + 2, "both plans must advance the shared version exactly twice");
    assert.equal(plannedRooms[1].version, plannedRooms[0].version);
    room = plannedRooms[0];
    assert.deepEqual(room.game.plans, plans);

    if (round === 1) {
      const beforeDuplicate = pair[0].messages.length;
      send(pair[0], planActions[0]);
      const duplicate = await waitFor(pair[0], (message) => message.type === "action_acknowledged" && message.actionId === planActions[0].actionId, "duplicate acknowledgement", beforeDuplicate);
      assert.equal(duplicate.version, room.version, "a duplicate must not advance the room");
      // Reusing a stale version for another action by the same player is not
      // the concurrent-other-player exception.
      const stale = { ...action(room, { kind: "ember_plan", round, ...plans[0] }), expectedVersion: room.version - 2 };
      send(pair[0], stale);
      const rejected = await waitFor(pair[0], (message) => message.type === "action_rejected" && message.actionId === stale.actionId, "stale action rejection");
      assert.equal(rejected.reason, "stale_version");
    }

    if (round === 2) {
      const beforeDisconnect = pair[0].messages.length;
      pair[1].socket.close(1000, "reconnect_test");
      const paused = await snapshot(pair[0], (room) => room.phase === "reconnect_grace", "disconnect pause", beforeDisconnect);
      assert.deepEqual(paused.game.plans, plans);
      pair[1] = connect(sessions[1]);
      room = await snapshot(pair[1], (room) => room.phase === "playing", "resume same plans");
      assert.deepEqual(room.game.plans, plans);
    }

    const commits = pair.map(() => action(room, { kind: "ember_commit", round }));
    const committedStart = pair.map((client) => client.messages.length);
    pair.forEach((client, seat) => send(client, commits[seat]));
    await Promise.all(pair.map((client, seat) => acknowledge(client, commits[seat], "concurrent confirmation", committedStart[seat])));
    const resolved = await Promise.all(pair.map((client, seat) => snapshot(client, (room) => room.game.round === round && room.game.phase === "round_result", "shared round result", committedStart[seat])));
    assert.deepEqual(resolved[0].game, resolved[1].game);
    room = resolved[0]; rounds++;
    if (!room.game.result) room = await snapshot(pair[0], (room) => room.game.round === round + 1 && room.game.phase === "planning", "next round", committedStart[0]);
  }
  assert.equal(room.phase, "completed");
  assert.equal(room.game.result.kind, "success", "the two-player rescue policy did not complete the mission");
  assert.equal(room.game.rescued, room.game.target, "every resident must reach safety");
  emberSmokeResult = { ok: true, code: room.code, game: "ember_crew", rounds, rescued: room.game.rescued, target: room.game.target, result: room.game.result, tested: ["concurrent plans", "concurrent confirmations", "duplicate action", "stale version", "disconnect/resume", "complete mission", "matching results on both clients"] };
  console.log(JSON.stringify(emberSmokeResult));
} finally {
  for (const client of clients) client.socket.close(1000, "smoke_complete");
}
