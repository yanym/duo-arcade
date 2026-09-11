import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PROTOCOL_VERSION } from "../packages/protocol/src/index.ts";

const apiBase = process.env.DUO_API_URL ?? "http://localhost:8787";
const REQUEST_TIMEOUT_MS = 10_000;

const healthResponse = await fetch(`${apiBase}/health`, {
  signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
});
const health = await healthResponse.json();
assert.equal(healthResponse.ok, true, JSON.stringify(health));
assert.equal(health.ok, true);
assert.equal(health.protocol, PROTOCOL_VERSION);
assert.equal(health.games, 28);
assert.match(health.release, /^\d{4}\.\d{2}\.\d{2}\.\d+$/);
assert.equal(healthResponse.headers.get("cache-control"), "no-store");
assert.equal(healthResponse.headers.get("x-content-type-options"), "nosniff");

async function json(path, init, attempt = 0) {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const body = await response.json();
  if (response.status === 429 && attempt < 2) {
    const retryAfterMs = Math.max(1, Number(response.headers.get("retry-after") ?? 1)) * 1_000;
    await new Promise((resolve) => setTimeout(resolve, Math.min(retryAfterMs + 100, 60_000)));
    return await json(path, init, attempt + 1);
  }
  assert.equal(response.ok, true, JSON.stringify(body));
  return body;
}

function socketUrl(code) {
  const url = new URL(`${apiBase}/api/rooms/${code}/socket`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

function openSocket(code, session, protocolVersion = PROTOCOL_VERSION) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(socketUrl(code), [`duo-v${protocolVersion}`, `seat.${session.seatToken}`]);
    const timeout = setTimeout(() => reject(new Error("WebSocket open timed out")), 5_000);
    socket.addEventListener("open", () => {
      clearTimeout(timeout);
      resolve(socket);
    }, { once: true });
    socket.addEventListener("error", () => reject(new Error("WebSocket failed to open")), { once: true });
  });
}

async function createPair(gameId, options) {
  const first = await json("/api/rooms", {
    method: "POST",
    body: JSON.stringify({ playerId: randomUUID(), nickname: "自动测试甲", gameId, options }),
  });
  const second = await json(`/api/rooms/${first.room.code}/join`, {
    method: "POST",
    body: JSON.stringify({ playerId: randomUUID(), nickname: "自动测试乙" }),
  });
  const sockets = [await openSocket(first.room.code, first), await openSocket(first.room.code, second)];
  return { code: first.room.code, sessions: [first, second], sockets };
}

function waitForMessage(socket, predicate, label, timeoutMs = 8_000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.removeEventListener("message", onMessage);
      reject(new Error(`${label} timed out`));
    }, timeoutMs);
    function onMessage(event) {
      const message = JSON.parse(String(event.data));
      if (!predicate(message)) return;
      clearTimeout(timeout);
      socket.removeEventListener("message", onMessage);
      resolve(message);
    }
    socket.addEventListener("message", onMessage);
  });
}

function waitForRoom(socket, predicate, label, timeoutMs) {
  return waitForMessage(
    socket,
    (message) => message.type === "state_snapshot" && predicate(message.room),
    label,
    timeoutMs,
  ).then((message) => message.room);
}

function action(socket, room, payload) {
  socket.send(JSON.stringify({
    type: "game_action",
    actionId: randomUUID(),
    expectedVersion: room.version,
    payload,
  }));
}

async function runGame(gameId, handle, timeoutMs = 15_000, options) {
  const pair = await createPair(gameId, options);
  let lastVersion = -1;
  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${gameId} smoke test timed out`)), timeoutMs);
    function onMessage(event) {
      const message = JSON.parse(String(event.data));
      if (message.type !== "state_snapshot" || message.room.version === lastVersion) return;
      lastVersion = message.room.version;
      try {
        const outcome = handle(message.room, pair.sockets);
        if (outcome !== undefined) {
          clearTimeout(timeout);
          resolve(outcome);
        }
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    }
    for (const socket of pair.sockets) socket.addEventListener("message", onMessage);
    pair.sockets[0].send(JSON.stringify({ type: "set_ready", ready: true }));
    pair.sockets[1].send(JSON.stringify({ type: "set_ready", ready: true }));
  });
  for (const socket of pair.sockets) socket.close(1000, "smoke_complete");
  return { code: pair.code, result };
}

const gomoku = await runGame("gomoku", (room, sockets) => {
  if (room.game.result) return room.game.result;
  if (room.phase !== "playing") return;
  const blackMoves = [[7, 3], [7, 4], [7, 5], [7, 6], [7, 7]];
  const whiteMoves = [[6, 3], [6, 4], [6, 5], [6, 6]];
  const seat = room.game.currentSeat;
  const piece = room.players[seat].piece;
  const moveNumber = room.game.board.filter((cell) => cell === piece).length;
  const [row, col] = (piece === 1 ? blackMoves : whiteMoves)[moveNumber];
  action(sockets[seat], room, { kind: "place_stone", row, col });
});
assert.deepEqual([gomoku.result.kind, gomoku.result.reason], ["win", "five_in_a_row"]);

let reversiMoved = false;
const reversi = await runGame("reversi", (room, sockets) => {
  if (room.game.result) return room.game.result;
  if (room.phase !== "playing") return;
  if (!reversiMoved) {
    reversiMoved = true;
    action(sockets[room.game.currentSeat], room, { kind: "place_disc", row: 2, col: 3 });
    return;
  }
  assert.equal(room.game.moveCount, 1);
  assert.equal(room.game.board[27], room.game.board[19]);
  sockets[room.game.currentSeat].send(JSON.stringify({ type: "resign" }));
});
assert.deepEqual([reversi.result.kind, reversi.result.reason], ["win", "resigned"]);

function solveMaze(game) {
  const directions = [
    ["up", -game.cols, 1],
    ["right", 1, 2],
    ["down", game.cols, 4],
    ["left", -1, 8],
  ];
  const previous = new Map([[game.position, null]]);
  const previousDirection = new Map();
  const queue = [game.position];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor];
    if (index === game.exit) break;
    for (const [direction, offset, wall] of directions) {
      if (game.walls[index] & wall) continue;
      const next = index + offset;
      if (previous.has(next)) continue;
      previous.set(next, index);
      previousDirection.set(next, direction);
      queue.push(next);
    }
  }
  const path = [];
  let cursor = game.exit;
  while (cursor !== game.position) {
    path.push(previousDirection.get(cursor));
    cursor = previous.get(cursor);
  }
  return path.reverse();
}

let mazePath;
const maze = await runGame("split_maze", (room, sockets) => {
  if (room.game.result) return room.game.result;
  if (room.phase !== "playing") return;
  mazePath ??= solveMaze(room.game);
  const direction = mazePath[room.game.moveCount];
  const vertical = direction === "up" || direction === "down";
  const seat = vertical ? room.game.verticalSeat : 1 - room.game.verticalSeat;
  action(sockets[seat], room, { kind: "maze_move", direction });
});
assert.equal(maze.result.kind, "success");
assert.equal(maze.result.reason, "exit_reached");

let scheduledRound = 0;
let finishedSyncRound = false;
const sync = await runGame("sync_tap", (room, sockets) => {
  if (room.game.result) return room.game.result;
  if (room.phase !== "playing") return;
  if (room.game.roundScores.length > 0 && !finishedSyncRound) {
    finishedSyncRound = true;
    assert.ok(room.game.lastDeltaMs < 250);
    sockets[0].send(JSON.stringify({ type: "resign" }));
    return;
  }
  if (scheduledRound === room.game.round) return;
  scheduledRound = room.game.round;
  const delay = Math.max(0, room.game.goAt - Date.now() + 30);
  setTimeout(() => {
    action(sockets[0], room, { kind: "sync_tap" });
    action(sockets[1], room, { kind: "sync_tap" });
  }, delay);
}, 20_000);
assert.deepEqual([sync.result.kind, sync.result.reason], ["failure", "abandoned"]);

async function runCoverPrivacy() {
  const pair = await createPair("cover_hunt", { pace: "standard", difficulty: "standard", length: "short" });
  const views = [null, null];
  let stage = 0;
  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("cover_hunt privacy smoke test timed out")), 15_000);
    const evaluate = () => {
      const [first, second] = views;
      if (!first || !second || first.version !== second.version) return;
      try {
        if (stage === 0 && first.phase === "playing" && first.game.phase === "hiding") {
          stage = 1;
          const hunter = first.game.hunterSeat;
          const hider = 1 - hunter;
          action(pair.sockets[hider], views[hider], { kind: "cover_hide", cover: 3 });
          return;
        }
        if (stage === 1 && first.game.phase === "hunting") {
          stage = 2;
          const hunter = first.game.hunterSeat;
          const hider = 1 - hunter;
          assert.equal(views[hunter].game.hiddenSpot, null, "hunter received secret hiding spot");
          assert.equal(views[hider].game.hiddenSpot, 3, "hider lost their own secret hiding spot");
          action(pair.sockets[hunter], views[hunter], { kind: "cover_scan", cover: 2 });
          return;
        }
        if (stage === 2 && first.game.scanCharges === 0) {
          stage = 3;
          const hunter = first.game.hunterSeat;
          const hider = 1 - hunter;
          assert.deepEqual(views[hunter].game.scanFeedback, { cover: 2, signal: "warm" });
          assert.equal(views[hider].game.scanFeedback, null, "hider received private hunter scan");
          action(pair.sockets[hunter], views[hunter], { kind: "cover_shoot", cover: 3 });
          return;
        }
        if (stage === 3 && first.game.phase === "round_result") {
          stage = 4;
          assert.equal(first.game.roundOutcome, "hit");
          assert.equal(first.game.hiddenSpot, 3);
          pair.sockets[0].send(JSON.stringify({ type: "resign" }));
          return;
        }
        if (stage === 4 && first.phase === "completed") {
          clearTimeout(timeout);
          resolve({ kind: first.game.result.kind, privacyVerified: true });
        }
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    };
    pair.sockets.forEach((socket, seat) => {
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data));
        if (message.type !== "state_snapshot") return;
        views[seat] = message.room;
        evaluate();
      });
    });
    pair.sockets[0].send(JSON.stringify({ type: "set_ready", ready: true }));
    pair.sockets[1].send(JSON.stringify({ type: "set_ready", ready: true }));
  });
  for (const socket of pair.sockets) socket.close(1000, "smoke_complete");
  return { code: pair.code, result };
}

const coverHunt = await runCoverPrivacy();
assert.equal(coverHunt.result.privacyVerified, true);

async function runDefusePrivacy() {
  const pair = await createPair("starship_defuse", { pace: "relaxed", difficulty: "easy", length: "short" });
  const views = [null, null];
  let stage = 0;
  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("starship_defuse privacy smoke test timed out")), 12_000);
    const evaluate = () => {
      const [first, second] = views;
      if (!first || !second || first.version !== second.version) return;
      try {
        if (stage === 0 && first.phase === "playing") {
          stage = 1;
          const operator = first.game.operatorSeat;
          const analyst = 1 - operator;
          assert.equal(views[operator].game.solution, null, "operator received private repair sequence");
          assert.ok(Array.isArray(views[analyst].game.solution), "analyst did not receive repair sequence");
          action(pair.sockets[operator], views[operator], {
            kind: "defuse_press",
            symbol: views[analyst].game.solution[0],
          });
          return;
        }
        if (stage === 1 && first.game.progress === 1) {
          stage = 2;
          const operator = first.game.operatorSeat;
          const analyst = 1 - operator;
          assert.equal(views[operator].game.solution, null);
          assert.ok(views[analyst].game.solution.length >= 3);
          assert.equal(first.game.lastInput.correct, true);
          pair.sockets[operator].send(JSON.stringify({ type: "resign" }));
          return;
        }
        if (stage === 2 && first.phase === "completed") {
          clearTimeout(timeout);
          resolve({ kind: first.game.result.kind, privacyVerified: true });
        }
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    };
    pair.sockets.forEach((socket, seat) => {
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data));
        if (message.type !== "state_snapshot") return;
        views[seat] = message.room;
        evaluate();
      });
    });
    pair.sockets[0].send(JSON.stringify({ type: "set_ready", ready: true }));
    pair.sockets[1].send(JSON.stringify({ type: "set_ready", ready: true }));
  });
  for (const socket of pair.sockets) socket.close(1000, "smoke_complete");
  return { code: pair.code, result };
}

const starshipDefuse = await runDefusePrivacy();
assert.equal(starshipDefuse.result.privacyVerified, true);

async function runQuantumDuelPrivacy() {
  const pair = await createPair("quantum_duel", { pace: "relaxed", difficulty: "standard", length: "short" });
  const views = [null, null];
  let stage = 0;
  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("quantum_duel privacy smoke test timed out")), 12_000);
    const evaluate = () => {
      const [first, second] = views;
      if (!first || !second || first.version !== second.version) return;
      try {
        if (stage === 0 && first.phase === "playing") {
          stage = 1;
          action(pair.sockets[0], first, { kind: "duel_choose", move: "strike" });
          return;
        }
        if (stage === 1 && first.game.locked[0] && !first.game.locked[1]) {
          stage = 2;
          assert.equal(views[0].game.choices[0], "strike");
          assert.equal(views[1].game.choices[0], null, "opponent received locked duel move");
          action(pair.sockets[1], second, { kind: "duel_choose", move: "charge" });
          return;
        }
        if (stage === 2 && first.game.phase === "round_result") {
          stage = 3;
          assert.deepEqual(first.game.choices, ["strike", "charge"]);
          assert.deepEqual(second.game.choices, ["strike", "charge"]);
          assert.equal(first.game.roundWinner, 0);
          pair.sockets[1].send(JSON.stringify({ type: "resign" }));
          return;
        }
        if (stage === 3 && first.phase === "completed") {
          clearTimeout(timeout);
          resolve({ kind: first.game.result.kind, privacyVerified: true });
        }
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    };
    pair.sockets.forEach((socket, seat) => {
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data));
        if (message.type !== "state_snapshot") return;
        views[seat] = message.room;
        evaluate();
      });
    });
    pair.sockets[0].send(JSON.stringify({ type: "set_ready", ready: true }));
    pair.sockets[1].send(JSON.stringify({ type: "set_ready", ready: true }));
  });
  for (const socket of pair.sockets) socket.close(1000, "smoke_complete");
  return { code: pair.code, result };
}

const quantumDuel = await runQuantumDuelPrivacy();
assert.equal(quantumDuel.result.privacyVerified, true);

async function runStarwayEscortPrivacy() {
  const pair = await createPair("starway_escort", { pace: "relaxed", difficulty: "easy", length: "short" });
  const views = [null, null];
  let stage = 0;
  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("starway_escort privacy smoke test timed out")), 12_000);
    const evaluate = () => {
      const [first, second] = views;
      if (!first || !second || first.version !== second.version) return;
      try {
        if (stage === 0 && first.phase === "playing" && first.game.phase === "planning") {
          stage = 1;
          const pilot = first.game.pilotSeat;
          const shield = 1 - pilot;
          assert.notEqual(views[pilot].game.energyLane, null, "pilot did not receive energy intelligence");
          assert.equal(views[pilot].game.obstacleLane, null, "pilot received obstacle intelligence");
          assert.equal(views[shield].game.energyLane, null, "shield officer received energy intelligence");
          assert.notEqual(views[shield].game.obstacleLane, null, "shield officer did not receive obstacle intelligence");
          action(pair.sockets[pilot], views[pilot], {
            kind: "escort_route",
            lane: views[pilot].game.energyLane,
          });
          return;
        }
        if (stage === 1 && first.game.locked[first.game.pilotSeat]) {
          stage = 2;
          const pilot = first.game.pilotSeat;
          const shield = 1 - pilot;
          assert.equal(views[shield].game.routeChoice, null, "shield officer received the pilot's locked route");
          assert.equal(views[pilot].game.shieldChoice, null, "pilot received the shield officer's plan");
          action(pair.sockets[shield], views[shield], {
            kind: "escort_shield",
            lane: views[shield].game.obstacleLane,
          });
          return;
        }
        if (stage === 2 && first.game.phase === "sector_result") {
          stage = 3;
          assert.equal(first.game.sectorOutcome, "energy_collected");
          assert.equal(first.game.cargo, 2);
          for (const view of views) {
            assert.notEqual(view.game.energyLane, null);
            assert.notEqual(view.game.obstacleLane, null);
            assert.notEqual(view.game.routeChoice, null);
            assert.notEqual(view.game.shieldChoice, null);
          }
          pair.sockets[0].send(JSON.stringify({ type: "resign" }));
          return;
        }
        if (stage === 3 && first.phase === "completed") {
          clearTimeout(timeout);
          resolve({ kind: first.game.result.kind, privacyVerified: true });
        }
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    };
    pair.sockets.forEach((socket, seat) => {
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data));
        if (message.type !== "state_snapshot") return;
        views[seat] = message.room;
        evaluate();
      });
    });
    pair.sockets[0].send(JSON.stringify({ type: "set_ready", ready: true }));
    pair.sockets[1].send(JSON.stringify({ type: "set_ready", ready: true }));
  });
  for (const socket of pair.sockets) socket.close(1000, "smoke_complete");
  return { code: pair.code, result };
}

const starwayEscort = await runStarwayEscortPrivacy();
assert.equal(starwayEscort.result.privacyVerified, true);

async function runOrbitalRepairPrivacy() {
  const pair = await createPair("orbital_repair", { pace: "relaxed", difficulty: "easy", length: "short" });
  const views = [null, null];
  let stage = 0;
  let actedVersion = -1;
  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("orbital_repair privacy smoke test timed out")), 15_000);
    const evaluate = () => {
      const [first, second] = views;
      if (!first || !second || first.version !== second.version || actedVersion === first.version) return;
      try {
        if (stage === 0 && first.phase === "playing" && first.game.phase === "aligning") {
          const engineer = first.game.engineerSeat;
          const launcher = 1 - engineer;
          assert.equal(views[engineer].game.targetSlots, null, "engineer received the private orbital blueprint");
          assert.ok(Array.isArray(views[launcher].game.targetSlots), "launcher did not receive the orbital blueprint");
          stage = 1;
        }
        if (stage === 1 && first.game.phase === "aligning") {
          const engineer = first.game.engineerSeat;
          const launcher = 1 - engineer;
          assert.equal(views[engineer].game.targetSlots, null);
          const target = views[launcher].game.targetSlots;
          const ring = first.game.currentSlots
            .slice(0, first.game.ringCount)
            .findIndex((slot, index) => slot !== target[index]);
          actedVersion = first.version;
          if (ring >= 0) {
            action(pair.sockets[engineer], views[engineer], {
              kind: "orbit_rotate",
              ring,
              direction: "clockwise",
            });
          } else {
            stage = 2;
            action(pair.sockets[launcher], views[launcher], { kind: "orbit_launch" });
          }
          return;
        }
        if (stage === 2 && first.game.phase === "stage_result") {
          stage = 3;
          assert.equal(first.game.lastLaunchCorrect, true);
          assert.deepEqual(first.game.targetSlots, second.game.targetSlots);
          assert.ok(Array.isArray(first.game.targetSlots));
          pair.sockets[0].send(JSON.stringify({ type: "resign" }));
          return;
        }
        if (stage === 3 && first.phase === "completed") {
          clearTimeout(timeout);
          resolve({ kind: first.game.result.kind, privacyVerified: true });
        }
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    };
    pair.sockets.forEach((socket, seat) => {
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data));
        if (message.type !== "state_snapshot") return;
        views[seat] = message.room;
        evaluate();
      });
    });
    pair.sockets[0].send(JSON.stringify({ type: "set_ready", ready: true }));
    pair.sockets[1].send(JSON.stringify({ type: "set_ready", ready: true }));
  });
  for (const socket of pair.sockets) socket.close(1000, "smoke_complete");
  return { code: pair.code, result };
}

const orbitalRepair = await runOrbitalRepairPrivacy();
assert.equal(orbitalRepair.result.privacyVerified, true);

async function runRhythmGravityPrivacy() {
  const pair = await createPair("rhythm_gravity", { pace: "relaxed", difficulty: "easy", length: "short" });
  const views = [null, null];
  let stage = 0;
  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("rhythm_gravity privacy smoke test timed out")), 15_000);
    const evaluate = () => {
      const [first, second] = views;
      if (!first || !second || first.version !== second.version) return;
      try {
        if (stage === 0 && first.phase === "playing" && first.game.phase === "beat") {
          stage = 1;
          const delay = Math.max(0, first.game.beatAt - Date.now() + 25);
          setTimeout(() => action(pair.sockets[0], first, { kind: "rhythm_gravity_tap" }), delay);
          return;
        }
        if (stage === 1 && first.game.locked[0] && !first.game.locked[1]) {
          stage = 2;
          assert.notEqual(views[0].game.taps[0], null, "player lost their own rhythm timing");
          assert.equal(views[1].game.taps[0], null, "opponent received the first player's rhythm timing");
          action(pair.sockets[1], second, { kind: "rhythm_gravity_tap" });
          return;
        }
        if (stage === 2 && first.game.phase === "round_result") {
          stage = 3;
          assert.notEqual(first.game.taps[0], null);
          assert.notEqual(first.game.taps[1], null);
          assert.deepEqual(first.game.taps, second.game.taps);
          pair.sockets[0].send(JSON.stringify({ type: "resign" }));
          return;
        }
        if (stage === 3 && first.phase === "completed") {
          clearTimeout(timeout);
          resolve({ kind: first.game.result.kind, privacyVerified: true });
        }
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    };
    pair.sockets.forEach((socket, seat) => {
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data));
        if (message.type !== "state_snapshot") return;
        views[seat] = message.room;
        evaluate();
      });
    });
    pair.sockets[0].send(JSON.stringify({ type: "set_ready", ready: true }));
    pair.sockets[1].send(JSON.stringify({ type: "set_ready", ready: true }));
  });
  for (const socket of pair.sockets) socket.close(1000, "smoke_complete");
  return { code: pair.code, result };
}

const rhythmGravity = await runRhythmGravityPrivacy();
assert.equal(rhythmGravity.result.privacyVerified, true);

async function runShadowShuttlePrivacy() {
  const pair = await createPair("shadow_shuttle", { pace: "blitz", difficulty: "easy", length: "short" });
  const views = [null, null];
  let stage = 0;
  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("shadow_shuttle privacy smoke test timed out")), 15_000);
    const evaluate = () => {
      const [first, second] = views;
      if (!first || !second || first.version !== second.version) return;
      try {
        if (stage === 0 && first.phase === "playing" && first.game.phase === "marking") {
          stage = 1;
          action(pair.sockets[first.game.infiltratorSeat], views[first.game.infiltratorSeat], { kind: "shadow_mark", pod: 2 });
          return;
        }
        if (stage === 1 && first.game.phase === "memorizing") {
          stage = 2;
          assert.notEqual(first.game.targetPod, null);
          assert.equal(first.game.targetPod, second.game.targetPod, "observer did not receive the memorizing target");
          return;
        }
        if (stage === 2 && first.game.phase === "shuffling") {
          stage = 3;
          const infiltrator = first.game.infiltratorSeat;
          const observer = 1 - infiltrator;
          assert.notEqual(views[infiltrator].game.targetPod, null);
          assert.equal(views[observer].game.targetPod, null, "observer retained the target identity during shuffling");
          return;
        }
        if (stage === 3 && first.game.phase === "guessing") {
          stage = 4;
          const infiltrator = first.game.infiltratorSeat;
          const observer = 1 - infiltrator;
          const correctSlot = first.game.permutation.indexOf(views[infiltrator].game.targetPod);
          action(pair.sockets[observer], views[observer], { kind: "shadow_guess", slot: correctSlot });
          return;
        }
        if (stage === 4 && first.game.phase === "round_result") {
          stage = 5;
          assert.equal(first.game.roundOutcome, "found");
          assert.notEqual(first.game.targetPod, null);
          assert.equal(first.game.targetPod, second.game.targetPod);
          pair.sockets[0].send(JSON.stringify({ type: "resign" }));
          return;
        }
        if (stage === 5 && first.phase === "completed") {
          clearTimeout(timeout);
          resolve({ kind: first.game.result.kind, privacyVerified: true });
        }
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    };
    pair.sockets.forEach((socket, seat) => {
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data));
        if (message.type !== "state_snapshot") return;
        views[seat] = message.room;
        evaluate();
      });
    });
    pair.sockets[0].send(JSON.stringify({ type: "set_ready", ready: true }));
    pair.sockets[1].send(JSON.stringify({ type: "set_ready", ready: true }));
  });
  for (const socket of pair.sockets) socket.close(1000, "smoke_complete");
  return { code: pair.code, result };
}

const shadowShuttle = await runShadowShuttlePrivacy();
assert.equal(shadowShuttle.result.privacyVerified, true);

async function runEchoRelayPrivacy() {
  const pair = await createPair("echo_relay", { pace: "relaxed", difficulty: "easy", length: "short" });
  const views = [null, null];
  let stage = 0;
  let actedVersion = -1;
  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("echo_relay privacy smoke test timed out")), 15_000);
    const evaluate = () => {
      const [first, second] = views;
      if (!first || !second || first.version !== second.version || actedVersion === first.version) return;
      try {
        if (stage === 0 && first.phase === "playing" && first.game.phase === "transmitting") {
          const decoder = first.game.decoderSeat;
          const operator = 1 - decoder;
          assert.ok(Array.isArray(views[decoder].game.sequence), "decoder did not receive the private echo sequence");
          assert.equal(views[operator].game.sequence, null, "operator received the private echo sequence");
          stage = 1;
        }
        if (stage === 1 && first.game.phase === "transmitting") {
          const decoder = first.game.decoderSeat;
          const operator = 1 - decoder;
          const sequence = views[decoder].game.sequence;
          assert.ok(Array.isArray(sequence));
          actedVersion = first.version;
          action(pair.sockets[operator], views[operator], {
            kind: "echo_press",
            tone: sequence[first.game.progress],
          });
          return;
        }
        if (stage === 1 && first.game.phase === "stage_result") {
          stage = 2;
          assert.deepEqual(first.game.sequence, second.game.sequence);
          assert.equal(first.game.completedStages, 1);
          pair.sockets[0].send(JSON.stringify({ type: "resign" }));
          return;
        }
        if (stage === 2 && first.phase === "completed") {
          clearTimeout(timeout);
          resolve({ kind: first.game.result.kind, privacyVerified: true });
        }
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    };
    pair.sockets.forEach((socket, seat) => {
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data));
        if (message.type !== "state_snapshot") return;
        views[seat] = message.room;
        evaluate();
      });
    });
    pair.sockets[0].send(JSON.stringify({ type: "set_ready", ready: true }));
    pair.sockets[1].send(JSON.stringify({ type: "set_ready", ready: true }));
  });
  for (const socket of pair.sockets) socket.close(1000, "smoke_complete");
  return { code: pair.code, result };
}

const echoRelay = await runEchoRelayPrivacy();
assert.equal(echoRelay.result.privacyVerified, true);

const coreRally = await runGame("core_rally", (room, sockets) => {
  if (room.game.result) return room.game.result;
  if (room.phase !== "playing" || room.game.phase === "rally_result") return;
  const receiver = room.game.receiverSeat;
  const currentLane = room.game.paddleLanes[receiver];
  if (room.game.phase === "approach" && currentLane !== room.game.incomingLane) {
    action(sockets[receiver], room, {
      kind: "core_move",
      direction: currentLane < room.game.incomingLane ? 1 : -1,
    });
    return;
  }
  if (room.game.phase === "return_window") {
    assert.equal(currentLane, room.game.incomingLane);
    action(sockets[receiver], room, { kind: "core_return" });
  }
}, 35_000, { pace: "blitz", difficulty: "easy", length: "short" });
assert.deepEqual([coreRally.result.kind, coreRally.result.reason], ["success", "core_rally_complete"]);

async function runSkylineRescuePrivacy() {
  const pair = await createPair("skyline_rescue", { pace: "blitz", difficulty: "easy", length: "short" });
  const views = [null, null];
  let actedVersion = -1;
  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("skyline_rescue privacy smoke test timed out")), 20_000);
    const evaluate = () => {
      const [first, second] = views;
      if (!first || !second || first.version !== second.version || actedVersion === first.version) return;
      try {
        if (first.phase === "completed") {
          clearTimeout(timeout);
          resolve({ result: first.game.result, privacyVerified: true });
          return;
        }
        if (first.phase !== "playing") return;
        if (first.game.phase === "planning") {
          const pump = first.game.pumpSeat;
          const guide = 1 - pump;
          assert.equal(views[pump].game.priorityZone, null, "pump received private rescue zone");
          assert.ok(Number.isInteger(views[pump].game.requiredPressure), "pump lost private pressure intel");
          assert.ok(Number.isInteger(views[guide].game.priorityZone), "guide lost private zone intel");
          assert.equal(views[guide].game.requiredPressure, null, "guide received private pressure intel");
          actedVersion = first.version;
          action(pair.sockets[guide], views[guide], { kind: "rescue_aim", zone: views[guide].game.priorityZone });
          action(pair.sockets[pump], views[pump], { kind: "rescue_pressure", pressure: views[pump].game.requiredPressure });
          return;
        }
        if (first.game.phase === "wave_result") {
          assert.equal(first.game.waveOutcome, "contained");
          assert.equal(first.game.priorityZone, second.game.priorityZone);
          assert.equal(first.game.requiredPressure, second.game.requiredPressure);
        }
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    };
    pair.sockets.forEach((socket, seat) => {
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data));
        if (message.type !== "state_snapshot") return;
        views[seat] = message.room;
        evaluate();
      });
    });
    pair.sockets[0].send(JSON.stringify({ type: "set_ready", ready: true }));
    pair.sockets[1].send(JSON.stringify({ type: "set_ready", ready: true }));
  });
  for (const socket of pair.sockets) socket.close(1000, "smoke_complete");
  return { code: pair.code, result };
}

const skylineRescue = await runSkylineRescuePrivacy();
assert.equal(skylineRescue.result.privacyVerified, true);
assert.deepEqual(
  [skylineRescue.result.result.kind, skylineRescue.result.result.reason],
  ["success", "skyline_rescue_complete"],
);

async function runMeteorDashPrivacy() {
  const pair = await createPair("meteor_dash", { pace: "blitz", difficulty: "easy", length: "short" });
  const views = [null, null];
  let actedVersion = -1;
  let privacySawLocked = false;
  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("meteor_dash privacy smoke test timed out")), 18_000);
    const evaluate = () => {
      const [first, second] = views;
      if (!first || !second || first.version !== second.version) return;
      try {
        if (first.phase === "completed") {
          assert.equal(privacySawLocked, true, "did not observe a private locked meteor response");
          clearTimeout(timeout);
          resolve({ result: first.game.result, privacyVerified: true });
          return;
        }
        if (first.phase !== "playing") return;
        if (first.game.phase === "signal") {
          assert.equal(first.game.targetCell, null, "seat 0 received the meteor target before signal");
          assert.equal(second.game.targetCell, null, "seat 1 received the meteor target before signal");
          return;
        }
        if (first.game.phase === "catching" && actedVersion !== first.version) {
          assert.ok(Number.isInteger(first.game.targetCell), "meteor target was not revealed in catch window");
          assert.equal(first.game.targetCell, second.game.targetCell);
          actedVersion = first.version;
          const wrong = (first.game.targetCell + 1) % first.game.cellCount;
          action(pair.sockets[0], first, { kind: "meteor_catch", cell: first.game.targetCell });
          setTimeout(() => action(pair.sockets[1], second, { kind: "meteor_catch", cell: wrong }), 80);
          return;
        }
        if (first.game.phase === "round_result") {
          assert.ok(first.game.responses[0], "seat 0 response was not revealed");
          assert.ok(first.game.responses[1], "seat 1 response was not revealed");
          assert.deepEqual(first.game.responses, second.game.responses);
          assert.equal(first.game.roundWinner, 0);
        }
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    };
    pair.sockets.forEach((socket, seat) => {
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data));
        if (message.type !== "state_snapshot") return;
        const next = message.room;
        if (
          seat === 1 && next.game.kind === "meteor_dash" && next.game.phase === "catching" &&
          next.game.locked[0] && !next.game.locked[1]
        ) {
          assert.equal(next.game.responses[0], null, "seat 1 received seat 0 reaction before reveal");
          privacySawLocked = true;
        }
        views[seat] = next;
        evaluate();
      });
    });
    pair.sockets[0].send(JSON.stringify({ type: "set_ready", ready: true }));
    pair.sockets[1].send(JSON.stringify({ type: "set_ready", ready: true }));
  });
  for (const socket of pair.sockets) socket.close(1000, "smoke_complete");
  return { code: pair.code, result };
}

const meteorDash = await runMeteorDashPrivacy();
assert.equal(meteorDash.result.privacyVerified, true);
assert.deepEqual(
  [meteorDash.result.result.kind, meteorDash.result.result.reason, meteorDash.result.result.winnerSeat],
  ["win", "meteor_dash_score", 0],
);

function thrusterSolution(game) {
  const delta = game.targetLane - game.shipLane - game.drift;
  assert.ok(Math.abs(delta) <= 2, `unreachable thruster gate: ${JSON.stringify(game)}`);
  return delta >= 0 ? [delta, 0] : [0, -delta];
}

async function runDualThrustersPrivacy() {
  const pair = await createPair("dual_thrusters", { pace: "blitz", difficulty: "easy", length: "short" });
  const views = [null, null];
  let actedVersion = -1;
  let privateLockSeen = false;
  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("dual_thrusters privacy smoke test timed out")), 18_000);
    const evaluate = () => {
      const [first, second] = views;
      if (!first || !second || first.version !== second.version || actedVersion === first.version) return;
      try {
        if (first.phase === "completed") {
          assert.equal(privateLockSeen, true, "did not observe private thruster lock");
          clearTimeout(timeout);
          resolve({ result: first.game.result, privacyVerified: true, clearedGates: first.game.clearedGates });
          return;
        }
        if (first.phase !== "playing") return;
        if (first.game.phase === "planning") {
          const [left, right] = thrusterSolution(first.game);
          assert.deepEqual([first.game.targetLane, first.game.shipLane, first.game.drift], [second.game.targetLane, second.game.shipLane, second.game.drift]);
          actedVersion = first.version;
          action(pair.sockets[0], first, { kind: "thruster_burn", power: left });
          setTimeout(() => action(pair.sockets[1], second, { kind: "thruster_burn", power: right }), 80);
          return;
        }
        if (first.game.phase === "gate_result") {
          assert.equal(first.game.gateOutcome, "gate_cleared");
          assert.deepEqual(first.game.powers, second.game.powers);
        }
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    };
    pair.sockets.forEach((socket, seat) => {
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data));
        if (message.type !== "state_snapshot") return;
        const next = message.room;
        if (
          seat === 1 && next.game.kind === "dual_thrusters" && next.game.phase === "planning" &&
          next.game.locked[0] && !next.game.locked[1]
        ) {
          assert.equal(next.game.powers[0], null, "seat 1 received seat 0 power before reveal");
          privateLockSeen = true;
        }
        views[seat] = next;
        evaluate();
      });
    });
    pair.sockets[0].send(JSON.stringify({ type: "set_ready", ready: true }));
    pair.sockets[1].send(JSON.stringify({ type: "set_ready", ready: true }));
  });
  for (const socket of pair.sockets) socket.close(1000, "smoke_complete");
  return { code: pair.code, result };
}

const dualThrusters = await runDualThrustersPrivacy();
assert.equal(dualThrusters.result.privacyVerified, true);
assert.equal(dualThrusters.result.clearedGates, 5);
assert.deepEqual(
  [dualThrusters.result.result.kind, dualThrusters.result.result.reason],
  ["success", "dual_thrusters_complete"],
);

function solveFogZone(game) {
  assert.ok(Array.isArray(game.reefs), "fog solver needs the sonar chart");
  const directions = [
    ["up", -game.gridSize],
    ["right", 1],
    ["down", game.gridSize],
    ["left", -1],
  ];
  const previous = new Map([[game.ship, null]]);
  const previousDirection = new Map();
  const queue = [game.ship];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const cell = queue[cursor];
    if (cell === game.beacon) break;
    const row = Math.floor(cell / game.gridSize);
    const col = cell % game.gridSize;
    for (const [direction, offset] of directions) {
      if ((direction === "up" && row === 0) || (direction === "right" && col === game.gridSize - 1) ||
        (direction === "down" && row === game.gridSize - 1) || (direction === "left" && col === 0)) continue;
      const next = cell + offset;
      if (game.reefs.includes(next) || previous.has(next)) continue;
      previous.set(next, cell);
      previousDirection.set(next, direction);
      queue.push(next);
    }
  }
  assert.ok(previous.has(game.beacon), "fog chart is not solvable");
  const path = [];
  let cursor = game.beacon;
  while (cursor !== game.ship) {
    path.push(previousDirection.get(cursor));
    cursor = previous.get(cursor);
  }
  return path.reverse();
}

async function runFogSonarPrivacy() {
  const pair = await createPair("fog_sonar", { pace: "blitz", difficulty: "easy", length: "short" });
  const views = [null, null];
  const pingedZones = new Set();
  let actedVersion = -1;
  let privateChartSeen = false;
  let publicPingSeen = false;
  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("fog_sonar privacy smoke test timed out")), 25_000);
    const evaluate = () => {
      const [first, second] = views;
      if (!first || !second || first.version !== second.version || actedVersion === first.version) return;
      try {
        if (first.phase === "completed") {
          assert.equal(privateChartSeen, true, "did not observe private fog chart");
          assert.equal(publicPingSeen, true, "did not observe public sonar ping");
          clearTimeout(timeout);
          resolve({ result: first.game.result, privacyVerified: true, zonesCleared: first.game.zonesCleared });
          return;
        }
        if (first.phase !== "playing" || first.game.phase !== "navigating") return;
        const sonarSeat = first.game.sonarSeat;
        const helmSeat = sonarSeat === 0 ? 1 : 0;
        const sonarRoom = views[sonarSeat];
        const helmRoom = views[helmSeat];
        assert.ok(Array.isArray(sonarRoom.game.reefs), "sonar seat did not receive reef chart");
        assert.equal(helmRoom.game.reefs, null, "helm seat received private reef chart");
        privateChartSeen = true;
        if (sonarRoom.game.lastPing !== null) {
          assert.equal(helmRoom.game.lastPing, sonarRoom.game.lastPing);
          publicPingSeen = true;
        }
        actedVersion = first.version;
        if (!pingedZones.has(first.game.zone)) {
          pingedZones.add(first.game.zone);
          action(pair.sockets[sonarSeat], sonarRoom, { kind: "sonar_ping", direction: "up" });
          return;
        }
        const direction = solveFogZone(sonarRoom.game)[0];
        assert.ok(direction, "fog solver produced an empty path before completion");
        action(pair.sockets[helmSeat], helmRoom, { kind: "fog_steer", direction });
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    };
    pair.sockets.forEach((socket, seat) => {
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data));
        if (message.type !== "state_snapshot") return;
        views[seat] = message.room;
        evaluate();
      });
    });
    pair.sockets[0].send(JSON.stringify({ type: "set_ready", ready: true }));
    pair.sockets[1].send(JSON.stringify({ type: "set_ready", ready: true }));
  });
  for (const socket of pair.sockets) socket.close(1000, "smoke_complete");
  return { code: pair.code, result };
}

const fogSonar = await runFogSonarPrivacy();
assert.equal(fogSonar.result.privacyVerified, true);
assert.equal(fogSonar.result.zonesCleared, 2);
assert.deepEqual(
  [fogSonar.result.result.kind, fogSonar.result.result.reason],
  ["success", "fog_sonar_complete"],
);

async function runStormGridPrivacy() {
  const pair = await createPair("storm_grid", { pace: "blitz", difficulty: "easy", length: "short" });
  const views = [null, null];
  let actedVersion = -1;
  let privateTargetSeen = false;
  let revealedTargetSeen = false;
  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("storm_grid privacy smoke test timed out")), 55_000);
    const evaluate = () => {
      const [first, second] = views;
      if (!first || !second || first.version !== second.version || actedVersion === first.version) return;
      try {
        if (first.phase === "completed") {
          assert.equal(privateTargetSeen, true, "did not observe private storm target");
          assert.equal(revealedTargetSeen, true, "did not observe revealed storm target");
          clearTimeout(timeout);
          resolve({ result: first.game.result, privacyVerified: true, stabilizedWaves: first.game.stabilizedWaves });
          return;
        }
        if (first.phase !== "playing") return;
        const sensorSeat = first.game.sensorSeat;
        const operatorSeat = sensorSeat === 0 ? 1 : 0;
        const sensorRoom = views[sensorSeat];
        const operatorRoom = views[operatorSeat];
        if (first.game.phase === "wave_result") {
          assert.equal(first.game.waveOutcome, "stabilized");
          assert.equal(first.game.targetNode, second.game.targetNode);
          assert.equal(first.game.targetPolarity, second.game.targetPolarity);
          revealedTargetSeen = true;
          return;
        }
        assert.ok(Number.isInteger(sensorRoom.game.targetNode), "sensor did not receive target node");
        assert.ok(sensorRoom.game.targetPolarity === "positive" || sensorRoom.game.targetPolarity === "negative");
        assert.equal(operatorRoom.game.targetNode, null, "operator received private target node");
        assert.equal(operatorRoom.game.targetPolarity, null, "operator received private target polarity");
        privateTargetSeen = true;
        actedVersion = first.version;
        if (first.game.phase === "charging") {
          if (operatorRoom.game.selectorNode !== sensorRoom.game.targetNode) {
            const clockwise = (sensorRoom.game.targetNode - operatorRoom.game.selectorNode + operatorRoom.game.nodeCount) % operatorRoom.game.nodeCount;
            const direction = clockwise <= operatorRoom.game.nodeCount / 2 ? 1 : -1;
            action(pair.sockets[operatorSeat], operatorRoom, { kind: "grid_shift", direction });
            return;
          }
          if (operatorRoom.game.polarity !== sensorRoom.game.targetPolarity) {
            action(pair.sockets[operatorSeat], operatorRoom, { kind: "grid_toggle" });
          }
          return;
        }
        action(pair.sockets[sensorSeat], sensorRoom, { kind: "grid_discharge" });
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    };
    pair.sockets.forEach((socket, seat) => {
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data));
        if (message.type !== "state_snapshot") return;
        views[seat] = message.room;
        evaluate();
      });
    });
    pair.sockets[0].send(JSON.stringify({ type: "set_ready", ready: true }));
    pair.sockets[1].send(JSON.stringify({ type: "set_ready", ready: true }));
  });
  for (const socket of pair.sockets) socket.close(1000, "smoke_complete");
  return { code: pair.code, result };
}

const stormGrid = await runStormGridPrivacy();
assert.equal(stormGrid.result.privacyVerified, true);
assert.equal(stormGrid.result.stabilizedWaves, 4);
assert.deepEqual(
  [stormGrid.result.result.kind, stormGrid.result.result.reason],
  ["success", "storm_grid_complete"],
);

async function runTrajectoryInterceptPrivacy() {
  const pair = await createPair("trajectory_intercept", { pace: "blitz", difficulty: "easy", length: "short" });
  const views = [null, null];
  let actedVersion = -1;
  let privateCursorSeen = false;
  let privateResponseSeen = false;
  let revealedResponsesSeen = false;
  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("trajectory_intercept privacy smoke test timed out")), 35_000);
    const evaluate = () => {
      const [first, second] = views;
      if (!first || !second || first.version !== second.version || actedVersion === first.version) return;
      try {
        if (first.phase === "completed") {
          assert.equal(privateCursorSeen, true, "did not observe private interceptor cursors");
          assert.equal(privateResponseSeen, true, "did not observe a private locked response");
          assert.equal(revealedResponsesSeen, true, "did not observe revealed interceptor responses");
          clearTimeout(timeout);
          resolve({ result: first.game.result, privacyVerified: true, scores: first.game.scores });
          return;
        }
        if (first.phase !== "playing") return;
        if (first.game.phase === "round_result") {
          assert.equal(first.game.roundWinner, 0);
          assert.equal(first.game.roundOutcome, "captured");
          assert.notEqual(first.game.responses[0], null);
          assert.notEqual(first.game.responses[1], null);
          assert.deepEqual(first.game.responses, second.game.responses);
          revealedResponsesSeen = true;
          return;
        }
        if (first.game.phase !== "intercepting") return;
        assert.notEqual(first.game.targetLane, null);
        assert.equal(first.game.targetLane, second.game.targetLane);
        assert.notEqual(views[0].game.cursors[0], null);
        assert.equal(views[0].game.cursors[1], null, "seat 0 received opponent cursor");
        assert.equal(views[1].game.cursors[0], null, "seat 1 received opponent cursor");
        assert.notEqual(views[1].game.cursors[1], null);
        privateCursorSeen = true;

        if (first.game.locked[0] && !first.game.locked[1]) {
          assert.notEqual(views[0].game.responses[0], null, "seat 0 lost its own locked response");
          assert.equal(views[1].game.responses[0], null, "seat 1 received seat 0's response before reveal");
          privateResponseSeen = true;
          actedVersion = first.version;
          action(pair.sockets[1], views[1], { kind: "intercept_capture" });
          return;
        }

        const target = first.game.targetLane;
        const ownCursor = views[0].game.cursors[0];
        if (ownCursor !== target) {
          actedVersion = first.version;
          action(pair.sockets[0], views[0], { kind: "intercept_move", direction: ownCursor < target ? 1 : -1 });
          return;
        }

        const wrongLane = target === 0 ? 1 : 0;
        const opponentCursor = views[1].game.cursors[1];
        if (opponentCursor !== wrongLane) {
          actedVersion = first.version;
          action(pair.sockets[1], views[1], { kind: "intercept_move", direction: opponentCursor < wrongLane ? 1 : -1 });
          return;
        }

        actedVersion = first.version;
        action(pair.sockets[0], views[0], { kind: "intercept_capture" });
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    };
    pair.sockets.forEach((socket, seat) => {
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data));
        if (message.type !== "state_snapshot") return;
        views[seat] = message.room;
        evaluate();
      });
    });
    pair.sockets[0].send(JSON.stringify({ type: "set_ready", ready: true }));
    pair.sockets[1].send(JSON.stringify({ type: "set_ready", ready: true }));
  });
  for (const socket of pair.sockets) socket.close(1000, "smoke_complete");
  return { code: pair.code, result };
}

const trajectoryIntercept = await runTrajectoryInterceptPrivacy();
assert.equal(trajectoryIntercept.result.privacyVerified, true);
assert.deepEqual(trajectoryIntercept.result.scores, [5, 0]);
assert.deepEqual(
  [trajectoryIntercept.result.result.kind, trajectoryIntercept.result.result.reason],
  ["win", "trajectory_intercept_score"],
);

async function runStarTracePrivacy() {
  const pair = await createPair("star_trace", { pace: "blitz", difficulty: "easy", length: "short" });
  const views = [null, null];
  let actedVersion = -1;
  let privateChartSeen = false;
  let revealedChartSeen = false;
  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("star_trace privacy smoke test timed out")), 20_000);
    const evaluate = () => {
      const [first, second] = views;
      if (!first || !second || first.version !== second.version || actedVersion === first.version) return;
      try {
        if (first.phase === "completed") {
          assert.ok(Array.isArray(first.game.checkpoints));
          assert.deepEqual(first.game.checkpoints, second.game.checkpoints);
          revealedChartSeen = true;
          assert.equal(privateChartSeen, true, "did not observe the private star chart");
          clearTimeout(timeout);
          resolve({ result: first.game.result, privacyVerified: true, completedStages: first.game.completedStages });
          return;
        }
        if (first.phase !== "playing") return;
        if (first.game.phase === "stage_result") {
          assert.equal(first.game.lastOutcome, "charted");
          assert.ok(Array.isArray(first.game.checkpoints));
          assert.deepEqual(first.game.checkpoints, second.game.checkpoints);
          revealedChartSeen = true;
          return;
        }
        const guideSeat = first.game.guideSeat;
        const tracerSeat = guideSeat === 0 ? 1 : 0;
        const guideRoom = views[guideSeat];
        const tracerRoom = views[tracerSeat];
        assert.ok(Array.isArray(guideRoom.game.checkpoints), "guide did not receive private star chart");
        assert.equal(tracerRoom.game.checkpoints, null, "tracer received private star chart");
        assert.deepEqual(guideRoom.game.trail, tracerRoom.game.trail);
        privateChartSeen = true;
        const target = guideRoom.game.checkpoints[guideRoom.game.currentTarget];
        const cursor = tracerRoom.game.cursor;
        const direction = cursor.x < target.x ? "right"
          : cursor.x > target.x ? "left"
            : cursor.y < target.y ? "down" : "up";
        actedVersion = first.version;
        action(pair.sockets[tracerSeat], tracerRoom, { kind: "star_trace_move", direction });
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    };
    pair.sockets.forEach((socket, seat) => {
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data));
        if (message.type !== "state_snapshot") return;
        views[seat] = message.room;
        evaluate();
      });
    });
    pair.sockets[0].send(JSON.stringify({ type: "set_ready", ready: true }));
    pair.sockets[1].send(JSON.stringify({ type: "set_ready", ready: true }));
  });
  for (const socket of pair.sockets) socket.close(1000, "smoke_complete");
  return { code: pair.code, result: { ...result, revealedChartSeen } };
}

const starTrace = await runStarTracePrivacy();
assert.equal(starTrace.result.privacyVerified, true);
assert.equal(starTrace.result.revealedChartSeen, true);
assert.equal(starTrace.result.completedStages, 2);
assert.deepEqual([starTrace.result.result.kind, starTrace.result.result.reason], ["success", "star_trace_complete"]);

function solveMagnetCheckpoint(game) {
  const encode = (positions) => `${positions[0]},${positions[1]}`;
  const queue = [{ positions: game.magnetPositions, route: [] }];
  const visited = new Set([encode(game.magnetPositions)]);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    if (current.positions[0] === game.targetPositions[0] && current.positions[1] === game.targetPositions[1]) return current.route;
    for (const seat of [0, 1]) {
      for (const direction of [-1, 1]) {
        const positions = [...current.positions];
        positions[seat] += direction;
        if (positions[seat] < 0 || positions[seat] >= game.laneCount || Math.abs(positions[0] - positions[1]) > game.tensionLimit) continue;
        const key = encode(positions);
        if (visited.has(key)) continue;
        visited.add(key);
        queue.push({ positions, route: [...current.route, { seat, direction }] });
      }
    }
  }
  throw new Error("magnet target is unreachable");
}

async function runMagnetHaul() {
  const pair = await createPair("magnet_haul", { pace: "blitz", difficulty: "hard", length: "short" });
  const views = [null, null];
  let actedVersion = -1;
  let tensionObserved = false;
  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("magnet_haul smoke test timed out")), 20_000);
    const evaluate = () => {
      const [first, second] = views;
      if (!first || !second || first.version !== second.version || actedVersion === first.version) return;
      try {
        assert.deepEqual(first.game.magnetPositions, second.game.magnetPositions);
        assert.deepEqual(first.game.targetPositions, second.game.targetPositions);
        assert.ok(Math.abs(first.game.magnetPositions[0] - first.game.magnetPositions[1]) <= first.game.tensionLimit);
        if (Math.abs(first.game.magnetPositions[0] - first.game.magnetPositions[1]) === first.game.tensionLimit) tensionObserved = true;
        if (first.phase === "completed") {
          clearTimeout(timeout);
          resolve({ result: first.game.result, completedCheckpoints: first.game.completedCheckpoints, tensionObserved });
          return;
        }
        if (first.phase !== "playing" || first.game.phase !== "moving") return;
        const step = solveMagnetCheckpoint(first.game)[0];
        assert.ok(step, "magnet solver produced no move before checkpoint completion");
        actedVersion = first.version;
        action(pair.sockets[step.seat], views[step.seat], { kind: "magnet_move", direction: step.direction });
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    };
    pair.sockets.forEach((socket, seat) => {
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data));
        if (message.type !== "state_snapshot") return;
        views[seat] = message.room;
        evaluate();
      });
    });
    pair.sockets[0].send(JSON.stringify({ type: "set_ready", ready: true }));
    pair.sockets[1].send(JSON.stringify({ type: "set_ready", ready: true }));
  });
  for (const socket of pair.sockets) socket.close(1000, "smoke_complete");
  return { code: pair.code, result };
}

const magnetHaul = await runMagnetHaul();
assert.equal(magnetHaul.result.completedCheckpoints, 4);
assert.equal(magnetHaul.result.tensionObserved, true);
assert.deepEqual([magnetHaul.result.result.kind, magnetHaul.result.result.reason], ["success", "magnet_haul_complete"]);

function solveLumenBridge(game) {
  const encode = (originLane, arcOffset) => `${originLane},${arcOffset}`;
  const queue = [{ originLane: game.originLane, arcOffset: game.arcOffset, route: [] }];
  const visited = new Set([encode(game.originLane, game.arcOffset)]);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    if (current.originLane + current.arcOffset === game.targetLane) return current.route;
    for (const control of ["origin", "arc"]) {
      for (const direction of [-1, 1]) {
        const originLane = current.originLane + (control === "origin" ? direction : 0);
        const arcOffset = current.arcOffset + (control === "arc" ? direction : 0);
        if (
          originLane < 0 || originLane >= game.laneCount ||
          Math.abs(arcOffset) > game.maxArc ||
          originLane + arcOffset < 0 || originLane + arcOffset >= game.laneCount
        ) continue;
        const key = encode(originLane, arcOffset);
        if (visited.has(key)) continue;
        visited.add(key);
        const seat = control === "origin" ? game.originSeat : game.originSeat === 0 ? 1 : 0;
        queue.push({ originLane, arcOffset, route: [...current.route, { seat, direction }] });
      }
    }
  }
  throw new Error("lumen bridge target is unreachable");
}

async function runLumenBridge() {
  const pair = await createPair("lumen_bridge", { pace: "blitz", difficulty: "hard", length: "short" });
  const views = [null, null];
  const originRoles = new Set();
  let actedVersion = -1;
  let concurrentLocksVerified = false;
  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("lumen_bridge smoke test timed out")), 22_000);
    const evaluate = () => {
      const [first, second] = views;
      if (!first || !second || first.version !== second.version || actedVersion === first.version) return;
      try {
        assert.deepEqual(first.game, second.game, "lumen bridge public state diverged between seats");
        originRoles.add(first.game.originSeat);
        if (first.game.phase === "stage_result" && first.game.confirmations.every(Boolean)) concurrentLocksVerified = true;
        if (first.phase === "completed") {
          clearTimeout(timeout);
          resolve({
            result: first.game.result,
            completedStages: first.game.completedStages,
            concurrentLocksVerified,
            rolesSwapped: originRoles.size === 2,
          });
          return;
        }
        if (first.phase !== "playing" || first.game.phase === "stage_result") return;
        actedVersion = first.version;
        if (first.game.phase === "resonance") {
          action(pair.sockets[0], views[0], { kind: "bridge_lock" });
          action(pair.sockets[1], views[1], { kind: "bridge_lock" });
          return;
        }
        const step = solveLumenBridge(first.game)[0];
        assert.ok(step, "lumen bridge solver produced no adjustment before alignment");
        action(pair.sockets[step.seat], views[step.seat], { kind: "bridge_adjust", direction: step.direction });
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    };
    pair.sockets.forEach((socket, seat) => {
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data));
        if (message.type !== "state_snapshot") return;
        views[seat] = message.room;
        evaluate();
      });
    });
    pair.sockets[0].send(JSON.stringify({ type: "set_ready", ready: true }));
    pair.sockets[1].send(JSON.stringify({ type: "set_ready", ready: true }));
  });
  for (const socket of pair.sockets) socket.close(1000, "smoke_complete");
  return { code: pair.code, result };
}

const lumenBridge = await runLumenBridge();
assert.equal(lumenBridge.result.completedStages, 4);
assert.equal(lumenBridge.result.concurrentLocksVerified, true);
assert.equal(lumenBridge.result.rolesSwapped, true);
assert.deepEqual([lumenBridge.result.result.kind, lumenBridge.result.result.reason], ["success", "lumen_bridge_complete"]);

const neonMoveForObstacle = {
  low_barrier: "jump",
  high_arch: "slide",
  right_wall: "dodge_left",
  left_wall: "dodge_right",
  pulse_field: "brake",
};

async function runNeonDashPrivacy() {
  const pair = await createPair("neon_dash", { pace: "blitz", difficulty: "hard", length: "short" });
  const views = [null, null];
  let actedRound = 0;
  let privacyVerified = false;
  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("neon_dash privacy smoke test timed out")), 24_000);
    const evaluate = () => {
      const [first, second] = views;
      if (!first || !second || first.version !== second.version) return;
      try {
        assert.equal(first.game.obstacle, second.game.obstacle);
        assert.deepEqual(first.game.locked, second.game.locked);
        assert.deepEqual(first.game.scores, second.game.scores);
        assert.deepEqual(first.game.lives, second.game.lives);
        if (first.phase === "completed") {
          clearTimeout(timeout);
          resolve({ result: first.game.result, privacyVerified, bestCombos: first.game.bestCombos });
          return;
        }
        if (first.phase !== "playing") return;
        if (first.game.phase === "countdown") {
          assert.equal(first.game.obstacle, null, "neon obstacle leaked before signal");
          return;
        }
        if (first.game.phase === "round_result") {
          assert.deepEqual(first.game.responses, second.game.responses, "neon responses were not revealed together");
          return;
        }
        if (first.game.locked[0] && !first.game.locked[1]) {
          assert.ok(first.game.responses[0], "runner did not receive its own sealed action");
          assert.equal(second.game.responses[0], null, "opponent received the sealed neon action");
          privacyVerified = true;
          return;
        }
        if (actedRound === first.game.round) return;
        actedRound = first.game.round;
        const move = neonMoveForObstacle[first.game.obstacle];
        assert.ok(move, "neon obstacle has no mapped action");
        action(pair.sockets[0], first, { kind: "neon_dodge", move });
        setTimeout(() => action(pair.sockets[1], second, { kind: "neon_dodge", move }), 90);
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    };
    pair.sockets.forEach((socket, seat) => {
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data));
        if (message.type !== "state_snapshot") return;
        views[seat] = message.room;
        evaluate();
      });
    });
    pair.sockets[0].send(JSON.stringify({ type: "set_ready", ready: true }));
    pair.sockets[1].send(JSON.stringify({ type: "set_ready", ready: true }));
  });
  for (const socket of pair.sockets) socket.close(1000, "smoke_complete");
  return { code: pair.code, result };
}

const neonDash = await runNeonDashPrivacy();
assert.equal(neonDash.result.privacyVerified, true);
assert.deepEqual(neonDash.result.bestCombos, [5, 5]);
assert.deepEqual([neonDash.result.result.kind, neonDash.result.result.reason, neonDash.result.result.winnerSeat], ["win", "neon_dash_score", 0]);

async function runSignalBluffPrivacy() {
  const pair = await createPair("signal_bluff", { pace: "blitz", difficulty: "easy", length: "short" });
  const views = [null, null];
  const actedVersions = new Set();
  let truthPrivacyVerified = false;
  let scanPrivacyVerified = false;
  let resultRevealVerified = false;
  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("signal_bluff privacy smoke test timed out")), 22_000);
    const evaluate = () => {
      const [first, second] = views;
      if (!first || !second || first.version !== second.version) return;
      try {
        assert.deepEqual(first.game.scores, second.game.scores);
        assert.equal(first.game.senderSeat, second.game.senderSeat);
        assert.equal(first.game.claimSignal, second.game.claimSignal);
        if (first.phase === "completed") {
          clearTimeout(timeout);
          resolve({
            result: first.game.result,
            scores: first.game.scores,
            truthPrivacyVerified,
            scanPrivacyVerified,
            resultRevealVerified,
          });
          return;
        }
        if (first.phase !== "playing") return;
        const sender = first.game.senderSeat;
        const judge = sender === 0 ? 1 : 0;
        const senderView = views[sender];
        const judgeView = views[judge];

        if (first.game.phase === "round_result") {
          assert.ok(first.game.truthSignal, "signal truth missing from round reveal");
          assert.equal(first.game.truthSignal, second.game.truthSignal, "signal truth not revealed to both seats");
          assert.equal(first.game.scanHint, second.game.scanHint, "scan result not public after resolution");
          resultRevealVerified = true;
          return;
        }

        assert.ok(senderView.game.truthSignal, "sender did not receive private truth");
        assert.equal(judgeView.game.truthSignal, null, "judge received private signal truth");
        truthPrivacyVerified = true;

        if (first.game.phase === "claiming") {
          assert.equal(first.game.claimSignal, null);
          assert.equal(first.game.scanHint, null);
          assert.equal(second.game.scanHint, null);
          if (actedVersions.has(first.version)) return;
          actedVersions.add(first.version);
          action(pair.sockets[sender], senderView, { kind: "signal_claim", signal: senderView.game.truthSignal });
          return;
        }

        assert.ok(first.game.claimSignal, "public signal claim missing during judgment");
        assert.equal(first.game.claimSignal, second.game.claimSignal, "signal claim not public to both seats");
        if (first.game.round === 1 && !first.game.scanned) {
          assert.equal(senderView.game.scanHint, null);
          assert.equal(judgeView.game.scanHint, null);
          if (actedVersions.has(first.version)) return;
          actedVersions.add(first.version);
          action(pair.sockets[judge], judgeView, { kind: "signal_scan" });
          return;
        }
        if (first.game.scanned) {
          assert.equal(senderView.game.scanHint, null, "sender received judge-only scan hint");
          assert.ok(judgeView.game.scanHint, "judge did not receive private scan hint");
          scanPrivacyVerified = true;
        } else {
          assert.equal(senderView.game.scanHint, null);
          assert.equal(judgeView.game.scanHint, null);
        }
        if (actedVersions.has(first.version)) return;
        actedVersions.add(first.version);
        const verdict = sender === 0 ? "challenge" : "trust";
        action(pair.sockets[judge], judgeView, { kind: "signal_judge", verdict });
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    };
    pair.sockets.forEach((socket, seat) => {
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data));
        if (message.type !== "state_snapshot") return;
        views[seat] = message.room;
        evaluate();
      });
    });
    pair.sockets[0].send(JSON.stringify({ type: "set_ready", ready: true }));
    pair.sockets[1].send(JSON.stringify({ type: "set_ready", ready: true }));
  });
  for (const socket of pair.sockets) socket.close(1000, "smoke_complete");
  return { code: pair.code, result };
}

const signalBluff = await runSignalBluffPrivacy();
assert.equal(signalBluff.result.truthPrivacyVerified, true);
assert.equal(signalBluff.result.scanPrivacyVerified, true);
assert.equal(signalBluff.result.resultRevealVerified, true);
assert.deepEqual(signalBluff.result.scores, [3, 0]);
assert.deepEqual(
  [signalBluff.result.result.kind, signalBluff.result.result.reason, signalBluff.result.result.winnerSeat],
  ["win", "signal_bluff_score", 0],
);

async function runPrismHeistPrivacy() {
  const pair = await createPair("prism_heist", { pace: "blitz", difficulty: "hard", length: "short" });
  const views = [null, null];
  const actedVersions = new Set();
  let privacyVerified = false;
  let revealVerified = false;
  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("prism_heist privacy smoke test timed out")), 45_000);
    const evaluate = () => {
      const [first, second] = views;
      if (!first || !second || first.version !== second.version) return;
      try {
        assert.equal(first.game.runnerLane, second.game.runnerLane);
        assert.equal(first.game.integrity, second.game.integrity);
        assert.equal(first.game.score, second.game.score);
        if (first.phase === "completed") {
          clearTimeout(timeout);
          resolve({
            result: first.game.result,
            cleanBreaches: first.game.cleanBreaches,
            totalSyncs: first.game.totalSyncs,
            integrity: first.game.integrity,
            privacyVerified,
            revealVerified,
          });
          return;
        }
        if (first.phase !== "playing") return;
        const scout = first.game.scoutSeat;
        const runner = scout === 0 ? 1 : 0;
        const scoutView = views[scout];
        const runnerView = views[runner];
        if (first.game.phase === "corridor_result") {
          assert.equal(first.game.safeLane, second.game.safeLane, "safe heist lane not revealed to both seats");
          assert.equal(first.game.lastOutcome, "clean_breach");
          revealVerified = true;
          return;
        }
        assert.ok(Number.isInteger(scoutView.game.safeLane), "scout did not receive private safe lane");
        assert.equal(runnerView.game.safeLane, null, "runner received the private safe lane");
        privacyVerified = true;
        if (first.game.phase === "approach") {
          if (first.game.runnerLane === scoutView.game.safeLane || actedVersions.has(first.version)) return;
          actedVersions.add(first.version);
          const direction = scoutView.game.safeLane > first.game.runnerLane ? 1 : -1;
          action(pair.sockets[runner], runnerView, { kind: "heist_move", direction });
          return;
        }
        if (first.game.bypassLocked || first.game.dashLocked || actedVersions.has(first.version)) return;
        actedVersions.add(first.version);
        action(pair.sockets[scout], scoutView, { kind: "heist_bypass" });
        action(pair.sockets[runner], runnerView, { kind: "heist_dash" });
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    };
    pair.sockets.forEach((socket, seat) => {
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data));
        if (message.type !== "state_snapshot") return;
        views[seat] = message.room;
        evaluate();
      });
    });
    pair.sockets[0].send(JSON.stringify({ type: "set_ready", ready: true }));
    pair.sockets[1].send(JSON.stringify({ type: "set_ready", ready: true }));
  });
  for (const socket of pair.sockets) socket.close(1000, "smoke_complete");
  return { code: pair.code, result };
}

const prismHeist = await runPrismHeistPrivacy();
assert.equal(prismHeist.result.privacyVerified, true);
assert.equal(prismHeist.result.revealVerified, true);
assert.deepEqual([prismHeist.result.cleanBreaches, prismHeist.result.totalSyncs, prismHeist.result.integrity], [4, 4, 2]);
assert.deepEqual(
  [prismHeist.result.result.kind, prismHeist.result.result.reason],
  ["success", "prism_heist_complete"],
);

const novaVolleyActedVersions = new Set();
const novaVolley = await runGame("nova_volley", (room, sockets) => {
  if (room.game.result) return room.game;
  if (room.phase !== "playing" || novaVolleyActedVersions.has(room.version)) return;
  const game = room.game;
  const receiver = game.receiverSeat;
  if (game.phase === "point_result") return;
  if (game.phase === "approach") {
    const paddle = game.paddleLanes[receiver];
    if (receiver === 0 && paddle !== game.incomingLane) {
      novaVolleyActedVersions.add(room.version);
      action(sockets[0], room, { kind: "volley_move", direction: game.incomingLane > paddle ? 1 : -1 });
    } else if (receiver === 1 && paddle === game.incomingLane) {
      novaVolleyActedVersions.add(room.version);
      action(sockets[1], room, { kind: "volley_move", direction: paddle === 0 ? 1 : -1 });
    }
    return;
  }
  novaVolleyActedVersions.add(room.version);
  if (receiver === 0) {
    assert.equal(game.paddleLanes[0], game.incomingLane, "automated volley receiver was not aligned");
    const targetLane = game.paddleLanes[1] === 0 ? 1 : 0;
    action(sockets[0], room, { kind: "volley_strike", lane: targetLane });
  } else {
    assert.notEqual(game.paddleLanes[1], game.incomingLane, "automated volley loser unexpectedly aligned");
    action(sockets[1], room, { kind: "volley_strike", lane: 0 });
  }
}, 30_000, { pace: "blitz", difficulty: "easy", length: "short" });
assert.deepEqual(
  [novaVolley.result.result.kind, novaVolley.result.result.reason, novaVolley.result.result.winnerSeat],
  ["win", "nova_volley_score", 0],
);
assert.equal(novaVolley.result.scores[0], 3);

const pulsePassActedVersions = new Set();
let pulsePassHiddenThresholdVerified = false;
let pulsePassRevealVerified = false;
const pulsePass = await runGame("pulse_pass", (room, sockets) => {
  if (room.game.phase === "handling") {
    assert.equal(room.game.burstAt, null, "hidden pulse burst threshold leaked during handling");
    pulsePassHiddenThresholdVerified = true;
  } else {
    assert.ok(Number.isInteger(room.game.burstAt), "pulse burst threshold was not revealed after the round");
    pulsePassRevealVerified = true;
  }
  if (room.game.result) return room.game;
  if (room.phase !== "playing" || room.game.phase !== "handling" || pulsePassActedVersions.has(room.version)) return;
  pulsePassActedVersions.add(room.version);
  action(sockets[room.game.holderSeat], room, { kind: "pulse_charge", power: 3 });
}, 25_000, { pace: "blitz", difficulty: "hard", length: "short" });
assert.equal(pulsePassHiddenThresholdVerified, true);
assert.equal(pulsePassRevealVerified, true);
assert.deepEqual([pulsePass.result.result.kind, pulsePass.result.result.reason], ["win", "pulse_pass_score"]);
assert.ok(pulsePass.result.totalPasses >= 6);

async function runDropRescuePrivacy() {
  const pair = await createPair("drop_rescue", { pace: "blitz", difficulty: "standard", length: "short" });
  const views = [null, null];
  const actedVersions = new Set();
  const concurrentLocksSent = new Set();
  let privacyVerified = false;
  let revealVerified = false;
  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("drop rescue smoke test timed out")), 30_000);
    const evaluate = () => {
      const [view0, view1] = views;
      if (!view0 || !view1 || view0.version !== view1.version || view0.phase !== "playing" && view0.phase !== "completed") return;
      const room = view0;
      const game = room.game;
      if (game.kind !== "drop_rescue") return;
      try {
        if (game.phase === "landing_result") {
          assert.ok(Number.isInteger(view0.game.targetLane) && Number.isInteger(view1.game.targetLane), "landing lane was not revealed");
          assert.ok(Number.isInteger(view0.game.descentSpeed) && Number.isInteger(view1.game.descentSpeed), "velocity was not revealed");
          revealVerified = true;
          if (game.result) {
            clearTimeout(timeout);
            resolve({ ...game, privacyVerified, revealVerified });
          }
          return;
        }
        const pilot = game.pilotSeat;
        const engineer = pilot === 0 ? 1 : 0;
        const pilotRoom = views[pilot];
        const engineerRoom = views[engineer];
        assert.ok(Number.isInteger(pilotRoom.game.targetLane) && Number.isInteger(pilotRoom.game.wind), "pilot telemetry missing");
        assert.equal(pilotRoom.game.descentSpeed, null, "velocity leaked to pilot");
        assert.equal(pilotRoom.game.targetSpeed, null, "safe speed leaked to pilot");
        assert.equal(engineerRoom.game.targetLane, null, "landing lane leaked to engineer");
        assert.equal(engineerRoom.game.wind, null, "wind leaked to engineer");
        assert.ok(Number.isInteger(engineerRoom.game.descentSpeed) && Number.isInteger(engineerRoom.game.targetSpeed), "engineer telemetry missing");
        privacyVerified = true;
        if (actedVersions.has(room.version)) return;
        actedVersions.add(room.version);
        const desiredLane = pilotRoom.game.targetLane - pilotRoom.game.wind;
        const desiredBrake = engineerRoom.game.descentSpeed - engineerRoom.game.targetSpeed;
        if (game.podLane !== desiredLane) {
          action(pair.sockets[pilot], pilotRoom, { kind: "drop_move", direction: game.podLane < desiredLane ? 1 : -1 });
        } else if (game.brakePower !== desiredBrake) {
          action(pair.sockets[engineer], engineerRoom, { kind: "drop_brake", direction: game.brakePower < desiredBrake ? 1 : -1 });
        } else if (!game.locked[pilot] && !game.locked[engineer] && !concurrentLocksSent.has(game.landing)) {
          concurrentLocksSent.add(game.landing);
          action(pair.sockets[pilot], pilotRoom, { kind: "drop_lock" });
          action(pair.sockets[engineer], engineerRoom, { kind: "drop_lock" });
        } else if (!concurrentLocksSent.has(game.landing) && !game.locked[pilot]) {
          action(pair.sockets[pilot], pilotRoom, { kind: "drop_lock" });
        } else if (!concurrentLocksSent.has(game.landing) && !game.locked[engineer]) {
          action(pair.sockets[engineer], engineerRoom, { kind: "drop_lock" });
        }
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    };
    pair.sockets.forEach((socket, seat) => {
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data));
        if (message.type !== "state_snapshot") return;
        views[seat] = message.room;
        evaluate();
      });
    });
    pair.sockets[0].send(JSON.stringify({ type: "set_ready", ready: true }));
    pair.sockets[1].send(JSON.stringify({ type: "set_ready", ready: true }));
  });
  for (const socket of pair.sockets) socket.close(1000, "smoke_complete");
  return { code: pair.code, result };
}

const dropRescue = await runDropRescuePrivacy();
assert.equal(dropRescue.result.privacyVerified, true);
assert.equal(dropRescue.result.revealVerified, true);
assert.deepEqual([dropRescue.result.result.kind, dropRescue.result.result.reason], ["success", "drop_rescue_complete"]);
assert.equal(dropRescue.result.softLandings, 4);

async function runReconnectRecovery() {
  const pair = await createPair("gomoku", { pace: "relaxed", difficulty: "standard", length: "standard" });
  const playingPromise = waitForRoom(pair.sockets[0], (room) => room.phase === "playing", "reconnect game start");
  pair.sockets[0].send(JSON.stringify({ type: "set_ready", ready: true }));
  pair.sockets[1].send(JSON.stringify({ type: "set_ready", ready: true }));
  const playing = await playingPromise;
  const originalDeadline = playing.game.turnDeadline;

  const gracePromise = waitForRoom(pair.sockets[1], (room) => room.phase === "reconnect_grace", "reconnect grace");
  pair.sockets[0].close(4001, "simulate_network_loss");
  const grace = await gracePromise;
  assert.equal(grace.players[0].connected, false);
  assert.ok(grace.reconnectDeadline > Date.now(), "reconnect deadline was not exposed to clients");

  const resumedSocket = await openSocket(pair.code, pair.sessions[0]);
  const resumedPromise = waitForRoom(resumedSocket, (room) => room.phase === "playing", "reconnect resume");
  resumedSocket.send(JSON.stringify({ type: "request_snapshot" }));
  const resumed = await resumedPromise;
  assert.equal(resumed.players[0].connected, true);
  assert.equal(resumed.reconnectDeadline, null);
  assert.ok(resumed.game.turnDeadline >= originalDeadline, "turn clock did not resume from its paused remainder");
  assert.ok(resumed.game.turnDeadline > Date.now(), "resumed turn deadline is not in the future");

  resumedSocket.close(1000, "smoke_complete");
  pair.sockets[1].close(1000, "smoke_complete");
  return { code: pair.code, recovered: true };
}

async function runReadyLobbyReconnect() {
  const pair = await createPair("gomoku", { pace: "relaxed", difficulty: "standard", length: "standard" });

  const firstReadyPromise = waitForRoom(
    pair.sockets[0],
    (room) => room.phase === "ready" && room.players[1].ready,
    "ready lobby first player ready",
  );
  pair.sockets[1].send(JSON.stringify({ type: "set_ready", ready: true }));
  await firstReadyPromise;

  const disconnectedPromise = waitForRoom(
    pair.sockets[0],
    (room) => room.phase === "ready" && room.players[1].connected === false,
    "ready lobby disconnect",
  );
  pair.sockets[1].close(4001, "simulate_lobby_background");
  await disconnectedPromise;

  const bothReadyPromise = waitForRoom(
    pair.sockets[0],
    (room) => room.phase === "ready" && room.players.every((player) => player?.ready),
    "ready lobby both ready while peer offline",
  );
  pair.sockets[0].send(JSON.stringify({ type: "set_ready", ready: true }));
  await bothReadyPromise;

  const resumedSocket = await openSocket(pair.code, pair.sessions[1]);
  const playingPromise = waitForRoom(
    resumedSocket,
    (room) => room.phase === "playing" && room.players.every((player) => player?.connected),
    "ready lobby reconnect auto start",
  );
  resumedSocket.send(JSON.stringify({ type: "request_snapshot" }));
  const playing = await playingPromise;
  assert.equal(playing.round, 1);
  assert.equal(playing.game.kind, "gomoku");

  pair.sockets[0].close(1000, "smoke_complete");
  resumedSocket.close(1000, "smoke_complete");
  return { code: pair.code, autoStarted: true };
}

async function runProtocolResilience() {
  const pair = await createPair("gomoku", { pace: "relaxed", difficulty: "standard", length: "standard" });
  const playingPromise = waitForRoom(pair.sockets[0], (room) => room.phase === "playing", "resilience game start");
  pair.sockets[0].send(JSON.stringify({ type: "set_ready", ready: true }));
  pair.sockets[1].send(JSON.stringify({ type: "set_ready", ready: true }));
  const playing = await playingPromise;
  const seat = playing.game.currentSeat;
  const actionId = randomUUID();
  const acknowledgementPromise = waitForMessage(
    pair.sockets[seat],
    (message) => message.type === "action_acknowledged" && message.actionId === actionId,
    "action acknowledgement",
  );
  const duplicateSnapshots = [];
  const duplicatePromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("duplicate action handling timed out")), 8_000);
    function onMessage(event) {
      const message = JSON.parse(String(event.data));
      if (message.type !== "state_snapshot" || message.room.version !== playing.version + 1) return;
      duplicateSnapshots.push(message.room);
      if (duplicateSnapshots.length < 2) return;
      clearTimeout(timeout);
      pair.sockets[seat].removeEventListener("message", onMessage);
      resolve(message.room);
    }
    pair.sockets[seat].addEventListener("message", onMessage);
  });
  const duplicateAction = JSON.stringify({
    type: "game_action",
    actionId,
    expectedVersion: playing.version,
    payload: { kind: "place_stone", row: 7, col: 7 },
  });
  pair.sockets[seat].send(duplicateAction);
  pair.sockets[seat].send(duplicateAction);
  const [afterDuplicate, acknowledgement] = await Promise.all([duplicatePromise, acknowledgementPromise]);
  assert.equal(afterDuplicate.game.board.filter((cell) => cell !== 0).length, 1);
  assert.equal(acknowledgement.version, afterDuplicate.version);

  const rejectedPromise = waitForMessage(
    pair.sockets[seat],
    (message) => message.type === "action_rejected" && message.actionId === "stale-test-action",
    "stale action rejection",
  );
  pair.sockets[seat].send(JSON.stringify({
    type: "game_action",
    actionId: "stale-test-action",
    expectedVersion: playing.version,
    payload: { kind: "place_stone", row: 7, col: 8 },
  }));
  const rejected = await rejectedPromise;
  assert.equal(rejected.reason, "stale_version");
  assert.equal(rejected.currentVersion, afterDuplicate.version);

  for (const socket of pair.sockets) socket.close(1000, "smoke_complete");
  return { code: pair.code, duplicateSuppressed: true, staleRejected: true };
}

async function runPreviousProtocolCompatibility() {
  const pair = await createPair("gomoku", { pace: "relaxed", difficulty: "standard", length: "short" });
  const previousProtocol = PROTOCOL_VERSION - 1;
  const compatibleSocket = await openSocket(pair.code, pair.sessions[0], previousProtocol);
  assert.equal(compatibleSocket.protocol, `duo-v${previousProtocol}`);
  const snapshotPromise = waitForRoom(
    compatibleSocket,
    (room) => room.code === pair.code && room.players[0].connected,
    "previous protocol compatibility",
  );
  compatibleSocket.send(JSON.stringify({ type: "request_snapshot" }));
  await snapshotPromise;
  compatibleSocket.close(1000, "smoke_complete");
  for (const socket of pair.sockets) socket.close(1000, "smoke_complete");
  return { code: pair.code, protocol: previousProtocol };
}

const reconnectRecovery = await runReconnectRecovery();
const readyLobbyReconnect = await runReadyLobbyReconnect();
const protocolResilience = await runProtocolResilience();
const previousProtocolCompatibility = await runPreviousProtocolCompatibility();

console.log(JSON.stringify({
  ok: true,
  release: health.release,
  games: {
    gomoku: gomoku.code,
    reversi: reversi.code,
    split_maze: maze.code,
    sync_tap: sync.code,
    cover_hunt: coverHunt.code,
    starship_defuse: starshipDefuse.code,
    quantum_duel: quantumDuel.code,
    starway_escort: starwayEscort.code,
    orbital_repair: orbitalRepair.code,
    rhythm_gravity: rhythmGravity.code,
    shadow_shuttle: shadowShuttle.code,
    echo_relay: echoRelay.code,
    core_rally: coreRally.code,
    skyline_rescue: skylineRescue.code,
    meteor_dash: meteorDash.code,
    dual_thrusters: dualThrusters.code,
    fog_sonar: fogSonar.code,
    storm_grid: stormGrid.code,
    trajectory_intercept: trajectoryIntercept.code,
    star_trace: starTrace.code,
    magnet_haul: magnetHaul.code,
    lumen_bridge: lumenBridge.code,
    neon_dash: neonDash.code,
    signal_bluff: signalBluff.code,
    prism_heist: prismHeist.code,
    nova_volley: novaVolley.code,
    pulse_pass: pulsePass.code,
    drop_rescue: dropRescue.code,
  },
  resilience: {
    reconnect: reconnectRecovery.code,
    readyLobbyReconnect: readyLobbyReconnect.code,
    duplicateAndStale: protocolResilience.code,
    previousProtocol: previousProtocolCompatibility,
  },
}));
