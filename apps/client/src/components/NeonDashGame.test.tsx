// @vitest-environment happy-dom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createNeonDashState, getNeonDashView, DEFAULT_GAME_OPTIONS, type NeonDashMove, type NeonDashState, type Seat } from "@duo/game-core";
import { LanguageContext } from "@/i18n";
import { NeonDashGame } from "./NeonDashGame";
const { playSound, dimensions } = vi.hoisted(() => ({ playSound: vi.fn(), dimensions: { width: 1024, height: 768, scale: 1, fontScale: 1 } }));
vi.mock("react-native", async () => ({ ...await vi.importActual<typeof import("react-native")>("react-native-web"), useWindowDimensions: () => dimensions }));
vi.mock("@/settings/SettingsContext", () => ({ useSettings: () => ({ feedback: vi.fn(), playSound, settings: { highContrast: false, reducedMotion: true } }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); dimensions.width = 1024; });

describe("neon dash reaction states", () => {
  it("prioritizes all five expert controls over decorative text on a small phone", () => {
    dimensions.width = 320;
    const state = { ...createNeonDashState(1000, 42, { ...DEFAULT_GAME_OPTIONS, difficulty: "hard" }), phase: "reacting" as const, obstacle: "pulse_field" as const, turnDeadline: 5000 };
    render(<LanguageContext.Provider value="en"><NeonDashGame game={getNeonDashView(state, 0)} ownSeat={0} phase="playing" now={1100} onDodge={vi.fn()} /></LanguageContext.Provider>);
    expect(screen.queryByText("NEON RUN // REACTION CIRCUIT")).toBeNull();
    expect(screen.getAllByRole("button", { name: /^Parkour move:/ })).toHaveLength(5);
    expect(screen.getByRole("button", { name: "Parkour move: Brake" }).getAttribute("aria-disabled")).not.toBe("true");
    expect(screen.getAllByText("Pulse stasis field").length).toBeGreaterThan(0);
    const liveHeadline = screen.getAllByText("Pulse stasis field").find((element) => element.getAttribute("aria-live") === "assertive");
    expect(getComputedStyle(liveHeadline!.parentElement!).minHeight).toBe("100px");
  });
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

  it.each(["jump", "slide", "dodge_left", "dodge_right", "brake"] as NeonDashMove[])("translates revealed %s moves for both players, including a miss", (move) => {
    const state: NeonDashState = { ...createNeonDashState(1000, 42, { ...DEFAULT_GAME_OPTIONS, difficulty: "hard" }),
      phase: "round_result", obstacle: "low_barrier", responses: [{ move, correct: false, reactionMs: 250 }, { move, correct: true, reactionMs: 300 }],
      locked: [true, true], roundOutcome: "single_clear", roundWinner: 1,
    };
    for (const ownSeat of [0, 1] as Seat[]) {
      const view = render(<LanguageContext.Provider value="en"><NeonDashGame game={getNeonDashView(state, ownSeat)} ownSeat={ownSeat} phase="playing" now={1100} onDodge={vi.fn()} /></LanguageContext.Provider>);
      expect(view.container.textContent).not.toMatch(/[一-龥]/);
      expect(screen.getAllByText(/Miss/).length).toBeGreaterThan(0);
      expect(screen.getByText(/Clear/)).toBeTruthy();
      view.unmount();
    }
  });
});
