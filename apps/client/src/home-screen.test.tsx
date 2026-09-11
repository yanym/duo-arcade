// @vitest-environment happy-dom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageContext } from "@/i18n";
import HomeScreen from "../app/index";

const mocks = vi.hoisted(() => ({
  feedback: vi.fn(),
  push: vi.fn(),
}));

vi.mock("react-native", () => vi.importActual<typeof import("react-native")>("react-native-web"));
vi.mock("expo-router", () => ({
  router: { back: vi.fn(), push: mocks.push, replace: vi.fn() },
  usePathname: () => "/",
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "div" }));
vi.mock("@/settings/SettingsContext", () => ({
  useSettings: () => ({
    feedback: mocks.feedback,
    settings: {
      ai: { difficulty: "hard", intelligence: "strategic", reactionSpeed: "quick" },
      haptics: true,
      highContrast: false,
      language: "en",
      music: true,
      reducedMotion: true,
      soundEffects: true,
    },
  }),
}));
vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error { code = "test_error"; },
  createRoom: vi.fn(),
  getRoom: vi.fn(),
  getServiceHealth: vi.fn(() => Promise.resolve({ ok: true })),
  joinRoom: vi.fn(),
}));
vi.mock("@/lib/session", () => ({
  getIdentity: vi.fn(() => Promise.resolve({ nickname: "Player One", playerId: "player-one" })),
  getRecentRoomCodes: vi.fn(() => Promise.resolve([])),
  getRoomSession: vi.fn(() => Promise.resolve(null)),
  localizeGeneratedNickname: vi.fn((_nickname: string, language: string) => language === "en" ? "Player One" : "玩家一号"),
  removeRoomSession: vi.fn(() => Promise.resolve()),
  saveIdentity: vi.fn(() => Promise.resolve()),
  saveRoomSession: vi.fn(() => Promise.resolve()),
}));

function untranslatedFragments(container: HTMLElement): string[] {
  const fragments = new Set<string>();
  for (const element of [container, ...container.querySelectorAll("*")]) {
    for (const node of element.childNodes) {
      if (node.nodeType !== 3) continue;
      const value = node.textContent?.trim();
      if (value && /[一-龥]/.test(value)) fragments.add(value);
    }
  }
  for (const element of container.querySelectorAll("[aria-label]")) {
    const value = element.getAttribute("aria-label")?.trim();
    if (value && /[一-龥]/.test(value)) fragments.add(`aria-label: ${value}`);
  }
  return [...fragments];
}

function fusedEnglishFragments(container: HTMLElement): string[] {
  return [...new Set([...container.querySelectorAll("*")].flatMap((element) =>
    [...element.childNodes]
      .filter((node) => node.nodeType === 3)
      .map((node) => node.textContent?.trim() ?? "")
      .filter((value) => /[a-z][A-Z]/.test(value.replaceAll("iPhone", "iphone"))),
  ))];
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("English home and solo entry", () => {
  it("keeps the full home localized and exposes the AI mode state", async () => {
    const view = render(
      <LanguageContext.Provider value="en">
        <HomeScreen />
      </LanguageContext.Provider>,
    );

    await waitFor(() => expect(screen.getByRole("textbox", { name: "Your game nickname" })).toBeTruthy());
    expect(document.title).toBe("Duo Arcade · Two-player and AI games");
    expect(untranslatedFragments(view.container)).toEqual([]);
    expect(fusedEnglishFragments(view.container)).toEqual([]);
    expect(view.container.textContent).not.toMatch(/[，。：；！？、]/u);
    expect(screen.getByRole("radiogroup", { name: "PLAY MODE" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Play a friend. Invite a friend, then start together", checked: true })).toBeTruthy();
    const library = screen.getByRole("radiogroup", { name: "GAME LIBRARY" });
    expect(within(library).getAllByRole("radio")).toHaveLength(28);
    expect(within(library).getAllByRole("radio", { checked: true })).toHaveLength(1);

    fireEvent.click(screen.getByRole("radio", { name: "Play with AI. AI takes the other seat immediately" }));

    expect(screen.getByRole("radio", { name: "Play with AI. AI takes the other seat immediately", checked: true })).toBeTruthy();
    expect(screen.getByText("Hard · Strategic · Quick")).toBeTruthy();
    expect(screen.getByText("Play Gomoku with AI")).toBeTruthy();
    expect(untranslatedFragments(view.container)).toEqual([]);
    expect(fusedEnglishFragments(view.container)).toEqual([]);
    expect(view.container.textContent).not.toMatch(/[，。：；！？、]/u);
  });

});
