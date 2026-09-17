// @vitest-environment happy-dom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createNovaVolleyState, DEFAULT_GAME_OPTIONS } from "@duo/game-core";
import { LanguageContext } from "@/i18n";
import { NovaVolleyGame } from "./NovaVolleyGame";
const { playSound, dimensions } = vi.hoisted(() => ({ playSound: vi.fn(), dimensions: { width: 1024, height: 768, scale: 1, fontScale: 1 } }));
vi.mock("react-native", async () => ({ ...await vi.importActual<typeof import("react-native")>("react-native-web"), useWindowDimensions: () => dimensions }));
vi.mock("@/settings/SettingsContext", () => ({ useSettings: () => ({ feedback: vi.fn(), playSound, settings: { highContrast: false, reducedMotion: true } }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); dimensions.width = 1024; });

describe("nova volley turn clarity", () => {
  it("keeps five expert return targets at touch size while reducing narrow-screen decoration", () => {
    dimensions.width = 320;
    const state = { ...createNovaVolleyState(0, 1000, 42, { ...DEFAULT_GAME_OPTIONS, difficulty: "hard" }), phase: "strike_window" as const, turnDeadline: 5000 };
    render(<LanguageContext.Provider value="en"><NovaVolleyGame game={state} ownSeat={0} phase="playing" now={1001} onMove={vi.fn()} onStrike={vi.fn()} /></LanguageContext.Provider>);
    expect(screen.queryByText("NOVA VOLLEY // ARC COURT")).toBeNull();
    const buttons = screen.getAllByRole("button", { name: /^Return to lane/ });
    expect(buttons).toHaveLength(5);
    for (const button of buttons) {
      expect(getComputedStyle(button).minWidth).toBe("44px");
      expect(getComputedStyle(button).minHeight).toBe("54px");
    }
    expect(getComputedStyle(buttons[0]!.parentElement!).gap).toBe("3px");
    expect(getComputedStyle(screen.getByText("Align your paddle first").parentElement!).minHeight).toBe("100px");
    expect(getComputedStyle(screen.getByRole("button", { name: "Move paddle left one lane" }).parentElement!).minHeight).toBe("100px");
    expect(getComputedStyle(screen.getByText("Not aligned — returning now loses the point")).minHeight).toBe("42px");
  });
  it("anchors separated paddles to their own ends of the court", () => {
    const state = { ...createNovaVolleyState(0, 1000, 42, DEFAULT_GAME_OPTIONS), paddleLanes: [0, 2] as [number, number] };
    render(<NovaVolleyGame game={state} ownSeat={0} phase="playing" now={1001} onMove={vi.fn()} onStrike={vi.fn()} />);
    const blue = getComputedStyle(screen.getByText("P1").parentElement!);
    const coral = getComputedStyle(screen.getByText("P2").parentElement!);
    expect(blue.position).toBe("absolute");
    expect(blue.top).toBe("20px");
    expect(coral.position).toBe("absolute");
    expect(coral.bottom).toBe("20px");
  });
  it("keeps return controls in place across flight, hit window, and point result", () => {
    const state = { ...createNovaVolleyState(0, 1000, 42, DEFAULT_GAME_OPTIONS), incomingLane: 1, paddleLanes: [1, 2] as [number, number], turnDeadline: 5000 };
    const onStrike = vi.fn();
    const view = render(<NovaVolleyGame game={state} ownSeat={0} phase="playing" now={1001} onMove={vi.fn()} onStrike={onStrike} />);
    const button = screen.getByRole("button", { name: "回击到 1 号轨道" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onStrike).not.toHaveBeenCalled();
    view.rerender(<NovaVolleyGame game={{ ...state, phase: "strike_window" }} ownSeat={0} phase="playing" now={1002} onMove={vi.fn()} onStrike={onStrike} />);
    expect(screen.getByRole("button", { name: "回击到 1 号轨道" })).toBe(button);
    expect(button.disabled).toBe(false);
    view.rerender(<NovaVolleyGame game={{ ...state, phase: "point_result", pointWinner: 0, lastOutcome: "return_timeout" }} ownSeat={0} phase="playing" now={1003} onMove={vi.fn()} onStrike={onStrike} />);
    expect(screen.getByRole("button", { name: "回击到 1 号轨道" })).toBe(button);
    expect(screen.getAllByRole("button").every((item) => (item as HTMLButtonElement).disabled)).toBe(true);
  });
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
  it("warns about misalignment without removing the existing miss mechanic", () => {
    const state = { ...createNovaVolleyState(0, 1000, 42, DEFAULT_GAME_OPTIONS), phase: "strike_window" as const, paddleLanes: [0, 2] as [number, number], incomingLane: 1, turnDeadline: 5000 };
    const onStrike = vi.fn();
    const view = render(<LanguageContext.Provider value="en"><NovaVolleyGame game={state} ownSeat={0} phase="playing" now={1001} onMove={vi.fn()} onStrike={onStrike} /></LanguageContext.Provider>);
    expect(screen.getByText("Align your paddle first")).toBeTruthy();
    expect(screen.getByText("Not aligned — returning now loses the point")).toBeTruthy();
    expect(view.container.textContent).not.toMatch(/[一-龥]/);
    fireEvent.click(screen.getByRole("button", { name: "Return to lane 1" }));
    expect(onStrike).toHaveBeenCalledWith(0);
  });
  it("waits for the hit window after flight instead of claiming the point is over", () => {
    const state = { ...createNovaVolleyState(0, 1000, 42, DEFAULT_GAME_OPTIONS), turnDeadline: 1200 };
    render(<LanguageContext.Provider value="en"><NovaVolleyGame game={state} ownSeat={0} phase="playing" now={1200} onMove={vi.fn()} onStrike={vi.fn()} /></LanguageContext.Provider>);
    expect(screen.getByText("Syncing the hit window")).toBeTruthy();
    expect(screen.getByText("The ball has arrived. Waiting for the hit window.")).toBeTruthy();
    expect(screen.getAllByRole("button").every((item) => (item as HTMLButtonElement).disabled)).toBe(true);
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
