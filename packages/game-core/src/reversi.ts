import { getSeatPiece } from "./gomoku";
import {
  DEFAULT_TURN_DURATION_MS,
  REVERSI_SIZE,
  otherSeat,
  type GameActionResult,
  type Piece,
  type ReversiState,
  type Seat,
} from "./types";

const DIRECTIONS = [
  [-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1],
] as const;

function indexOf(row: number, col: number): number {
  return row * REVERSI_SIZE + col;
}

function isInside(row: number, col: number): boolean {
  return row >= 0 && row < REVERSI_SIZE && col >= 0 && col < REVERSI_SIZE;
}

export function createReversiState(
  blackSeat: Seat,
  now: number,
  turnDurationMs = DEFAULT_TURN_DURATION_MS,
): ReversiState {
  const board = Array.from({ length: REVERSI_SIZE * REVERSI_SIZE }, () => 0 as Piece);
  board[indexOf(3, 3)] = 2;
  board[indexOf(3, 4)] = 1;
  board[indexOf(4, 3)] = 1;
  board[indexOf(4, 4)] = 2;
  return {
    kind: "reversi",
    rulesVersion: 1,
    size: REVERSI_SIZE,
    board,
    blackSeat,
    currentSeat: blackSeat,
    moveCount: 0,
    lastMove: null,
    passedSeat: null,
    turnDeadline: now + turnDurationMs,
    result: null,
  };
}

export function getReversiFlips(
  state: Pick<ReversiState, "board" | "blackSeat">,
  actor: Seat,
  row: number,
  col: number,
): number[] {
  if (!Number.isInteger(row) || !Number.isInteger(col) || !isInside(row, col)) return [];
  const index = indexOf(row, col);
  if (state.board[index] !== 0) return [];
  const own = getSeatPiece(state, actor);
  const opponent = own === 1 ? 2 : 1;
  const flips: number[] = [];
  for (const [rowStep, colStep] of DIRECTIONS) {
    const line: number[] = [];
    let nextRow = row + rowStep;
    let nextCol = col + colStep;
    while (isInside(nextRow, nextCol)) {
      const nextIndex = indexOf(nextRow, nextCol);
      const piece = state.board[nextIndex];
      if (piece === opponent) {
        line.push(nextIndex);
      } else {
        if (piece === own && line.length > 0) flips.push(...line);
        break;
      }
      nextRow += rowStep;
      nextCol += colStep;
    }
  }
  return flips;
}

export function getReversiLegalMoves(state: ReversiState, actor: Seat): number[] {
  const moves: number[] = [];
  for (let index = 0; index < state.board.length; index += 1) {
    if (state.board[index] !== 0) continue;
    const row = Math.floor(index / REVERSI_SIZE);
    const col = index % REVERSI_SIZE;
    if (getReversiFlips(state, actor, row, col).length > 0) moves.push(index);
  }
  return moves;
}

function finishReversi(board: Piece[], state: ReversiState): ReversiState {
  const blackCount = board.filter((piece) => piece === 1).length;
  const whiteCount = board.filter((piece) => piece === 2).length;
  if (blackCount === whiteCount) {
    return { ...state, board, result: { kind: "draw", reason: "board_tied" } };
  }
  const winnerPiece: 1 | 2 = blackCount > whiteCount ? 1 : 2;
  const winnerSeat = getSeatPiece(state, 0) === winnerPiece ? 0 : 1;
  return { ...state, board, result: { kind: "win", winnerSeat, reason: "disc_majority" } };
}

export function placeDisc(
  state: ReversiState,
  actor: Seat,
  row: number,
  col: number,
  now: number,
  turnDurationMs = DEFAULT_TURN_DURATION_MS,
): GameActionResult {
  if (state.result) return { ok: false, reason: "game_finished" };
  if (now >= state.turnDeadline) return { ok: false, reason: "turn_expired" };
  if (actor !== state.currentSeat) return { ok: false, reason: "not_your_turn" };
  if (!Number.isInteger(row) || !Number.isInteger(col) || !isInside(row, col)) {
    return { ok: false, reason: "invalid_position" };
  }
  const index = indexOf(row, col);
  if (state.board[index] !== 0) return { ok: false, reason: "cell_occupied" };
  const flips = getReversiFlips(state, actor, row, col);
  if (flips.length === 0) return { ok: false, reason: "illegal_move" };
  const board = [...state.board];
  const own = getSeatPiece(state, actor);
  board[index] = own;
  for (const flip of flips) board[flip] = own;
  const opponent = otherSeat(actor);
  const base: ReversiState = {
    ...state,
    board,
    lastMove: index,
    moveCount: state.moveCount + 1,
  };
  if (getReversiLegalMoves(base, opponent).length > 0) {
    return {
      ok: true,
      state: { ...base, currentSeat: opponent, passedSeat: null, turnDeadline: now + turnDurationMs },
    };
  }
  if (getReversiLegalMoves(base, actor).length > 0) {
    return {
      ok: true,
      state: { ...base, currentSeat: actor, passedSeat: opponent, turnDeadline: now + turnDurationMs },
    };
  }
  return { ok: true, state: finishReversi(board, base) };
}
