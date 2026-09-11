// @vitest-environment happy-dom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageContext } from "@/i18n";
import SettingsScreen from "../app/settings";

const mocks = vi.hoisted(() => ({
  feedback: vi.fn(),
  resetSettings: vi.fn(),
  updateSetting: vi.fn(),
}));

vi.mock("react-native", () => vi.importActual<typeof import("react-native")>("react-native-web"));
vi.mock("expo-router", () => ({
  router: { back: vi.fn(), push: vi.fn(), replace: vi.fn() },
  usePathname: () => "/settings",
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "div" }));
vi.mock("@/settings/SettingsContext", () => ({
  useSettings: () => ({
    feedback: mocks.feedback,
    resetSettings: mocks.resetSettings,
    settings: {
      ai: { difficulty: "standard", intelligence: "balanced", reactionSpeed: "natural" },
      haptics: true,
      highContrast: false,
      language: "en",
      music: true,
      reducedMotion: false,
      soundEffects: true,
    },
    systemReducedMotion: false,
    updateSetting: mocks.updateSetting,
  }),
}));
vi.mock("@/lib/local-data", () => ({ clearLocalData: vi.fn(() => Promise.resolve()) }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("English settings experience", () => {
  it("renders language and all three AI controls without untranslated copy", () => {
    const view = render(
      <LanguageContext.Provider value="en">
        <SettingsScreen />
      </LanguageContext.Provider>,
    );
    const visibleFragments = [...view.container.querySelectorAll("*")].flatMap((element) =>
      [...element.childNodes]
        .filter((node) => node.nodeType === 3)
        .map((node) => node.textContent?.trim() ?? "")
        .filter(Boolean),
    );
    expect(document.title).toBe("Settings · Tandem Arcade");
    expect(visibleFragments.filter((copy) => copy !== "中文").join(" ")).not.toMatch(/[一-龥]/);
    expect(visibleFragments.join(" ")).not.toMatch(/[，。：；！？、]/u);
    for (const element of view.container.querySelectorAll("[aria-label]")) {
      const label = element.getAttribute("aria-label");
      if (label !== "中文") expect(label).not.toMatch(/[一-龥]/);
    }

    expect(screen.getByRole("radiogroup", { name: "Interface language" })).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "Difficulty" })).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "Intelligence & strategy" })).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "Reaction speed" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "English", checked: true })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Standard", checked: true })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Balanced", checked: true })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Natural", checked: true })).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: "Hard" }));
    fireEvent.click(screen.getByRole("radio", { name: "Strategic" }));
    fireEvent.click(screen.getByRole("radio", { name: "Quick" }));
    expect(mocks.updateSetting).toHaveBeenNthCalledWith(1, "ai", {
      difficulty: "hard", intelligence: "balanced", reactionSpeed: "natural",
    });
    expect(mocks.updateSetting).toHaveBeenNthCalledWith(2, "ai", {
      difficulty: "standard", intelligence: "strategic", reactionSpeed: "natural",
    });
    expect(mocks.updateSetting).toHaveBeenNthCalledWith(3, "ai", {
      difficulty: "standard", intelligence: "balanced", reactionSpeed: "quick",
    });
  });
});
