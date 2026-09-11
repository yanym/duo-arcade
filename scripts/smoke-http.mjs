import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const apiBase = process.env.DUO_API_URL ?? "http://localhost:8787";
const REQUEST_TIMEOUT_MS = 10_000;
const LOCAL_ORIGIN = "http://localhost:8081";
const UNTRUSTED_ORIGIN = "https://untrusted.example";

async function request(path, init = {}) {
  return await fetch(new URL(path, apiBase), {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

async function expectJson(path, init, status, errorCode) {
  const response = await request(path, init);
  const body = await response.json();
  assert.equal(response.status, status, `${path}: ${JSON.stringify(body)}`);
  assert.match(response.headers.get("content-type") ?? "", /^application\/json/);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  if (errorCode) {
    assert.equal(body.error, errorCode);
    assert.match(body.requestId, /^[0-9a-f-]{36}$/i);
    assert.equal("stack" in body, false);
  }
  return { response, body };
}

const badJson = await expectJson("/api/rooms", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: "{",
}, 400, "invalid_json");

const oversized = await expectJson("/api/rooms", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ padding: "x".repeat(9_000) }),
}, 413, "payload_too_large");

const invalidPlayer = await expectJson("/api/rooms", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ playerId: "short", nickname: "", gameId: "gomoku" }),
}, 400, "invalid_player");

const invalidGame = await expectJson("/api/rooms", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ playerId: randomUUID(), nickname: "边界测试", gameId: "not_a_game" }),
}, 400, "invalid_game");

const unknownCode = "ZZZZZ" + String(Math.floor(Math.random() * 8) + 2);
const missingRoom = await expectJson(`/api/rooms/${unknownCode}`, {}, 404);
assert.equal(missingRoom.body.error, "room_not_found");
assert.equal("seatToken" in missingRoom.body, false);

await expectJson("/api/not-real", {}, 404, "not_found");
await expectJson(`/api/rooms/${unknownCode}`, { method: "DELETE" }, 405, "method_not_allowed");

const allowedPreflight = await request("/api/rooms", {
  method: "OPTIONS",
  headers: { Origin: LOCAL_ORIGIN },
});
assert.equal(allowedPreflight.status, 204);
assert.equal(allowedPreflight.headers.get("access-control-allow-origin"), LOCAL_ORIGIN);
assert.equal(allowedPreflight.headers.get("vary"), "Origin");
assert.match(allowedPreflight.headers.get("access-control-allow-methods") ?? "", /POST/);

const deniedPreflight = await request("/api/rooms", {
  method: "OPTIONS",
  headers: { Origin: UNTRUSTED_ORIGIN },
});
assert.equal(deniedPreflight.status, 204);
assert.equal(deniedPreflight.headers.get("access-control-allow-origin"), null);

const deniedHealth = await request("/health", { headers: { Origin: UNTRUSTED_ORIGIN } });
assert.equal(deniedHealth.status, 200);
assert.equal(deniedHealth.headers.get("access-control-allow-origin"), null);

const resumeIdentity = { playerId: randomUUID(), nickname: "恢复测试" };
const wrongResumeToken = `${randomUUID()}${randomUUID()}`;
const resumeRoomResponse = await request("/api/rooms", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ ...resumeIdentity, gameId: "gomoku" }),
});
assert.equal(resumeRoomResponse.status, 201);
const resumeRoom = await resumeRoomResponse.json();
await expectJson(`/api/rooms/${resumeRoom.room.code}/join`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ ...resumeIdentity, resumeToken: wrongResumeToken }),
}, 401, "invalid_resume_token");
const rotatedResumeResponse = await request(`/api/rooms/${resumeRoom.room.code}/join`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ ...resumeIdentity, resumeToken: resumeRoom.seatToken }),
});
assert.equal(rotatedResumeResponse.status, 200);
const rotatedResume = await rotatedResumeResponse.json();
assert.notEqual(rotatedResume.seatToken, resumeRoom.seatToken);
await expectJson(`/api/rooms/${resumeRoom.room.code}/join`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ ...resumeIdentity, resumeToken: resumeRoom.seatToken }),
}, 401, "invalid_resume_token");

for (const route of ["/privacy", "/terms", "/settings", "/room/ZZZZZZ", "/not-a-real-page"]) {
  const response = await request(route, { headers: { "cache-control": "no-cache" } });
  assert.equal(response.status, 200, route);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html/);
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.match(await response.text(), /<div id="root"><\/div>/);
}

console.log(JSON.stringify({
  ok: true,
  baseUrl: apiBase,
  errors: {
    invalidJson: badJson.response.status,
    oversized: oversized.response.status,
    invalidPlayer: invalidPlayer.response.status,
    invalidGame: invalidGame.response.status,
    missingRoom: missingRoom.response.status,
    staleResume: 401,
  },
  cors: { allowed: LOCAL_ORIGIN, denied: UNTRUSTED_ORIGIN },
  deepLinks: 5,
}));
