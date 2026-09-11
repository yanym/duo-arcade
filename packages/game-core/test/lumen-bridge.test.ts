import { describe, expect, it } from "vitest";

import {
  adjustLumenBridge,
  advanceLumenBridgeClock,
  beamEndLane,
  createLumenBridgeState,
  lockLumenBridge,
  otherSeat,
  shiftGameClock,
  type GameOptions,
  type LumenBridgeState,
  type Seat,
} from "../src/index";

const options: GameOptions = { pace: "standard", difficulty: "standard", length: "short" };

function unwrap(
  result: ReturnType<typeof adjustLumenBridge> | ReturnType<typeof lockLumenBridge>,
): LumenBridgeState {
  if (!result.ok || result.state.kind !== "lumen_bridge") throw new Error("expected lumen bridge state");
  return result.state;
}

type Step = { seat: Seat; direction: -1 | 1 };

function routeToTarget(state: LumenBridgeState): Step[] {
  const key = (originLane: number, arcOffset: number) => `${originLane},${arcOffset}`;
  const queue: { originLane: number; arcOffset: number; route: Step[] }[] = [
    { originLane: state.originLane, arcOffset: state.arcOffset, route: [] },
  ];
  const visited = new Set([key(state.originLane, state.arcOffset)]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.originLane + current.arcOffset === state.targetLane) return current.route;
    for (const control of ["origin", "arc"] as const) {
      for (const direction of [-1, 1] as const) {
        const originLane = current.originLane + (control === "origin" ? direction : 0);
        const arcOffset = current.arcOffset + (control === "arc" ? direction : 0);
        if (
          originLane < 0 || originLane >= state.laneCount ||
          Math.abs(arcOffset) > state.maxArc ||
          originLane + arcOffset < 0 || originLane + arcOffset >= state.laneCount
        ) continue;
        const encoded = key(originLane, arcOffset);
        if (visited.has(encoded)) continue;
        visited.add(encoded);
        queue.push({
          originLane,
          arcOffset,
          route: [...current.route, { seat: control === "origin" ? state.originSeat : otherSeat(state.originSeat), direction }],
        });
      }
    }
  }
  throw new Error("light target is unreachable");
}

function align(state: LumenBridgeState, now: number): LumenBridgeState {
  for (const step of routeToTarget(state)) state = unwrap(adjustLumenBridge(state, step.seat, step.direction, now));
  return state;
}

describe("lumen bridge", () => {
  it("maps all option axes and creates deterministic reachable targets", () => {
    const first = createLumenBridgeState(0, 1_000, 42, options);
    expect(createLumenBridgeState(0, 1_000, 42, options)).toEqual(first);
    expect([first.totalStages, first.laneCount, first.maxArc, first.maxStability, first.stageDurationMs, first.resonanceWindowMs])
      .toEqual([4, 7, 2, 3, 18_000, 1_100]);
    expect(routeToTarget(first).length).toBeGreaterThan(0);

    const easy = createLumenBridgeState(1, 0, 7, { pace: "relaxed", difficulty: "easy", length: "long" });
    const hard = createLumenBridgeState(1, 0, 7, { pace: "blitz", difficulty: "hard", length: "standard" });
    expect([easy.totalStages, easy.laneCount, easy.maxArc, easy.maxStability, easy.stageDurationMs, easy.resonanceWindowMs])
      .toEqual([8, 5, 1, 4, 24_000, 1_600]);
    expect([hard.totalStages, hard.laneCount, hard.maxArc, hard.maxStability, hard.stageDurationMs, hard.resonanceWindowMs])
      .toEqual([6, 9, 3, 2, 14_000, 800]);
  });

  it("gives the two roles different controls and consumes shared energy", () => {
    let state = createLumenBridgeState(1, 1_000, 9, options);
    state = { ...state, targetLane: 0 };
    const originMoved = unwrap(adjustLumenBridge(state, state.originSeat, -1, 1_100));
    expect([originMoved.originLane, originMoved.arcOffset, originMoved.energy])
      .toEqual([state.originLane - 1, state.arcOffset, state.energy - 1]);
    const arcMoved = unwrap(adjustLumenBridge(originMoved, otherSeat(state.originSeat), 1, 1_200));
    expect([arcMoved.originLane, arcMoved.arcOffset, arcMoved.totalAdjustments])
      .toEqual([originMoved.originLane, 1, 2]);
  });

  it("rejects origin, arc and projected endpoint boundaries", () => {
    const base = createLumenBridgeState(0, 1_000, 11, options);
    expect(adjustLumenBridge({ ...base, originLane: 0, arcOffset: 0 }, base.originSeat, -1, 1_100))
      .toEqual({ ok: false, reason: "invalid_position" });
    expect(adjustLumenBridge({ ...base, arcOffset: base.maxArc }, otherSeat(base.originSeat), 1, 1_100))
      .toEqual({ ok: false, reason: "invalid_position" });
    expect(adjustLumenBridge({ ...base, originLane: 0, arcOffset: 0 }, otherSeat(base.originSeat), -1, 1_100))
      .toEqual({ ok: false, reason: "invalid_position" });
    expect(lockLumenBridge(base, 0, 1_100)).toEqual({ ok: false, reason: "wrong_phase" });
  });

  it("opens a server resonance window and requires both unique locks", () => {
    let state = align(createLumenBridgeState(0, 1_000, 17, options), 2_000);
    expect([state.phase, beamEndLane(state), state.targetLane]).toEqual(["resonance", state.targetLane, state.targetLane]);
    expect(state.turnDeadline - state.resonanceStartedAt).toBe(state.resonanceWindowMs);
    state = unwrap(lockLumenBridge(state, 0, state.resonanceStartedAt + 100));
    expect(state.confirmations).toEqual([true, false]);
    expect(lockLumenBridge(state, 0, state.resonanceStartedAt + 200)).toEqual({ ok: false, reason: "already_chosen" });
    state = unwrap(lockLumenBridge(state, 1, state.resonanceStartedAt + 300));
    expect([state.phase, state.completedStages, state.lastOutcome]).toEqual(["stage_result", 1, "resonated"]);
    const previousRole = state.originSeat;
    state = advanceLumenBridgeClock(state, state.turnDeadline);
    expect([state.phase, state.stage, state.originSeat]).toEqual(["aligning", 2, otherSeat(previousRole)]);
    expect(state.targetLane).not.toBe(beamEndLane(state));
  });

  it("loses stability after a missed sync window and shifts both clocks on reconnect", () => {
    let state = align(createLumenBridgeState(0, 1_000, 23, options), 2_000);
    const beforeStageDeadline = state.stageDeadline;
    state = shiftGameClock(state, state.turnDeadline + 5_000);
    expect(state.stageDeadline).toBe(beforeStageDeadline + 5_000);
    expect(state.resonanceDeadline).toBe(state.turnDeadline);
    state = advanceLumenBridgeClock(state, state.turnDeadline);
    expect([state.phase, state.stability, state.lastOutcome]).toEqual(["aligning", 2, "desynced"]);
  });

  it("fails on stage timeout, depleted energy, or exhausted stability", () => {
    const base = createLumenBridgeState(0, 1_000, 29, options);
    const timeout = advanceLumenBridgeClock(base, base.turnDeadline);
    expect([timeout.lastOutcome, timeout.result?.reason]).toEqual(["bridge_timeout", "timeout"]);

    const first = routeToTarget(base)[0]!;
    const depleted = unwrap(adjustLumenBridge({ ...base, energy: 1 }, first.seat, first.direction, 1_100));
    expect([depleted.lastOutcome, depleted.result?.reason]).toEqual(["energy_depleted", "bridge_lost"]);

    let unstable = align({ ...base, stability: 1 }, 1_200);
    unstable = advanceLumenBridgeClock(unstable, unstable.turnDeadline);
    expect([unstable.stability, unstable.result?.reason]).toEqual([0, "bridge_lost"]);
  });

  it("can align, synchronize and complete every stage", () => {
    let state = createLumenBridgeState(0, 1_000, 37, options);
    while (!state.result) {
      state = align(state, state.stageDeadline - 2_000);
      state = unwrap(lockLumenBridge(state, 0, state.resonanceStartedAt + 100));
      state = unwrap(lockLumenBridge(state, 1, state.resonanceStartedAt + 200));
      if (!state.result) state = advanceLumenBridgeClock(state, state.turnDeadline);
    }
    expect([state.result.kind, state.result.reason, state.completedStages]).toEqual(["success", "lumen_bridge_complete", 4]);
    expect(state.energy).toBeGreaterThan(0);
    expect(state.score).toBeGreaterThan(800);
  });
});
