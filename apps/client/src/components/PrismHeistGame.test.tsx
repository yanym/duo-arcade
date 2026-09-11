// @vitest-environment happy-dom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPrismHeistState, getPrismHeistView, DEFAULT_GAME_OPTIONS } from "@duo/game-core";
import { PrismHeistGame } from "./PrismHeistGame";
const { playSound } = vi.hoisted(() => ({ playSound: vi.fn() }));
vi.mock("react-native", () => vi.importActual<typeof import("react-native")>("react-native-web"));
vi.mock("@/settings/SettingsContext", () => ({ useSettings: () => ({ feedback: vi.fn(), playSound, settings: { highContrast: false, reducedMotion: true } }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("prism heist role separation", () => {
  it("keeps the safe lane off the driver's device before the reveal", () => {
    const state = createPrismHeistState(0, 1000, 42, DEFAULT_GAME_OPTIONS);
    render(<PrismHeistGame game={getPrismHeistView(state, 1)} ownSeat={1} phase="playing" now={1001} onMove={vi.fn()} onBypass={vi.fn()} onDash={vi.fn()} />);
    expect(screen.queryByText("SAFE")).toBeNull();
    expect(screen.getByText(/当前航道/)).toBeTruthy();
    expect(screen.getByText(/侦察阶段剩余/).closest("[aria-live]")).toBeNull();
  });
  it("lets the driver move while the scout's movement buttons stay disabled", () => {
    const state = createPrismHeistState(0, 1000, 42, DEFAULT_GAME_OPTIONS);
    const onMove = vi.fn();
    const view = render(<PrismHeistGame game={getPrismHeistView(state, 1)} ownSeat={1} phase="playing" now={1001} onMove={onMove} onBypass={vi.fn()} onDash={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "潜入舱向左移动一条航道" }));
    expect(onMove).toHaveBeenCalledWith(-1);
    view.rerender(<PrismHeistGame game={getPrismHeistView(state, 0)} ownSeat={0} phase="playing" now={1001} onMove={onMove} onBypass={vi.fn()} onDash={vi.fn()} />);
    expect(screen.getAllByRole("button").every((button) => button.getAttribute("aria-disabled") === "true")).toBe(true);
  });
  it("replaces active instructions when the room is complete", () => {
    const state = { ...createPrismHeistState(0, 1000, 42, DEFAULT_GAME_OPTIONS), phase: "corridor_result" as const, lastOutcome: "clean_breach" as const, result: { kind: "success" as const, score: 900, reason: "prism_heist_complete" as const } };
    render(<PrismHeistGame game={getPrismHeistView(state, 0)} ownSeat={0} phase="completed" now={1001} onMove={vi.fn()} onBypass={vi.fn()} onDash={vi.fn()} />);
    expect(screen.getByText("本局潜入行动已结束")).toBeTruthy();
    expect(screen.getByText("行动结束 · 查看最终结果")).toBeTruthy();
    expect(playSound).not.toHaveBeenCalled();
  });
  it("plays the breach cue once when the window opens, not again for each lock", () => {
    const base = createPrismHeistState(0, 1000, 42, DEFAULT_GAME_OPTIONS);
    const state = { ...base, phase: "breach" as const, turnDeadline: 5000 };
    const view = render(<PrismHeistGame game={getPrismHeistView(state, 0)} ownSeat={0} phase="playing" now={1001} onMove={vi.fn()} onBypass={vi.fn()} onDash={vi.fn()} />);
    expect(playSound).toHaveBeenCalledTimes(1);
    view.rerender(<PrismHeistGame game={getPrismHeistView({ ...state, bypassLocked: true }, 0)} ownSeat={0} phase="playing" now={1002} onMove={vi.fn()} onBypass={vi.fn()} onDash={vi.fn()} />);
    expect(playSound).toHaveBeenCalledTimes(1);
  });
  it("changes role instructions to settlement after the corridor window closes", () => {
    const state = { ...createPrismHeistState(0, 1000, 42, DEFAULT_GAME_OPTIONS), phase: "breach" as const, turnDeadline: 1200 };
    render(<PrismHeistGame game={getPrismHeistView(state, 0)} ownSeat={0} phase="playing" now={1200} onMove={vi.fn()} onBypass={vi.fn()} onDash={vi.fn()} />);
    expect(screen.getByText("行动窗口已关闭，正在同步走廊结果")).toBeTruthy();
    expect(screen.getAllByText("等待结算")).toHaveLength(2);
    expect(screen.getAllByRole("button").every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
  });
});
