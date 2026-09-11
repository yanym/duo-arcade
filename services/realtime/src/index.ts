import { GAME_IDS, isGameId, normalizeAiOptions, normalizeGameOptions, type AiOptions, type GameId, type GameOptions } from "@duo/game-core";
import { PROTOCOL_VERSION, type RoomMode } from "@duo/protocol";

import { HttpError, isPlayerInput, normalizeNickname, readLimitedJson } from "./http";
import type { RateLimitResult } from "./rate-limiter";
export { GameRoom } from "./room";
export { RequestRateLimiter } from "./rate-limiter";

const ROOM_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CREATE_ROOM_ATTEMPTS = 6;
const RELEASE = "1.0";

const RATE_LIMITS = {
  create: { limit: 20, windowMs: 60_000 },
  join: { limit: 40, windowMs: 60_000 },
  preview: { limit: 120, windowMs: 60_000 },
  socket: { limit: 90, windowMs: 60_000 },
} as const;

type RateLimitScope = keyof typeof RATE_LIMITS;

function makeRoomCode(): string {
  const random = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(random, (byte) => ROOM_ALPHABET[byte % ROOM_ALPHABET.length]).join("");
}

function corsHeaders(request: Request, env: Env): HeadersInit {
  const origin = request.headers.get("Origin");
  const allowedOrigins = env.ALLOWED_ORIGINS.split(",").map((value) => value.trim());
  if (!origin || !allowedOrigins.includes(origin)) {
    return {};
  }
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function responseHeaders(request: Request, env: Env, extra?: HeadersInit): Headers {
  const headers = new Headers(corsHeaders(request, env));
  headers.set("Cache-Control", "no-store");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Content-Type-Options", "nosniff");
  for (const [key, value] of new Headers(extra)) headers.set(key, value);
  return headers;
}

function json(
  request: Request,
  env: Env,
  value: unknown,
  status = 200,
  extraHeaders?: HeadersInit,
): Response {
  return Response.json(value, {
    status,
    headers: responseHeaders(request, env, extraHeaders),
  });
}

async function clientRateLimitKey(request: Request): Promise<string> {
  const source = request.headers.get("CF-Connecting-IP") ?? "local-development";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function checkRateLimit(
  request: Request,
  env: Env,
  scope: RateLimitScope,
): Promise<RateLimitResult> {
  const key = await clientRateLimitKey(request);
  const policy = RATE_LIMITS[scope];
  return await env.REQUEST_RATE_LIMITERS.getByName(key).check(scope, policy.limit, policy.windowMs);
}

async function rateLimitedResponse(
  request: Request,
  env: Env,
  scope: RateLimitScope,
): Promise<Response | null> {
  const result = await checkRateLimit(request, env, scope);
  if (result.allowed) return null;
  const retryAfter = Math.max(1, Math.ceil(result.retryAfterMs / 1_000));
  return json(
    request,
    env,
    { error: "rate_limited", message: `请求过于频繁，请在 ${retryAfter} 秒后重试` },
    429,
    {
      "Retry-After": String(retryAfter),
      "X-RateLimit-Limit": String(result.limit),
      "X-RateLimit-Remaining": "0",
    },
  );
}

function roomErrorStatus(code: string): number {
  if (code === "room_not_found") return 404;
  if (code === "room_full") return 409;
  if (code === "invalid_resume_token") return 401;
  return 409;
}

function roomErrorResponse(request: Request, env: Env, code: string, requestId: string): Response {
  const message = {
    room_not_found: "这个房间不存在，或邀请已经过期",
    room_full: "这个房间已经坐满两位玩家",
    invalid_resume_token: "这台设备的房间凭证已经失效",
    room_exists: "房间码发生冲突，请重试",
  }[code] ?? "暂时无法处理这个房间请求";
  return json(request, env, { error: code, message, requestId }, roomErrorStatus(code));
}

async function createRoom(
  request: Request,
  env: Env,
  playerId: string,
  nickname: string,
  gameId: GameId,
  options: GameOptions,
  mode: RoomMode,
  aiOptions: AiOptions,
  requestId: string,
): Promise<Response> {
  for (let attempt = 0; attempt < CREATE_ROOM_ATTEMPTS; attempt += 1) {
    const code = makeRoomCode();
    const stub = env.GAME_ROOMS.getByName(code);
    const result = await stub.createRoom(code, playerId, nickname, gameId, options, mode, aiOptions);
    if (result.ok) {
      console.log(JSON.stringify({ event: "room_created", code, attempt }));
      return json(request, env, result.value, 201);
    }
    if (result.code !== "room_exists") {
      return roomErrorResponse(request, env, result.code, requestId);
    }
  }
  throw new HttpError(503, "code_generation_failed", "暂时无法创建房间，请重试");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestId = crypto.randomUUID();
    try {
      const url = new URL(request.url);
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: responseHeaders(request, env) });
      }
      if (request.method === "GET" && url.pathname === "/health") {
        return json(request, env, {
          ok: true,
          service: "duo-arcade-realtime",
          release: RELEASE,
          protocol: PROTOCOL_VERSION,
          games: GAME_IDS.length,
        });
      }

      if (request.method === "POST" && url.pathname === "/api/rooms") {
        const limited = await rateLimitedResponse(request, env, "create");
        if (limited) return limited;
        const body = await readLimitedJson(request);
        if (!isPlayerInput(body)) {
          throw new HttpError(400, "invalid_player", "昵称或玩家标识无效");
        }
        if (!isGameId(body.gameId)) {
          throw new HttpError(400, "invalid_game", "请选择受支持的小游戏");
        }
        return await createRoom(
          request,
          env,
          body.playerId,
          normalizeNickname(body.nickname),
          body.gameId,
          normalizeGameOptions(body.options),
          body.mode === "ai" ? "ai" : "duo",
          normalizeAiOptions(body.aiOptions),
          requestId,
        );
      }

      const match = url.pathname.match(/^\/api\/rooms\/([2-9A-HJ-NP-Z]{6})(?:\/(join|socket))?$/);
      if (!match) {
        throw new HttpError(404, "not_found", "接口不存在");
      }

      const code = match[1]!;
      const action = match[2];
      const stub = env.GAME_ROOMS.getByName(code);

      if (request.method === "GET" && action === "socket") {
        const limited = await rateLimitedResponse(request, env, "socket");
        if (limited) return limited;
        return await stub.fetch(request);
      }
      if (request.method === "GET" && !action) {
        const limited = await rateLimitedResponse(request, env, "preview");
        if (limited) return limited;
        const room = await stub.getRoom();
        return room
          ? json(request, env, { room })
          : json(request, env, { error: "room_not_found" }, 404);
      }
      if (request.method === "POST" && action === "join") {
        const limited = await rateLimitedResponse(request, env, "join");
        if (limited) return limited;
        const body = await readLimitedJson(request);
        if (!isPlayerInput(body)) {
          throw new HttpError(400, "invalid_player", "昵称或玩家标识无效");
        }
        const result = await stub.joinRoom(
          body.playerId,
          normalizeNickname(body.nickname),
          body.resumeToken,
        );
        if (!result.ok) {
          return roomErrorResponse(request, env, result.code, requestId);
        }
        return json(request, env, result.value);
      }

      throw new HttpError(405, "method_not_allowed", "请求方法不受支持");
    } catch (error) {
      if (error instanceof HttpError) {
        return json(request, env, { error: error.code, message: error.message, requestId }, error.status);
      }
      console.error(
        JSON.stringify({
          event: "unhandled_error",
          requestId,
          message: error instanceof Error ? error.message : "unknown_error",
        }),
      );
      return json(request, env, { error: "internal_error", message: "服务暂时不可用", requestId }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
