// @vitest-environment happy-dom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCoverHuntState, DEFAULT_GAME_OPTIONS, getCoverHuntView, hideBehindCover, shootCover, type CoverHuntState } from "@duo/game-core";
import { LanguageContext } from "@/i18n";
import { CoverHuntGame } from "./CoverHuntGame";

vi.mock("react-native", () => vi.importActual<typeof import("react-native")>("react-native-web"));
vi.mock("@/settings/SettingsContext", () => ({ useSettings: () => ({ feedback: vi.fn(), settings: { highContrast: false, reducedMotion: true } }) }));
const assetRequire = require as unknown as { extensions: Record<string, (module: { exports: unknown }, filename: string) => void> };
for (const extension of [".jpg", ".png"]) assetRequire.extensions[extension] = (module, filename) => { module.exports = filename; };
afterEach(cleanup);

function huntingState(): CoverHuntState {
  const initial = createCoverHuntState(0, 1000, { ...DEFAULT_GAME_OPTIONS, difficulty: "hard", length: "short" });
  const hidden = hideBehindCover(initial, 1, 5, 1001);
  if (!hidden.ok || hidden.state.kind !== "cover_hunt") throw new Error("Expected a hidden target");
  return hidden.state;
}

describe("Cover Hunt native layout and phase copy", () => {
  it("keeps the arena at its container width without an aspect-ratio minimum-height conflict", () => {
    render(<CoverHuntGame game={getCoverHuntView(huntingState(), 0)} ownSeat={0} phase="playing" onHide={vi.fn()} onScan={vi.fn()} onShoot={vi.fn()} />);
    // React Native Web forwards ImageBackground testID to its inner Image.
    const style = getComputedStyle(screen.getByTestId("cover-hunt-arena").parentElement!);
    expect(style.width).toBe("100%");
    expect(style.height).toBe("330px");
    expect(["", "auto"]).toContain(style.aspectRatio);
    expect(screen.getAllByRole("button", { name: /^掩体/ })).toHaveLength(6);
  });

  it("translates the active and exhausted scan button without silently firing a shot", () => {
    const state = huntingState();
    const onShoot = vi.fn();
    const view = render(<LanguageContext.Provider value="en"><CoverHuntGame game={getCoverHuntView(state, 0)} ownSeat={0} phase="playing" onHide={vi.fn()} onScan={vi.fn()} onShoot={onShoot} /></LanguageContext.Provider>);
    expect(screen.getByRole("button", { name: "Scan · 1" })).toBeTruthy();
    view.rerender(<LanguageContext.Provider value="en"><CoverHuntGame game={getCoverHuntView({ ...state, scanCharges: 0 }, 0)} ownSeat={0} phase="playing" onHide={vi.fn()} onScan={vi.fn()} onShoot={onShoot} /></LanguageContext.Provider>);
    expect(screen.getByRole("button", { name: "Scan · 0" }).getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Cover 6, Fuel pod" }));
    expect(onShoot).not.toHaveBeenCalled();
  });

  it.each([0, 1] as const)("only exposes the selected hiding spot to its owner, seat %s", (seat) => {
    render(<LanguageContext.Provider value="en"><CoverHuntGame game={getCoverHuntView(huntingState(), seat)} ownSeat={seat} phase="playing" onHide={vi.fn()} onScan={vi.fn()} onShoot={vi.fn()} /></LanguageContext.Provider>);
    expect(screen.getByRole("button", { name: "Cover 6, Fuel pod" }).getAttribute("aria-pressed")).toBe(String(seat === 1));
  });

  it.each([0, 5])("fully translates the final outcome after shooting cover %s", (shot) => {
    const state = huntingState();
    state.scores = [1, 1];
    state.round = 3;
    const result = shootCover(state, 0, shot, 1002);
    if (!result.ok || result.state.kind !== "cover_hunt") throw new Error("Expected final shot");
    const view = render(<LanguageContext.Provider value="en"><CoverHuntGame game={getCoverHuntView(result.state, 0)} ownSeat={0} phase="completed" onHide={vi.fn()} onScan={vi.fn()} onShoot={vi.fn()} /></LanguageContext.Provider>);
    expect(view.container.textContent).not.toMatch(/[\u3400-\u9fff]/u);
    expect(screen.getByText(`Cover Hunt complete · ${shot === 5 ? "Hunter scores · Direct hit" : "Hider scores · Escaped"}`)).toBeTruthy();
  });
});
