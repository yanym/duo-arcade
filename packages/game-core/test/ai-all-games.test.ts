import { describe, expect, it } from "vitest";

import {
  DEFAULT_AI_OPTIONS,
  DEFAULT_GAME_OPTIONS,
  EMPTY_AI_MEMORY,
  GAME_IDS,
  advanceGameClock,
  aiPlanDelayMs,
  applyGameAction,
  chooseAiAction,
  createAiRandom,
  createGameState,
  isCompetitiveGame,
  updateAiMemory,
  type AiMemory,
  type AiOptions,
  type GameState,
  type Seat,
} from "../src";

function actionTime(state: GameState, now: number, step: number, seat: Seat, options: AiOptions): number {
  const selectionRandom = createAiRandom(10_000 + step * 17 + seat);
  const plan = chooseAiAction(state, seat, options, selectionRandom, EMPTY_AI_MEMORY);
  if (!plan) return now;
  const delay = aiPlanDelayMs(
    state,
    plan,
    options,
    createAiRandom(20_000 + step * 19 + seat),
    now,
  );
  return Math.max(now + 1, Math.min(state.turnDeadline - 25, now + delay));
}

describe("all-game AI policy", () => {
  it("classifies the existing competitive catalogue without changing its size", () => {
    const states = GAME_IDS.map((gameId, index) => createGameState(gameId, 0, 0, index + 1));
    expect(states.filter(isCompetitiveGame).map((state) => state.kind)).toEqual([
      "gomoku",
      "reversi",
      "cover_hunt",
      "quantum_duel",
      "rhythm_gravity",
      "shadow_shuttle",
      "meteor_dash",
      "trajectory_intercept",
      "neon_dash",
      "signal_bluff",
      "nova_volley",
      "pulse_pass",
    ]);
    expect(states).toHaveLength(28);
  });

  const profiles: Array<[string, AiOptions]> = [
    ["easy/casual/relaxed", { difficulty: "easy", intelligence: "casual", reactionSpeed: "relaxed" }],
    ["standard/balanced/natural", DEFAULT_AI_OPTIONS],
    ["hard/strategic/quick", { difficulty: "hard", intelligence: "strategic", reactionSpeed: "quick" }],
  ];
  const seeds = [11, 71, 173] as const;
  const scenarios = profiles.flatMap(([profile, options]) =>
    GAME_IDS.flatMap((gameId) => seeds.map((seed) => [profile, gameId, seed, options] as const)),
  );

  it.each(scenarios)("keeps %s AI legal in %s (seed %i) and reaches a result", (_profile, gameId, seed, aiOptions) => {
    let now = 1_000;
    let state = createGameState(gameId, 0, now, seed, DEFAULT_GAME_OPTIONS);
    const memories: [AiMemory, AiMemory] = [
      { ...EMPTY_AI_MEMORY },
      { ...EMPTY_AI_MEMORY },
    ];
    const acted = new Set<Seat>();

    for (let step = 0; step < 6_000 && !state.result; step += 1) {
      memories[0] = updateAiMemory(state, 0, memories[0]);
      memories[1] = updateAiMemory(state, 1, memories[1]);
      // Match the Durable Object scheduler: do not invent an AI action when
      // less than its 25 ms deadline guard remains. Let the game clock recover.
      if (state.turnDeadline <= now + 25) {
        now = Math.max(now + 1, state.turnDeadline);
        const advanced = advanceGameClock(state, now);
        expect(advanced, `${gameId} stalled inside the AI deadline guard`).not.toBe(state);
        state = advanced;
        continue;
      }
      let applied = false;

      for (const seat of (step % 2 === 0 ? [0, 1] : [1, 0]) as Seat[]) {
        // Model a human eventually missing one volley so a perfect-vs-perfect rally terminates.
        if (
          state.kind === "nova_volley" &&
          state.phase === "strike_window" &&
          seat === 0 &&
          state.rallyCount >= 2
        ) continue;
        const random = createAiRandom(30_000 + step * 37 + seat);
        const plan = chooseAiAction(state, seat, aiOptions, random, memories[seat]);
        if (!plan) continue;
        const at = actionTime(state, now, step, seat, aiOptions);
        const result = applyGameAction(state, seat, plan.action, at);
        expect(
          result,
          `${gameId} rejected ${JSON.stringify(plan.action)} at step ${step} (now ${now}, action ${at}, deadline ${state.turnDeadline})`,
        ).toMatchObject({ ok: true });
        if (!result.ok) throw new Error(`${gameId} generated an illegal action: ${result.reason}`);
        state = result.state;
        now = at;
        acted.add(seat);
        applied = true;
        break;
      }

      if (!applied) {
        now = Math.max(now + 1, state.turnDeadline);
        const advanced = advanceGameClock(state, now);
        expect(advanced, `${gameId} stalled before its deadline`).not.toBe(state);
        state = advanced;
      }
    }

    expect(state.result, `${gameId} never reached a terminal state`).not.toBeNull();
    expect(acted.has(1), `${gameId} never allowed the AI seat to participate`).toBe(true);
  });
});
