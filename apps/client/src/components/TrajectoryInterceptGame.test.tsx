// @vitest-environment happy-dom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTrajectoryInterceptState, getTrajectoryInterceptView, DEFAULT_GAME_OPTIONS } from "@duo/game-core";
import { TrajectoryInterceptGame } from "./TrajectoryInterceptGame";
vi.mock("react-native", () => vi.importActual<typeof import("react-native")>("react-native-web"));
vi.mock("@/settings/SettingsContext", () => ({ useSettings: () => ({ feedback: vi.fn(), settings: { highContrast: false, reducedMotion: true } }) }));
afterEach(cleanup);

describe("trajectory capture states", () => {
  it("disables pre-signal controls and names the waiting action", () => {
    const state = createTrajectoryInterceptState(1000, 42, DEFAULT_GAME_OPTIONS);
    render(<TrajectoryInterceptGame game={getTrajectoryInterceptView(state, 0)} ownSeat={0} phase="playing" onMove={vi.fn()} onCapture={vi.fn()} />);
    expect(screen.getByText("等待信号")).toBeTruthy();
    expect(screen.getAllByRole("button").every(b => b.getAttribute("aria-disabled") === "true")).toBe(true);
  });
  it("shows only the player's tracker and sends their movement", () => {
    const state = { ...createTrajectoryInterceptState(1000, 42, DEFAULT_GAME_OPTIONS), phase: "intercepting" as const, cursors: [2, 4] as [number, number], targetLane: 1 };
    const onMove = vi.fn();
    render(<TrajectoryInterceptGame game={getTrajectoryInterceptView(state, 0)} ownSeat={0} phase="playing" onMove={onMove} onCapture={vi.fn()} />);
    expect(screen.getByLabelText("目标位于轨道 2，你的追踪器位于轨道 3")).toBeTruthy();
    expect(screen.getAllByText("YOU")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "追踪器移到上一条轨道" }));
    expect(onMove).toHaveBeenCalledWith(-1);
  });
  it("labels missing submissions as final records rather than ongoing tracking", () => {
    const state = { ...createTrajectoryInterceptState(1000, 42, DEFAULT_GAME_OPTIONS), phase: "round_result" as const, roundOutcome: "intercept_timeout" as const };
    render(<TrajectoryInterceptGame game={getTrajectoryInterceptView(state, 0)} ownSeat={0} phase="completed" onMove={vi.fn()} onCapture={vi.fn()} />);
    expect(screen.getByText("对手未提交")).toBeTruthy();
    expect(screen.queryByText("对手追踪中")).toBeNull();
    expect(screen.getByText("已结束")).toBeTruthy();
    expect(screen.getByText("双方记录已公开")).toBeTruthy();
  });
});
