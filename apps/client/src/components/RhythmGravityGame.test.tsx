// @vitest-environment happy-dom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRhythmGravityState, DEFAULT_GAME_OPTIONS } from "@duo/game-core";
import { RhythmGravityGame } from "./RhythmGravityGame";

vi.mock("react-native", () => vi.importActual<typeof import("react-native")>("react-native-web"));
vi.mock("@/settings/SettingsContext", () => ({ useSettings: () => ({ feedback: vi.fn(), settings: { highContrast: false, reducedMotion: true } }) }));
afterEach(cleanup);

describe("rhythm perspective and feedback", () => {
  it("labels the coral player's own well on the right", () => {
    const state = { ...createRhythmGravityState(1000, DEFAULT_GAME_OPTIONS), corePosition: 2 };
    render(<RhythmGravityGame game={state} ownSeat={1} phase="playing" now={state.beatAt} onTap={vi.fn()} />);
    expect(screen.getByLabelText("能量核向对手靠近 2 格")).toBeTruthy();
    const own = screen.getByText("你的引力井");
    expect(own.previousElementSibling?.textContent).toBe("对手引力井");
  });
  it("acknowledges the tap and disables repeat input", () => {
    const state = createRhythmGravityState(1000, DEFAULT_GAME_OPTIONS);
    const onTap = vi.fn();
    const view = render(<RhythmGravityGame game={state} ownSeat={0} phase="playing" now={state.beatAt} onTap={onTap} />);
    fireEvent.click(screen.getByRole("button", { name: "引力击拍" }));
    expect(onTap).toHaveBeenCalledOnce();
    view.rerender(<RhythmGravityGame game={{ ...state, locked: [true, false] }} ownSeat={0} phase="playing" now={state.beatAt} onTap={onTap} />);
    expect(screen.getByText("击拍已密封，等待对手")).toBeTruthy();
    expect(screen.getByRole("button", { name: "引力击拍" }).getAttribute("aria-disabled")).toBe("true");
  });
  it("does not invite another tap after a round or game has ended", () => {
    const state = { ...createRhythmGravityState(1000, DEFAULT_GAME_OPTIONS), phase: "round_result" as const, accuracies: [60, 180] as [number, number] };
    const view = render(<RhythmGravityGame game={state} ownSeat={0} phase="playing" now={state.beatAt} onTap={vi.fn()} />);
    expect(screen.getByText("下一拍即将开始")).toBeTruthy();
    expect(screen.getByText("60ms")).toBeTruthy();
    expect(screen.queryByText("+60ms")).toBeNull();
    view.rerender(<RhythmGravityGame game={state} ownSeat={0} phase="completed" now={state.beatAt} onTap={vi.fn()} />);
    expect(screen.getByText("已结束")).toBeTruthy();
    expect(screen.queryByText("下一拍即将开始")).toBeNull();
  });
  it("announces the settlement wait once the beat window expires", () => {
    const state = createRhythmGravityState(1000, DEFAULT_GAME_OPTIONS);
    render(<RhythmGravityGame game={state} ownSeat={0} phase="playing" now={state.turnDeadline} onTap={vi.fn()} />);
    expect(screen.getByText("击拍窗口已关闭，正在结算")).toBeTruthy();
    expect(screen.getByText("服务器同步中")).toBeTruthy();
    expect((screen.getByRole("button", { name: "引力击拍" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
