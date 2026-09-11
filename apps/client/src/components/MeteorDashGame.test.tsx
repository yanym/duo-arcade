// @vitest-environment happy-dom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMeteorDashState, DEFAULT_GAME_OPTIONS } from "@duo/game-core";
import { MeteorDashGame } from "./MeteorDashGame";
const { playSound } = vi.hoisted(() => ({ playSound: vi.fn() }));
vi.mock("react-native", () => vi.importActual<typeof import("react-native")>("react-native-web"));
vi.mock("@/settings/SettingsContext", () => ({ useSettings: () => ({ feedback: vi.fn(), playSound, settings: { highContrast: false, reducedMotion: true } }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("meteor signal feedback", () => {
  it("does not put the rapidly changing countdown inside a live region", () => {
    const state = createMeteorDashState(1000, 42, DEFAULT_GAME_OPTIONS);
    render(<MeteorDashGame game={state} ownSeat={0} phase="playing" now={1001} onCatch={vi.fn()} />);
    expect(screen.getByText(/阵列正在随机校准/).closest("[aria-live]")).toBeNull();
    expect(screen.getByText("流星尚未进入观测区").getAttribute("aria-live")).toBe("polite");
  });
  it("sends the selected target, then prevents a second answer", () => {
    const state = { ...createMeteorDashState(1000, 42, DEFAULT_GAME_OPTIONS), phase: "catching" as const, targetCell: 2 };
    const onCatch = vi.fn();
    const view = render(<MeteorDashGame game={state} ownSeat={0} phase="playing" now={1001} onCatch={onCatch} />);
    fireEvent.click(screen.getByRole("button", { name: "信标 3，流星目标" }));
    expect(onCatch).toHaveBeenCalledWith(2);
    expect(playSound).toHaveBeenCalledTimes(1);
    view.rerender(<MeteorDashGame game={{ ...state, locked: [true, false] }} ownSeat={0} phase="playing" now={1002} onCatch={onCatch} />);
    expect(screen.getByText("坐标已封存，等待对手")).toBeTruthy();
    expect(screen.getAllByRole("button").every(b => b.getAttribute("aria-disabled") === "true")).toBe(true);
    expect(playSound).toHaveBeenCalledTimes(1);
  });
  it("describes two misses honestly instead of a close timing draw", () => {
    const state = { ...createMeteorDashState(1000, 42, DEFAULT_GAME_OPTIONS), phase: "round_result" as const };
    render(<MeteorDashGame game={state} ownSeat={0} phase="playing" now={1001} onCatch={vi.fn()} />);
    expect(screen.getByText("本轮双方未命中")).toBeTruthy();
    expect(screen.queryByText("毫厘之间，本轮平分秋色")).toBeNull();
  });
  it("does not sound or invite capture after completion", () => {
    const state = { ...createMeteorDashState(1000, 42, DEFAULT_GAME_OPTIONS), phase: "catching" as const, targetCell: 2 };
    render(<MeteorDashGame game={state} ownSeat={0} phase="completed" now={1001} onCatch={vi.fn()} />);
    expect(screen.getByText("本局已结束")).toBeTruthy();
    expect(playSound).not.toHaveBeenCalled();
  });
  it("turns zero seconds into an explicit settlement wait", () => {
    const state = { ...createMeteorDashState(1000, 42, DEFAULT_GAME_OPTIONS), phase: "catching" as const, targetCell: 2, turnDeadline: 1200 };
    render(<MeteorDashGame game={state} ownSeat={0} phase="playing" now={1200} onCatch={vi.fn()} />);
    expect(screen.getByText("捕捉窗口已关闭，正在结算")).toBeTruthy();
    expect(screen.getByText("双方操作已停止，等待服务器同步本轮结果")).toBeTruthy();
    expect(screen.getAllByRole("button").every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
  });
});
