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
  it("never sends the sender's truth to the waiting reviewer view", () => {
    const state = createSignalBluffState(0, 1000, 42, DEFAULT_GAME_OPTIONS);
    render(<SignalBluffGame game={getSignalBluffView(state, 1)} ownSeat={1} phase="playing" now={1001} onClaim={vi.fn()} onScan={vi.fn()} onJudge={vi.fn()} />);
    expect(screen.getByText("端到端密报传输中")).toBeTruthy();
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
    expect(screen.queryByText(/1 \/ 3 \/ 5/)).toBeNull();
  });
  it("announces the terminal room state clearly", () => {
    const state = { ...createSignalBluffState(0, 1000, 42, DEFAULT_GAME_OPTIONS), phase: "round_result" as const, roundWinner: 0 as const, roundOutcome: "truth_trusted" as const, result: { kind: "win" as const, winnerSeat: 0 as const, reason: "signal_bluff_score" as const } };
    render(<SignalBluffGame game={getSignalBluffView(state, 0)} ownSeat={0} phase="completed" now={1001} onClaim={vi.fn()} onScan={vi.fn()} onJudge={vi.fn()} />);
    expect(screen.getByText("本局密报对决已结束")).toBeTruthy();
    expect(screen.getByText("最终比分与最后一轮真相已向双方同步")).toBeTruthy();
    expect(playSound).not.toHaveBeenCalled();
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
