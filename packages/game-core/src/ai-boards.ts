import { findWinningLine, getSeatPiece } from "./gomoku";
import { getReversiLegalMoves, placeDisc } from "./reversi";
import { aiMistakeRate, type AiOptions } from "./ai-options";
import { otherSeat, type GameAction, type GomokuState, type Piece, type ReversiState, type Seat, type SplitMazeState, type MazeDirection } from "./types";

function choose<T>(items: readonly T[], random: () => number): T | undefined {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
}

function linePotential(board: readonly Piece[], index: number, piece: Piece): number {
  const row = Math.floor(index / 15), col = index % 15;
  let score = 0;
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    let count = 1, open = 0;
    for (const sign of [-1, 1]) {
      let r = row + dr! * sign, c = col + dc! * sign;
      while (r >= 0 && r < 15 && c >= 0 && c < 15 && board[r * 15 + c] === piece) {
        count += 1; r += dr! * sign; c += dc! * sign;
      }
      if (r >= 0 && r < 15 && c >= 0 && c < 15 && board[r * 15 + c] === 0) open += 1;
    }
    if (count >= 5) score += 1_000_000;
    else if (open) score += 8 ** count * (open === 2 ? 4 : 1);
  }
  return score;
}

export function chooseGomokuAction(state: GomokuState, seat: Seat, options: AiOptions, random: () => number): GameAction | null {
  if (state.result || state.currentSeat !== seat) return null;
  const empty = state.board.flatMap((piece, index) => piece === 0 ? [index] : []);
  if (!empty.length) return null;
  const own = getSeatPiece(state, seat), opponent = own === 1 ? 2 : 1;
  const action = (index: number): GameAction => ({ kind: "place_stone", row: Math.floor(index / 15), col: index % 15 });
  if (empty.length === 225) return action(112);
  // Immediate wins always matter; easy opponents may overlook a defensive threat.
  const win = empty.find((i) => findWinningLine(state.board, Math.floor(i / 15), i % 15, own));
  if (win !== undefined) return action(win);
  const mistake = random() < aiMistakeRate(options);
  const block = empty.find((i) => findWinningLine(state.board, Math.floor(i / 15), i % 15, opponent));
  if (!mistake && block !== undefined) return action(block);
  const nearby = empty.filter((i) => state.board.some((p, j) => p !== 0 && Math.abs(Math.floor(i / 15) - Math.floor(j / 15)) <= 2 && Math.abs(i % 15 - j % 15) <= 2));
  if (mistake) return action(choose(nearby, random) ?? empty[0]!);
  const defensiveWeight = { casual: 0.55, balanced: 0.95, strategic: 1.2 }[options.intelligence];
  const ranked = nearby.map((i) => ({ i, score: linePotential(state.board, i, own) + linePotential(state.board, i, opponent) * defensiveWeight - (Math.abs(Math.floor(i / 15) - 7) + Math.abs(i % 15 - 7)) * 0.1 })).sort((a, b) => b.score - a.score);
  const topScore = ranked[0]?.score;
  return action(choose(ranked.filter((item) => item.score === topScore), random)?.i ?? empty[0]!);
}

const REVERSI_WEIGHTS = [
  120, -30, 20, 5, 5, 20, -30, 120,
  -30, -45, -5, -5, -5, -5, -45, -30,
  20, -5, 15, 3, 3, 15, -5, 20,
  5, -5, 3, 3, 3, 3, -5, 5,
  5, -5, 3, 3, 3, 3, -5, 5,
  20, -5, 15, 3, 3, 15, -5, 20,
  -30, -45, -5, -5, -5, -5, -45, -30,
  120, -30, 20, 5, 5, 20, -30, 120,
];

function reversiScore(state: ReversiState, seat: Seat): number {
  const own = getSeatPiece(state, seat);
  const material = state.board.reduce<number>((sum, p) => sum + (p === 0 ? 0 : p === own ? 1 : -1), 0);
  if (state.result) return material === 0 ? 0 : Math.sign(material) * 100_000 + material;
  const position = state.board.reduce<number>((sum, p, i) => sum + (p === 0 ? 0 : p === own ? REVERSI_WEIGHTS[i]! : -REVERSI_WEIGHTS[i]!), 0);
  const mobility = getReversiLegalMoves(state, seat).length - getReversiLegalMoves(state, otherSeat(seat)).length;
  return position + mobility * 8 + material * (state.moveCount > 44 ? 8 : 0.3);
}

function searchReversi(state: ReversiState, seat: Seat, depth: number, alpha: number, beta: number): number {
  if (!depth || state.result) return reversiScore(state, seat);
  const maximize = state.currentSeat === seat;
  let best = maximize ? -Infinity : Infinity;
  for (const index of getReversiLegalMoves(state, state.currentSeat)) {
    const next = placeDisc(state, state.currentSeat, Math.floor(index / 8), index % 8, 0);
    if (!next.ok || next.state.kind !== "reversi") continue;
    const score = searchReversi(next.state, seat, depth - 1, alpha, beta);
    best = maximize ? Math.max(best, score) : Math.min(best, score);
    if (maximize) alpha = Math.max(alpha, best); else beta = Math.min(beta, best);
    if (alpha >= beta) break;
  }
  return Number.isFinite(best) ? best : reversiScore(state, seat);
}

export function chooseReversiAction(state: ReversiState, seat: Seat, options: AiOptions, random: () => number): GameAction | null {
  if (state.result || state.currentSeat !== seat) return null;
  const legal = getReversiLegalMoves(state, seat);
  if (!legal.length) return null;
  let selected = choose(legal, random)!;
  if (random() >= aiMistakeRate(options)) {
    const depth = { casual: 1, balanced: 2, strategic: 3 }[options.intelligence];
    let best = -Infinity;
    for (const index of legal) {
      const next = placeDisc(state, seat, Math.floor(index / 8), index % 8, 0);
      if (!next.ok || next.state.kind !== "reversi") continue;
      const score = searchReversi(next.state, seat, depth - 1, -Infinity, Infinity);
      if (score > best) { best = score; selected = index; }
    }
  }
  return { kind: "place_disc", row: Math.floor(selected / 8), col: selected % 8 };
}

export function nextMazeDirection(state: SplitMazeState): MazeDirection | null {
  const visited = new Set([state.position]);
  const queue: { at: number; first: MazeDirection | null }[] = [{ at: state.position, first: null }];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const item = queue[cursor]!;
    if (item.at === state.exit) return item.first;
    const r = Math.floor(item.at / state.cols), c = item.at % state.cols;
    const neighbors: [MazeDirection, number, number, boolean][] = [
      ["up", item.at - state.cols, 1, r > 0], ["right", item.at + 1, 2, c < state.cols - 1],
      ["down", item.at + state.cols, 4, r < state.rows - 1], ["left", item.at - 1, 8, c > 0],
    ];
    for (const [direction, at, wall, valid] of neighbors) {
      if (!valid || visited.has(at) || (state.walls[item.at]! & wall)) continue;
      visited.add(at); queue.push({ at, first: item.first ?? direction });
    }
  }
  return null;
}

export function chooseMazeAction(state: SplitMazeState, seat: Seat): GameAction | null {
  if (state.result) return null;
  const direction = nextMazeDirection(state);
  if (!direction || ((direction === "up" || direction === "down") !== (seat === state.verticalSeat))) return null;
  return { kind: "maze_move", direction };
}
