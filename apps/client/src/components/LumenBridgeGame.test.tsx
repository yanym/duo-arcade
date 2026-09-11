// @vitest-environment happy-dom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLumenBridgeState, DEFAULT_GAME_OPTIONS } from "@duo/game-core";
import { LumenBridgeGame } from "./LumenBridgeGame";
vi.mock("react-native", () => vi.importActual<typeof import("react-native")>("react-native-web"));
vi.mock("@/settings/SettingsContext", () => ({ useSettings: () => ({ feedback: vi.fn(), settings: { highContrast: false, reducedMotion: true } }) }));
afterEach(cleanup);

describe("lumen bridge role feedback", () => {
  it("sends an adjustment from the role-specific control", () => {
    const state = { ...createLumenBridgeState(0, 1000, 42, DEFAULT_GAME_OPTIONS), originLane: 3, arcOffset: 0, targetLane: 1 };
    const onAdjust = vi.fn();
    render(<LumenBridgeGame game={state} ownSeat={0} phase="playing" now={1001} onAdjust={onAdjust} onLock={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "发射台向上移动一条高度轨" }));
    expect(onAdjust).toHaveBeenCalledWith(-1);
  });
  it("shows both players' lock state during the resonance window", () => {
    const state = { ...createLumenBridgeState(0, 1000, 42, DEFAULT_GAME_OPTIONS), phase: "resonance" as const, confirmations: [true, false] as [boolean, boolean], turnDeadline: 2000 };
    render(<LumenBridgeGame game={state} ownSeat={0} phase="playing" now={1100} onAdjust={vi.fn()} onLock={vi.fn()} />);
    expect(screen.getByText("你 · 已锁定")).toBeTruthy();
    expect(screen.getByText("搭档 · 等待")).toBeTruthy();
    expect(screen.getByText("你的锁定已提交")).toBeTruthy();
  });
  it("turns a disconnected room into an explicit paused state", () => {
    const state = createLumenBridgeState(0, 1000, 42, DEFAULT_GAME_OPTIONS);
    render(<LumenBridgeGame game={state} ownSeat={0} phase="reconnect_grace" now={1001} onAdjust={vi.fn()} onLock={vi.fn()} />);
    expect(screen.getByText("光桥已暂停，等待连接恢复")).toBeTruthy();
    expect(screen.getByText("等待恢复")).toBeTruthy();
  });
  it("stops accepting input as soon as the shared action window closes", () => {
    const state = { ...createLumenBridgeState(0, 1000, 42, DEFAULT_GAME_OPTIONS), phase: "resonance" as const, turnDeadline: 1500 };
    const onLock = vi.fn();
    render(<LumenBridgeGame game={state} ownSeat={0} phase="playing" now={1500} onAdjust={vi.fn()} onLock={onLock} />);
    const lock = screen.getByRole("button", { name: "按下共振锁定" });
    expect((lock as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("时间已到，正在同步节点结果")).toBeTruthy();
    expect(screen.getByText("等待服务器结算")).toBeTruthy();
    fireEvent.click(lock);
    expect(onLock).not.toHaveBeenCalled();
  });
});
