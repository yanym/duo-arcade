// @vitest-environment happy-dom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFogSonarState, createStarTraceState, DEFAULT_GAME_OPTIONS, getFogSonarView, getStarTraceView } from "@duo/game-core";
import { FogSonarGame } from "./FogSonarGame";
import { StarTraceGame } from "./StarTraceGame";

vi.mock("react-native", () => vi.importActual<typeof import("react-native")>("react-native-web"));
vi.mock("@/settings/SettingsContext", () => ({
  useSettings: () => ({ feedback: vi.fn(), settings: { highContrast: false, reducedMotion: true } }),
}));
afterEach(cleanup);

describe("direction controls", () => {
  it("keeps fog directions in two explicit three-cell rows", () => {
    const state = createFogSonarState(0, 1000, 42, DEFAULT_GAME_OPTIONS);
    const onPing = vi.fn();
    render(<FogSonarGame game={getFogSonarView(state, 0)} ownSeat={0} phase="playing" onPing={onPing} onSteer={vi.fn()} />);
    const rows = screen.getByTestId("fog-direction-pad").children;
    expect([...rows].map(row => row.children.length)).toEqual([3, 3]);
    expect(rows[0]!.children[1]!.getAttribute("aria-label")).toBe("发送脉冲向北");
    expect(rows[1]!.children[0]!.getAttribute("aria-label")).toBe("发送脉冲向西");
    fireEvent.click(screen.getByRole("button", { name: "发送脉冲向东" }));
    expect(onPing).toHaveBeenCalledWith("right");
  });

  it("keeps the helm map private and disables moves outside its boundary", () => {
    const state = { ...createFogSonarState(0, 1000, 42, DEFAULT_GAME_OPTIONS), ship: 0 };
    render(<FogSonarGame game={getFogSonarView(state, 1)} ownSeat={1} phase="playing" onPing={vi.fn()} onSteer={vi.fn()} />);
    expect(screen.getByRole("button", { name: "掌舵向北" }).getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByRole("button", { name: "掌舵向西" }).getAttribute("aria-disabled")).toBe("true");
    expect(screen.queryAllByLabelText(/，暗礁$/)).toHaveLength(0);
  });

  it("labels a paused fog voyage without exposing a live prompt", () => {
    const state = createFogSonarState(0, 1000, 42, DEFAULT_GAME_OPTIONS);
    render(<FogSonarGame game={getFogSonarView(state, 1)} ownSeat={1} phase="reconnect_grace" onPing={vi.fn()} onSteer={vi.fn()} />);
    expect(screen.getByText("雾航已暂停，等待连接恢复；当前海图与航位已保留")).toBeTruthy();
  });

  it("keeps the light pen in a three-by-three cross and maps the move correctly", () => {
    const state = { ...createStarTraceState(0, 1000, 42, DEFAULT_GAME_OPTIONS), cursor: { x: 2, y: 2 } };
    const onMove = vi.fn();
    render(<StarTraceGame game={getStarTraceView(state, 1)} ownSeat={1} phase="playing" onMove={onMove} />);
    const rows = screen.getByTestId("star-trace-direction-pad").children;
    expect([...rows].map(row => row.children.length)).toEqual([3, 3, 3]);
    expect(rows[0]!.children[1]!.getAttribute("aria-label")).toBe("光笔向上一格");
    expect(rows[2]!.children[1]!.getAttribute("aria-label")).toBe("光笔向下一格");
    fireEvent.click(screen.getByRole("button", { name: "光笔向左一格" }));
    expect(onMove).toHaveBeenCalledWith("left");
  });

  it("does not let the star guide move the partner's light pen", () => {
    const state = createStarTraceState(0, 1000, 42, DEFAULT_GAME_OPTIONS);
    render(<StarTraceGame game={getStarTraceView(state, 0)} ownSeat={0} phase="playing" onMove={vi.fn()} />);
    expect(screen.getAllByRole("button").every(button => button.getAttribute("aria-disabled") === "true")).toBe(true);
  });

  it("labels a paused star trace and keeps every direction disabled", () => {
    const state = createStarTraceState(0, 1000, 42, DEFAULT_GAME_OPTIONS);
    render(<StarTraceGame game={getStarTraceView(state, 1)} ownSeat={1} phase="reconnect_grace" onMove={vi.fn()} />);
    expect(screen.getByText("星图盲绘已暂停，等待连接恢复")).toBeTruthy();
    expect(screen.getAllByRole("button").every(button => button.getAttribute("aria-disabled") === "true")).toBe(true);
  });
});
