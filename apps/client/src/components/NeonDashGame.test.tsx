// @vitest-environment happy-dom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createNeonDashState, getNeonDashView, DEFAULT_GAME_OPTIONS } from "@duo/game-core";
import { NeonDashGame } from "./NeonDashGame";
const { playSound } = vi.hoisted(() => ({ playSound: vi.fn() }));
vi.mock("react-native", () => vi.importActual<typeof import("react-native")>("react-native-web"));
vi.mock("@/settings/SettingsContext", () => ({ useSettings: () => ({ feedback: vi.fn(), playSound, settings: { highContrast: false, reducedMotion: true } }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("neon dash reaction states", () => {
  it("blocks early taps while the lane is still scanning", () => {
    const state = createNeonDashState(1000, 42, DEFAULT_GAME_OPTIONS);
    render(<NeonDashGame game={getNeonDashView(state, 0)} ownSeat={0} phase="playing" now={1001} onDodge={vi.fn()} />);
    expect(screen.getByText("赛道正在重组，保持准备")).toBeTruthy();
    expect(screen.getByText(/随机信号还有/).closest("[aria-live]")).toBeNull();
    expect(screen.getAllByRole("button").every((button) => button.getAttribute("aria-disabled") === "true")).toBe(true);
  });
  it("submits one available reaction without revealing the partner's action", () => {
    const state = { ...createNeonDashState(1000, 42, DEFAULT_GAME_OPTIONS), phase: "reacting" as const, obstacle: "low_barrier" as const, turnDeadline: 5000 };
    const onDodge = vi.fn();
    render(<NeonDashGame game={getNeonDashView(state, 0)} ownSeat={0} phase="playing" now={1100} onDodge={onDodge} />);
    fireEvent.click(screen.getByRole("button", { name: "跑酷动作：跳跃" }));
    expect(onDodge).toHaveBeenCalledWith("jump");
    expect(screen.queryByText(/对手动作/)).toBeNull();
  });
  it("does not play a fresh signal or show an active race after completion", () => {
    const state = { ...createNeonDashState(1000, 42, DEFAULT_GAME_OPTIONS), phase: "reacting" as const, obstacle: "low_barrier" as const };
    render(<NeonDashGame game={getNeonDashView(state, 0)} ownSeat={0} phase="completed" now={1100} onDodge={vi.fn()} />);
    expect(screen.getByText("本局障碍赛已结束")).toBeTruthy();
    expect(playSound).not.toHaveBeenCalled();
  });
  it("does not invite another dodge after the reaction window expires", () => {
    const state = { ...createNeonDashState(1000, 42, DEFAULT_GAME_OPTIONS), phase: "reacting" as const, obstacle: "low_barrier" as const, turnDeadline: 1200 };
    render(<NeonDashGame game={getNeonDashView(state, 0)} ownSeat={0} phase="playing" now={1200} onDodge={vi.fn()} />);
    expect(screen.getByText("动作窗口已关闭，正在结算")).toBeTruthy();
    expect(screen.getByText("双方操作已停止，等待服务器同步本段结果")).toBeTruthy();
    expect(screen.getAllByRole("button").every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
  });
});
