// @vitest-environment happy-dom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { advancePulsePassClock, chargePulseCore, createPulsePassState, getPulsePassView, DEFAULT_GAME_OPTIONS, type PulsePassState } from "@duo/game-core";
import { LanguageContext } from "@/i18n";
import { PulsePassGame } from "./PulsePassGame";
const { playSound } = vi.hoisted(() => ({ playSound: vi.fn() }));
vi.mock("react-native", () => vi.importActual<typeof import("react-native")>("react-native-web"));
vi.mock("@/settings/SettingsContext", () => ({ useSettings: () => ({ feedback: vi.fn(), playSound, settings: { highContrast: false, reducedMotion: true } }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("pulse pass hidden threshold", () => {
  it("does not describe a warming core as an immediate burst risk", () => {
    let state = createPulsePassState(0, 1000, 42, DEFAULT_GAME_OPTIONS);
    while (state.heatBand === "stable") {
      const move = chargePulseCore(state, state.holderSeat, 1, 1001);
      if (!move.ok || move.state.kind !== "pulse_pass") throw new Error("Expected legal pass");
      state = move.state;
    }
    expect(state.heatBand).toBe("warm");
    const strongestPass = chargePulseCore(state, state.holderSeat, 3, 1002);
    expect(strongestPass.ok && strongestPass.state.kind === "pulse_pass" && strongestPass.state.phase).toBe("handling");
    render(<PulsePassGame game={getPulsePassView(state)} ownSeat={state.holderSeat} phase="playing" now={1001} onCharge={vi.fn()} onVent={vi.fn()} />);
    expect(screen.getByText("电荷正在累积，留意传出后对手的选择")).toBeTruthy();
    expect(screen.queryByText(/下一次强传可能触发爆裂/)).toBeNull();
  });

  it.each([0, 1] as const)("explains depleted match vents without recommending them to seat %s", (ownSeat) => {
    const state: PulsePassState = { ...createPulsePassState(ownSeat, 1000, 42, DEFAULT_GAME_OPTIONS), ventCharges: [0, 0] };
    const onVent = vi.fn();
    render(<PulsePassGame game={getPulsePassView(state)} ownSeat={ownSeat} phase="playing" now={1001} onCharge={vi.fn()} onVent={onVent} />);
    expect(screen.getByText("核心在你手中：选择充能强度")).toBeTruthy();
    expect(screen.getByText("本局冷却已用完，下局恢复")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "紧急冷却，剩余 0 次" }));
    expect(onVent).not.toHaveBeenCalled();
    expect(screen.queryByText("核心在你手中：选择充能强度或紧急冷却")).toBeNull();
  });

  it("explains unavailable vents in hard mode without implying they were spent", () => {
    const state = createPulsePassState(0, 1000, 42, { ...DEFAULT_GAME_OPTIONS, difficulty: "hard" });
    render(<LanguageContext.Provider value="en"><PulsePassGame game={getPulsePassView(state)} ownSeat={0} phase="playing" now={1001} onCharge={vi.fn()} onVent={vi.fn()} /></LanguageContext.Provider>);
    expect(screen.getByText("No vents at this difficulty")).toBeTruthy();
    expect(screen.getByText("You hold the core — choose a charge")).toBeTruthy();
  });

  it("replaces live risk guidance after a timeout", () => {
    const initial = createPulsePassState(0, 1000, 42, DEFAULT_GAME_OPTIONS);
    const state = advancePulsePassClock(initial, initial.turnDeadline);
    render(<LanguageContext.Provider value="en"><PulsePassGame game={getPulsePassView(state)} ownSeat={0} phase="playing" now={initial.turnDeadline} onCharge={vi.fn()} onVent={vi.fn()} /></LanguageContext.Provider>);
    expect(screen.getByText("Round result")).toBeTruthy();
    expect(screen.getByText("Hold timeout")).toBeTruthy();
    expect(screen.queryByText("The core appears stable, but the burst point remains hidden")).toBeNull();
    expect(screen.queryByText(/精确|本轮|冷却/)).toBeNull();
  });

  it("keeps the exact burst point out of the handling view", () => {
    const state = createPulsePassState(0, 1000, 42, DEFAULT_GAME_OPTIONS);
    render(<PulsePassGame game={getPulsePassView(state)} ownSeat={0} phase="playing" now={1001} onCharge={vi.fn()} onVent={vi.fn()} />);
    expect(screen.queryByText(/爆点揭晓/)).toBeNull();
    expect(screen.getByText(/精确爆点对双方保密/)).toBeTruthy();
    expect(screen.getByText(/秒内行动/).closest("[aria-live]")).toBeNull();
  });
  it("accepts a power only from the current holder", () => {
    const state = createPulsePassState(0, 1000, 42, DEFAULT_GAME_OPTIONS);
    const onCharge = vi.fn();
    const view = render(<PulsePassGame game={getPulsePassView(state)} ownSeat={0} phase="playing" now={1001} onCharge={onCharge} onVent={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "轻推，+1 电荷" }));
    expect(onCharge).toHaveBeenCalledWith(1);
    view.rerender(<PulsePassGame game={getPulsePassView(state)} ownSeat={1} phase="playing" now={1001} onCharge={onCharge} onVent={vi.fn()} />);
    expect(screen.getAllByRole("button").every((button) => button.getAttribute("aria-disabled") === "true")).toBe(true);
  });
  it("turns reconnect grace into an explicit pause", () => {
    const state = createPulsePassState(0, 1000, 42, DEFAULT_GAME_OPTIONS);
    render(<PulsePassGame game={getPulsePassView(state)} ownSeat={0} phase="reconnect_grace" now={1001} onCharge={vi.fn()} onVent={vi.fn()} />);
    expect(screen.getByText("脉冲传递已暂停，等待连接恢复")).toBeTruthy();
    expect(screen.getByText("当前状态已保留")).toBeTruthy();
  });
  it("leaves the match-winning result cue to the room result layer", () => {
    const state = { ...createPulsePassState(0, 1000, 42, DEFAULT_GAME_OPTIONS), phase: "round_result" as const, roundWinner: 0 as const, roundOutcome: "burst" as const, result: { kind: "win" as const, winnerSeat: 0 as const, reason: "pulse_pass_score" as const } };
    render(<PulsePassGame game={getPulsePassView(state)} ownSeat={0} phase="completed" now={1001} onCharge={vi.fn()} onVent={vi.fn()} />);
    expect(playSound).not.toHaveBeenCalled();
  });
  it("plays a new-pass cue only on the receiving device", () => {
    const state = { ...createPulsePassState(0, 1000, 42, DEFAULT_GAME_OPTIONS), totalPasses: 1, passes: 1 };
    render(<PulsePassGame game={getPulsePassView(state)} ownSeat={1} phase="playing" now={1001} onCharge={vi.fn()} onVent={vi.fn()} />);
    expect(playSound).not.toHaveBeenCalled();
  });
  it("stops offering a pass when the holder window expires", () => {
    const state = { ...createPulsePassState(0, 1000, 42, DEFAULT_GAME_OPTIONS), turnDeadline: 1200 };
    render(<PulsePassGame game={getPulsePassView(state)} ownSeat={0} phase="playing" now={1200} onCharge={vi.fn()} onVent={vi.fn()} />);
    expect(screen.getByText("传递窗口已关闭，正在结算")).toBeTruthy();
    expect(screen.getByText("等待服务器结算")).toBeTruthy();
    expect(screen.getAllByRole("button").every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
  });
});
