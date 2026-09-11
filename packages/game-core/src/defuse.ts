import { roundsForLength } from "./options";
import {
  DEFUSE_SYMBOLS,
  otherSeat,
  type DefuseState,
  type DefuseSymbol,
  type DefuseViewState,
  type GameActionResult,
  type GameOptions,
  type Seat,
} from "./types";

function stageConfig(options: GameOptions): Pick<
  DefuseState,
  "totalStages" | "sequenceLength" | "maxStrikes" | "stageDurationMs"
> {
  const difficulty = {
    easy: { sequenceLength: 3 as const, maxStrikes: 3 as const },
    standard: { sequenceLength: 4 as const, maxStrikes: 2 as const },
    hard: { sequenceLength: 5 as const, maxStrikes: 1 as const },
  }[options.difficulty];
  return {
    ...difficulty,
    totalStages: roundsForLength(options.length),
    stageDurationMs: { relaxed: 60_000, standard: 40_000, blitz: 25_000 }[options.pace],
  };
}

function shuffledSymbols(seed: number, stage: number): DefuseSymbol[] {
  const symbols = [...DEFUSE_SYMBOLS];
  let value = (seed ^ Math.imul(stage, 0x9e3779b9)) >>> 0;
  const random = () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
  for (let index = symbols.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [symbols[index], symbols[target]] = [symbols[target]!, symbols[index]!];
  }
  return symbols;
}

function solutionFor(state: Pick<DefuseState, "seed" | "stage" | "sequenceLength">): DefuseSymbol[] {
  return shuffledSymbols(state.seed, state.stage).slice(0, state.sequenceLength);
}

export function createDefuseState(
  operatorSeat: Seat,
  now: number,
  seed: number,
  options: GameOptions,
): DefuseState {
  const config = stageConfig(options);
  const base = {
    kind: "starship_defuse" as const,
    rulesVersion: 1 as const,
    seed,
    stage: 1,
    totalStages: config.totalStages,
    operatorSeat,
    availableSymbols: [...DEFUSE_SYMBOLS],
    progress: 0,
    sequenceLength: config.sequenceLength,
    strikes: 0,
    maxStrikes: config.maxStrikes,
    stageDurationMs: config.stageDurationMs,
    lastInput: null,
    turnDeadline: now + config.stageDurationMs,
    result: null,
  };
  return { ...base, solution: solutionFor(base) };
}

export function pressDefuseSymbol(
  state: DefuseState,
  actor: Seat,
  symbol: DefuseSymbol,
  now: number,
): GameActionResult {
  if (state.result) return { ok: false, reason: "game_finished" };
  if (now >= state.turnDeadline) return { ok: false, reason: "turn_expired" };
  if (actor !== state.operatorSeat) return { ok: false, reason: "wrong_role" };
  if (!state.availableSymbols.includes(symbol)) return { ok: false, reason: "invalid_symbol" };

  const correct = state.solution[state.progress] === symbol;
  if (!correct) {
    const strikes = state.strikes + 1;
    return {
      ok: true,
      state: {
        ...state,
        strikes,
        lastInput: { symbol, correct: false, stageComplete: false },
        result: strikes >= state.maxStrikes
          ? { kind: "failure", score: Math.max(0, (state.stage - 1) * 200), reason: "too_many_strikes" }
          : null,
      },
    };
  }

  const progress = state.progress + 1;
  if (progress < state.solution.length) {
    return {
      ok: true,
      state: { ...state, progress, lastInput: { symbol, correct: true, stageComplete: false } },
    };
  }

  if (state.stage >= state.totalStages) {
    return {
      ok: true,
      state: {
        ...state,
        progress,
        lastInput: { symbol, correct: true, stageComplete: true },
        result: {
          kind: "success",
          score: Math.max(100, 1_000 + state.totalStages * 100 - state.strikes * 120),
          reason: "defuse_complete",
        },
      },
    };
  }

  const next = {
    ...state,
    stage: state.stage + 1,
    operatorSeat: otherSeat(state.operatorSeat),
    progress: 0,
    lastInput: { symbol, correct: true, stageComplete: true },
    turnDeadline: now + state.stageDurationMs,
  };
  return { ok: true, state: { ...next, solution: solutionFor(next) } };
}

export function expireDefuse(state: DefuseState, now: number): DefuseState {
  if (state.result || now < state.turnDeadline) return state;
  return {
    ...state,
    result: { kind: "failure", score: Math.max(0, (state.stage - 1) * 200), reason: "timeout" },
  };
}

export function getDefuseView(state: DefuseState, viewerSeat: Seat | null): DefuseViewState {
  return {
    ...state,
    solution: viewerSeat !== null && viewerSeat !== state.operatorSeat ? state.solution : null,
  };
}
