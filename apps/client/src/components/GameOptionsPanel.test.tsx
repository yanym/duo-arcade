// @vitest-environment happy-dom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSignalBluffState, GAME_DIFFICULTIES, GAME_LENGTHS, GAME_PACES } from "@duo/game-core";
import { LanguageContext } from "@/i18n";
import { GAME_INFO } from "@/lib/games";
import { GameOptionsPanel } from "./GameOptionsPanel";

vi.mock("react-native", () => vi.importActual<typeof import("react-native")>("react-native-web"));
afterEach(cleanup);

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
