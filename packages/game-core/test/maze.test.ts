import { describe, expect, it } from "vitest";

import {
  WALL_BOTTOM,
  WALL_LEFT,
  WALL_RIGHT,
  WALL_TOP,
  createSplitMazeState,
  generateMaze,
  moveInMaze,
} from "../src/index";

describe("split maze rules", () => {
  it("generates a connected deterministic maze", () => {
    const first = generateMaze(42);
    const second = generateMaze(42);
    expect(first).toEqual(second);

    const seen = new Set([0]);
    const queue = [0];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor]!;
      const row = Math.floor(index / 9);
      const col = index % 9;
      const candidates: number[] = [];
      if (!(first.walls[index]! & WALL_TOP) && row > 0) candidates.push(index - 9);
      if (!(first.walls[index]! & WALL_RIGHT) && col < 8) candidates.push(index + 1);
      if (!(first.walls[index]! & WALL_BOTTOM) && row < 8) candidates.push(index + 9);
      if (!(first.walls[index]! & WALL_LEFT) && col > 0) candidates.push(index - 1);
      for (const next of candidates) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    expect(seen.size).toBe(81);
    expect(first.exit).not.toBe(0);
  });

  it("enforces split controls and completes at the exit", () => {
    const base = createSplitMazeState(0, 1_000, 7);
    expect(moveInMaze(base, 1, "up", 2_000)).toEqual({ ok: false, reason: "wrong_control" });

    const game = { ...base, walls: [13, 7, ...base.walls.slice(2)], exit: 1 };
    const outcome = moveInMaze(game, 1, "right", 2_000);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok || outcome.state.kind !== "split_maze") return;
    expect(outcome.state.position).toBe(1);
    expect(outcome.state.result?.kind).toBe("success");
  });

  it("counts wall collisions without changing position", () => {
    const game = createSplitMazeState(0, 1_000, 7);
    const outcome = moveInMaze(game, 0, "up", 2_000);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok || outcome.state.kind !== "split_maze") return;
    expect(outcome.state.position).toBe(0);
    expect(outcome.state.wallHits).toBe(1);
  });
});
