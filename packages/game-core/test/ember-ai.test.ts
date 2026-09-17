import { describe, expect, it } from "vitest";
import { applyGameAction, chooseAiAction, DEFAULT_AI_OPTIONS, DEFAULT_GAME_OPTIONS, type Seat } from "../src";
import { createEmberCrewState, emberDistance, type EmberCrewState } from "../src/ember-crew";

function aiStep(game: EmberCrewState, seat: Seat) {
  const decision = chooseAiAction(game, seat, DEFAULT_AI_OPTIONS, () => 0.5);
  if (!decision) return game;
  const applied = applyGameAction(game, seat, decision.action, 2000);
  if (!applied.ok || applied.state.kind !== "ember_crew") throw new Error("AI action rejected");
  return applied.state;
}

describe("Ember AI follows a revisable shared plan", () => {
  it.each([0, 1] as Seat[])("does not give water back to a safely evacuating partner from AI seat %s", (ai) => {
    const human = ai === 0 ? 1 : 0;
    const game = createEmberCrewState(1000, 42, DEFAULT_GAME_OPTIONS);
    game.walls = []; game.fire = Array(25).fill(0); game.forecast = [];
    game.positions = [21, 21]; game.carrying = [true, true]; game.civilians = []; game.target = 2;
    game.water[ai] = 2; game.water[human] = 0;
    game.plans[human] = { operation: "move", cell: 20 };
    const planned = aiStep(game, ai);
    expect(planned.plans[ai]).toEqual({ operation: "move", cell: 20 });
    expect(planned.water).toEqual(game.water);
    const committed = applyGameAction(planned, human, { kind: "ember_commit", round: game.round }, 2000);
    if (!committed.ok || committed.state.kind !== "ember_crew") throw new Error("Human confirmation rejected");
    const result = aiStep(committed.state, ai);
    expect(result.rescued).toBe(2);
    expect(result.result?.kind).toBe("success");
    expect(result.water).toEqual(game.water);
  });

  it.each([0, 1] as Seat[])("lets AI seat %s use received water on an intense fire instead of returning it unnecessarily", (ai) => {
    const human = ai === 0 ? 1 : 0;
    const game = createEmberCrewState(1000, 42, DEFAULT_GAME_OPTIONS);
    game.walls = []; game.fire = Array(25).fill(0); game.forecast = [];
    game.fire[3] = 2; game.positions = [2, 2]; game.carrying = [true, true]; game.civilians = [];
    game.water[ai] = 2; game.water[human] = 0;
    game.plans[human] = { operation: "move", cell: 1 };
    expect(aiStep(game, ai).plans[ai]).toEqual({ operation: "extinguish", cell: 3 });
  });

  it.each([0, 1] as Seat[])("still lets AI seat %s supply a carrying partner whose exits require firefighting", (ai) => {
    const human = ai === 0 ? 1 : 0;
    const game = createEmberCrewState(1000, 42, DEFAULT_GAME_OPTIONS);
    game.walls = []; game.fire = Array(25).fill(0); game.forecast = [];
    for (const cell of [15, 21, 19, 23]) game.fire[cell] = 1;
    game.positions[ai] = 12; game.positions[human] = 11; game.carrying = [true, true];
    game.water[ai] = 2; game.water[human] = 0;
    game.plans[human] = { operation: "wait", cell: 11 };
    expect(aiStep(game, ai).plans[ai]).toEqual({ operation: "share", cell: 12 });
  });

  it.each(([0, 1] as Seat[]).flatMap((ai) => [0, 4].map((water) => [ai, water] as const)))("does not let AI seat %s with %s water take a resident the human is already moving to", (ai, water) => {
    const human = ai === 0 ? 1 : 0;
    let game = createEmberCrewState(1000, 2, DEFAULT_GAME_OPTIONS);
    game.round = ai === 0 ? 1 : 2; // AI resolves first in both scenarios.
    game.positions[ai] = 17;
    game.positions[human] = 11;
    game.water[ai] = water;
    game.civilians = [12, 2];
    game.fire = Array(25).fill(0);
    game.forecast = [];
    const planHuman = (cell: number) => {
      const result = applyGameAction(game, human, { kind: "ember_plan", round: game.round, operation: "move", cell }, 2000);
      if (!result.ok || result.state.kind !== "ember_crew") throw new Error("Human plan rejected");
      game = aiStep(result.state, ai);
    };
    planHuman(12);
    expect(game.plans[ai]).not.toEqual({ operation: "move", cell: 12 });
    expect(game.locked[ai]).toBe(false);
    planHuman(10); // Moving away releases the pickup for the AI.
    expect(game.plans[ai]).toEqual({ operation: "move", cell: 12 });
    planHuman(12);
    expect(game.plans[ai]).not.toEqual({ operation: "move", cell: 12 });
    const committed = applyGameAction(game, human, { kind: "ember_commit", round: game.round }, 2000);
    if (!committed.ok || committed.state.kind !== "ember_crew") throw new Error("Human confirmation rejected");
    game = aiStep(committed.state, ai);
    expect(game.phase).toBe("round_result");
    expect(game.carrying[human]).toBe(true);
    expect(game.carrying[ai]).toBe(false);
    expect(game.positions[human]).toBe(12);
  });
  it.each([0, 1] as Seat[])("keeps seat %s adaptable until the human confirms, then clears their route", (ai) => {
    const human = ai === 0 ? 1 : 0;
    let game = createEmberCrewState(1000, 42, DEFAULT_GAME_OPTIONS);
    game.positions[human] = 16;
    game.positions[ai] = 22;
    game.carrying[ai] = true;
    game.civilians = [1];
    game.fire = Array(25).fill(0);
    game.fire[17] = 1;
    game.forecast = [17];

    game = aiStep(game, ai);
    expect(game.plans[ai]).toEqual({ operation: "move", cell: 21 });
    expect(chooseAiAction(game, ai, DEFAULT_AI_OPTIONS, () => 0.5)).toBeNull();
    expect(game.locked).toEqual([false, false]);

    const humanPlan = (cell: number) => {
      const applied = applyGameAction(game, human, { kind: "ember_plan", round: game.round, operation: "move", cell }, 2000);
      if (!applied.ok || applied.state.kind !== "ember_crew") throw new Error("Human plan rejected");
      game = applied.state;
      game = aiStep(game, ai);
      expect(game.locked[ai]).toBe(false);
      expect(chooseAiAction(game, ai, DEFAULT_AI_OPTIONS, () => 0.5)).toBeNull();
    };
    humanPlan(17);
    expect(game.plans[ai]).toEqual({ operation: "extinguish", cell: 17 });
    humanPlan(21);
    expect(game.plans[ai]).toEqual({ operation: "move", cell: 21 });
    humanPlan(17);

    const committed = applyGameAction(game, human, { kind: "ember_commit", round: game.round }, 2000);
    if (!committed.ok || committed.state.kind !== "ember_crew") throw new Error("Human confirmation rejected");
    game = aiStep(committed.state, ai);
    expect(game.phase).toBe("round_result");
    expect(game.positions[human]).toBe(17);
    expect(game.positions[ai]).toBe(22);
    expect(game.fire[17]).toBe(0);
    expect(game.water[ai]).toBe(3);
  });

  it.each([0, 1] as Seat[])("lets carrying AI seat %s pass a pickup without blocking either rescue", (ai) => {
    const human = ai === 0 ? 1 : 0;
    let game = createEmberCrewState(1000, 2, DEFAULT_GAME_OPTIONS);
    game.round = ai === 0 ? 1 : 2;
    game.positions[ai] = 7;
    game.positions[human] = 11;
    game.carrying[ai] = true;
    game.civilians = [12];
    game.fire = Array(25).fill(0);
    game.forecast = [];
    const planned = applyGameAction(game, human, { kind: "ember_plan", round: game.round, operation: "move", cell: 12 }, 2000);
    if (!planned.ok || planned.state.kind !== "ember_crew") throw new Error("Human plan rejected");
    game = aiStep(planned.state, ai);
    expect(game.plans[ai]).toEqual({ operation: "move", cell: 12 });
    const committed = applyGameAction(game, human, { kind: "ember_commit", round: game.round }, 2000);
    if (!committed.ok || committed.state.kind !== "ember_crew") throw new Error("Human confirmation rejected");
    game = aiStep(committed.state, ai);
    expect(game.phase).toBe("round_result");
    expect(game.positions).toEqual([12, 12]);
    expect(game.carrying).toEqual([true, true]);
    expect(game.civilians).toEqual([]);
  });

  it.each([0, 1] as Seat[])("does not reserve a pickup for already-carrying partner of AI seat %s", (ai) => {
    const human = ai === 0 ? 1 : 0;
    let game = createEmberCrewState(1000, 2, DEFAULT_GAME_OPTIONS);
    game.positions[ai] = 17;
    game.positions[human] = 11;
    game.carrying[human] = true;
    game.civilians = [12];
    game.fire = Array(25).fill(0);
    game.forecast = [];
    const planned = applyGameAction(game, human, { kind: "ember_plan", round: game.round, operation: "move", cell: 12 }, 2000);
    if (!planned.ok || planned.state.kind !== "ember_crew") throw new Error("Human plan rejected");
    game = aiStep(planned.state, ai);
    expect(game.plans[ai]).toEqual({ operation: "move", cell: 12 });
    const committed = applyGameAction(game, human, { kind: "ember_commit", round: game.round }, 2000);
    if (!committed.ok || committed.state.kind !== "ember_crew") throw new Error("Human confirmation rejected");
    game = aiStep(committed.state, ai);
    expect(game.phase).toBe("round_result");
    expect(game.carrying).toEqual([true, true]);
    expect(game.civilians).toEqual([]);
  });

  it.each([0, 1] as Seat[])("lets dry AI seat %s collect a nearby resident before its safe return to refill", (ai) => {
    const human = ai === 0 ? 1 : 0;
    let game = createEmberCrewState(1000, 0, DEFAULT_GAME_OPTIONS);
    game.positions[ai] = 2;
    game.positions[human] = 24;
    game.water[ai] = 0;
    game.civilians = [1];
    game.fire = Array(25).fill(0);
    // The short left exit is burning. Pickup at B1 remains safe via C1 and
    // the right-hand exit; going directly to refill at E5 would leave B1 behind.
    for (const cell of [0, 5, 6]) game.fire[cell] = 1;
    game.forecast = [];
    const planned = applyGameAction(game, human, { kind: "ember_plan", round: game.round, operation: "wait", cell: 24 }, 2000);
    if (!planned.ok || planned.state.kind !== "ember_crew") throw new Error("Human plan rejected");
    game = aiStep(planned.state, ai);
    expect(game.plans[ai]).toEqual({ operation: "move", cell: 1 });
    const committed = applyGameAction(game, human, { kind: "ember_commit", round: game.round }, 2000);
    if (!committed.ok || committed.state.kind !== "ember_crew") throw new Error("Human confirmation rejected");
    game = aiStep(committed.state, ai);
    expect(game.phase).toBe("round_result");
    expect(game.carrying[ai]).toBe(true);
    expect(game.water[ai]).toBe(0);
  });

  it.each(["burning pickup", "no safe exit"] as const)("does not send a dry AI into a rescue with %s", (scenario) => {
    let game = createEmberCrewState(1000, 0, DEFAULT_GAME_OPTIONS);
    game.positions = [2, 24];
    game.water[0] = 0;
    game.civilians = [1];
    game.fire = Array(25).fill(0);
    for (const cell of [0, 5, 6, scenario === "burning pickup" ? 1 : 3]) game.fire[cell] = 1;
    game.forecast = [];
    game = aiStep(game, 0);
    expect(game.plans[0]).not.toEqual({ operation: "move", cell: 1 });
    expect(game.plans[0]).toEqual(scenario === "burning pickup"
      ? { operation: "move", cell: 3 }
      : { operation: "wait", cell: 2 });
  });
});

describe("Ember replay layouts", () => {
  it.each([4, 5])("puts both short staggered-layout rescues behind meaningful fire choices, reflection seed %s", (seed) => {
    const game = createEmberCrewState(0, seed, { ...DEFAULT_GAME_OPTIONS, length: "short" });
    // A resident beside the exit let one player finish in four turns and then
    // wait while both tanks stayed full. Both objectives now belong upstairs.
    expect(game.civilians.every((cell) => cell < 10)).toBe(true);
    for (const station of game.depots) {
      const safe = new Set([station]);
      for (const from of safe) {
        for (let to = 0; to < 25; to++) {
          if (emberDistance(from, to) === 1 && !game.walls.includes(to) && !game.fire[to]) safe.add(to);
        }
      }
      for (const resident of game.civilians) expect(safe.has(resident)).toBe(false);
      // There must be an actionable fire at the edge, not an inaccessible gate.
      expect(game.fire.some((level, cell) => level > 0 && [...safe].some((from) => emberDistance(from, cell) === 1))).toBe(true);
    }
  });
  it.each([0, 1])("makes the shared central rescue part of short missions in layout reflection %s", (seed) => {
    const short = createEmberCrewState(0, seed, { ...DEFAULT_GAME_OPTIONS, length: "short" });
    expect(short.civilians).toContain(12);
    // The central resident has one approach. Clearing this fire therefore helps
    // reach an actual objective instead of inviting a pointless side trip.
    const approaches = Array.from({ length: 25 }, (_, cell) => cell)
      .filter((cell) => emberDistance(cell, 12) === 1 && !short.walls.includes(cell));
    expect(approaches).toEqual([17]);
    expect(short.fire[17]).toBeGreaterThan(0);
    expect(createEmberCrewState(0, seed, DEFAULT_GAME_OPTIONS).civilians.slice().sort((a, b) => a - b)).toEqual([1, 3, 12]);
    expect(createEmberCrewState(0, seed, { ...DEFAULT_GAME_OPTIONS, length: "long" }).civilians.slice().sort((a, b) => a - b)).toEqual([1, 2, 3, 12]);
  });

  it("uses three distinct wall networks with deterministic rescue sites", () => {
    const networks = new Set([0, 2, 4].map((seed) => {
      const first = createEmberCrewState(1000, seed, DEFAULT_GAME_OPTIONS);
      expect(createEmberCrewState(1000, seed, DEFAULT_GAME_OPTIONS)).toEqual(first);
      return first.walls.join(",");
    }));
    expect(networks.size).toBe(3);
  });

  it.each(["short", "standard", "long"] as const)("keeps every %s rescue reachable from either station in every layout and reflection", (length) => {
    for (let seed = 0; seed < 6; seed++) {
      const game = createEmberCrewState(0, seed, { ...DEFAULT_GAME_OPTIONS, length });
      expect(new Set(game.civilians).size).toBe(game.target);
      for (const cell of [...game.civilians, ...game.depots, ...game.fire.flatMap((level, cell) => level ? [cell] : [])]) {
        expect(game.walls).not.toContain(cell);
      }
      for (const station of game.depots) {
        const visited = new Set([station]);
        const queue = [station];
        for (const from of queue) {
          for (let to = 0; to < 25; to++) {
            if (emberDistance(from, to) !== 1 || game.walls.includes(to) || visited.has(to)) continue;
            visited.add(to);
            queue.push(to);
          }
        }
        expect(visited.size).toBe(25 - game.walls.length);
        for (const resident of game.civilians) expect(visited.has(resident)).toBe(true);
      }
    }
  });
});
