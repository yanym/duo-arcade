// @vitest-environment happy-dom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createNovaVolleyState, DEFAULT_GAME_OPTIONS } from "@duo/game-core";
import { NovaVolleyGame } from "./NovaVolleyGame";
const { playSound } = vi.hoisted(() => ({ playSound: vi.fn() }));
vi.mock("react-native", () => vi.importActual<typeof import("react-native")>("react-native-web"));
vi.mock("@/settings/SettingsContext", () => ({ useSettings: () => ({ feedback: vi.fn(), playSound, settings: { highContrast: false, reducedMotion: true } }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("nova volley turn clarity", () => {
  it("enables movement only for the current receiver", () => {
    const state = { ...createNovaVolleyState(0, 1000, 42, DEFAULT_GAME_OPTIONS), paddleLanes: [2, 2] as [number, number] };
    const onMove = vi.fn();
    const view = render(<NovaVolleyGame game={state} ownSeat={0} phase="playing" now={1001} onMove={onMove} onStrike={vi.fn()} />);
    expect(screen.getByText(/秒后进入击球窗/).closest("[aria-live]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "挡板向左移动一条轨道" }));
    expect(onMove).toHaveBeenCalledWith(-1);
    view.rerender(<NovaVolleyGame game={state} ownSeat={1} phase="playing" now={1001} onMove={onMove} onStrike={vi.fn()} />);
    expect(screen.getAllByRole("button").every((button) => button.getAttribute("aria-disabled") === "true")).toBe(true);
  });
  it("sends the receiver's selected return lane during the strike window", () => {
    const state = { ...createNovaVolleyState(0, 1000, 42, DEFAULT_GAME_OPTIONS), phase: "strike_window" as const, paddleLanes: [1, 2] as [number, number], incomingLane: 1, turnDeadline: 5000 };
    const onStrike = vi.fn();
    render(<NovaVolleyGame game={state} ownSeat={0} phase="playing" now={1001} onMove={vi.fn()} onStrike={onStrike} />);
    fireEvent.click(screen.getByRole("button", { name: "回击到 1 号轨道" }));
    expect(onStrike).toHaveBeenCalledWith(0);
  });
  it("does not describe a completed match as another incoming ball", () => {
    const state = { ...createNovaVolleyState(0, 1000, 42, DEFAULT_GAME_OPTIONS), phase: "point_result" as const, pointWinner: 0 as const, lastOutcome: "misaligned_return" as const, result: { kind: "win" as const, winnerSeat: 0 as const, reason: "nova_volley_score" as const } };
    render(<NovaVolleyGame game={state} ownSeat={0} phase="completed" now={1001} onMove={vi.fn()} onStrike={vi.fn()} />);
    expect(screen.getByText("本局星弧对攻已结束")).toBeTruthy();
    expect(screen.getByText("本局已结束")).toBeTruthy();
    expect(playSound).not.toHaveBeenCalled();
  });
  it("plays an incoming-ball cue for the receiver only", () => {
    const state = { ...createNovaVolleyState(0, 1000, 42, DEFAULT_GAME_OPTIONS), rallyCount: 1 };
    render(<NovaVolleyGame game={state} ownSeat={1} phase="playing" now={1001} onMove={vi.fn()} onStrike={vi.fn()} />);
    expect(playSound).not.toHaveBeenCalled();
  });
  it("replaces receiver prompts after the ball window closes", () => {
    const state = { ...createNovaVolleyState(0, 1000, 42, DEFAULT_GAME_OPTIONS), phase: "strike_window" as const, turnDeadline: 1200 };
    render(<NovaVolleyGame game={state} ownSeat={0} phase="playing" now={1200} onMove={vi.fn()} onStrike={vi.fn()} />);
    expect(screen.getByText("击球窗口已关闭，正在结算")).toBeTruthy();
    expect(screen.getAllByText("等待结算").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button").every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
  });
});
