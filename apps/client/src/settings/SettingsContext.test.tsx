// @vitest-environment happy-dom
import React from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsProvider, useSettings, type SoundCue } from "./SettingsContext";

const mocks = vi.hoisted(() => ({
  createAudioPlayer: vi.fn(),
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  impactAsync: vi.fn(),
  notificationAsync: vi.fn(),
}));

vi.mock("react-native", () => ({
  AccessibilityInfo: {
    isReduceMotionEnabled: () => Promise.resolve(false),
    addEventListener: () => ({ remove: vi.fn() }),
  },
  Platform: { OS: "ios" },
}));
vi.mock("expo-secure-store", () => ({
  getItemAsync: mocks.getItemAsync,
  setItemAsync: mocks.setItemAsync,
}));
vi.mock("expo-audio", () => ({ createAudioPlayer: mocks.createAudioPlayer }));
vi.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success", Warning: "warning" },
  impactAsync: mocks.impactAsync,
  notificationAsync: mocks.notificationAsync,
}));

function wrapper({ children }: React.PropsWithChildren) {
  return <SettingsProvider>{children}</SettingsProvider>;
}

function player() {
  return {
    loop: false,
    volume: 1,
    pause: vi.fn(),
    play: vi.fn(),
    release: vi.fn(),
    seekTo: vi.fn(() => Promise.resolve()),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getItemAsync.mockResolvedValue(null);
  mocks.setItemAsync.mockResolvedValue(undefined);
  mocks.impactAsync.mockResolvedValue(undefined);
  mocks.notificationAsync.mockResolvedValue(undefined);
  mocks.createAudioPlayer.mockImplementation(player);
});

afterEach(() => {
  cleanup();
});

describe("settings feedback lifecycle", () => {
  it("migrates older preferences and persists language and AI controls", async () => {
    mocks.getItemAsync.mockResolvedValue(JSON.stringify({ soundEffects: false, haptics: true }));
    const view = renderHook(() => useSettings(), { wrapper });
    await waitFor(() => expect(view.result.current.ready).toBe(true));
    expect(view.result.current.settings).toMatchObject({
      language: "zh",
      ai: { difficulty: "standard", intelligence: "balanced", reactionSpeed: "natural" },
      soundEffects: false,
    });

    act(() => view.result.current.updateSetting("language", "en"));
    act(() => view.result.current.updateSetting("ai", {
      difficulty: "hard",
      intelligence: "strategic",
      reactionSpeed: "quick",
    }));
    await waitFor(() => expect(mocks.setItemAsync).toHaveBeenCalled());
    const latest = JSON.parse(mocks.setItemAsync.mock.calls.at(-1)?.[1] as string);
    expect(latest).toMatchObject({
      language: "en",
      ai: { difficulty: "hard", intelligence: "strategic", reactionSpeed: "quick" },
    });
  });

  it("does not initialize audio until a sound is actually requested", async () => {
    const view = renderHook(() => useSettings(), { wrapper });
    await waitFor(() => expect(view.result.current.ready).toBe(true));
    expect(mocks.createAudioPlayer).not.toHaveBeenCalled();

    act(() => view.result.current.playSound("tap"));
    expect(mocks.createAudioPlayer).toHaveBeenCalledTimes(1);
    const tapPlayer = mocks.createAudioPlayer.mock.results[0]?.value as ReturnType<typeof player>;
    await waitFor(() => expect(tapPlayer.play).toHaveBeenCalledOnce());

    act(() => view.result.current.playSound("tap"));
    expect(mocks.createAudioPlayer).toHaveBeenCalledTimes(1);

    act(() => view.result.current.playSound("hit"));
    expect(mocks.createAudioPlayer).toHaveBeenCalledTimes(2);
    const hitPlayer = mocks.createAudioPlayer.mock.results[1]?.value as ReturnType<typeof player>;
    view.unmount();
    expect(tapPlayer.release).toHaveBeenCalledOnce();
    expect(hitPlayer.release).toHaveBeenCalledOnce();
  });

  it("serializes rapid preference writes so the newest settings persist last", async () => {
    let finishFirstWrite: (() => void) | undefined;
    mocks.setItemAsync
      .mockImplementationOnce(() => new Promise<void>((resolve) => { finishFirstWrite = resolve; }))
      .mockResolvedValue(undefined);
    const view = renderHook(() => useSettings(), { wrapper });
    await waitFor(() => expect(view.result.current.ready).toBe(true));

    act(() => view.result.current.updateSetting("language", "en"));
    await waitFor(() => expect(mocks.setItemAsync).toHaveBeenCalledTimes(1));
    act(() => view.result.current.updateSetting("ai", {
      difficulty: "hard",
      intelligence: "strategic",
      reactionSpeed: "quick",
    }));
    expect(mocks.setItemAsync).toHaveBeenCalledTimes(1);

    finishFirstWrite?.();
    await waitFor(() => expect(mocks.setItemAsync).toHaveBeenCalledTimes(2));
    const latest = JSON.parse(mocks.setItemAsync.mock.calls[1]?.[1] as string);
    expect(latest).toMatchObject({
      language: "en",
      ai: { difficulty: "hard", intelligence: "strategic", reactionSpeed: "quick" },
    });
  });

  it("keeps gameplay responsive when audio initialization is unavailable", async () => {
    const view = renderHook(() => useSettings(), { wrapper });
    await waitFor(() => expect(view.result.current.ready).toBe(true));
    mocks.createAudioPlayer.mockImplementationOnce(() => { throw new Error("audio unavailable"); });

    expect(() => {
      act(() => view.result.current.playSound("scan" as SoundCue));
    }).not.toThrow();
  });
});
