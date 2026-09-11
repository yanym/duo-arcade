// @vitest-environment happy-dom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createOrbitalRepairState, getOrbitalRepairView, createSkylineRescueState, getSkylineRescueView, createStarwayEscortState, getStarwayEscortView, DEFAULT_GAME_OPTIONS } from "@duo/game-core";
import { OrbitalRepairGame } from "./OrbitalRepairGame";
import { SkylineRescueGame } from "./SkylineRescueGame";
import { StarwayEscortGame } from "./StarwayEscortGame";

vi.mock("react-native", () => vi.importActual<typeof import("react-native")>("react-native-web"));
vi.mock("@/settings/SettingsContext", () => ({
  useSettings: () => ({ feedback: vi.fn(), settings: { highContrast: false, reducedMotion: true } }),
}));
afterEach(cleanup);

describe("cooperative role controls", () => {
  it("announces current orbital positions without leaking the engineer's hidden targets", () => {
    const state = createOrbitalRepairState(0, 1000, 42, DEFAULT_GAME_OPTIONS);
    const onRotate = vi.fn();
    render(<OrbitalRepairGame game={getOrbitalRepairView(state, 0)} ownSeat={0} phase="playing" onRotate={onRotate} onLaunch={vi.fn()} />);
    expect(screen.getAllByLabelText(/环当前刻度/)).toHaveLength(3);
    expect(screen.queryAllByLabelText(/目标刻度/)).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "外环逆时针" }));
    expect(onRotate).toHaveBeenCalledWith(0, "counterclockwise");
  });

  it("gives the launcher a named blueprint and does not offer rotation", () => {
    const state = createOrbitalRepairState(0, 1000, 42, { ...DEFAULT_GAME_OPTIONS, difficulty: "easy" });
    const onLaunch = vi.fn();
    render(<OrbitalRepairGame game={getOrbitalRepairView(state, 1)} ownSeat={1} phase="playing" onRotate={vi.fn()} onLaunch={onLaunch} />);
    expect(screen.getAllByLabelText(/^(外环|中环)目标刻度/)).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "外环顺时针" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "发射能量脉冲" }));
    expect(onLaunch).toHaveBeenCalledOnce();
  });

  it("never prompts further orbital work after completion", () => {
    const state = createOrbitalRepairState(0, 1000, 42, DEFAULT_GAME_OPTIONS);
    render(<OrbitalRepairGame game={getOrbitalRepairView(state, 0)} ownSeat={0} phase="completed" onRotate={vi.fn()} onLaunch={vi.fn()} />);
    expect(screen.getByText("本局已结束，查看上方结果")).toBeTruthy();
    expect(screen.getAllByRole("button").every(b => b.getAttribute("aria-disabled") === "true")).toBe(true);
  });

  it("lets only the pump choose pressure and prevents changes after locking", () => {
    const state = createSkylineRescueState(0, 1000, 42, DEFAULT_GAME_OPTIONS);
    const onPressure = vi.fn();
    const view = render(<SkylineRescueGame game={getSkylineRescueView(state, 0)} ownSeat={0} phase="playing" onAim={vi.fn()} onPressure={onPressure} />);
    expect(screen.getByRole("button", { name: "瞄准下层平台" }).getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "2 档水压，强流" }));
    expect(onPressure).toHaveBeenCalledWith(2);
    view.rerender(<SkylineRescueGame game={getSkylineRescueView({ ...state, locked: [true, false], pressureChoice: 2 }, 0)} ownSeat={0} phase="playing" onAim={vi.fn()} onPressure={onPressure} />);
    expect(screen.getAllByRole("button").every(b => b.getAttribute("aria-disabled") === "true")).toBe(true);
  });

  it("turns a reconnecting skyline session into an explicit pause", () => {
    const state = createSkylineRescueState(0, 1000, 42, DEFAULT_GAME_OPTIONS);
    render(<SkylineRescueGame game={getSkylineRescueView(state, 0)} ownSeat={0} phase="reconnect_grace" onAim={vi.fn()} onPressure={vi.fn()} />);
    expect(screen.getByText("救援已暂停，等待连接恢复")).toBeTruthy();
    expect(screen.getAllByRole("button").every(b => b.getAttribute("aria-disabled") === "true")).toBe(true);
  });

  it("announces execution rather than stale planning during the starway reveal", () => {
    const state = createStarwayEscortState(0, 1000, 42, DEFAULT_GAME_OPTIONS);
    render(<StarwayEscortGame game={getStarwayEscortView({ ...state, phase: "sector_result", sectorOutcome: "energy_collected", locked: [true, true] }, 0)} ownSeat={0} phase="playing" onRoute={vi.fn()} onShield={vi.fn()} />);
    expect(screen.getByText("双方方案已执行")).toBeTruthy();
    expect(screen.queryByText("搭档规划中")).toBeNull();
    expect(screen.getAllByRole("button").every(b => b.getAttribute("aria-disabled") === "true")).toBe(true);
  });

  it("shows retained state instead of live planning during a starway reconnect", () => {
    const state = createStarwayEscortState(0, 1000, 42, DEFAULT_GAME_OPTIONS);
    render(<StarwayEscortGame game={getStarwayEscortView(state, 0)} ownSeat={0} phase="reconnect_grace" onRoute={vi.fn()} onShield={vi.fn()} />);
    expect(screen.getByText("等待连接恢复")).toBeTruthy();
    expect(screen.getByText("护航已暂停；航段状态已保留")).toBeTruthy();
  });
});
