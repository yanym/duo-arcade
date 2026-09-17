import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { CLIENT_PROTOCOL_HEADER, PROTOCOL_VERSION } from "../packages/protocol/src/index.ts";
import { PLAYABLE_GAME_IDS } from "../packages/game-core/src/catalog.ts";
import { getReversiLegalMoves } from "../packages/game-core/src/reversi.ts";

const apiBase = process.env.DUO_API_URL ?? "http://localhost:8787";
const REQUEST_TIMEOUT_MS = 10_000;
const openSockets = new Set();

const healthResponse = await fetch(`${apiBase}/health`, {
  signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
});
const health = await healthResponse.json();
assert.equal(healthResponse.ok, true, JSON.stringify(health));
assert.equal(health.ok, true);
assert.equal(health.protocol, PROTOCOL_VERSION);
assert.equal(health.games, PLAYABLE_GAME_IDS.length);
assert.deepEqual(health.gameIds, [...PLAYABLE_GAME_IDS]);
assert.equal(health.release, "1.0");
assert.equal(healthResponse.headers.get("cache-control"), "no-store");
assert.equal(healthResponse.headers.get("x-content-type-options"), "nosniff");

async function json(path, init, attempt = 0) {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { "content-type": "application/json", [CLIENT_PROTOCOL_HEADER]: String(PROTOCOL_VERSION), ...init?.headers },
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
    openSockets.add(socket);
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error("WebSocket open timed out"));
    }, 5_000);
    socket.addEventListener("open", () => {
      clearTimeout(timeout);
      resolve(socket);
    }, { once: true });
    socket.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error("WebSocket failed to open"));
    }, { once: true });
  });
}

async function createPair(gameId, options) {
  assert.ok(PLAYABLE_GAME_IDS.includes(gameId), `cannot create a retired game: ${gameId}`);
  console.log(`Testing two-client ${gameId}`);
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
  const views = [null, null];
  let lastVersion = -1;
  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${gameId} smoke test timed out: ${JSON.stringify(views.map((room) => room && ({ version: room.version, phase: room.phase, gamePhase: room.game.phase, round: room.game.round })))}`)), timeoutMs);
    function onMessage(event, seat) {
      const message = JSON.parse(String(event.data));
      if (message.type === "action_rejected" || message.type === "error") {
        clearTimeout(timeout);
        reject(new Error(`${gameId}: seat ${seat} ${message.type}: ${message.reason ?? message.code}`));
        return;
      }
      if (message.type !== "state_snapshot") return;
      views[seat] = message.room;
      if (!views[0] || !views[1] || views[0].version !== views[1].version || message.room.version === lastVersion) return;
      lastVersion = message.room.version;
      try {
        assert.deepEqual(views[0].game, views[1].game, `${gameId}: public board/result differs between players`);
        if ("seed" in message.room.game) assert.equal(message.room.game.seed, 0, `${gameId}: deterministic seed leaked`);
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
    pair.sockets.forEach((socket, seat) => {
      socket.addEventListener("message", (event) => onMessage(event, seat));
      socket.addEventListener("close", (event) => {
        clearTimeout(timeout);
        reject(new Error(`${gameId}: seat ${seat} socket closed during the scenario (${event.code})`));
      }, { once: true });
    });
    pair.sockets[0].send(JSON.stringify({ type: "set_ready", ready: true }));
    pair.sockets[1].send(JSON.stringify({ type: "set_ready", ready: true }));
  });
  for (const socket of pair.sockets) socket.close(1000, "smoke_complete");
  return { code: pair.code, result };
}

try {
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
  let reversiPasses = 0;
  const reversi = await runGame("reversi", (room, sockets) => {
    if (room.game.result) {
      assert.equal(getReversiLegalMoves(room.game, 0).length, 0);
      assert.equal(getReversiLegalMoves(room.game, 1).length, 0);
      return { ...room.game.result, moves: room.game.moveCount, passes: reversiPasses };
    }
    if (room.phase !== "playing") return;
    if (!reversiMoved) {
      reversiMoved = true;
      action(sockets[room.game.currentSeat], room, { kind: "place_disc", row: 2, col: 3 });
      return;
    }
    if (room.game.moveCount === 1) assert.equal(room.game.board[27], room.game.board[19]);
    if (room.game.passedSeat !== null) {
      reversiPasses++;
      assert.equal(getReversiLegalMoves(room.game, room.game.passedSeat).length, 0);
      assert.notEqual(room.game.currentSeat, room.game.passedSeat);
    }
    const moves = getReversiLegalMoves(room.game, room.game.currentSeat);
    assert.ok(moves.length, "current player must be able to move after an automatic pass");
    action(sockets[room.game.currentSeat], room, { kind: "place_disc", row: Math.floor(moves[0] / 8), col: moves[0] % 8 });
  }, 30_000);
  assert.ok(["disc_majority", "board_tied"].includes(reversi.result.reason));
  assert.ok(reversi.result.moves > 1, "Reversi must finish naturally, not resign after its opening");
  assert.ok(reversi.result.passes > 0, "the deterministic match must exercise automatic passes");

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

  async function runMeteorDashPrivacy() {
    const pair = await createPair("meteor_dash", { pace: "blitz", difficulty: "easy", length: "short" });
    const views = [null, null];
    let actedRound = 0;
    let privacySawLocked = false;
    const trace = [];
    const record = (entry) => {
      trace.push({ at: Date.now(), ...entry });
      if (trace.length > 40) trace.shift();
    };
    const result = await new Promise((resolve, reject) => {
      const fail = (reason) => {
        clearTimeout(timeout);
        reject(new Error(`meteor_dash: ${reason}; ${JSON.stringify({
          code: pair.code, actedRound, privacySawLocked,
          sockets: pair.sockets.map((socket) => socket.readyState), trace,
        })}`));
      };
      const timeout = setTimeout(() => fail("privacy smoke test timed out"), 18_000);
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
          if (first.game.phase === "catching" && actedRound !== first.game.round) {
            assert.ok(Number.isInteger(first.game.targetCell), "meteor target was not revealed in catch window");
            assert.equal(first.game.targetCell, second.game.targetCell);
            actedRound = first.game.round;
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
        socket.addEventListener("close", (event) => fail(`seat ${seat} closed (${event.code})`), { once: true });
        socket.addEventListener("message", (event) => {
          const message = JSON.parse(String(event.data));
          if (message.type === "action_rejected" || message.type === "error") {
            fail(`seat ${seat} ${message.type}: ${message.reason ?? message.code}`);
            return;
          }
          if (message.type !== "state_snapshot") return;
          const next = message.room;
          record({ seat, version: next.version, phase: next.phase, gamePhase: next.game.phase,
            round: next.game.round, locked: next.game.locked, deadline: next.game.turnDeadline });
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
  // Retired-room admission and saved-state recovery run in test:realtime;
  // private legacy views retain their engine tests. Do not create retired rooms.
  const { emberSmokeResult } = await import("./smoke-ember.mjs");
  assert.equal(emberSmokeResult.result.kind, "success", "the cooperative smoke mission must actually rescue everyone");
  const testedGames = {
    ember_crew: emberSmokeResult.code,
    gomoku: gomoku.code,
    reversi: reversi.code,
    cover_hunt: coverHunt.code,
    quantum_duel: quantumDuel.code,
    meteor_dash: meteorDash.code,
    neon_dash: neonDash.code,
    signal_bluff: signalBluff.code,
    nova_volley: novaVolley.code,
    pulse_pass: pulsePass.code,
  };
  assert.deepEqual(Object.keys(testedGames).sort(), [...PLAYABLE_GAME_IDS].sort(), "every playable game needs a two-client scenario");

  console.log(JSON.stringify({
    ok: true,
    release: health.release,
    games: testedGames,
    reversi: reversi.result,
    resilience: {
      reconnect: reconnectRecovery.code,
      readyLobbyReconnect: readyLobbyReconnect.code,
      duplicateAndStale: protocolResilience.code,
      previousProtocol: previousProtocolCompatibility,
    },
  }));
} finally {
  for (const socket of openSockets) socket.close(1000, "smoke_complete");
}
