import {
  DEFAULT_GAME_OPTIONS,
  GAME_DIFFICULTIES,
  GAME_LENGTHS,
  GAME_PACES,
  type GameDifficulty,
  type GameLength,
  type GameOptions,
  type GamePace,
} from "./types";

export function isGamePace(value: unknown): value is GamePace {
  return typeof value === "string" && (GAME_PACES as readonly string[]).includes(value);
}

export function isGameDifficulty(value: unknown): value is GameDifficulty {
  return typeof value === "string" && (GAME_DIFFICULTIES as readonly string[]).includes(value);
}

export function isGameLength(value: unknown): value is GameLength {
  return typeof value === "string" && (GAME_LENGTHS as readonly string[]).includes(value);
}

export function normalizeGameOptions(value: unknown): GameOptions {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ...DEFAULT_GAME_OPTIONS };
  }
  const input = value as Record<string, unknown>;
  return {
    pace: isGamePace(input.pace) ? input.pace : DEFAULT_GAME_OPTIONS.pace,
    difficulty: isGameDifficulty(input.difficulty)
      ? input.difficulty
      : DEFAULT_GAME_OPTIONS.difficulty,
    length: isGameLength(input.length) ? input.length : DEFAULT_GAME_OPTIONS.length,
  };
}

export function turnDurationForPace(pace: GamePace): number {
  return { relaxed: 60_000, standard: 30_000, blitz: 15_000 }[pace];
}

export function roundsForLength(length: GameLength): 3 | 5 | 7 {
  return { short: 3, standard: 5, long: 7 }[length] as 3 | 5 | 7;
}
