// @vitest-environment happy-dom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGameState, DEFAULT_GAME_OPTIONS, getGameRoleLabel, getGameView, RETIRED_GAME_IDS, type GameId } from "@duo/game-core";
import type { RoomPhase, RoomView } from "@duo/protocol";
import type { useRoom } from "@/hooks/useRoom";
import { LanguageContext } from "@/i18n";
import RoomScreen from "../app/room/[code]";

type ScreenRoomState = Pick<ReturnType<typeof useRoom>, "room" | "session" | "status" | "identity" | "notice" | "errorCode" | "actionSyncStatus" | "actionPending" | "controlPending" | "reaction" | "reactionCooldown">;
const mocks = vi.hoisted(() => ({
  state: null as ScreenRoomState | null,
  replace: vi.fn(), setReady: vi.fn(), voteRematch: vi.fn(), join: vi.fn(),
  feedback: vi.fn(), playSound: vi.fn(), hasSeenTutorial: vi.fn(),
  beforeRemove: null as ((event: { preventDefault: () => void }) => void) | null,
  navigation: { addListener: vi.fn() },
}));
vi.mock("react-native", () => vi.importActual<typeof import("react-native")>("react-native-web"));
vi.mock("expo-router", () => ({
  router: { replace: mocks.replace },
  Stack: { Screen: () => null },
  usePathname: () => "/room/ABC234",
  useLocalSearchParams: () => ({ code: "ABC234" }),
  useNavigation: () => mocks.navigation,
}));
vi.mock("expo-clipboard", () => ({ setStringAsync: vi.fn() }));
vi.mock("@/lib/session", () => ({ localizeGeneratedNickname: (nickname: string) => nickname }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "div", useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
vi.mock("@/hooks/useNow", () => ({ useNow: () => 1001 }));
vi.mock("@/hooks/useRoom", () => ({ useRoom: () => ({
  ...mocks.state, setReady: mocks.setReady, voteRematch: mocks.voteRematch, join: mocks.join,
}) }));
vi.mock("@/lib/tutorial", () => ({ hasSeenTutorial: mocks.hasSeenTutorial, markTutorialSeen: vi.fn() }));
vi.mock("@/settings/SettingsContext", () => ({ useSettings: () => ({
  feedback: mocks.feedback, playSound: mocks.playSound,
  settings: { language: "en", reducedMotion: true, highContrast: false },
}) }));

function setupRoom(gameId: GameId, phase: RoomPhase, participant = true) {
  const state = createGameState(gameId, 0, 1000, 42);
  if (phase === "completed") state.result = { kind: "failure", score: 0, reason: "abandoned" };
  const room: RoomView = {
    code: "ABC234", gameId, mode: "duo", ai: null, options: DEFAULT_GAME_OPTIONS,
    phase, version: 1, seq: 1, round: 1, rematchVotes: [], reconnectDeadline: null,
    players: ([0, 1] as const).map((seat) => phase === "waiting" && seat === 1 ? null : ({
      id: `player-${seat}`, nickname: seat === 0 ? "Alex" : "Sam", seat, ready: false,
      connected: true, piece: seat === 0 ? 1 : 2, roleLabel: getGameRoleLabel(state, seat), isAi: false,
    })),
    game: getGameView(state, 0),
  };
  mocks.state = {
    room, session: participant ? { seat: 0, playerId: "player-0", seatToken: "test-token" } : null,
    identity: { playerId: "player-0", nickname: "Alex" }, status: participant ? "connected" : "preview",
    notice: null, errorCode: null, actionSyncStatus: "idle", actionPending: false,
    controlPending: null, reaction: null, reactionCooldown: false,
  };
}
const renderRoom = () => render(<LanguageContext.Provider value="en"><RoomScreen /></LanguageContext.Provider>);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("scrollTo", vi.fn());
  mocks.beforeRemove = null;
  mocks.navigation.addListener.mockImplementation((_event, listener) => {
    mocks.beforeRemove = listener;
    return () => { mocks.beforeRemove = null; };
  });
  mocks.hasSeenTutorial.mockResolvedValue(false);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("retired game room recovery UI", () => {
  for (const gameId of RETIRED_GAME_IDS) {
    it.each(["waiting", "ready"] as const)(`${gameId}: %s players see recovery, never invitation or readiness`, (phase) => {
      setupRoom(gameId, phase);
      renderRoom();
      expect(screen.getByRole("heading", { name: "This game has been retired" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: /Copy invite|Share|I'm ready|Ready & start|Cancel ready/ })).toBeNull();
      expect(mocks.hasSeenTutorial).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Choose another game" }));
      expect(mocks.replace).toHaveBeenCalledWith("/");
      expect(mocks.setReady).not.toHaveBeenCalled();
    });
    it(`${gameId}: a preserved result offers another game instead of rematching`, () => {
      setupRoom(gameId, "completed");
      renderRoom();
      expect(screen.getByText("This co-op ended early")).toBeTruthy();
      expect(screen.queryByRole("button", { name: /Play again|Cancel rematch/ })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Choose another game" }));
      expect(mocks.replace).toHaveBeenCalledWith("/");
      expect(mocks.voteRematch).not.toHaveBeenCalled();
    });
  }

  it.each(["waiting", "ready", "playing", "reconnect_grace", "completed"] as const)("a guest can leave a retired %s invitation immediately", (phase) => {
    setupRoom("split_maze", phase, false);
    renderRoom();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Join/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Choose another game" }));
    expect(mocks.replace).toHaveBeenCalledWith("/");
    expect(mocks.navigation.addListener).not.toHaveBeenCalled();
    const unload = new Event("beforeunload", { cancelable: true });
    globalThis.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(false);
  });

  it("still allows readiness for a retained game", () => {
    setupRoom("gomoku", "ready");
    mocks.hasSeenTutorial.mockResolvedValue(true);
    renderRoom();
    fireEvent.click(screen.getByRole("button", { name: "I'm ready" }));
    expect(mocks.setReady).toHaveBeenCalledWith(true);
    expect(screen.queryByRole("button", { name: "Choose another game" })).toBeNull();
  });

  it.each(["playing", "reconnect_grace"] as const)("a nonparticipant can use Back from a full %s retained room", (phase) => {
    setupRoom("gomoku", phase, false);
    renderRoom();
    expect(screen.getByRole("heading", { name: "This room is full" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(mocks.replace).toHaveBeenCalledWith("/");
    expect(mocks.navigation.addListener).not.toHaveBeenCalled();
  });

  it.each(["playing", "reconnect_grace"] as const)("keeps accidental-leave protection for a participating %s player", (phase) => {
    setupRoom("split_maze", phase);
    renderRoom();
    fireEvent.click(screen.getByRole("button", { name: "Leave" }));
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Leave this game for now?" })).toBeTruthy();
    expect(mocks.navigation.addListener).toHaveBeenCalledWith("beforeRemove", expect.any(Function));
    const unload = new Event("beforeunload", { cancelable: true });
    globalThis.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
  });
});
