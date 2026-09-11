// @vitest-environment happy-dom
import React from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useWebDocumentTitle } from "@/hooks/useWebDocumentTitle";
import { SettingsProvider, useSettings } from "./SettingsContext";

const mocks = vi.hoisted(() => ({
  createAudioPlayer: vi.fn(),
  impactAsync: vi.fn(),
  notificationAsync: vi.fn(),
}));

vi.mock("react-native", () => ({
  AccessibilityInfo: {
    isReduceMotionEnabled: () => Promise.resolve(false),
    addEventListener: () => ({ remove: vi.fn() }),
  },
  Platform: { OS: "web" },
}));
vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
}));
vi.mock("expo-audio", () => ({ createAudioPlayer: mocks.createAudioPlayer }));
vi.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success", Warning: "warning" },
  impactAsync: mocks.impactAsync,
  notificationAsync: mocks.notificationAsync,
}));

const SETTINGS_KEY = "duo.settings.v1";
let storageValues = new Map<string, string>();
const storage: Storage = {
  get length() { return storageValues.size; },
  clear: () => storageValues.clear(),
  getItem: (key) => storageValues.get(key) ?? null,
  key: (index) => [...storageValues.keys()][index] ?? null,
  removeItem: (key) => { storageValues.delete(key); },
  setItem: (key, value) => { storageValues.set(key, String(value)); },
};

function wrapper({ children }: React.PropsWithChildren) {
  return <SettingsProvider>{children}</SettingsProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  storageValues = new Map();
  vi.stubGlobal("localStorage", storage);
  document.documentElement.lang = "zh-CN";
  document.title = "Duo Arcade · 好友联机与 AI 小游戏";
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("web settings persistence", () => {
  it("hydrates English and AI preferences before the first interactive view", async () => {
    storage.setItem(SETTINGS_KEY, JSON.stringify({
      language: "en",
      ai: { difficulty: "hard", intelligence: "strategic", reactionSpeed: "quick" },
      reducedMotion: true,
    }));

    const view = renderHook(() => useSettings(), { wrapper });

    expect(view.result.current.settings).toMatchObject({
      language: "en",
      ai: { difficulty: "hard", intelligence: "strategic", reactionSpeed: "quick" },
      reducedMotion: true,
    });
    await waitFor(() => expect(view.result.current.ready).toBe(true));
    expect(document.documentElement.lang).toBe("en");
    expect(document.title).toBe("Duo Arcade · 好友联机与 AI 小游戏");
  });

  it("updates the document language and persists the latest selection", async () => {
    const view = renderHook(() => useSettings(), { wrapper });
    await waitFor(() => expect(view.result.current.ready).toBe(true));

    act(() => view.result.current.updateSetting("language", "en"));

    await waitFor(() => expect(document.documentElement.lang).toBe("en"));
    expect(document.title).toBe("Duo Arcade · 好友联机与 AI 小游戏");
    await waitFor(() => expect(JSON.parse(storage.getItem(SETTINGS_KEY) ?? "{}")).toMatchObject({ language: "en" }));
  });

  it("does not overwrite the current route title when language changes", async () => {
    const view = renderHook(() => {
      const settings = useSettings();
      useWebDocumentTitle(settings.settings.language === "en" ? "Settings · Duo Arcade" : "设置 · Duo Arcade");
      return settings;
    }, { wrapper });
    await waitFor(() => expect(view.result.current.ready).toBe(true));

    act(() => view.result.current.updateSetting("language", "en"));

    await waitFor(() => expect(document.documentElement.lang).toBe("en"));
    await waitFor(() => expect(document.title).toBe("Settings · Duo Arcade"));
  });
});
