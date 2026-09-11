import { GOMOKU_SIZE } from "@duo/game-core";

type GomokuNavigationKey = "ArrowUp" | "ArrowRight" | "ArrowDown" | "ArrowLeft" | "Home" | "End";

export function nextGomokuFocusIndex(
  board: readonly number[],
  current: number,
  key: string,
): number {
  const row = Math.floor(current / GOMOKU_SIZE);
  const col = current % GOMOKU_SIZE;
  if (key === "Home" || key === "End") {
    const columns = key === "Home"
      ? Array.from({ length: GOMOKU_SIZE }, (_, index) => index)
      : Array.from({ length: GOMOKU_SIZE }, (_, index) => GOMOKU_SIZE - 1 - index);
    return columns.map((nextCol) => row * GOMOKU_SIZE + nextCol).find((index) => board[index] === 0) ?? current;
  }
  const delta: Partial<Record<GomokuNavigationKey, readonly [number, number]>> = {
    ArrowUp: [-1, 0],
    ArrowRight: [0, 1],
    ArrowDown: [1, 0],
    ArrowLeft: [0, -1],
  };
  const step = delta[key as GomokuNavigationKey];
  if (!step) return current;
  let nextRow = row + step[0];
  let nextCol = col + step[1];
  while (nextRow >= 0 && nextRow < GOMOKU_SIZE && nextCol >= 0 && nextCol < GOMOKU_SIZE) {
    const next = nextRow * GOMOKU_SIZE + nextCol;
    if (board[next] === 0) return next;
    nextRow += step[0];
    nextCol += step[1];
  }
  return current;
}
