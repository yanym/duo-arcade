// @vitest-environment happy-dom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmberCrewState, DEFAULT_GAME_OPTIONS, planEmberAction, type EmberCrewState } from "@duo/game-core";
import { LanguageContext } from "@/i18n";
import { EmberCrewGame } from "./EmberCrewGame";

const { viewport } = vi.hoisted(() => ({ viewport: { width: 1024, height: 768, scale: 1, fontScale: 1 } }));
vi.mock("react-native", async () => ({
  ...await vi.importActual<typeof import("react-native")>("react-native-web"),
  useWindowDimensions: () => viewport,
}));
vi.mock("@/settings/SettingsContext", () => ({ useSettings: () => ({ feedback: vi.fn(), settings: { highContrast: false, reducedMotion: true } }) }));
afterEach(() => { cleanup(); viewport.width = 1024; viewport.fontScale = 1; });
const initial = () => createEmberCrewState(1000, 42, DEFAULT_GAME_OPTIONS);
const jointRoute = () => {
  const fire = Array<number>(25).fill(0);
  fire[7] = 2;
  let game: EmberCrewState = { ...initial(), walls: [], positions: [6, 2], fire };
  for (const [seat, operation] of [[0, "move"], [1, "extinguish"]] as const) {
    const planned = planEmberAction(game, seat, game.round, { operation, cell: 7 }, 1001);
    if (!planned.ok) throw new Error(planned.reason);
    game = planned.state;
  }
  return game;
};
const forecastMove = (): EmberCrewState => {
  const fire = Array<number>(25).fill(0);
  fire[8] = 2;
  return { ...initial(), positions: [4, 9], fire, forecast: [3],
    plans: [{ operation: "move", cell: 3 }, { operation: "extinguish", cell: 8 }] };
};

describe("Ember Crew interaction", () => {
  it.each([320, 375, 390, 414])("groups full-size tools into two rows at %s px without losing accessible action names", (width) => {
    viewport.width = width;
    render(<LanguageContext.Provider value="en"><EmberCrewGame game={initial()} ownSeat={0} phase="playing" now={1001}
      playerNames={["Alex", "Sam"]} partnerIsAi onPlan={vi.fn()} onCommit={vi.fn()} /></LanguageContext.Provider>);
    expect(screen.getByText("AI adapts until you confirm.")).toBeTruthy();
    expect(screen.getByText(/2 · Sam/)).toBeTruthy();
    expect(screen.getByText("Tap an adjacent tile to plan.")).toBeTruthy();
    for (const [name, label, basis] of [
      ["Move", "Move", "45%"], ["Put out fire", "Put out fire", "45%"],
      ["Refill tank", "Refill", "27%"], ["Share water", "Share water", "27%"], ["Hold position", "Wait", "27%"],
    ]) {
      const control = screen.getByRole("button", { name });
      expect(control.textContent).toBe(label);
      expect(getComputedStyle(control).flexBasis).toBe(basis);
      expect(Number.parseFloat(getComputedStyle(control).minHeight)).toBeGreaterThanOrEqual(48);
    }
    expect(screen.getAllByText("Water 4/4")).toHaveLength(2);
  });

  it("keeps the roomy layout for larger text on a small screen", () => {
    viewport.width = 320; viewport.fontScale = 1.6;
    render(<LanguageContext.Provider value="en"><EmberCrewGame game={initial()} ownSeat={0} phase="playing" now={1001}
      playerNames={["Alex", "Sam"]} partnerIsAi onPlan={vi.fn()} onCommit={vi.fn()} /></LanguageContext.Provider>);
    expect(screen.getByText("Sam")).toBeTruthy();
    expect(screen.getByText("AI adapts to your plan. Confirm when ready.")).toBeTruthy();
    const refill = screen.getByRole("button", { name: "Refill tank" });
    expect(refill.textContent).toBe("Refill tank");
    expect(getComputedStyle(refill).flexBasis).not.toBe("27%");
  });

  it("still requires a synced draft and separate confirmation after a compact refill selection", () => {
    viewport.width = 320;
    const game = initial(); game.water[0] = 1;
    const onPlan = vi.fn(); const onCommit = vi.fn();
    render(<LanguageContext.Provider value="en"><EmberCrewGame game={game} ownSeat={0} phase="playing" now={1001}
      onPlan={onPlan} onCommit={onCommit} /></LanguageContext.Provider>);
    fireEvent.click(screen.getByRole("button", { name: "Refill tank" }));
    expect(onPlan).toHaveBeenCalledWith({ operation: "refill", cell: game.positions[0] });
    fireEvent.click(screen.getByRole("button", { name: "Confirm plan" }));
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("preserves a forecast danger warning and coordinated-route guidance in the compact layout", () => {
    viewport.width = 320;
    const game = forecastMove(); game.plans[1] = null;
    const props = { ownSeat: 0 as const, phase: "playing" as const, now: 1001, onPlan: vi.fn(), onCommit: vi.fn() };
    const view = render(<LanguageContext.Provider value="en"><EmberCrewGame {...props} game={game} /></LanguageContext.Provider>);
    expect(screen.getByText("This tile is forecast to burn after you move. Change your route or clear the source.")).toBeTruthy();
    view.rerender(<LanguageContext.Provider value="en"><EmberCrewGame {...props} game={jointRoute()} /></LanguageContext.Provider>);
    expect(screen.getByText("Confirm together: your partner clears the fire, then you move.")).toBeTruthy();
  });

  it("warns before moving into forecast fire without taking away the player's choice", () => {
    const game = forecastMove();
    game.plans[1] = null;
    render(<LanguageContext.Provider value="en"><EmberCrewGame game={game} ownSeat={0} phase="playing" now={1001} onPlan={vi.fn()} onCommit={vi.fn()} /></LanguageContext.Provider>);
    const warning = screen.getByText("This tile is forecast to burn after you move. Change your route or clear the source.");
    expect(warning.getAttribute("aria-live")).toBe("polite");
    expect(screen.queryByText("Tap an adjacent tile to plan a move. Your partner can clear a burning route in the same round.")).toBeNull();
    expect((screen.getByRole("button", { name: "Confirm plan · Move · D1" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Hold position" }));
    expect(screen.queryByText(/This tile is forecast/)).toBeNull();
  });

  it("explains forecast prevention and restores the warning if the partner revises their plan", () => {
    const game = forecastMove();
    const props = { ownSeat: 0 as const, phase: "playing" as const, now: 1001, onPlan: vi.fn(), onCommit: vi.fn() };
    const view = render(<LanguageContext.Provider value="en"><EmberCrewGame {...props} game={game} /></LanguageContext.Provider>);
    expect(screen.getByText("Your partner's current plan prevents fire here this round. Confirm together.")).toBeTruthy();
    view.rerender(<LanguageContext.Provider value="en"><EmberCrewGame {...props} game={{ ...game, plans: [game.plans[0], { operation: "wait", cell: 9 }] }} /></LanguageContext.Provider>);
    expect(screen.queryByText(/Your partner's current plan prevents/)).toBeNull();
    expect(screen.getByText(/This tile is forecast to burn/)).toBeTruthy();
  });

  it.each(["empty tank", "too far", "another source"])("does not promise forecast prevention with %s", (scenario) => {
    const game = forecastMove();
    if (scenario === "empty tank") game.water[1] = 0;
    if (scenario === "too far") game.positions[1] = 24;
    if (scenario === "another source") game.fire[2] = 1;
    render(<LanguageContext.Provider value="en"><EmberCrewGame game={game} ownSeat={0} phase="playing" now={1001} onPlan={vi.fn()} onCommit={vi.fn()} /></LanguageContext.Provider>);
    expect(screen.queryByText(/Your partner's current plan prevents/)).toBeNull();
    expect(screen.getByText(/This tile is forecast to burn/)).toBeTruthy();
  });

  it.each(["reconnect", "completed", "resolved", "expired"])("removes forecast-move advice when %s", (state) => {
    const game = forecastMove();
    if (state === "resolved") game.phase = "round_result";
    render(<LanguageContext.Provider value="en"><EmberCrewGame game={game} ownSeat={0}
      phase={state === "reconnect" ? "reconnect_grace" : state === "completed" ? "completed" : "playing"}
      now={state === "expired" ? game.turnDeadline : 1001} onPlan={vi.fn()} onCommit={vi.fn()} /></LanguageContext.Provider>);
    expect(screen.queryByText(/Your partner's current plan prevents|This tile is forecast to burn/)).toBeNull();
  });

  it("does not ask a locked partner to change their plan to clear a route", () => {
    const game = jointRoute();
    game.plans[1] = { operation: "wait", cell: game.positions[1] };
    game.locked[1] = true;
    render(<LanguageContext.Provider value="en"><EmberCrewGame game={game} ownSeat={0} phase="playing" now={1001} onPlan={vi.fn()} onCommit={vi.fn()} /></LanguageContext.Provider>);
    expect(screen.getByText("Your partner can't clear this route this turn. Put out the fire before moving.")).toBeTruthy();
    expect(screen.queryByText("This route is burning. Your partner must put it out this round for you to pass.")).toBeNull();
  });
  it.each([
    { partnerCell: 24, ownWater: 4, partnerWater: 4 },
    { partnerCell: 16, ownWater: 4, partnerWater: 0 },
    { partnerCell: 24, ownWater: 0, partnerWater: 4 },
  ])("gives an achievable next step when the partner cannot clear the route: %j", ({ partnerCell, ownWater, partnerWater }) => {
    const game = initial();
    game.positions = [20, partnerCell];
    game.water = [ownWater, partnerWater];
    game.fire[15] = 1;
    game.plans[0] = { operation: "move", cell: 15 };
    render(<LanguageContext.Provider value="en"><EmberCrewGame game={game} ownSeat={0} phase="playing" now={1001} onPlan={vi.fn()} onCommit={vi.fn()} /></LanguageContext.Provider>);
    expect(screen.getByText(ownWater > 0
      ? "Your partner can't clear this route this turn. Put out the fire before moving."
      : "Your partner can't clear this route this turn. Take another route or get more water.")).toBeTruthy();
    expect(screen.queryByText("This route is burning. Your partner must put it out this round for you to pass.")).toBeNull();
  });
  it.each([false, true])("does not present abandoned drafts as ongoing or executed actions (planned: %s)", (planned) => {
    const game = planned ? jointRoute() : initial();
    game.result = { kind: "failure", score: 0, reason: "abandoned" };
    render(<LanguageContext.Provider value="en"><EmberCrewGame game={game} ownSeat={0} phase="completed" now={1001} onPlan={vi.fn()} onCommit={vi.fn()} /></LanguageContext.Provider>);
    expect(screen.queryByText(/Still planning/)).toBeNull();
    expect(screen.queryByText(/…/)).toBeNull();
    expect(screen.getAllByText(planned ? "Plan not executed" : "No action taken")).toHaveLength(2);
  });
  it.each([0, 1] as const)("explains the paired route from seat %s and restores its planned tool", (ownSeat) => {
    const onCommit = vi.fn();
    render(<LanguageContext.Provider value="en"><EmberCrewGame game={jointRoute()} ownSeat={ownSeat} phase="playing" now={1001} onPlan={vi.fn()} onCommit={onCommit} /></LanguageContext.Provider>);
    expect(screen.getByText(ownSeat === 0
      ? "Confirm together: your partner clears the fire, then you move."
      : "Confirm together: you clear the fire, then your partner moves.")).toBeTruthy();
    expect(screen.queryByText("This route is burning. Your partner must put it out this round for you to pass.")).toBeNull();
    const tool = ownSeat === 0 ? "Move" : "Put out fire";
    expect(screen.getByRole("button", { name: tool }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: `Confirm plan · ${tool} · C2` }));
    expect(onCommit).toHaveBeenCalledOnce();
  });

  it("restores the burning-route warning when the partner changes their plan", () => {
    const game = jointRoute();
    const props = { ownSeat: 0 as const, phase: "playing" as const, now: 1001, onPlan: vi.fn(), onCommit: vi.fn() };
    const view = render(<LanguageContext.Provider value="en"><EmberCrewGame {...props} game={game} /></LanguageContext.Provider>);
    const revised = planEmberAction(game, 1, game.round, { operation: "wait", cell: game.positions[1] }, 1002);
    if (!revised.ok) throw new Error(revised.reason);
    view.rerender(<LanguageContext.Provider value="en"><EmberCrewGame {...props} game={revised.state} /></LanguageContext.Provider>);
    expect(screen.queryByText(/Confirm together:/)).toBeNull();
    expect(screen.getByText("This route is burning. Your partner must put it out this round for you to pass.")).toBeTruthy();
  });

  it.each(["reconnect_grace", "completed"] as const)("does not promise a route during %s", (phase) => {
    render(<LanguageContext.Provider value="en"><EmberCrewGame game={jointRoute()} ownSeat={0} phase={phase} now={1001} onPlan={vi.fn()} onCommit={vi.fn()} /></LanguageContext.Provider>);
    expect(screen.queryByText(/Confirm together:|This route is burning/)).toBeNull();
  });

  it.each(["expired", "resolved"])("does not retain active planning advice after the turn is %s", (state) => {
    const game = jointRoute();
    if (state === "resolved") game.phase = "round_result";
    render(<LanguageContext.Provider value="en"><EmberCrewGame game={game} ownSeat={0} phase="playing" now={state === "expired" ? game.turnDeadline : 1001} onPlan={vi.fn()} onCommit={vi.fn()} /></LanguageContext.Provider>);
    expect(screen.queryByText(/Confirm together:|This route is burning/)).toBeNull();
    expect(screen.queryByText("Tap an adjacent tile to plan a move. Your partner can clear a burning route in the same round.")).toBeNull();
  });

  it("publishes a legal tile plan, but requires a server snapshot before confirmation", () => {
    const onPlan = vi.fn(); const onCommit = vi.fn(); const game = initial();
    const view = render(<EmberCrewGame game={game} ownSeat={0} phase="playing" now={1001} onPlan={onPlan} onCommit={onCommit} />);
    fireEvent.click(screen.getByRole("button", { name: /^A4,/ }));
    expect(onPlan).toHaveBeenCalledWith({ operation: "move", cell: 15 });
    expect((screen.getByRole("button", { name: /确认本轮计划/ }) as HTMLButtonElement).disabled).toBe(true);
    const planned = { ...game, plans: [{ operation: "move", cell: 15 }, null] } as EmberCrewState;
    view.rerender(<EmberCrewGame game={planned} ownSeat={0} phase="playing" now={1001} onPlan={onPlan} onCommit={onCommit} />);
    fireEvent.click(screen.getByRole("button", { name: /确认本轮计划.*A4/ }));
    expect(onCommit).toHaveBeenCalledOnce();
  });

  it.each(["reconnect_grace", "ready", "completed"] as const)("does not allow moves while %s", (phase) => {
    render(<EmberCrewGame game={initial()} ownSeat={0} phase={phase} now={1001} onPlan={vi.fn()} onCommit={vi.fn()} />);
    expect(screen.getAllByRole("button").every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
  });

  it("blocks repeated taps during synchronization", () => {
    render(<EmberCrewGame game={initial()} ownSeat={0} phase="playing" pending now={1001} onPlan={vi.fn()} onCommit={vi.fn()} />);
    expect(screen.getAllByRole("button").every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
    expect(screen.getAllByText("正在同步你的计划").length).toBeGreaterThan(0);
  });

  it("shows the partner's plan, water and ready status on both screens", () => {
    const game: EmberCrewState = { ...initial(), locked: [false, true], plans: [null, { operation: "move", cell: 19 }] };
    render(<LanguageContext.Provider value="en"><EmberCrewGame game={game} ownSeat={0} phase="playing" now={1001} onPlan={vi.fn()} onCommit={vi.fn()} /></LanguageContext.Provider>);
    expect(screen.getByText("Partner confirmed · your decision")).toBeTruthy();
    expect(screen.getByText("Move · E4")).toBeTruthy();
    expect(screen.getByRole("button", { name: /E4, Passage, Partner's planned target/ })).toBeTruthy();
  });

  it("does not silently confirm the previous operation after selecting a different tool", () => {
    const game: EmberCrewState = { ...initial(), positions: [16, 22], plans: [{ operation: "move", cell: 21 }, null] };
    render(<EmberCrewGame game={game} ownSeat={0} phase="playing" now={1001} onPlan={vi.fn()} onCommit={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "灭火" }));
    expect((screen.getByRole("button", { name: "确认本轮计划" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("identifies the disconnected partner while preserving both visible plans", () => {
    const game: EmberCrewState = { ...initial(), plans: [{ operation: "move", cell: 15 }, { operation: "move", cell: 19 }] };
    render(<LanguageContext.Provider value="en"><EmberCrewGame game={game} ownSeat={0} playerConnected={[true, false]} phase="reconnect_grace" now={1001} onPlan={vi.fn()} onCommit={vi.fn()} /></LanguageContext.Provider>);
    expect(screen.getByText("Partner offline · plans saved")).toBeTruthy();
    expect(screen.getByText("Move · A4")).toBeTruthy();
    expect(screen.getByText("Move · E4")).toBeTruthy();
  });

  it("does not ask players to wait for a partner who has already acted", () => {
    const game: EmberCrewState = { ...initial(), phase: "round_result", locked: [true, true] };
    render(<LanguageContext.Provider value="en"><EmberCrewGame game={game} ownSeat={0} phase="playing" now={1001} onPlan={vi.fn()} onCommit={vi.fn()} /></LanguageContext.Provider>);
    expect(screen.queryByText("Confirmed · waiting for partner")).toBeNull();
    expect(screen.queryByText(/Fire grows after this round/)).toBeNull();
    expect(screen.getAllByRole("button").every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
  });

  it("explains why AI keeps its draft open without changing friend-room guidance", () => {
    const props = { game: initial(), ownSeat: 0 as const, phase: "playing" as const, now: 1001, onPlan: vi.fn(), onCommit: vi.fn() };
    const view = render(<LanguageContext.Provider value="en"><EmberCrewGame {...props} partnerIsAi /></LanguageContext.Provider>);
    expect(screen.getByText("AI adapts to your plan. Confirm when ready.")).toBeTruthy();
    view.rerender(<LanguageContext.Provider value="en"><EmberCrewGame {...props} /></LanguageContext.Provider>);
    expect(screen.queryByText("AI adapts to your plan. Confirm when ready.")).toBeNull();
    expect(screen.getByText("Plan together. Confirm separately.")).toBeTruthy();
  });

  it("does not warn about fire growth when all fires are out", () => {
    const game = { ...initial(), fire: Array<number>(25).fill(0), forecast: [] };
    render(<LanguageContext.Provider value="en"><EmberCrewGame game={game} ownSeat={0} phase="playing" now={1001} onPlan={vi.fn()} onCommit={vi.fn()} /></LanguageContext.Provider>);
    expect(screen.getByText("All fires out")).toBeTruthy();
    expect(screen.queryByText(/Fire grows|Fire forecast this round/)).toBeNull();
  });

  it("does not call an abandoned mission complete", () => {
    const game: EmberCrewState = { ...initial(), result: { kind: "failure", score: 0, reason: "abandoned" } };
    render(<LanguageContext.Provider value="en"><EmberCrewGame game={game} ownSeat={0} phase="completed" now={1001} onPlan={vi.fn()} onCommit={vi.fn()} /></LanguageContext.Provider>);
    expect(screen.queryByText("Rescue complete")).toBeNull();
    expect(screen.getAllByText("Rescue ended").length).toBeGreaterThan(0);
  });
});
