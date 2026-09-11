// @vitest-environment happy-dom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDropRescueState, getDropRescueView, DEFAULT_GAME_OPTIONS } from "@duo/game-core";
import { DropRescueGame } from "./DropRescueGame";
const { feedback, playSound } = vi.hoisted(() => ({ feedback: vi.fn(), playSound: vi.fn() }));
vi.mock("react-native", () => vi.importActual<typeof import("react-native")>("react-native-web"));
vi.mock("@/settings/SettingsContext", () => ({ useSettings: () => ({ feedback, playSound, settings: { highContrast: false, reducedMotion: true } }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("drop rescue private telemetry", () => {
  it("shows the pilot only navigation telemetry", () => {
    const state = createDropRescueState(0, 1000, 42, DEFAULT_GAME_OPTIONS);
    render(<DropRescueGame game={getDropRescueView(state, 0)} ownSeat={0} phase="playing" now={1001} onMove={vi.fn()} onBrake={vi.fn()} onLock={vi.fn()} />);
    expect(screen.getByText(/着陆台 .*侧风/)).toBeTruthy();
    expect(screen.queryByText(/入场速度/)).toBeNull();
  });
  it("sends each role's own adjustment and lock actions", () => {
    const state = { ...createDropRescueState(0, 1000, 42, DEFAULT_GAME_OPTIONS), podLane: 2 };
    const onMove = vi.fn();
    const onLock = vi.fn();
    render(<DropRescueGame game={getDropRescueView(state, 0)} ownSeat={0} phase="playing" now={1001} onMove={onMove} onBrake={vi.fn()} onLock={onLock} />);
    fireEvent.click(screen.getByRole("button", { name: "救援舱向左侧推一条航道" }));
    fireEvent.click(screen.getByRole("button", { name: "锁定航向" }));
    expect(onMove).toHaveBeenCalledWith(-1);
    expect(onLock).toHaveBeenCalledOnce();
  });
  it("labels reconnect grace without leaving a live countdown", () => {
    const state = createDropRescueState(0, 1000, 42, DEFAULT_GAME_OPTIONS);
    render(<DropRescueGame game={getDropRescueView(state, 0)} ownSeat={0} phase="reconnect_grace" now={1001} onMove={vi.fn()} onBrake={vi.fn()} onLock={vi.fn()} />);
    expect(screen.getByText("救援已暂停，等待连接恢复")).toBeTruthy();
    expect(screen.getByText("已暂停")).toBeTruthy();
    expect(screen.getByText("状态已保留")).toBeTruthy();
  });
  it("emits one result feedback event without a duplicate direct sound", () => {
    const state = { ...createDropRescueState(0, 1000, 42, DEFAULT_GAME_OPTIONS), phase: "landing_result" as const, lastOutcome: "soft_landing" as const, finalLane: 2, finalSpeed: 2 };
    render(<DropRescueGame game={getDropRescueView(state, 0)} ownSeat={0} phase="playing" now={1001} onMove={vi.fn()} onBrake={vi.fn()} onLock={vi.fn()} />);
    expect(feedback).toHaveBeenCalledTimes(1);
    expect(playSound).not.toHaveBeenCalled();
    expect(screen.getByText("着陆遥测复盘 · 双方可见")).toBeTruthy();
    expect(screen.getByText(/入场 .*安全/)).toBeTruthy();
  });
  it("leaves the final feedback to the room result layer", () => {
    const state = {
      ...createDropRescueState(0, 1000, 42, DEFAULT_GAME_OPTIONS),
      phase: "landing_result" as const,
      lastOutcome: "soft_landing" as const,
      finalLane: 2,
      finalSpeed: 2,
      result: { kind: "success" as const, score: 900, reason: "drop_rescue_complete" as const },
    };
    render(<DropRescueGame game={getDropRescueView(state, 0)} ownSeat={0} phase="completed" now={1001} onMove={vi.fn()} onBrake={vi.fn()} onLock={vi.fn()} />);
    expect(feedback).not.toHaveBeenCalled();
  });
  it("stops both controls and partner prompts when descent time expires", () => {
    const state = { ...createDropRescueState(0, 1000, 42, DEFAULT_GAME_OPTIONS), turnDeadline: 1200 };
    render(<DropRescueGame game={getDropRescueView(state, 0)} ownSeat={0} phase="playing" now={1200} onMove={vi.fn()} onBrake={vi.fn()} onLock={vi.fn()} />);
    expect(screen.getByText("决策时间已到，正在同步着陆结果")).toBeTruthy();
    expect(screen.getByText("等待服务器结算")).toBeTruthy();
    expect(screen.getAllByRole("button").every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
  });
});
