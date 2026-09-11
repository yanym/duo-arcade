import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_AI_OPTIONS, DEFAULT_GAME_OPTIONS } from "@duo/game-core";
import { PROTOCOL_VERSION } from "@duo/protocol";

import { ApiError, createRoom, getRoom, getServiceHealth } from "./api";

vi.mock("react-native", () => ({ Platform: { OS: "web" } }));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("API recovery copy", () => {
  it("sends the selected single-player mode and AI controls when creating a room", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await createRoom(
      { playerId: "player-test", nickname: "Tester" },
      "gomoku",
      DEFAULT_GAME_OPTIONS,
      "ai",
      { ...DEFAULT_AI_OPTIONS, difficulty: "hard", intelligence: "strategic", reactionSpeed: "quick" },
    );
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({
      mode: "ai",
      aiOptions: { difficulty: "hard", intelligence: "strategic", reactionSpeed: "quick" },
    });
  });

  it("uses stable user-facing copy for a known error code", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "room_not_found", message: "raw" }), { status: 404 })));
    await expect(getRoom("ABC234")).rejects.toMatchObject({ code: "room_not_found", message: "这个房间不存在，或邀请已经过期。" } satisfies Partial<ApiError>);
  });

  it("never exposes an unknown backend message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "future_failure", message: "database shard private-room-7 failed" }), { status: 500 })));
    await expect(getRoom("ABC234")).rejects.toMatchObject({ code: "future_failure", message: "请求暂时无法完成，请稍后重试。" } satisfies Partial<ApiError>);
  });

  it("turns a deployed protocol mismatch into an explicit update prompt", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      protocol: PROTOCOL_VERSION + 1,
    }), { status: 200 })));
    await expect(getServiceHealth()).rejects.toMatchObject({
      code: "protocol_mismatch",
      message: "应用已有新版本，请刷新页面或重新打开应用。",
    } satisfies Partial<ApiError>);
  });

  it("turns a stalled request into an actionable timeout instead of waiting forever", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    })));

    const expectation = expect(getRoom("ABC234")).rejects.toMatchObject({
      code: "request_timeout",
      message: "连接时间有点久，请检查网络后重试。",
    } satisfies Partial<ApiError>);
    await vi.advanceTimersByTimeAsync(12_000);
    await expectation;
  });
});
