import { describe, expect, it } from "vitest";

import {
  advanceMagnetHaulClock,
  createMagnetHaulState,
  moveMagnet,
  type GameOptions,
  type MagnetHaulState,
  type Seat,
} from "../src/index";

const options: GameOptions = { pace: "standard", difficulty: "standard", length: "short" };

function unwrap(result: ReturnType<typeof moveMagnet>): MagnetHaulState {
  if (!result.ok || result.state.kind !== "magnet_haul") throw new Error("expected magnet haul state");
  return result.state;
}

function routeToTarget(state: MagnetHaulState): { seat: Seat; direction: -1 | 1 }[] {
  const encode = (positions: [number, number]) => `${positions[0]},${positions[1]}`;
  const queue: { positions: [number, number]; route: { seat: Seat; direction: -1 | 1 }[] }[] = [{ positions: state.magnetPositions, route: [] }];
  const visited = new Set([encode(state.magnetPositions)]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.positions[0] === state.targetPositions[0] && current.positions[1] === state.targetPositions[1]) return current.route;
    for (const seat of [0, 1] as const) {
      for (const direction of [-1, 1] as const) {
        const positions = [...current.positions] as [number, number];
        positions[seat] += direction;
        if (positions[seat] < 0 || positions[seat] >= state.laneCount || Math.abs(positions[0] - positions[1]) > state.tensionLimit) continue;
        const key = encode(positions);
        if (visited.has(key)) continue;
        visited.add(key);
        queue.push({ positions, route: [...current.route, { seat, direction }] });
      }
    }
  }
  throw new Error("target pair is unreachable within tension limit");
}

function completeCheckpoint(state: MagnetHaulState, now: number): MagnetHaulState {
  for (const step of routeToTarget(state)) state = unwrap(moveMagnet(state, step.seat, step.direction, now));
  return state;
}

describe("magnet haul", () => {
  it("maps options and creates a deterministic reachable checkpoint", () => {
    const state = createMagnetHaulState(1_000, 42, options);
    expect([state.totalCheckpoints, state.laneCount, state.tensionLimit, state.checkpointDurationMs]).toEqual([4, 7, 2, 14_000]);
    expect(Math.abs(state.targetPositions[0] - state.targetPositions[1])).toBeLessThanOrEqual(2);
    expect(routeToTarget(state).length).toBeGreaterThanOrEqual(2);
    expect(state.maxBattery).toBeGreaterThan(routeToTarget(state).length);
    expect(createMagnetHaulState(1_000, 42, options)).toEqual(state);
  });

  it("maps all difficulty and length settings", () => {
    const easy = createMagnetHaulState(0, 1, { pace: "relaxed", difficulty: "easy", length: "long" });
    const hard = createMagnetHaulState(0, 1, { pace: "blitz", difficulty: "hard", length: "standard" });
    expect([easy.laneCount, easy.tensionLimit, easy.totalCheckpoints, easy.checkpointDurationMs]).toEqual([5, 3, 8, 20_000]);
    expect([hard.laneCount, hard.tensionLimit, hard.totalCheckpoints, hard.checkpointDurationMs]).toEqual([9, 1, 6, 10_000]);
  });

  it("moves only the actor's magnet and consumes shared battery", () => {
    const state = createMagnetHaulState(1_000, 7, options);
    const direction: -1 | 1 = state.magnetPositions[0] === 0 ? 1 : -1;
    const moved = unwrap(moveMagnet(state, 0, direction, 1_100));
    expect(moved.magnetPositions[0]).toBe(state.magnetPositions[0] + direction);
    expect(moved.magnetPositions[1]).toBe(state.magnetPositions[1]);
    expect([moved.battery, moved.moves, moved.lastActorSeat]).toEqual([state.battery - 1, 1, 0]);
  });

  it("rejects boundary and unsafe tension moves", () => {
    const base = createMagnetHaulState(1_000, 8, options);
    const boundary = { ...base, magnetPositions: [0, 0] as [number, number] };
    expect(moveMagnet(boundary, 0, -1, 1_100)).toEqual({ ok: false, reason: "invalid_position" });
    const taut = { ...base, magnetPositions: [1, 3] as [number, number] };
    expect(moveMagnet(taut, 1, 1, 1_100)).toEqual({ ok: false, reason: "tension_limit" });
    expect(moveMagnet({ ...base, phase: "checkpoint_result" }, 0, 1, 1_100)).toEqual({ ok: false, reason: "wrong_phase" });
  });

  it("clears a checkpoint and starts the next target after reveal", () => {
    let state = createMagnetHaulState(1_000, 11, options);
    state = completeCheckpoint(state, 2_000);
    expect([state.phase, state.completedCheckpoints, state.lastOutcome]).toEqual(["checkpoint_result", 1, "aligned"]);
    const positions = state.magnetPositions;
    state = advanceMagnetHaulClock(state, state.turnDeadline);
    expect([state.phase, state.checkpoint]).toEqual(["moving", 2]);
    expect(state.magnetPositions).toEqual(positions);
    expect(state.targetPositions).not.toEqual(positions);
  });

  it("fails on timeout or battery depletion", () => {
    const state = createMagnetHaulState(1_000, 13, options);
    const expired = advanceMagnetHaulClock(state, state.turnDeadline);
    expect([expired.lastOutcome, expired.result?.reason]).toEqual(["haul_timeout", "timeout"]);

    const first = routeToTarget(state)[0]!;
    let depleted = { ...state, battery: 1, targetPositions: [0, 0] as [number, number] };
    depleted = unwrap(moveMagnet(depleted, first.seat, first.direction, 1_100));
    expect([depleted.lastOutcome, depleted.result?.reason]).toEqual(["battery_depleted", "magnet_lost"]);
  });

  it("can coordinate every checkpoint and complete the haul", () => {
    let state = createMagnetHaulState(1_000, 29, options);
    while (!state.result) {
      state = completeCheckpoint(state, state.turnDeadline - 1_000);
      if (!state.result) state = advanceMagnetHaulClock(state, state.turnDeadline);
    }
    expect(state.result.kind).toBe("success");
    expect(state.result.reason).toBe("magnet_haul_complete");
    expect(state.completedCheckpoints).toBe(4);
    expect(state.battery).toBeGreaterThan(0);
  });
});
