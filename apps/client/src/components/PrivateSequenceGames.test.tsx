// @vitest-environment happy-dom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefuseState, createEchoRelayState, DEFAULT_GAME_OPTIONS, getDefuseView, getEchoRelayView } from "@duo/game-core";
import { StarshipDefuseGame } from "./StarshipDefuseGame";
import { EchoRelayGame } from "./EchoRelayGame";

vi.mock("react-native", () => vi.importActual<typeof import("react-native")>("react-native-web"));
vi.mock("@/settings/SettingsContext", () => ({
  useSettings: () => ({ feedback: vi.fn(), settings: { highContrast: false, reducedMotion: true } }),
}));
afterEach(cleanup);

describe("private sequence game presentation", () => {
  it("numbers the analyst's symbols but disables their console", () => {
    const state = createDefuseState(0, 1000, 42, DEFAULT_GAME_OPTIONS);
    render(<StarshipDefuseGame game={getDefuseView(state, 1)} ownSeat={1} phase="playing" onPressSymbol={vi.fn()} />);
    expect(screen.getAllByLabelText(/^第 \d+ 个符号：/)).toHaveLength(state.sequenceLength);
    expect(screen.getAllByRole("button").every(button => button.getAttribute("aria-disabled") === "true")).toBe(true);
  });

  it("keeps the operator's answer hidden and sends their symbol", () => {
    const state = createDefuseState(0, 1000, 42, DEFAULT_GAME_OPTIONS);
    const onPressSymbol = vi.fn();
    render(<StarshipDefuseGame game={getDefuseView(state, 0)} ownSeat={0} phase="playing" onPressSymbol={onPressSymbol} />);
    expect(screen.queryAllByLabelText(/^第 \d+ 个符号：/)).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "三角符号" }));
    expect(onPressSymbol).toHaveBeenCalledWith("triangle");
  });

  it("does not announce another role swap when defusing is complete", () => {
    const state = { ...createDefuseState(0, 1000, 42, DEFAULT_GAME_OPTIONS), result: { kind: "success" as const, score: 1500, reason: "defuse_complete" as const } };
    render(<StarshipDefuseGame game={getDefuseView(state, 0)} ownSeat={0} phase="completed" onPressSymbol={vi.fn()} />);
    expect(screen.getByText("全部舱段已稳定，任务完成")).toBeTruthy();
    expect(screen.getAllByRole("button").every(button => button.getAttribute("aria-disabled") === "true")).toBe(true);
  });

  it("replaces live defuse instructions with a reconnect pause", () => {
    const state = createDefuseState(0, 1000, 42, DEFAULT_GAME_OPTIONS);
    render(<StarshipDefuseGame game={getDefuseView(state, 0)} ownSeat={0} phase="reconnect_grace" onPressSymbol={vi.fn()} />);
    expect(screen.getByText("拆弹协作已暂停，等待连接恢复")).toBeTruthy();
    expect(screen.getAllByRole("button").every(button => button.getAttribute("aria-disabled") === "true")).toBe(true);
  });

  it("offers named preview cards only to the echo decoder", () => {
    const state = createEchoRelayState(0, 1000, 42, DEFAULT_GAME_OPTIONS);
    const view = render(<EchoRelayGame game={getEchoRelayView(state, 0)} ownSeat={0} phase="playing" onPressTone={vi.fn()} />);
    expect(screen.getAllByRole("button", { name: /^第 \d+ 枚，/ })).toHaveLength(state.sequenceLength);
    view.rerender(<EchoRelayGame game={getEchoRelayView(state, 1)} ownSeat={1} phase="playing" onPressTone={vi.fn()} />);
    expect(screen.queryAllByRole("button", { name: /^第 \d+ 枚，/ })).toHaveLength(0);
    expect(screen.getByText("脉冲序列只发送给译码员")).toBeTruthy();
  });

  it("makes a paused echo relay explicit without enabling preview or input", () => {
    const state = createEchoRelayState(0, 1000, 42, DEFAULT_GAME_OPTIONS);
    render(<EchoRelayGame game={getEchoRelayView(state, 0)} ownSeat={0} phase="reconnect_grace" onPressTone={vi.fn()} />);
    expect(screen.getByText("回声中继已暂停，等待连接恢复")).toBeTruthy();
    expect(screen.getAllByRole("button").every(button => button.getAttribute("aria-disabled") === "true")).toBe(true);
  });
});
