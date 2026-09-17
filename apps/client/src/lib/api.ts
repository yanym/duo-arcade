import { Platform } from "react-native";

import type { AiOptions, GameId, GameOptions } from "@duo/game-core";
import { CLIENT_PROTOCOL_HEADER, PROTOCOL_VERSION, type RoomMode, type RoomSessionResponse, type RoomView } from "@duo/protocol";

import type { Identity, StoredSession } from "./session";

const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
const isDevelopment = typeof __DEV__ !== "undefined" && __DEV__;

export const API_BASE_URL = (
  configuredApiUrl ||
  (Platform.OS === "web" && !isDevelopment && typeof globalThis.location !== "undefined"
    ? globalThis.location.origin
    : "http://localhost:8787")
).replace(/\/$/, "");

export class ApiError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

const REQUEST_TIMEOUT_MS = 12_000;

const friendlyErrors: Record<string, string> = {
  protocol_mismatch: "应用已有新版本，请刷新页面或重新打开应用。",
  room_not_found: "这个房间不存在，或邀请已经过期。",
  room_full: "这个房间已经坐满两位玩家了。",
  invalid_resume_token: "这台设备的房间凭证已经失效，请让好友重新发起邀请。",
  rate_limited: "操作有点频繁，请稍等片刻再试。",
  invalid_player: "请检查游戏昵称后再试。",
  invalid_game: "这个游戏暂时无法创建房间。",
  game_retired: "这款游戏已从游戏库下架，请返回首页选择其他游戏。",
  code_generation_failed: "暂时没能创建房间，请再试一次。",
  internal_error: "服务暂时忙碌，请稍后重试。",
};

function requestSignal(external?: AbortSignal): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), REQUEST_TIMEOUT_MS);
  const abort = () => controller.abort(external?.reason);
  external?.addEventListener("abort", abort, { once: true });
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout);
      external?.removeEventListener("abort", abort);
    },
  };
}

export type ServiceHealth = {
  ok: true;
  service: string;
  release: string;
  protocol: number;
  games: number;
};

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const pending = requestSignal(init?.signal ?? undefined);
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      signal: pending.signal,
      headers: { "Content-Type": "application/json", [CLIENT_PROTOCOL_HEADER]: String(PROTOCOL_VERSION), ...init?.headers }
    });
    const body = await response.json().catch(() => ({})) as { error?: string } & T;
    if (!response.ok) {
      const code = body.error ?? "request_failed";
      // Unknown server text can be technical, unstable, or unsafe to surface.
      throw new ApiError(code, friendlyErrors[code] ?? "请求暂时无法完成，请稍后重试。");
    }
    return body;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (pending.signal.aborted && !init?.signal?.aborted) {
      throw new ApiError("request_timeout", "连接时间有点久，请检查网络后重试。");
    }
    if (init?.signal?.aborted) throw error;
    throw new ApiError("network_unavailable", "目前无法连接服务，请检查网络后重试。");
  } finally {
    pending.cleanup();
  }
}

export async function createRoom(
  identity: Identity,
  gameId: GameId,
  options: GameOptions,
  mode: RoomMode = "duo",
  aiOptions?: AiOptions,
): Promise<RoomSessionResponse> {
  return await requestJson<RoomSessionResponse>("/api/rooms", {
    method: "POST",
    body: JSON.stringify({ ...identity, gameId, options, mode, aiOptions })
  });
}

export async function joinRoom(
  code: string,
  identity: Identity,
  previous?: StoredSession | null
): Promise<RoomSessionResponse> {
  return await requestJson<RoomSessionResponse>(`/api/rooms/${code}/join`, {
    method: "POST",
    body: JSON.stringify({
      ...identity,
      resumeToken: previous?.playerId === identity.playerId ? previous.seatToken : undefined
    })
  });
}

export async function getRoom(code: string): Promise<RoomView> {
  const response = await requestJson<{ room: RoomView }>(`/api/rooms/${code}`);
  return response.room;
}

export async function getServiceHealth(signal?: AbortSignal): Promise<ServiceHealth> {
  const health = await requestJson<ServiceHealth>("/health", { signal });
  if (health.protocol !== PROTOCOL_VERSION) {
    throw new ApiError("protocol_mismatch", "应用已有新版本，请刷新页面或重新打开应用。");
  }
  return health;
}

export function roomSocketUrl(code: string): string {
  const url = new URL(`${API_BASE_URL}/api/rooms/${code}/socket`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}
