// @vitest-environment happy-dom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGomokuState } from "@duo/game-core";
import { LanguageContext } from "@/i18n";
import { GomokuBoard } from "./GomokuBoard";

const { dimensions, platform } = vi.hoisted(() => ({
  dimensions: { width: 428, height: 926, scale: 3, fontScale: 1 },
  platform: { OS: "web" },
}));
vi.mock("react-native", async () => {
  const native = await vi.importActual<typeof import("react-native")>("react-native-web");
  return { ...native, Platform: { ...native.Platform, get OS() { return platform.OS; } }, useWindowDimensions: () => dimensions };
});
vi.mock("@/settings/SettingsContext", () => ({ useSettings: () => ({ feedback: vi.fn(), settings: { highContrast: false } }) }));
afterEach(() => { cleanup(); platform.OS = "web"; });

describe("Gomoku board coordinates", () => {
  it.each([320, 390, 428, 430, 1024])("positions all 225 intersections without fractional-width wrapping at %i px", (width) => {
    dimensions.width = width;
    const game = createGomokuState(0, 1000);
    render(<LanguageContext.Provider value="en"><GomokuBoard game={game} phase="playing" canPlay onPlace={vi.fn()} /></LanguageContext.Provider>);
    const cells = screen.getAllByRole("button");
    expect(cells).toHaveLength(225);
    const size = (Math.floor(Math.min(width - 40, dimensions.height * 0.6, 560)) - 12) / 15;
    cells.forEach((cell, index) => {
      const style = getComputedStyle(cell);
      expect(style.position).toBe("absolute");
      expect(parseFloat(style.left)).toBeCloseTo((index % 15) * size, 4);
      expect(parseFloat(style.top)).toBeCloseTo(Math.floor(index / 15) * size, 4);
      expect(parseFloat(style.width)).toBeCloseTo(size, 4);
    });
  });

  it("keeps visual coordinates, action coordinates, and occupied-cell labels aligned", () => {
    const game = createGomokuState(0, 1000);
    game.board[112] = 1;
    game.lastMove = 112;
    const onPlace = vi.fn();
    render(<LanguageContext.Provider value="en"><GomokuBoard game={game} phase="playing" canPlay onPlace={onPlace} /></LanguageContext.Provider>);
    expect(screen.getByRole("button", { name: "Row 8, column 8, black" }).getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Row 9, column 8, empty" }));
    expect(onPlace).toHaveBeenCalledWith(8, 7);
  });

  it("gives iOS players touch instructions rather than keyboard commands", () => {
    platform.OS = "ios";
    render(<LanguageContext.Provider value="en"><GomokuBoard game={createGomokuState(0, 1000)} phase="playing" canPlay onPlace={vi.fn()} /></LanguageContext.Provider>);
    expect(screen.getByLabelText("15 by 15 Gomoku board. Choose an empty intersection to place a stone.")).toBeTruthy();
    expect(screen.queryByLabelText(/Press Tab/)).toBeNull();
  });
});
