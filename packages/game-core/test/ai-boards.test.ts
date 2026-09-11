import { describe, expect, it } from "vitest";
import { aiReactionDelay, createAiRandom, DEFAULT_AI_OPTIONS, normalizeAiOptions } from "../src/ai-options";
import { aiPlanDelayMs, type AiActionPlan } from "../src/ai";
import { chooseGomokuAction, chooseMazeAction, chooseReversiAction } from "../src/ai-boards";
import { createGomokuState, placeStone } from "../src/gomoku";
import { createReversiState, placeDisc } from "../src/reversi";
import { createSplitMazeState, moveInMaze } from "../src/maze";
import type { ReversiState, SplitMazeState } from "../src/types";

describe("AI controls", () => {
  it("normalizes untrusted configuration and separates reaction speed", () => {
    expect(normalizeAiOptions(null)).toEqual(DEFAULT_AI_OPTIONS);
    expect(normalizeAiOptions({ difficulty: "hard", intelligence: "invalid", reactionSpeed: 1 })).toEqual({ ...DEFAULT_AI_OPTIONS, difficulty: "hard" });
    expect(aiReactionDelay({ ...DEFAULT_AI_OPTIONS, reactionSpeed: "quick" }, () => 0.5)).toBeLessThan(aiReactionDelay({ ...DEFAULT_AI_OPTIONS, reactionSpeed: "relaxed" }, () => 0.5));
  });
  it("keeps reaction speed observable for every scheduling mode", () => {
    const state = createGomokuState(0, 1_000);
    const action = { kind: "place_stone", row: 7, col: 7 } as const;

    for (const timing of ["rapid", "deliberate", "reaction", "precision"] as const) {
      const plan: AiActionPlan = { action, timing };
      const relaxed = aiPlanDelayMs(
        state,
        plan,
        { ...DEFAULT_AI_OPTIONS, reactionSpeed: "relaxed" },
        () => 0.5,
        1_000,
      );
      const quick = aiPlanDelayMs(
        state,
        plan,
        { ...DEFAULT_AI_OPTIONS, reactionSpeed: "quick" },
        () => 0.5,
        1_000,
      );
      expect(quick, `${timing} should respond faster`).toBeLessThan(relaxed);
    }
  });
  it("uses difficulty to tighten timing-sensitive precision", () => {
    const state = createGomokuState(0, 1_000);
    const plan: AiActionPlan = {
      action: { kind: "place_stone", row: 7, col: 7 },
      timing: "precision",
    };
    const easy = aiPlanDelayMs(
      state,
      plan,
      { ...DEFAULT_AI_OPTIONS, difficulty: "easy" },
      () => 0.5,
      1_000,
    );
    const hard = aiPlanDelayMs(
      state,
      plan,
      { ...DEFAULT_AI_OPTIONS, difficulty: "hard" },
      () => 0.5,
      1_000,
    );
    expect(hard).toBeLessThan(easy);
  });
  it("can reproduce decisions without sharing mutable random state", () => {
    const a = createAiRandom(42), b = createAiRandom(42);
    expect(Array.from({ length: 10 }, a)).toEqual(Array.from({ length: 10 }, b));
  });
});

describe("board AI", () => {
  it("wins with either colour and does not mutate the source board", () => {
    for (const blackSeat of [0, 1] as const) {
      const state = createGomokuState(blackSeat, 0);
      state.currentSeat = 1;
      for (let col = 2; col < 6; col++) state.board[7 * 15 + col] = blackSeat === 1 ? 1 : 2;
      state.moveCount = 4;
      const before = JSON.parse(JSON.stringify(state));
      const action = chooseGomokuAction(state, 1, DEFAULT_AI_OPTIONS, () => 0.5);
      expect(action?.kind).toBe("place_stone");
      if (action?.kind !== "place_stone") throw new Error("missing move");
      const result = placeStone(state, 1, action.row, action.col, 1);
      expect(result.ok && result.state.result).toMatchObject({ kind: "win", winnerSeat: 1 });
      expect(state).toEqual(before);
    }
  });
  it("blocks an immediate loss and waits for its turn", () => {
    const state = createGomokuState(0, 0);
    state.currentSeat = 1;
    state.board[7 * 15 + 1] = 2;
    for (let col = 2; col < 6; col++) state.board[7 * 15 + col] = 1;
    expect(chooseGomokuAction(state, 1, DEFAULT_AI_OPTIONS, () => 0.9)).toEqual({ kind: "place_stone", row: 7, col: 6 });
    expect(chooseGomokuAction(state, 0, DEFAULT_AI_OPTIONS, () => 0.9)).toBeNull();
  });
  it("makes difficulty and strategy controls affect actual decisions", () => {
    const state = createGomokuState(0, 0);
    state.currentSeat = 1;
    state.board[7 * 15 + 1] = 2;
    for (let col = 2; col < 6; col++) state.board[7 * 15 + col] = 1;
    const easyRandomValues = [0.1, 0];
    const easy = chooseGomokuAction(
      state,
      1,
      { difficulty: "easy", intelligence: "casual", reactionSpeed: "natural" },
      () => easyRandomValues.shift() ?? 0,
    );
    const hard = chooseGomokuAction(
      state,
      1,
      { difficulty: "hard", intelligence: "strategic", reactionSpeed: "natural" },
      () => 0.1,
    );
    expect(easy).not.toEqual({ kind: "place_stone", row: 7, col: 6 });
    expect(hard).toEqual({ kind: "place_stone", row: 7, col: 6 });
  });
  it("plays a full legal reversi game including forced passes", () => {
    let state: ReversiState = createReversiState(1, 0);
    const random = createAiRandom(17);
    for (let turn = 0; turn < 60 && !state.result; turn++) {
      const action = chooseReversiAction(state, state.currentSeat, DEFAULT_AI_OPTIONS, random);
      if (action?.kind !== "place_disc") throw new Error("AI stalled");
      const result = placeDisc(state, state.currentSeat, action.row, action.col, turn + 1);
      if (!result.ok || result.state.kind !== "reversi") throw new Error("illegal AI move");
      state = result.state;
    }
    expect(state.result).not.toBeNull();
  });
  it("cooperates through many mazes without hitting walls or taking over the other controls", () => {
    for (let seed = 0; seed < 20; seed++) {
      let state: SplitMazeState = createSplitMazeState(seed % 2 === 0 ? 0 : 1, 0, seed);
      for (let step = 0; step < 81 && !state.result; step++) {
        const a = chooseMazeAction(state, 0), b = chooseMazeAction(state, 1);
        expect(Number(a !== null) + Number(b !== null)).toBe(1);
        const seat = a ? 0 : 1, action = a ?? b;
        if (action?.kind !== "maze_move") throw new Error("AI stalled");
        const result = moveInMaze(state, seat, action.direction, step + 1);
        if (!result.ok || result.state.kind !== "split_maze") throw new Error("invalid maze move");
        state = result.state;
      }
      expect(state.result?.kind).toBe("success");
      expect(state.wallHits).toBe(0);
    }
  });
});
