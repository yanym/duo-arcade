// @vitest-environment happy-dom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { chooseDuelMove, createQuantumDuelState, DEFAULT_GAME_OPTIONS, getQuantumDuelView, type DuelMove, type QuantumDuelState } from "@duo/game-core";
import { LanguageContext } from "@/i18n";
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
    expect(screen.getByText("招式已锁定，等待对手")).toBeTruthy();
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

  it.each([
    ["strike", "➤ Strike"], ["guard", "⬡ Guard"], ["charge", "ϟ Charge"],
  ] as const)("translates locked and revealed %s for both seats", (move: DuelMove, label) => {
    const initial = createQuantumDuelState(1000, DEFAULT_GAME_OPTIONS);
    const first = chooseDuelMove(initial, 0, move, 1001);
    if (!first.ok || first.state.kind !== "quantum_duel") throw new Error("Expected legal choice");
    const element = (state: QuantumDuelState, seat: 0 | 1) => <LanguageContext.Provider value="en"><QuantumDuelGame game={getQuantumDuelView(state, seat)} ownSeat={seat} phase={state.result ? "completed" : "playing"} onChoose={vi.fn()} /></LanguageContext.Provider>;
    const view = render(element(first.state, 0));
    expect(screen.getByText(label)).toBeTruthy();
    expect(view.container.textContent).not.toMatch(/[一-龥]/);
    view.rerender(element(first.state, 1));
    expect(screen.queryByText(label)).toBeNull();
    expect(screen.getByText("Locked · Move hidden")).toBeTruthy();

    const second = chooseDuelMove(first.state, 1, move, 1002);
    if (!second.ok || second.state.kind !== "quantum_duel") throw new Error("Expected reveal");
    for (const seat of [0, 1] as const) {
      view.rerender(element(second.state, seat));
      expect(screen.getAllByText(label)).toHaveLength(2);
      expect(view.container.textContent).not.toMatch(/[一-龥]/);
      view.rerender(element({ ...second.state, result: { kind: "draw", reason: "duel_tied" } }, seat));
      expect(screen.getAllByText(label)).toHaveLength(2);
      expect(view.container.textContent).not.toMatch(/[一-龥]/);
    }
  });
});
