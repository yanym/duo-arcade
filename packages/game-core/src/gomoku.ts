import {
  DEFAULT_TURN_DURATION_MS,
  GOMOKU_CELL_COUNT,
  GOMOKU_SIZE,
  otherSeat,
  type GomokuState,
  type Piece,
  type PlaceStoneResult,
  type Seat,
} from "./types";

export function getSeatPiece(
  state: Pick<GomokuState, "blackSeat">,
  seat: Seat,
): 1 | 2 {
  return seat === state.blackSeat ? 1 : 2;
}

export function createGomokuState(
  blackSeat: Seat,
  now: number,
  turnDurationMs = DEFAULT_TURN_DURATION_MS,
): GomokuState {
  return {
    kind: "gomoku",
    rulesVersion: 1,
    size: GOMOKU_SIZE,
    board: Array.from({ length: GOMOKU_CELL_COUNT }, () => 0 as const),
    blackSeat,
    currentSeat: blackSeat,
    moveCount: 0,
    lastMove: null,
    turnDurationMs,
    turnDeadline: now + turnDurationMs,
    winningLine: null,
    result: null,
  };
}

function isInside(row: number, col: number): boolean {
  return row >= 0 && row < GOMOKU_SIZE && col >= 0 && col < GOMOKU_SIZE;
}

export function toCellIndex(row: number, col: number): number {
  return row * GOMOKU_SIZE + col;
}

export function fromCellIndex(index: number): { row: number; col: number } {
  return { row: Math.floor(index / GOMOKU_SIZE), col: index % GOMOKU_SIZE };
}

function collectDirection(
  board: readonly Piece[],
  row: number,
  col: number,
  rowStep: number,
  colStep: number,
  piece: 1 | 2,
): number[] {
  const cells: number[] = [];
  let nextRow = row + rowStep;
  let nextCol = col + colStep;
  while (isInside(nextRow, nextCol)) {
    const index = toCellIndex(nextRow, nextCol);
    if (board[index] !== piece) break;
    cells.push(index);
    nextRow += rowStep;
    nextCol += colStep;
  }
  return cells;
}

export function findWinningLine(
  board: readonly Piece[],
  row: number,
  col: number,
  piece: 1 | 2,
): number[] | null {
  const axes = [[0, 1], [1, 0], [1, 1], [1, -1]] as const;
  for (const [rowStep, colStep] of axes) {
    const before = collectDirection(board, row, col, -rowStep, -colStep, piece).reverse();
    const after = collectDirection(board, row, col, rowStep, colStep, piece);
    const line = [...before, toCellIndex(row, col), ...after];
    if (line.length >= 5) return line;
  }
  return null;
}

export function placeStone(
  state: GomokuState,
  actor: Seat,
  row: number,
  col: number,
  now: number,
  turnDurationMs = state.turnDurationMs ?? DEFAULT_TURN_DURATION_MS,
): PlaceStoneResult {
  if (state.result) return { ok: false, reason: "game_finished" };
  if (now >= state.turnDeadline) return { ok: false, reason: "turn_expired" };
  if (actor !== state.currentSeat) return { ok: false, reason: "not_your_turn" };
  if (!Number.isInteger(row) || !Number.isInteger(col) || !isInside(row, col)) {
    return { ok: false, reason: "invalid_position" };
  }
  const index = toCellIndex(row, col);
  if (state.board[index] !== 0) return { ok: false, reason: "cell_occupied" };
  const board = [...state.board];
  const piece = getSeatPiece(state, actor);
  board[index] = piece;
  const moveCount = state.moveCount + 1;
  const winningLine = findWinningLine(board, row, col, piece);
  if (winningLine) {
    return {
      ok: true,
      state: {
        ...state,
        board,
        moveCount,
        lastMove: index,
        winningLine,
        result: { kind: "win", winnerSeat: actor, reason: "five_in_a_row" },
      },
    };
  }
  if (moveCount === GOMOKU_CELL_COUNT) {
    return {
      ok: true,
      state: { ...state, board, moveCount, lastMove: index, result: { kind: "draw", reason: "board_full" } },
    };
  }
  return {
    ok: true,
    state: {
      ...state,
      board,
      currentSeat: otherSeat(actor),
      moveCount,
      lastMove: index,
      turnDurationMs,
      turnDeadline: now + turnDurationMs,
    },
  };
}
