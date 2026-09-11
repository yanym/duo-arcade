// @vitest-environment happy-dom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStormGridState, getStormGridView, DEFAULT_GAME_OPTIONS } from "@duo/game-core";
import { StormGridGame } from "./StormGridGame";
vi.mock("react-native", () => vi.importActual<typeof import("react-native")>("react-native-web"));
vi.mock("@/settings/SettingsContext", () => ({ useSettings: () => ({ feedback: vi.fn(), settings: { highContrast: false, reducedMotion: true } }) }));
afterEach(cleanup);

describe("storm role and window guidance", () => {
  it("hides the target from the operator and only offers calibration controls", () => {
    const state = createStormGridState(0, 1000, 42, DEFAULT_GAME_OPTIONS);
    const onShift = vi.fn();
    render(<StormGridGame game={getStormGridView(state, 1)} ownSeat={1} phase="playing" onShift={onShift} onToggle={vi.fn()} onDischarge={vi.fn()} />);
    expect(screen.getByText("节点 ? · 极性 ?")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "释放电网稳定脉冲" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "选择后一个电网节点" }));
    expect(onShift).toHaveBeenCalledWith(1);
  });
  it("lets the observer discharge only once the window opens", () => {
    const state = createStormGridState(0, 1000, 42, DEFAULT_GAME_OPTIONS);
    const onDischarge = vi.fn();
    const view = render(<StormGridGame game={getStormGridView(state, 0)} ownSeat={0} phase="playing" onShift={vi.fn()} onToggle={vi.fn()} onDischarge={onDischarge} />);
    expect(screen.getByRole("button", { name: "释放电网稳定脉冲" }).getAttribute("aria-disabled")).toBe("true");
    view.rerender(<StormGridGame game={getStormGridView({ ...state, phase: "discharge_window" }, 0)} ownSeat={0} phase="playing" onShift={vi.fn()} onToggle={vi.fn()} onDischarge={onDischarge} />);
    fireEvent.click(screen.getByRole("button", { name: "释放电网稳定脉冲" }));
    expect(onDischarge).toHaveBeenCalledOnce();
  });
  it("does not ask players to calibrate or wait for another window after completion", () => {
    const state = createStormGridState(0, 1000, 42, DEFAULT_GAME_OPTIONS);
    render(<StormGridGame game={getStormGridView(state, 0)} ownSeat={0} phase="completed" onShift={vi.fn()} onToggle={vi.fn()} onDischarge={vi.fn()} />);
    expect(screen.getByText("本局电网调度已结束")).toBeTruthy();
    expect(screen.queryByText("先让搭档完成校准，等待风暴窗口")).toBeNull();
    expect(screen.getByRole("button", { name: "释放电网稳定脉冲" }).getAttribute("aria-disabled")).toBe("true");
  });
});
