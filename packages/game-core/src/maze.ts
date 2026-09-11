import {
  MAZE_COLS,
  MAZE_DURATION_MS,
  MAZE_ROWS,
  type GameActionResult,
  type MazeDirection,
  type Seat,
  type SplitMazeState,
} from "./types";

export const WALL_TOP = 1;
export const WALL_RIGHT = 2;
export const WALL_BOTTOM = 4;
export const WALL_LEFT = 8;

function seededRandom(seed: number): () => number {
  let value = seed >>> 0 || 0x9e3779b9;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function removeWall(walls: number[], from: number, to: number, direction: MazeDirection): void {
  const masks: Record<MazeDirection, [number, number]> = {
    up: [WALL_TOP, WALL_BOTTOM],
    right: [WALL_RIGHT, WALL_LEFT],
    down: [WALL_BOTTOM, WALL_TOP],
    left: [WALL_LEFT, WALL_RIGHT],
  };
  const [fromMask, toMask] = masks[direction];
  walls[from] = (walls[from] ?? 15) & ~fromMask;
  walls[to] = (walls[to] ?? 15) & ~toMask;
}

export function generateMaze(
  seed: number,
  rows = MAZE_ROWS,
  cols = MAZE_COLS,
): { walls: number[]; exit: number } {
  const count = rows * cols;
  const walls = Array.from({ length: count }, () => 15);
  const visited = Array.from({ length: count }, () => false);
  const stack = [0];
  const random = seededRandom(seed);
  visited[0] = true;
  while (stack.length > 0) {
    const current = stack[stack.length - 1]!;
    const row = Math.floor(current / cols);
    const col = current % cols;
    const candidates: { index: number; direction: MazeDirection }[] = [];
    if (row > 0 && !visited[current - cols]) candidates.push({ index: current - cols, direction: "up" });
    if (col < cols - 1 && !visited[current + 1]) candidates.push({ index: current + 1, direction: "right" });
    if (row < rows - 1 && !visited[current + cols]) candidates.push({ index: current + cols, direction: "down" });
    if (col > 0 && !visited[current - 1]) candidates.push({ index: current - 1, direction: "left" });
    if (candidates.length === 0) {
      stack.pop();
      continue;
    }
    const next = candidates[Math.floor(random() * candidates.length)]!;
    removeWall(walls, current, next.index, next.direction);
    visited[next.index] = true;
    stack.push(next.index);
  }

  const distances = Array.from({ length: count }, () => -1);
  const queue = [0];
  distances[0] = 0;
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor]!;
    const row = Math.floor(current / cols);
    const col = current % cols;
    const open: number[] = [];
    if (!(walls[current]! & WALL_TOP) && row > 0) open.push(current - cols);
    if (!(walls[current]! & WALL_RIGHT) && col < cols - 1) open.push(current + 1);
    if (!(walls[current]! & WALL_BOTTOM) && row < rows - 1) open.push(current + cols);
    if (!(walls[current]! & WALL_LEFT) && col > 0) open.push(current - 1);
    for (const next of open) {
      if (distances[next] !== -1) continue;
      distances[next] = distances[current]! + 1;
      queue.push(next);
    }
  }
  let exit = 0;
  for (let index = 1; index < distances.length; index += 1) {
    if (distances[index]! > distances[exit]!) exit = index;
  }
  return { walls, exit };
}

export function createSplitMazeState(
  verticalSeat: Seat,
  now: number,
  seed: number,
  durationMs = MAZE_DURATION_MS,
  size = MAZE_ROWS,
): SplitMazeState {
  const maze = generateMaze(seed, size, size);
  return {
    kind: "split_maze",
    rulesVersion: 1,
    rows: size,
    cols: size,
    walls: maze.walls,
    position: 0,
    exit: maze.exit,
    verticalSeat,
    moveCount: 0,
    wallHits: 0,
    startedAt: now,
    turnDeadline: now + durationMs,
    result: null,
  };
}

export function moveInMaze(
  state: SplitMazeState,
  actor: Seat,
  direction: MazeDirection,
  now: number,
): GameActionResult {
  if (state.result) return { ok: false, reason: "game_finished" };
  if (now >= state.turnDeadline) return { ok: false, reason: "turn_expired" };
  const isVertical = direction === "up" || direction === "down";
  if ((actor === state.verticalSeat) !== isVertical) return { ok: false, reason: "wrong_control" };
  const mask = { up: WALL_TOP, right: WALL_RIGHT, down: WALL_BOTTOM, left: WALL_LEFT }[direction];
  if ((state.walls[state.position] ?? 15) & mask) {
    return { ok: true, state: { ...state, wallHits: state.wallHits + 1 } };
  }
  const offset = { up: -state.cols, right: 1, down: state.cols, left: -1 }[direction];
  const position = state.position + offset;
  const moveCount = state.moveCount + 1;
  if (position === state.exit) {
    const elapsedSeconds = Math.max(0, Math.floor((now - state.startedAt) / 1_000));
    const score = Math.max(100, 1_200 - elapsedSeconds * 8 - moveCount * 4 - state.wallHits * 12);
    return {
      ok: true,
      state: {
        ...state,
        position,
        moveCount,
        result: { kind: "success", score, reason: "exit_reached" },
      },
    };
  }
  return { ok: true, state: { ...state, position, moveCount } };
}
