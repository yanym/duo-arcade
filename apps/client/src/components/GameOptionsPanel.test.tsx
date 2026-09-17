// @vitest-environment happy-dom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSignalBluffState, GAME_DIFFICULTIES, GAME_LENGTHS, GAME_PACES } from "@duo/game-core";
import { LanguageContext } from "@/i18n";
import { GAME_INFO } from "@/lib/games";
import { GameOptionsPanel } from "./GameOptionsPanel";

const layout = vi.hoisted(() => ({ width: 1024, height: 768, scale: 1, fontScale: 1 }));
vi.mock("react-native", async () => ({
  ...await vi.importActual<typeof import("react-native")>("react-native-web"),
  useWindowDimensions: () => layout,
}));
afterEach(() => {
  cleanup();
  Object.assign(layout, { width: 1024, height: 768, scale: 1, fontScale: 1 });
});

describe("Game option control layout", () => {
  it.each([320, 390])("gives option labels their own row at %spx", (width) => {
    layout.width = width;
    render(<LanguageContext.Provider value="en"><GameOptionsPanel game={GAME_INFO.signal_bluff}
      options={{ difficulty: "standard", pace: "standard", length: "short" }} onChange={vi.fn()} /></LanguageContext.Provider>);
    const group = screen.getByRole("button", { name: "Pace: Relaxed" }).parentElement!;
    expect(getComputedStyle(group.parentElement!).flexDirection).toBe("column");
    expect(getComputedStyle(group).width).toBe("100%");
    expect(getComputedStyle(group).flexBasis).toBe("auto");
    expect(getComputedStyle(group).flexDirection).toBe("row");
  });

  it.each([320, 1024])("stacks full-width choices for larger text at %spx without changing rules", (width) => {
    Object.assign(layout, { width, fontScale: 1.4 });
    const onChange = vi.fn();
    const options = { difficulty: "standard", pace: "relaxed", length: "long" } as const;
    render(<LanguageContext.Provider value="en"><GameOptionsPanel game={GAME_INFO.signal_bluff}
      options={options} onChange={onChange} /></LanguageContext.Provider>);
    const expert = screen.getByRole("button", { name: "Difficulty: Expert" });
    expect(getComputedStyle(expert.parentElement!).flexDirection).toBe("column");
    expect(getComputedStyle(expert).flexBasis).toBe("auto");
    expect(getComputedStyle(expert).minHeight).toBe("44px");
    fireEvent.click(expert);
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...options, difficulty: "hard" });
    expect(screen.getByRole("button", { name: "Pace: Relaxed" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps a horizontal label and controls when a tablet has room", () => {
    render(<LanguageContext.Provider value="en"><GameOptionsPanel game={GAME_INFO.gomoku}
      options={{ difficulty: "standard", pace: "standard", length: "short" }} onChange={vi.fn()} /></LanguageContext.Provider>);
    const group = screen.getByRole("button", { name: "Pace: Relaxed" }).parentElement!;
    expect(getComputedStyle(group.parentElement!).flexDirection).toBe("row");
    expect(getComputedStyle(group).flexDirection).toBe("row");
  });
});

describe("Signal Bluff option summary", () => {
  for (const difficulty of GAME_DIFFICULTIES) {
    for (const pace of GAME_PACES) {
      for (const length of GAME_LENGTHS) {
        it(`matches the actual ${difficulty}/${pace}/${length} rules and match-long scan budget`, () => {
          const options = { difficulty, pace, length };
          const state = createSignalBluffState(0, 1000, 42, options);
          const scans = state.scanCharges[0];
          render(<LanguageContext.Provider value="en"><GameOptionsPanel game={GAME_INFO.signal_bluff}
            options={options} onChange={vi.fn()} /></LanguageContext.Provider>);
          expect(screen.getByText(`${state.totalRounds} rounds · ${state.signalCount} runes · ${scans} scan${scans === 1 ? "" : "s"} each per match · claim ${state.claimDurationMs / 1000}s / judge ${state.judgeDurationMs / 1000}s`)).toBeTruthy();
        });
      }
    }
  }

  it("also describes the expert scan allowance truthfully in Chinese", () => {
    render(<GameOptionsPanel game={GAME_INFO.signal_bluff} options={{ difficulty: "hard", pace: "relaxed", length: "short" }} onChange={vi.fn()} />);
    expect(screen.getByText("5 轮 · 5 种符文 · 每人整局 1 次扫描 · 谎报 30 秒/判断 20 秒")).toBeTruthy();
  });
});
