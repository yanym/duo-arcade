// @vitest-environment happy-dom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMagnetHaulState, DEFAULT_GAME_OPTIONS } from "@duo/game-core";
import { MagnetHaulGame } from "./MagnetHaulGame";
vi.mock("react-native", () => vi.importActual<typeof import("react-native")>("react-native-web"));
vi.mock("@/settings/SettingsContext", () => ({ useSettings: () => ({ feedback: vi.fn(), settings: { highContrast: false, reducedMotion: true } }) }));
afterEach(cleanup);

describe("magnet haul coordination", () => {
  it("moves only the local magnet and immediately reports the action", () => {
    const state = { ...createMagnetHaulState(1000, 42, DEFAULT_GAME_OPTIONS), laneCount: 5 as const, magnetPositions: [2, 2] as [number, number], targetPositions: [1, 2] as [number, number], tensionLimit: 3 as const };
    const onMove = vi.fn();
    render(<MagnetHaulGame game={state} ownSeat={0} phase="playing" onMove={onMove} />);
    fireEvent.click(screen.getByRole("button", { name: "磁臂向上移动一条高度轨" }));
    expect(onMove).toHaveBeenCalledWith(-1);
    expect(screen.getByText("控制左侧磁臂 · 高度轨 3")).toBeTruthy();
  });
  it("disables moves that would exceed the shared tension limit", () => {
    const state = { ...createMagnetHaulState(1000, 42, DEFAULT_GAME_OPTIONS), magnetPositions: [1, 3] as [number, number], tensionLimit: 2 as const };
    render(<MagnetHaulGame game={state} ownSeat={0} phase="playing" onMove={vi.fn()} />);
    expect(screen.getByRole("button", { name: "磁臂向上移动一条高度轨" }).getAttribute("aria-disabled")).toBe("true");
  });
  it("announces completion instead of inviting another move", () => {
    const state = createMagnetHaulState(1000, 42, DEFAULT_GAME_OPTIONS);
    render(<MagnetHaulGame game={state} ownSeat={0} phase="completed" onMove={vi.fn()} />);
    expect(screen.getByText("本局搬运已结束")).toBeTruthy();
    expect(screen.getByText("本局结束")).toBeTruthy();
    expect(screen.getAllByRole("button").every((button) => button.getAttribute("aria-disabled") === "true")).toBe(true);
  });
});
