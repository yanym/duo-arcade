// @vitest-environment happy-dom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQuantumDuelState, DEFAULT_GAME_OPTIONS, getQuantumDuelView, type QuantumDuelState } from "@duo/game-core";
import { QuantumDuelGame } from "./QuantumDuelGame";

vi.mock("react-native", () => vi.importActual<typeof import("react-native")>("react-native-web"));
vi.mock("@/settings/SettingsContext", () => ({
  useSettings: () => ({ feedback: vi.fn(), settings: { highContrast: false, reducedMotion: true } }),
}));
afterEach(cleanup);

describe("simultaneous duel feedback", () => {
  it("shows the opponent's lock without revealing their choice", () => {
    const state: QuantumDuelState = { ...createQuantumDuelState(1000, DEFAULT_GAME_OPTIONS), choices: [null, "strike"], locked: [false, true] };
    render(<QuantumDuelGame game={getQuantumDuelView(state, 0)} ownSeat={0} phase="playing" onChoose={vi.fn()} />);
    expect(screen.getByText("已锁定 · 招式保密")).toBeTruthy();
    expect(screen.queryByText("➤ 突击")).toBeNull();
  });

  it("confirms the player's lock and disables every alternative", () => {
    const state: QuantumDuelState = { ...createQuantumDuelState(1000, DEFAULT_GAME_OPTIONS), choices: ["strike", null], locked: [true, false] };
    render(<QuantumDuelGame game={getQuantumDuelView(state, 0)} ownSeat={0} phase="playing" onChoose={vi.fn()} />);
    expect(screen.getByText("招式已加密，等待对手")).toBeTruthy();
    expect(screen.getAllByRole("button").every(button => button.getAttribute("aria-disabled") === "true")).toBe(true);
  });

  it("sends exactly the selected move when input is available", () => {
    const state = createQuantumDuelState(1000, DEFAULT_GAME_OPTIONS);
    const onChoose = vi.fn();
    render(<QuantumDuelGame game={getQuantumDuelView(state, 0)} ownSeat={0} phase="playing" onChoose={onChoose} />);
    fireEvent.click(screen.getByRole("button", { name: "防御，反制突击" }));
    expect(onChoose).toHaveBeenCalledExactlyOnceWith("guard");
  });

  it("replaces the live selection prompt while reconnecting", () => {
    const state = createQuantumDuelState(1000, DEFAULT_GAME_OPTIONS);
    render(<QuantumDuelGame game={getQuantumDuelView(state, 0)} ownSeat={0} phase="reconnect_grace" onChoose={vi.fn()} />);
    expect(screen.getByText("量子对决已暂停，等待连接恢复")).toBeTruthy();
    expect(screen.getAllByRole("button").every(button => button.getAttribute("aria-disabled") === "true")).toBe(true);
  });
});
