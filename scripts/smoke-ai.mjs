import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { CLIENT_PROTOCOL_HEADER, PROTOCOL_VERSION } from "../packages/protocol/src/index.ts";
import { chooseEmberPlan } from "../packages/game-core/src/ember-crew.ts";
import { requiredMoveForObstacle } from "../packages/game-core/src/neon-dash.ts";

const apiBase = process.env.DUO_API_URL ?? "http://localhost:8787";
const REQUEST_TIMEOUT_MS = 30_000;

async function json(path, init = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { "content-type": "application/json", [CLIENT_PROTOCOL_HEADER]: String(PROTOCOL_VERSION), ...init.headers },
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

async function createAiRoom(gameId, options) {
  const identity = { playerId: randomUUID(), nickname: "AI 回归测试" };
  const { body, response } = await json("/api/rooms", {
    method: "POST",
    body: JSON.stringify({
      ...identity,
      gameId,
      options,
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
const resumeSnapshot = waitForRoom(socket, (candidate) => candidate.phase === "playing", "AI room resume");
socket.send(JSON.stringify({ type: "request_snapshot" }));
room = await resumeSnapshot;
assert.equal(room.players[1].connected, true);
socket.close(1000, "smoke_complete");

// Retired instruction-relay games must not be recreated just to keep an old
// smoke suite green. Saved-room compatibility is covered by runtime fixtures.
const rescue = await createAiRoom("ember_crew", { pace: "relaxed", difficulty: "standard", length: "short" });
const rescueSocket = await openSocket(rescue.room.code, rescue);
try {
  const start = waitForRoom(rescueSocket, (candidate) => candidate.phase === "playing", "AI rescue start");
  rescueSocket.send(JSON.stringify({ type: "set_ready", ready: true }));
  let rescueRoom = await start;
  while (!rescueRoom.game.result) {
    const round = rescueRoom.game.round;
    const humanPlan = chooseEmberPlan(rescueRoom.game, rescue.seat);
    const planned = waitForRoom(rescueSocket, (candidate) => candidate.game.round === round &&
      candidate.game.plans[rescue.seat]?.operation === humanPlan.operation && candidate.game.plans[rescue.seat]?.cell === humanPlan.cell,
    "human rescue plan accepted");
    sendAction(rescueSocket, rescueRoom, { kind: "ember_plan", round, ...humanPlan });
    rescueRoom = await planned;
    assert.equal(rescueRoom.game.locked[1], false, "AI locked before the human confirmed");
    const resolved = waitForRoom(rescueSocket, (candidate) => candidate.game.round === round && candidate.game.phase === "round_result", "AI rescue resolves both plans");
    sendAction(rescueSocket, rescueRoom, { kind: "ember_commit", round });
    rescueRoom = await resolved;
    assert.deepEqual(rescueRoom.game.locked, [true, true], "A turn was resolved by timeout instead of confirmation");
    if (!rescueRoom.game.result) rescueRoom = await waitForRoom(rescueSocket,
      (candidate) => candidate.game.round === round + 1 && candidate.game.phase === "planning", "next rescue turn");
  }
  assert.equal(rescueRoom.phase, "completed");
  assert.equal(rescueRoom.game.result.kind, "success", JSON.stringify(rescueRoom.game.result));
  assert.equal(rescueRoom.game.rescued, rescueRoom.game.target);
} finally {
  rescueSocket.close(1000, "smoke_complete");
}

// Keep real timed-AI coverage using a retained reaction game rather than Sync Tap.
const dash = await createAiRoom("neon_dash", { pace: "blitz", difficulty: "standard", length: "short" });
const dashSocket = await openSocket(dash.room.code, dash);
try {
  const signal = waitForRoom(dashSocket, (candidate) => candidate.game.phase === "reacting", "Neon obstacle revealed");
  dashSocket.send(JSON.stringify({ type: "set_ready", ready: true }));
  const dashRoom = await signal;
  assert.equal(dashRoom.ai.intent, null, "competitive reaction intent leaked");
  const resolved = waitForRoom(dashSocket, (candidate) => candidate.game.phase === "round_result", "AI timed response");
  sendAction(dashSocket, dashRoom, { kind: "neon_dodge", move: requiredMoveForObstacle(dashRoom.game.obstacle) });
  const result = await resolved;
  assert.ok(result.game.responses[1], "AI missed the reaction window");
  assert.ok(result.game.responses[1].reactionMs >= 0);
  assert.ok(result.game.responses[1].reactionMs < result.game.responseWindowMs);
} finally {
  dashSocket.close(1000, "smoke_complete");
}

console.log(JSON.stringify({
  ok: true,
  protocol: PROTOCOL_VERSION,
  verified: ["ai_seat", "options", "move", "competitive_privacy", "rematch", "reconnect", "ember_human_plan", "ember_waits_for_confirmation", "ember_complete_mission", "timed_reaction"],
}));
