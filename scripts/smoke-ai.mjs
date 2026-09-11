import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PROTOCOL_VERSION } from "../packages/protocol/src/index.ts";

const apiBase = process.env.DUO_API_URL ?? "http://localhost:8787";
const REQUEST_TIMEOUT_MS = 30_000;

async function json(path, init = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { "content-type": "application/json", ...init.headers },
  });
  const body = await response.json();
  return { body, response };
}

function socketUrl(code) {
  const url = new URL(`${apiBase}/api/rooms/${code}/socket`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

function openSocket(code, session) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(socketUrl(code), [
      `duo-v${PROTOCOL_VERSION}`,
      `seat.${session.seatToken}`,
    ]);
    const timeout = setTimeout(() => reject(new Error("AI room WebSocket open timed out")), 5_000);
    socket.addEventListener("open", () => {
      clearTimeout(timeout);
      resolve(socket);
    }, { once: true });
    socket.addEventListener("error", () => reject(new Error("AI room WebSocket failed")), { once: true });
  });
}

function waitForRoom(socket, predicate, label, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.removeEventListener("message", onMessage);
      reject(new Error(`${label} timed out`));
    }, timeoutMs);
    function onMessage(event) {
      const message = JSON.parse(String(event.data));
      if (message.type !== "state_snapshot" || !predicate(message.room)) return;
      clearTimeout(timeout);
      socket.removeEventListener("message", onMessage);
      resolve(message.room);
    }
    socket.addEventListener("message", onMessage);
  });
}

function sendAction(socket, room, payload) {
  socket.send(JSON.stringify({
    type: "game_action",
    actionId: randomUUID(),
    expectedVersion: room.version,
    payload,
  }));
}

async function createAiRoom(gameId) {
  const identity = { playerId: randomUUID(), nickname: "AI 回归测试" };
  const { body, response } = await json("/api/rooms", {
    method: "POST",
    body: JSON.stringify({
      ...identity,
      gameId,
      mode: "ai",
      aiOptions: { difficulty: "hard", intelligence: "strategic", reactionSpeed: "quick" },
    }),
  });
  assert.equal(response.status, 201, JSON.stringify(body));
  assert.equal(body.room.mode, "ai");
  assert.equal(body.room.phase, "ready");
  assert.equal(body.room.players[1].isAi, true);
  assert.equal(body.room.players[1].ready, true);
  assert.equal(body.room.players[1].connected, true);
  assert.deepEqual(body.room.ai.options, { difficulty: "hard", intelligence: "strategic", reactionSpeed: "quick" });
  return { ...body, identity };
}

const gomoku = await createAiRoom("gomoku");
const blockedJoin = await json(`/api/rooms/${gomoku.room.code}/join`, {
  method: "POST",
  body: JSON.stringify({ playerId: randomUUID(), nickname: "不应入座" }),
});
assert.equal(blockedJoin.response.status, 409);
assert.equal(blockedJoin.body.error, "room_full");

let socket = await openSocket(gomoku.room.code, gomoku);
const playingPromise = waitForRoom(socket, (room) => room.phase === "playing", "AI game start");
socket.send(JSON.stringify({ type: "set_ready", ready: true }));
let room = await playingPromise;
const initialMoves = room.game.moveCount;
if (room.game.currentSeat === gomoku.seat) {
  const empty = room.game.board.findIndex((cell) => cell === 0);
  sendAction(socket, room, { kind: "place_stone", row: Math.floor(empty / room.game.size), col: empty % room.game.size });
}
room = await waitForRoom(
  socket,
  (candidate) => candidate.phase === "playing" && candidate.game.moveCount >= initialMoves + (candidate.game.currentSeat === gomoku.seat ? 1 : 2),
  "AI gomoku move",
);
assert.ok(room.game.moveCount > initialMoves, "AI did not make a Gomoku move");
assert.equal(room.ai.intent, null, "competitive AI intent leaked to its opponent");
assert.equal(room.ai.suggestion, null, "competitive AI suggestion leaked hidden strategy");
assert.equal("nextActionAt" in room.ai, false, "competitive AI timing leaked to its opponent");

const completedPromise = waitForRoom(socket, (candidate) => candidate.phase === "completed", "AI resign result");
socket.send(JSON.stringify({ type: "resign" }));
room = await completedPromise;
const rematchPromise = waitForRoom(socket, (candidate) => candidate.phase === "playing" && candidate.round === 2, "AI rematch");
socket.send(JSON.stringify({ type: "rematch_vote", accept: true }));
room = await rematchPromise;
assert.equal(room.rematchVotes.length, 0);

socket.close(1000, "test_reconnect");
await new Promise((resolve) => setTimeout(resolve, 80));
const reconnectPreview = await json(`/api/rooms/${gomoku.room.code}`);
assert.equal(reconnectPreview.body.room.phase, "reconnect_grace");
const resumed = await json(`/api/rooms/${gomoku.room.code}/join`, {
  method: "POST",
  body: JSON.stringify({ ...gomoku.identity, resumeToken: gomoku.seatToken }),
});
assert.equal(resumed.response.status, 200, JSON.stringify(resumed.body));
socket = await openSocket(gomoku.room.code, resumed.body);
room = await waitForRoom(socket, (candidate) => candidate.phase === "playing", "AI room resume");
assert.equal(room.players[1].connected, true);
socket.close(1000, "smoke_complete");

const defuse = await createAiRoom("starship_defuse");
const defuseSocket = await openSocket(defuse.room.code, defuse);
const defuseStart = waitForRoom(defuseSocket, (candidate) => candidate.phase === "playing", "AI teammate start");
defuseSocket.send(JSON.stringify({ type: "set_ready", ready: true }));
const defuseRoom = await defuseStart;
if (defuseRoom.game.operatorSeat === defuse.seat) {
  assert.equal(defuseRoom.ai.suggestion?.kind, "defuse_press", "AI analyst did not communicate the next symbol");
  assert.equal(defuseRoom.ai.intent, null);
} else {
  assert.equal(defuseRoom.ai.intent?.kind, "defuse_press", "AI operator did not schedule its own input");
}
defuseSocket.close(1000, "smoke_complete");

const thrusters = await createAiRoom("dual_thrusters");
const thrusterSocket = await openSocket(thrusters.room.code, thrusters);
const thrusterStart = waitForRoom(thrusterSocket, (candidate) => candidate.phase === "playing", "AI thruster start");
thrusterSocket.send(JSON.stringify({ type: "set_ready", ready: true }));
const thrusterRoom = await thrusterStart;
assert.equal(thrusterRoom.ai.intent?.kind, "thruster_burn", "AI thruster intent is not visible to its teammate");
assert.equal(thrusterRoom.ai.suggestion?.kind, "thruster_burn", "human thruster suggestion is missing");
const thrusterResult = waitForRoom(
  thrusterSocket,
  (candidate) => candidate.game.kind === "dual_thrusters" && candidate.game.phase === "gate_result",
  "AI paired thruster resolution",
);
sendAction(thrusterSocket, thrusterRoom, thrusterRoom.ai.suggestion);
const resolvedThrusters = await thrusterResult;
assert.equal(resolvedThrusters.game.locked.every(Boolean), true);
assert.equal(resolvedThrusters.game.powers.every((power) => power !== null), true);
thrusterSocket.close(1000, "smoke_complete");

const sync = await createAiRoom("sync_tap");
const syncSocket = await openSocket(sync.room.code, sync);
const syncStart = waitForRoom(syncSocket, (candidate) => candidate.phase === "playing", "AI sync start");
syncSocket.send(JSON.stringify({ type: "set_ready", ready: true }));
const syncRoom = await syncStart;
const syncResult = waitForRoom(
  syncSocket,
  (candidate) => candidate.game.kind === "sync_tap" && candidate.game.roundScores.length > 0,
  "AI synchronized reaction",
  12_000,
);
await new Promise((resolve) => setTimeout(resolve, Math.max(0, syncRoom.game.goAt - Date.now() + 55)));
sendAction(syncSocket, syncRoom, { kind: "sync_tap" });
const resolvedSync = await syncResult;
assert.ok(resolvedSync.game.lastDeltaMs < resolvedSync.game.tapWindowMs, "AI tap missed the legal reaction window");
syncSocket.close(1000, "smoke_complete");

console.log(JSON.stringify({
  ok: true,
  protocol: PROTOCOL_VERSION,
  verified: ["ai_seat", "options", "move", "competitive_privacy", "rematch", "reconnect", "teammate_coordination", "paired_coordination", "timed_reaction"],
}));
