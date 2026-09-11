export const AI_DIFFICULTIES = ["easy", "standard", "hard"] as const;
export const AI_INTELLIGENCE_LEVELS = ["casual", "balanced", "strategic"] as const;
export const AI_REACTION_SPEEDS = ["relaxed", "natural", "quick"] as const;

export type AiOptions = {
  difficulty: (typeof AI_DIFFICULTIES)[number];
  intelligence: (typeof AI_INTELLIGENCE_LEVELS)[number];
  reactionSpeed: (typeof AI_REACTION_SPEEDS)[number];
};

export const DEFAULT_AI_OPTIONS: AiOptions = {
  difficulty: "standard",
  intelligence: "balanced",
  reactionSpeed: "natural",
};

export function normalizeAiOptions(value: unknown): AiOptions {
  const input = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  return {
    difficulty: AI_DIFFICULTIES.find((item) => item === input.difficulty) ?? DEFAULT_AI_OPTIONS.difficulty,
    intelligence: AI_INTELLIGENCE_LEVELS.find((item) => item === input.intelligence) ?? DEFAULT_AI_OPTIONS.intelligence,
    reactionSpeed: AI_REACTION_SPEEDS.find((item) => item === input.reactionSpeed) ?? DEFAULT_AI_OPTIONS.reactionSpeed,
  };
}

/** A deterministic stream keeps a scheduled decision reproducible across retries. Not for credentials. */
export function createAiRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(value ^ (value >>> 15), value | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function aiReactionDelay(options: AiOptions, random: () => number): number {
  const base = { relaxed: 1100, natural: 650, quick: 280 }[options.reactionSpeed];
  return Math.round(base * (0.8 + random() * 0.4));
}

export function aiMistakeRate(options: AiOptions): number {
  return { easy: 0.22, standard: 0.08, hard: 0.01 }[options.difficulty];
}
