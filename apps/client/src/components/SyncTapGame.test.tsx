// @vitest-environment happy-dom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSyncTapState } from "@duo/game-core";
import { SyncTapGame } from "./SyncTapGame";

vi.mock("react-native", () => vi.importActual<typeof import("react-native")>("react-native-web"));
vi.mock("@/settings/SettingsContext", () => ({
  useSettings: () => ({ feedback: vi.fn(), settings: { highContrast: false, reducedMotion: true } }),
}));
afterEach(cleanup);

describe("same-beat interaction states", () => {
  it("disables the countdown then acknowledges a playable tap", () => {
    const game = createSyncTapState(1000);
    const onTap = vi.fn();
    const view = render(<SyncTapGame game={game} phase="playing" ownSeat={0} now={1000} onTap={onTap} />);
    expect(screen.getByRole("button").getAttribute("aria-disabled")).toBe("true");
    view.rerender(<SyncTapGame game={game} phase="playing" ownSeat={0} now={game.goAt} onTap={onTap} />);
    fireEvent.click(screen.getByRole("button", { name: "现在按，每轮只能按一次" }));
    expect(onTap).toHaveBeenCalledOnce();
  });

  it("does not tell a disconnected player to act", () => {
    const game = createSyncTapState(1000);
    render(<SyncTapGame game={game} phase="reconnect_grace" ownSeat={0} now={game.goAt} onTap={vi.fn()} />);
    expect(screen.getByRole("button", { name: "连接恢复后继续击拍" }).getAttribute("aria-disabled")).toBe("true");
    expect(screen.queryByText("现在按！")).toBeNull();
  });

  it("labels an ended round truthfully even if no tap was made", () => {
    const game = createSyncTapState(1000, 7);
    render(<SyncTapGame game={game} phase="completed" ownSeat={0} now={game.goAt} onTap={vi.fn()} />);
    expect(screen.getByRole("button", { name: "本局已结束" }).getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText("已结束")).toBeTruthy();
    expect(screen.getByLabelText("第 7 轮，尚未完成")).toBeTruthy();
  });

  it("keeps partner timing private and identifies scored rounds", () => {
    const game = { ...createSyncTapState(1000), taps: [3000, null] as [number, null], roundScores: [88] };
    render(<SyncTapGame game={game} phase="playing" ownSeat={0} now={game.goAt} onTap={vi.fn()} />);
    expect(screen.getByRole("button", { name: "已按下，等待搭档" }).getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByLabelText("第 1 轮，88 分")).toBeTruthy();
  });

  it("stops accepting a tap after the shared server window closes", () => {
    const game = createSyncTapState(1000);
    const onTap = vi.fn();
    render(<SyncTapGame game={game} phase="playing" ownSeat={0} now={game.turnDeadline} onTap={onTap} />);
    const button = screen.getByRole("button", { name: "击拍窗口已关闭，正在等待服务器结算" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("服务器正在同步结果")).toBeTruthy();
    fireEvent.click(button);
    expect(onTap).not.toHaveBeenCalled();
  });
});
