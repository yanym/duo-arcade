// @vitest-environment happy-dom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSignalBluffState, getSignalBluffView, DEFAULT_GAME_OPTIONS } from "@duo/game-core";
import { SignalBluffGame } from "./SignalBluffGame";
const { playSound } = vi.hoisted(() => ({ playSound: vi.fn() }));
vi.mock("react-native", () => vi.importActual<typeof import("react-native")>("react-native-web"));
vi.mock("@/settings/SettingsContext", () => ({ useSettings: () => ({ feedback: vi.fn(), playSound, settings: { highContrast: false, reducedMotion: true } }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("signal bluff private roles", () => {
  it("does not ask the sender to judge a claim when their future scan budget is empty", () => {
    const state = createSignalBluffState(0, 1000, 42, DEFAULT_GAME_OPTIONS);
    state.scanCharges[0] = 0;
    render(<SignalBluffGame game={getSignalBluffView(state, 0)} ownSeat={0} phase="playing" now={1001} onClaim={vi.fn()} onScan={vi.fn()} onJudge={vi.fn()} />);
    expect(screen.queryByText("没有剩余扫描，请根据公开宣称作出判断。")).toBeNull();
    expect((screen.getByRole("button", { name: "宣称棱镜，编号 1" }) as HTMLButtonElement).disabled).toBe(false);
  });
  it.each([0, 1])("offers only usable scan decisions with %s charges remaining", (remaining) => {
    const state = { ...createSignalBluffState(0, 1000, 42, { ...DEFAULT_GAME_OPTIONS, difficulty: "hard" as const }), phase: "judging" as const, claimSignal: "prism" as const };
    state.scanCharges[1] = remaining;
    render(<SignalBluffGame game={getSignalBluffView(state, 1)} ownSeat={1} phase="playing" now={1001} onClaim={vi.fn()} onScan={vi.fn()} onJudge={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /频谱扫描/ }) !== null).toBe(remaining > 0);
    expect(screen.queryByText("你的扫描次数整局有限，留给关键判断。") !== null).toBe(remaining > 0);
    expect((screen.getByRole("button", { name: "相信公开宣称" }) as HTMLButtonElement).disabled).toBe(false);
  });
  it("never sends the sender's truth to the waiting reviewer view", () => {
    const state = createSignalBluffState(0, 1000, 42, DEFAULT_GAME_OPTIONS);
    render(<SignalBluffGame game={getSignalBluffView(state, 1)} ownSeat={1} phase="playing" now={1001} onClaim={vi.fn()} onScan={vi.fn()} onJudge={vi.fn()} />);
    expect(screen.getByText("等待对手公开宣称")).toBeTruthy();
    expect(screen.queryByText(/真实讯号 ·/)).toBeNull();
    expect(screen.getByText(/服务器窗口剩余/).closest("[aria-live]")).toBeNull();
  });
  it("lets only the sender publish a named claim", () => {
    const state = createSignalBluffState(0, 1000, 42, DEFAULT_GAME_OPTIONS);
    const onClaim = vi.fn();
    render(<SignalBluffGame game={getSignalBluffView(state, 0)} ownSeat={0} phase="playing" now={1001} onClaim={onClaim} onScan={vi.fn()} onJudge={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "宣称棱镜，编号 1" }));
    expect(onClaim).toHaveBeenCalledWith("prism");
  });
  it("lists only scan positions that exist at the configured difficulty", () => {
    const state = { ...createSignalBluffState(0, 1000, 42, DEFAULT_GAME_OPTIONS), phase: "judging" as const, scanned: true, scanHint: "group_a" as const, availableSignals: ["prism", "orbit", "wave"] as ("prism" | "orbit" | "wave")[], claimSignal: "prism" as const };
    render(<SignalBluffGame game={getSignalBluffView(state, 1)} ownSeat={1} phase="playing" now={1001} onClaim={vi.fn()} onScan={vi.fn()} onJudge={vi.fn()} />);
    expect(screen.getByText("奇数档 · 1 / 3")).toBeTruthy();
    expect(screen.getByText("◇ 棱镜 / ≋ 潮纹")).toBeTruthy();
    expect(screen.getByText("扫描只缩小范围，仍需判断真假。")).toBeTruthy();
    expect(screen.queryByText(/1 \/ 3 \/ 5/)).toBeNull();
  });
  it("announces the terminal room state clearly", () => {
    const state = { ...createSignalBluffState(0, 1000, 42, DEFAULT_GAME_OPTIONS), phase: "round_result" as const, roundWinner: 0 as const, roundOutcome: "truth_trusted" as const, result: { kind: "win" as const, winnerSeat: 0 as const, reason: "signal_bluff_score" as const } };
    render(<SignalBluffGame game={getSignalBluffView(state, 0)} ownSeat={0} phase="completed" now={1001} onClaim={vi.fn()} onScan={vi.fn()} onJudge={vi.fn()} />);
    expect(screen.getByText("本局密报对决已结束")).toBeTruthy();
    expect(screen.getByText("最终比分与最后一轮真相已向双方同步")).toBeTruthy();
    expect(playSound).not.toHaveBeenCalled();
  });
  it.each([
    ["prism", "prism", "=", "宣称属实"],
    ["prism", "wave", "≠", "宣称与真相不符"],
    [null, "wave", "—", "未发送宣称"],
  ] as const)("shows an accurate reveal for claim %s and truth %s", (claimSignal, truthSignal, glyph, label) => {
    const state = { ...createSignalBluffState(0, 1000, 42, DEFAULT_GAME_OPTIONS), phase: "round_result" as const, claimSignal, truthSignal };
    render(<SignalBluffGame game={getSignalBluffView(state, 1)} ownSeat={1} phase="playing" now={1001} onClaim={vi.fn()} onScan={vi.fn()} onJudge={vi.fn()} />);
    expect(screen.getByLabelText(label).textContent).toBe(glyph);
  });
  it("stops accepting a claim after the decision window closes", () => {
    const state = { ...createSignalBluffState(0, 1000, 42, DEFAULT_GAME_OPTIONS), turnDeadline: 1200 };
    const onClaim = vi.fn();
    render(<SignalBluffGame game={getSignalBluffView(state, 0)} ownSeat={0} phase="playing" now={1200} onClaim={onClaim} onScan={vi.fn()} onJudge={vi.fn()} />);
    expect(screen.getByText("决策窗口已关闭，正在同步裁决")).toBeTruthy();
    const claim = screen.getByRole("button", { name: "宣称棱镜，编号 1" });
    expect((claim as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(claim);
    expect(onClaim).not.toHaveBeenCalled();
  });
});
