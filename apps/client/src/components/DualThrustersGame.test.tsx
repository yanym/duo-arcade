// @vitest-environment happy-dom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDualThrustersState, getDualThrustersView, DEFAULT_GAME_OPTIONS } from "@duo/game-core";
import { DualThrustersGame } from "./DualThrustersGame";
vi.mock("react-native", () => vi.importActual<typeof import("react-native")>("react-native-web"));
vi.mock("@/settings/SettingsContext", () => ({ useSettings: () => ({ feedback: vi.fn(), settings: { highContrast: false, reducedMotion: true } }) }));
afterEach(cleanup);

describe("dual thruster coordination", () => {
  it("distinguishes positive and negative inertia", () => {
    const state = createDualThrustersState(1000, 42, DEFAULT_GAME_OPTIONS);
    const view = render(<DualThrustersGame game={getDualThrustersView({ ...state, drift: 1 }, 0)} ownSeat={0} phase="playing" onChoosePower={vi.fn()} />);
    expect(screen.getByLabelText("惯性向较大编号 1 格").textContent).toBe("惯性 +1");
    view.rerender(<DualThrustersGame game={getDualThrustersView({ ...state, drift: -1 }, 0)} ownSeat={0} phase="playing" onChoosePower={vi.fn()} />);
    expect(screen.getByLabelText("惯性向较小编号 1 格").textContent).toBe("惯性 −1");
  });
  it("sends the right engine's power and acknowledges the partner's lock", () => {
    const state = { ...createDualThrustersState(1000, 42, DEFAULT_GAME_OPTIONS), locked: [true, false] as [boolean, boolean], powers: [2, null] as [2, null] };
    const onChoosePower = vi.fn();
    render(<DualThrustersGame game={getDualThrustersView(state, 1)} ownSeat={1} phase="playing" onChoosePower={onChoosePower} />);
    expect(screen.getByText("搭档已锁定")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "右舷推进器轻推，1档" }));
    expect(onChoosePower).toHaveBeenCalledWith(1);
  });
  it("does not report ongoing thinking after the game ends", () => {
    const state = createDualThrustersState(1000, 42, DEFAULT_GAME_OPTIONS);
    render(<DualThrustersGame game={getDualThrustersView(state, 1)} ownSeat={1} phase="completed" onChoosePower={vi.fn()} />);
    expect(screen.getByText("本局飞行已结束")).toBeTruthy();
    expect(screen.queryByText("搭档思考中")).toBeNull();
    expect(screen.getAllByRole("button").every(b => b.getAttribute("aria-disabled") === "true")).toBe(true);
  });
});
