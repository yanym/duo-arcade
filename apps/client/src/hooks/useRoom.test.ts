// @vitest-environment happy-dom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROTOCOL_VERSION, type RoomView } from "@duo/protocol";
import { ApiError } from "@/lib/api";
import { useRoom } from "./useRoom";

const mocks = vi.hoisted(() => ({
  getIdentity: vi.fn(), getRoomSession: vi.fn(), saveRoomSession: vi.fn(),
  saveIdentity: vi.fn(), removeRoomSession: vi.fn(), getRoom: vi.fn(), joinRoom: vi.fn(),
  getServiceHealth: vi.fn(),
  platformOS: "ios",
  appState: "active",
  appStateListener: null as ((nextState: string) => void) | null,
}));
vi.mock("react-native", () => ({
  Platform: { get OS() { return mocks.platformOS; } },
  AppState: {
    get currentState() { return mocks.appState; },
    addEventListener: (_type: string, listener: (nextState: string) => void) => {
      mocks.appStateListener = listener;
      return { remove() { mocks.appStateListener = null; } };
    },
  },
}));
vi.mock("@/lib/api", () => ({
  ApiError: class extends Error {
    constructor(readonly code: string, message: string) { super(message); }
  },
  getRoom: mocks.getRoom,
  getServiceHealth: mocks.getServiceHealth,
  joinRoom: mocks.joinRoom,
  roomSocketUrl: () => "ws://test.invalid/room",
}));
vi.mock("@/lib/session", () => ({
  ...mocks, createClientId: () => "test-action",
}));

class TestSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static instances: TestSocket[] = [];
  readonly protocols: string[];
  readyState = TestSocket.CONNECTING;
  sent: { type: string }[] = [];
  closes: number[] = [];
  onopen?: (event: Event) => void;
  onclose?: (event: CloseEvent) => void;
  onmessage?: (event: MessageEvent) => void;
  onerror?: (event: Event) => void;
  constructor(_url: string, protocols: string[]) {
    this.protocols = protocols;
    TestSocket.instances.push(this);
  }
  send(value: string) { this.sent.push(JSON.parse(value)); }
  close(code = 1000) { this.closes.push(code); this.readyState = 3; }
  open() { this.readyState = TestSocket.OPEN; this.onopen?.(new Event("open")); }
  message(message: unknown) { this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(message) })); }
  disconnect() { this.readyState = 3; this.onclose?.(new CloseEvent("close", { code: 1006 })); }
}

const identity = { playerId: "test-player", nickname: "Player A" };
const session = { ...identity, seat: 0, seatToken: "old-token" };
const room = {
  code: "ABC234", phase: "ready", round: 1, version: 1, seq: 1,
  players: [{ seat: 0, ready: false }, { seat: 1, ready: false }], rematchVotes: [],
} as unknown as RoomView;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function mountRoom() {
  const hook = renderHook(() => useRoom("ABC234"));
  await act(async () => { await Promise.resolve(); });
  return hook;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  TestSocket.instances = [];
  mocks.platformOS = "ios";
  mocks.appState = "active";
  mocks.appStateListener = null;
  vi.stubGlobal("WebSocket", TestSocket);
  mocks.getIdentity.mockResolvedValue(identity);
  mocks.getRoomSession.mockResolvedValue(session);
  mocks.saveRoomSession.mockResolvedValue(undefined);
  mocks.saveIdentity.mockResolvedValue(undefined);
  mocks.removeRoomSession.mockResolvedValue(undefined);
  mocks.getRoom.mockResolvedValue(room);
  mocks.getServiceHealth.mockResolvedValue({ ok: true, protocol: PROTOCOL_VERSION });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("room connection and action UX", () => {
  it("negotiates the shared protocol version instead of a drifting hard-coded value", async () => {
    await mountRoom();
    expect(TestSocket.instances[0]?.protocols).toEqual([
      `duo-v${PROTOCOL_VERSION}`,
      `seat.${session.seatToken}`,
    ]);
  });

  it("stops reconnecting and asks for an update when the server protocol changed", async () => {
    mocks.getServiceHealth.mockRejectedValue(new ApiError("protocol_mismatch", "应用已有新版本，请刷新页面或重新打开应用。"));
    const { result } = await mountRoom();
    await act(async () => {
      TestSocket.instances[0]!.disconnect();
      await Promise.resolve();
    });
    expect(result.current.status).toBe("error");
    expect(result.current.errorCode).toBe("protocol_mismatch");
    expect(result.current.notice).toContain("应用已有新版本");
    expect(mocks.joinRoom).not.toHaveBeenCalled();
  });

  it("does not request or connect when a deep-link room code is malformed", async () => {
    const { result } = renderHook(() => useRoom(""));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.status).toBe("loading");
    expect(result.current.errorCode).toBeNull();
    expect(mocks.getRoom).not.toHaveBeenCalled();
    expect(mocks.getRoomSession).not.toHaveBeenCalled();
    expect(TestSocket.instances).toHaveLength(0);
  });

  it("does not enable interaction before the first authoritative snapshot", async () => {
    const { result } = await mountRoom();
    const socket = TestSocket.instances[0]!;
    act(() => socket.open());
    expect(result.current.status).toBe("connecting");
    act(() => result.current.setReady(true));
    expect(socket.sent).toEqual([]);
    act(() => socket.message({ type: "state_snapshot", room }));
    expect(result.current.status).toBe("connected");
  });

  it("reconnects when a transport opens but never delivers a snapshot", async () => {
    await mountRoom();
    const socket = TestSocket.instances[0]!;
    act(() => socket.open());
    act(() => vi.advanceTimersByTime(8000));
    expect(socket.closes).toContain(4000);
  });

  it("locks a ready action immediately and waits for our own acknowledgement", async () => {
    const { result } = await mountRoom();
    const socket = TestSocket.instances[0]!;
    act(() => { socket.open(); socket.message({ type: "state_snapshot", room }); });
    act(() => { result.current.setReady(true); result.current.setReady(true); });
    expect(socket.sent).toHaveLength(1);
    expect(result.current.controlPending).toBe("ready");
    act(() => socket.message({ type: "state_snapshot", room: { ...room, players: [{ ready: false }, { ready: true }] } }));
    expect(result.current.controlPending).toBe("ready");
    act(() => socket.message({ type: "state_snapshot", room: { ...room, players: [{ ready: true }, { ready: true }] } }));
    expect(result.current.controlPending).toBeNull();
  });

  it("blocks a rapid duplicate reaction before the cooldown state rerenders", async () => {
    const { result } = await mountRoom();
    const socket = TestSocket.instances[0]!;
    act(() => { socket.open(); socket.message({ type: "state_snapshot", room }); });

    act(() => { result.current.sendReaction("wave"); result.current.sendReaction("wave"); });
    expect(socket.sent).toEqual([{ type: "reaction", reactionId: "wave" }]);
    expect(result.current.reactionCooldown).toBe(true);

    act(() => vi.advanceTimersByTime(800));
    act(() => result.current.sendReaction("clap"));
    expect(socket.sent.at(-1)).toEqual({ type: "reaction", reactionId: "clap" });
  });

  it("releases reaction cooldown when a manual reconnect replaces its timer", async () => {
    const { result } = await mountRoom();
    const socket = TestSocket.instances[0]!;
    act(() => { socket.open(); socket.message({ type: "state_snapshot", room }); });

    act(() => result.current.sendReaction("wave"));
    expect(result.current.reactionCooldown).toBe(true);

    act(() => result.current.retry());
    expect(result.current.reactionCooldown).toBe(false);
  });

  it("acknowledges a destructive end action and blocks duplicate sends", async () => {
    const { result } = await mountRoom();
    const socket = TestSocket.instances[0]!;
    act(() => { socket.open(); socket.message({ type: "state_snapshot", room }); });
    act(() => { result.current.resign(); result.current.resign(); });
    expect(socket.sent).toEqual([{ type: "resign" }]);
    expect(result.current.controlPending).toBe("resign");

    act(() => socket.message({ type: "state_snapshot", room: { ...room, phase: "completed" } }));
    expect(result.current.controlPending).toBeNull();
  });

  it("ignores old socket messages and close events after an explicit retry", async () => {
    const { result } = await mountRoom();
    const old = TestSocket.instances[0]!;
    act(() => { old.open(); old.message({ type: "state_snapshot", room }); });
    await act(async () => result.current.retry());
    const current = TestSocket.instances.at(-1)!;
    expect(current).not.toBe(old);
    act(() => current.open());
    act(() => result.current.setReady(true));
    expect(current.sent).toEqual([]);
    act(() => current.message({ type: "state_snapshot", room: { ...room, version: 3 } }));
    act(() => { old.message({ type: "state_snapshot", room }); old.disconnect(); });
    expect(result.current.room?.version).toBe(3);
    expect(result.current.status).toBe("connected");
  });

  it("does not open a socket if stored identity arrives after leaving", async () => {
    const pending = deferred<typeof identity>();
    mocks.getIdentity.mockReturnValue(pending.promise);
    const hook = renderHook(() => useRoom("ABC234"));
    hook.unmount();
    await act(async () => pending.resolve(identity));
    expect(TestSocket.instances).toHaveLength(0);
  });

  it("persists a rotated token after leaving without reopening the screen", async () => {
    const response = { room, playerId: identity.playerId, seat: 0, seatToken: "rotated-token" };
    const pending = deferred<typeof response>();
    mocks.joinRoom.mockReturnValue(pending.promise);
    const hook = await mountRoom();
    await act(async () => {
      TestSocket.instances[0]!.disconnect();
      await Promise.resolve();
    });
    expect(mocks.joinRoom).toHaveBeenCalledOnce();
    hook.unmount();
    await act(async () => pending.resolve(response));
    expect(mocks.saveRoomSession).toHaveBeenCalledWith("ABC234", {
      playerId: identity.playerId, seat: 0, seatToken: "rotated-token",
    });
    expect(TestSocket.instances).toHaveLength(1);
  });

  it("clears in-flight gameplay feedback on retry instead of leaving input locked", async () => {
    const { result } = await mountRoom();
    const socket = TestSocket.instances[0]!;
    act(() => { socket.open(); socket.message({ type: "state_snapshot", room }); });
    act(() => result.current.placeStone(7, 7));
    expect(result.current.actionPending).toBe(true);
    await act(async () => result.current.retry());
    expect(result.current.actionPending).toBe(false);
  });

  it("shows progressive action feedback and clears it after acknowledgement", async () => {
    const { result } = await mountRoom();
    const socket = TestSocket.instances[0]!;
    act(() => { socket.open(); socket.message({ type: "state_snapshot", room }); });

    act(() => result.current.placeStone(7, 7));
    expect(result.current.actionSyncStatus).toBe("sending");
    act(() => vi.advanceTimersByTime(649));
    expect(result.current.actionSyncStatus).toBe("sending");
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.actionSyncStatus).toBe("slow");

    act(() => socket.message({ type: "action_acknowledged", actionId: "test-action" }));
    expect(result.current.actionSyncStatus).toBe("confirmed");
    act(() => vi.advanceTimersByTime(700));
    expect(result.current.actionSyncStatus).toBe("idle");
  });

  it("recovers from an action acknowledgement timeout instead of staying silently locked", async () => {
    const { result } = await mountRoom();
    const socket = TestSocket.instances[0]!;
    act(() => { socket.open(); socket.message({ type: "state_snapshot", room }); });
    act(() => result.current.placeStone(7, 7));

    act(() => vi.advanceTimersByTime(8000));
    expect(result.current.notice).toBe("这一步确认用时较长，正在重新同步房间进度");
    expect(socket.closes).toContain(4001);
  });

  it("requests an authoritative snapshot after a stale action is rejected", async () => {
    const { result } = await mountRoom();
    const socket = TestSocket.instances[0]!;
    act(() => { socket.open(); socket.message({ type: "state_snapshot", room }); });
    act(() => result.current.placeStone(7, 7));
    act(() => socket.message({
      type: "action_rejected",
      actionId: "test-action",
      reason: "stale_version",
    }));

    expect(result.current.actionSyncStatus).toBe("sending");
    expect(result.current.actionPending).toBe(true);
    expect(result.current.notice).toBe("游戏刚刚更新，正在同步最新进度");
    expect(socket.sent.at(-1)).toEqual({ type: "request_snapshot" });

    act(() => result.current.placeStone(8, 8));
    expect(socket.sent.filter((message) => message.type === "game_action")).toHaveLength(1);

    act(() => socket.message({ type: "state_snapshot", room: { ...room, version: 2 } }));
    expect(result.current.actionSyncStatus).toBe("confirmed");
    expect(result.current.actionPending).toBe(false);
    expect(result.current.notice).toBeNull();
  });

  it("recovers when a requested stale-state snapshot also stalls", async () => {
    const { result } = await mountRoom();
    const socket = TestSocket.instances[0]!;
    act(() => { socket.open(); socket.message({ type: "state_snapshot", room }); });
    act(() => result.current.placeStone(7, 7));
    act(() => socket.message({ type: "action_rejected", actionId: "test-action", reason: "stale_version" }));

    act(() => vi.advanceTimersByTime(8_000));
    expect(result.current.notice).toBe("最新进度同步较慢，正在重新连接房间");
    expect(socket.closes).toContain(4001);
  });

  it("requests a fresh snapshot when iOS returns to the foreground", async () => {
    await mountRoom();
    const socket = TestSocket.instances[0]!;
    act(() => { socket.open(); socket.message({ type: "state_snapshot", room }); });
    socket.sent = [];

    act(() => mocks.appStateListener?.("active"));
    expect(socket.sent).toEqual([{ type: "request_snapshot" }]);
  });

  it("reconnects on foreground after the transport closed in the background", async () => {
    await mountRoom();
    const socket = TestSocket.instances[0]!;
    act(() => { socket.open(); socket.message({ type: "state_snapshot", room }); });
    mocks.appState = "background";
    act(() => socket.disconnect());
    expect(TestSocket.instances).toHaveLength(1);

    mocks.appState = "active";
    act(() => mocks.appStateListener?.("active"));
    expect(TestSocket.instances).toHaveLength(2);
  });

  it("closes the iOS transport while backgrounded so the partner sees the pause", async () => {
    const { result } = await mountRoom();
    const socket = TestSocket.instances[0]!;
    act(() => { socket.open(); socket.message({ type: "state_snapshot", room }); });

    mocks.appState = "background";
    act(() => mocks.appStateListener?.("background"));
    expect(socket.closes).toContain(4001);

    act(() => socket.disconnect());
    expect(result.current.status).toBe("reconnecting");
    expect(mocks.removeRoomSession).not.toHaveBeenCalled();

    mocks.appState = "active";
    act(() => mocks.appStateListener?.("active"));
    expect(TestSocket.instances).toHaveLength(2);
  });

  it("keeps a healthy web transport open when the tab is backgrounded", async () => {
    mocks.platformOS = "web";
    await mountRoom();
    const socket = TestSocket.instances[0]!;
    act(() => { socket.open(); socket.message({ type: "state_snapshot", room }); });

    mocks.appState = "background";
    act(() => mocks.appStateListener?.("background"));

    expect(socket.closes).toEqual([]);
    expect(socket.readyState).toBe(TestSocket.OPEN);
  });

  it("releases a pending gameplay action when the server reports a protocol error", async () => {
    const { result } = await mountRoom();
    const socket = TestSocket.instances[0]!;
    act(() => { socket.open(); socket.message({ type: "state_snapshot", room }); });
    act(() => result.current.placeStone(7, 7));
    expect(result.current.actionPending).toBe(true);

    act(() => socket.message({ type: "error", code: "invalid_message", message: "details" }));
    expect(result.current.actionPending).toBe(false);
    expect(result.current.notice).toBe("收到了一条无法识别的房间消息，请重试。");
  });

  it("releases a room control with clear recovery copy when the phase changed", async () => {
    const { result } = await mountRoom();
    const socket = TestSocket.instances[0]!;
    act(() => { socket.open(); socket.message({ type: "state_snapshot", room }); });
    act(() => result.current.setReady(true));
    expect(result.current.controlPending).toBe("ready");

    act(() => socket.message({ type: "action_rejected", reason: "room_not_ready", currentVersion: 2 }));
    expect(result.current.controlPending).toBeNull();
    expect(result.current.notice).toBe("房间状态刚刚改变，请按最新画面继续");
  });

  it("turns a long ready acknowledgement into a recoverable reconnect", async () => {
    const { result } = await mountRoom();
    const socket = TestSocket.instances[0]!;
    act(() => { socket.open(); socket.message({ type: "state_snapshot", room }); });
    act(() => result.current.setReady(true));

    act(() => vi.advanceTimersByTime(8000));
    expect(result.current.notice).toBe("确认用时较长，正在重新同步；请稍等");
    expect(socket.closes).toContain(4001);
  });

  it("stops an endless reconnect loop with an explicit manual recovery state", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { result } = await mountRoom();
    let socket = TestSocket.instances[0]!;
    act(() => { socket.open(); socket.message({ type: "state_snapshot", room }); });

    for (let attempt = 1; attempt <= 8; attempt += 1) {
      act(() => socket.disconnect());
      const delay = Math.min(8000, 500 * 2 ** attempt);
      act(() => vi.advanceTimersByTime(delay));
      socket = TestSocket.instances.at(-1)!;
      act(() => socket.open());
    }
    act(() => socket.disconnect());

    expect(result.current.status).toBe("error");
    expect(result.current.errorCode).toBe("connection_lost");
    expect(result.current.notice).toContain("当前进度仍保留在房间里");
  });

  it("does not expose arbitrary server error text in the room notice", async () => {
    const { result } = await mountRoom();
    const socket = TestSocket.instances[0]!;
    act(() => { socket.open(); socket.message({ type: "state_snapshot", room }); });
    act(() => socket.message({ type: "error", code: "future_internal_code", message: "SQL constraint room_secret_idx" }));
    expect(result.current.notice).toBe("房间服务暂时无法处理这个请求，请重试。");
    expect(result.current.notice).not.toContain("SQL");
  });

  it("shares an in-flight token refresh when the player retries again", async () => {
    const response = { room, playerId: identity.playerId, seat: 0, seatToken: "rotated-token" };
    const pending = deferred<typeof response>();
    mocks.joinRoom.mockReturnValue(pending.promise);
    const { result } = await mountRoom();
    await act(async () => {
      TestSocket.instances[0]!.disconnect();
      await Promise.resolve();
    });
    await act(async () => result.current.retry());
    await act(async () => {
      TestSocket.instances.at(-1)!.disconnect();
      await Promise.resolve();
    });
    expect(mocks.joinRoom).toHaveBeenCalledOnce();
    await act(async () => pending.resolve(response));
    expect(result.current.session?.seatToken).toBe("rotated-token");
  });
});
