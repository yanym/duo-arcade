// @vitest-environment happy-dom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createShadowShuttleState, getShadowShuttleView, DEFAULT_GAME_OPTIONS } from "@duo/game-core";
import { ShadowShuttleGame, shadowTrackLayout } from "./ShadowShuttleGame";

vi.mock("react-native", () => vi.importActual<typeof import("react-native")>("react-native-web"));
vi.mock("@/settings/SettingsContext", () => ({ useSettings: () => ({ feedback: vi.fn(), settings: { highContrast: false, reducedMotion: true } }) }));
afterEach(cleanup);

describe("shadow shuttle responsive controls", () => {
  for (const podCount of [4, 5, 6]) {
    it(`keeps ${podCount} pods within narrow and wide tracks`, () => {
      for (const width of [202, 244, 300]) {
        const layout = shadowTrackLayout(width, podCount);
        expect(layout.stepWidth * (podCount - 1) + layout.podSize).toBeCloseTo(width);
        expect(layout.stepWidth - layout.podSize).toBeGreaterThanOrEqual(5.99);
        if (layout.podSize < 44) expect(layout.compact).toBe(true);
      }
    });
  }
  it("uses only the revealed target in accessible labels", () => {
    const state = { ...createShadowShuttleState(0, 1000, 42, DEFAULT_GAME_OPTIONS), targetPod: 2 };
    const view = render(<ShadowShuttleGame game={getShadowShuttleView(state, 1)} ownSeat={1} phase="playing" onMark={vi.fn()} onGuess={vi.fn()} />);
    expect(screen.queryByLabelText(/发光目标/)).toBeNull();
    view.rerender(<ShadowShuttleGame game={getShadowShuttleView({ ...state, phase: "memorizing" }, 1)} ownSeat={1} phase="playing" onMark={vi.fn()} onGuess={vi.fn()} />);
    expect(screen.getByLabelText("选择第 3 艘逃逸舱，发光目标")).toBeTruthy();
  });
  it("announces the just-completed swap with reduced motion, not a future swap", () => {
    const state = { ...createShadowShuttleState(0, 1000, 42, DEFAULT_GAME_OPTIONS), phase: "shuffling" as const, shuffleStep: 1, shufflePlan: [[1, 2], [3, 4]] as [number, number][] };
    render(<ShadowShuttleGame game={getShadowShuttleView(state, 1)} ownSeat={1} phase="playing" onMark={vi.fn()} onGuess={vi.fn()} />);
    expect(screen.getByText("第 2、3 位置刚刚交换")).toBeTruthy();
    expect(screen.queryByText("第 4、5 位置刚刚交换")).toBeNull();
  });
  it("maps the clicked visible slot after shuffling, not the pod's original identity", () => {
    const state = { ...createShadowShuttleState(0, 1000, 42, DEFAULT_GAME_OPTIONS), phase: "guessing" as const, permutation: [4, 1, 2, 3, 0] };
    const onGuess = vi.fn();
    render(<ShadowShuttleGame game={getShadowShuttleView(state, 1)} ownSeat={1} phase="playing" onMark={vi.fn()} onGuess={onGuess} />);
    fireEvent.click(screen.getByRole("button", { name: "检查第 1 位置" }));
    expect(onGuess).toHaveBeenCalledWith(0);
  });
  it("does not describe a marking timeout as a successful escape", () => {
    const state = { ...createShadowShuttleState(0, 1000, 42, DEFAULT_GAME_OPTIONS), phase: "round_result" as const, roundOutcome: "mark_timeout" as const };
    render(<ShadowShuttleGame game={getShadowShuttleView(state, 1)} ownSeat={1} phase="playing" onMark={vi.fn()} onGuess={vi.fn()} />);
    expect(screen.getByText("幻影选舱超时，追踪者得分")).toBeTruthy();
    expect(screen.queryByText("幻影逃逸，目标已经揭晓")).toBeNull();
  });
});
