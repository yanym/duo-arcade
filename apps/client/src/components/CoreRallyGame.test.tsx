// @vitest-environment happy-dom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCoreRallyState, DEFAULT_GAME_OPTIONS } from "@duo/game-core";
import { CoreRallyGame } from "./CoreRallyGame";
vi.mock("react-native", () => vi.importActual<typeof import("react-native")>("react-native-web"));
vi.mock("@/settings/SettingsContext", () => ({ useSettings: () => ({ feedback: vi.fn(), settings: { highContrast: false, reducedMotion: true } }) }));
afterEach(cleanup);

describe("core rally receiver guidance", () => {
  it("does not tell the waiting player to launch during their partner's window", () => {
    const state = { ...createCoreRallyState(0, 1000, 42, DEFAULT_GAME_OPTIONS), phase: "return_window" as const };
    render(<CoreRallyGame game={state} ownSeat={1} phase="playing" now={1001} onMove={vi.fn()} onReturn={vi.fn()} />);
    expect(screen.getByText("搭档接球")).toBeTruthy();
    expect(screen.getByText("窗口已开启，等待搭档弹射")).toBeTruthy();
    expect(screen.getAllByRole("button").every(b => b.getAttribute("aria-disabled") === "true")).toBe(true);
  });
  it("enables launch only in the receiver's window", () => {
    const state = createCoreRallyState(0, 1000, 42, DEFAULT_GAME_OPTIONS);
    const onReturn = vi.fn();
    const view = render(<CoreRallyGame game={state} ownSeat={0} phase="playing" now={1001} onMove={vi.fn()} onReturn={onReturn} />);
    expect(screen.getByRole("button", { name: "弹射星核" }).getAttribute("aria-disabled")).toBe("true");
    view.rerender(<CoreRallyGame game={{ ...state, phase: "return_window" }} ownSeat={0} phase="playing" now={1001} onMove={vi.fn()} onReturn={onReturn} />);
    fireEvent.click(screen.getByRole("button", { name: "弹射星核" }));
    expect(onReturn).toHaveBeenCalledOnce();
  });
  it("stops announcing a moving ball or another turn after completion", () => {
    const state = createCoreRallyState(0, 1000, 42, DEFAULT_GAME_OPTIONS);
    render(<CoreRallyGame game={state} ownSeat={1} phase="completed" now={1001} onMove={vi.fn()} onReturn={vi.fn()} />);
    expect(screen.getByText("本局接力已结束")).toBeTruthy();
    expect(screen.queryByLabelText(/星核正飞向/)).toBeNull();
    expect(screen.getByText("已结束")).toBeTruthy();
    expect(screen.queryByText(/下一次接力将轮到你/)).toBeNull();
  });
  it("replaces active receiver guidance after the server window expires", () => {
    const state = { ...createCoreRallyState(0, 1000, 42, DEFAULT_GAME_OPTIONS), phase: "return_window" as const, turnDeadline: 1200 };
    render(<CoreRallyGame game={state} ownSeat={0} phase="playing" now={1200} onMove={vi.fn()} onReturn={vi.fn()} />);
    expect(screen.getByText("接球窗口已关闭，正在结算")).toBeTruthy();
    expect(screen.getByText("等待结算")).toBeTruthy();
    expect((screen.getByRole("button", { name: "弹射星核" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
