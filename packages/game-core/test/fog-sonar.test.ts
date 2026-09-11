import { describe, expect, it } from "vitest";

import {
  advanceFogSonarClock,
  createFogSonarState,
  getFogSonarView,
  sendSonarPing,
  steerFogVessel,
  type FogSonarState,
  type GameOptions,
  type MazeDirection,
} from "../src/index";

const options: GameOptions = { pace: "standard", difficulty: "standard", length: "short" };

function unwrap(result: ReturnType<typeof steerFogVessel> | ReturnType<typeof sendSonarPing>): FogSonarState {
  if (!result.ok || result.state.kind !== "fog_sonar") throw new Error("expected fog sonar state");
  return result.state;
}

function pathToBeacon(state: FogSonarState): MazeDirection[] {
  const directions: MazeDirection[] = ["up", "right", "down", "left"];
  const offsets = [-state.gridSize, 1, state.gridSize, -1];
  const queue: { cell: number; path: MazeDirection[] }[] = [{ cell: state.ship, path: [] }];
  const visited = new Set([state.ship]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.cell === state.beacon) return current.path;
    const row = Math.floor(current.cell / state.gridSize);
    const col = current.cell % state.gridSize;
    directions.forEach((direction, index) => {
      if ((direction === "up" && row === 0) || (direction === "right" && col === state.gridSize - 1) ||
        (direction === "down" && row === state.gridSize - 1) || (direction === "left" && col === 0)) return;
      const next = current.cell + offsets[index]!;
      if (state.reefs.includes(next) || visited.has(next)) return;
      visited.add(next);
      queue.push({ cell: next, path: [...current.path, direction] });
    });
  }
  throw new Error("generated fog zone has no path");
}

describe("fog sonar", () => {
  it("maps options to a deterministic, solvable fog zone", () => {
    const state = createFogSonarState(1, 1_000, 42, options);
    expect([state.totalZones, state.gridSize, state.maxHull, state.maxPulseCharges, state.zoneDurationMs]).toEqual([2, 6, 3, 4, 50_000]);
    expect(state.reefs).toHaveLength(13);
    expect(state.reefs).not.toContain(state.ship);
    expect(state.reefs).not.toContain(state.beacon);
    expect(pathToBeacon(state).length).toBeGreaterThan(0);
    expect(createFogSonarState(1, 1_000, 42, options)).toEqual(state);
  });

  it("shows reefs only to the sonar seat until a zone resolves", () => {
    const state = createFogSonarState(0, 1_000, 7, options);
    expect(getFogSonarView(state, 0).reefs).toEqual(state.reefs);
    expect(getFogSonarView(state, 1).reefs).toBeNull();
    expect(getFogSonarView(state, null).reefs).toBeNull();
  });

  it("enforces roles and limited public direction pings", () => {
    let state = createFogSonarState(0, 1_000, 8, options);
    expect(sendSonarPing(state, 1, "up", 1_100)).toEqual({ ok: false, reason: "wrong_role" });
    expect(steerFogVessel(state, 0, "up", 1_100)).toEqual({ ok: false, reason: "wrong_role" });
    for (let index = 0; index < state.maxPulseCharges; index += 1) {
      state = unwrap(sendSonarPing(state, 0, "right", 1_100 + index));
    }
    expect([state.pulseCharges, state.lastPing]).toEqual([0, "right"]);
    expect(sendSonarPing(state, 0, "left", 1_200)).toEqual({ ok: false, reason: "no_pulses_left" });
  });

  it("moves through open water and damages the hull on a reef", () => {
    let state = createFogSonarState(0, 1_000, 11, options);
    const route = pathToBeacon(state);
    const first = route[0]!;
    state = unwrap(steerFogVessel(state, 1, first, 1_100));
    expect(state.lastMove?.outcome).toBe(state.ship === state.beacon ? "beacon_reached" : "sailed");

    const reef = state.reefs.find((cell) => {
      const delta = cell - state.ship;
      const sameRow = Math.floor(cell / state.gridSize) === Math.floor(state.ship / state.gridSize);
      return delta === -state.gridSize || delta === state.gridSize || (sameRow && Math.abs(delta) === 1);
    });
    if (reef !== undefined && state.phase === "navigating") {
      const delta = reef - state.ship;
      const direction: MazeDirection = delta === -state.gridSize ? "up" : delta === state.gridSize ? "down" : delta === 1 ? "right" : "left";
      const before = state.hull;
      state = unwrap(steerFogVessel(state, 1, direction, 1_200));
      expect([state.hull, state.lastMove?.outcome]).toEqual([before - 1, "reef_hit"]);
    }
  });

  it("rejects steering beyond the chart boundary", () => {
    let state = createFogSonarState(0, 1_000, 13, options);
    state = { ...state, ship: state.gridSize * (state.gridSize - 1) };
    expect(steerFogVessel(state, 1, "left", 1_100)).toEqual({ ok: false, reason: "invalid_position" });
    expect(steerFogVessel(state, 1, "down", 1_100)).toEqual({ ok: false, reason: "invalid_position" });
  });

  it("reveals the chart, then swaps roles for the next zone", () => {
    let state = createFogSonarState(0, 1_000, 17, options);
    for (const direction of pathToBeacon(state)) state = unwrap(steerFogVessel(state, 1, direction, 1_100));
    expect([state.phase, state.zonesCleared, state.lastMove?.outcome]).toEqual(["zone_result", 1, "beacon_reached"]);
    expect(getFogSonarView(state, 1).reefs).toEqual(state.reefs);
    state = advanceFogSonarClock(state, state.turnDeadline);
    expect([state.phase, state.zone, state.sonarSeat, state.pulseCharges]).toEqual(["navigating", 2, 1, 4]);
    expect(pathToBeacon(state).length).toBeGreaterThan(0);
  });

  it("fails on timeout or when repeated collisions consume the hull", () => {
    const timedOut = advanceFogSonarClock(createFogSonarState(0, 1_000, 21, options), 51_000);
    expect(timedOut.result).toEqual({ kind: "failure", score: 0, reason: "timeout" });

    let state = createFogSonarState(0, 1_000, 22, { ...options, difficulty: "hard" });
    const reef = state.reefs.find((cell) => {
      const delta = cell - state.ship;
      const sameRow = Math.floor(cell / state.gridSize) === Math.floor(state.ship / state.gridSize);
      return delta === -state.gridSize || (sameRow && Math.abs(delta) === 1);
    });
    if (reef === undefined) throw new Error("expected an adjacent reef in hard zone");
    const delta = reef - state.ship;
    const direction: MazeDirection = delta === -state.gridSize ? "up" : delta === 1 ? "right" : "left";
    state = unwrap(steerFogVessel(state, 1, direction, 1_100));
    state = unwrap(steerFogVessel(state, 1, direction, 1_200));
    expect(state.result).toEqual({ kind: "failure", score: 0, reason: "fog_lost" });
  });

  it("can navigate every zone and complete the mission", () => {
    let state = createFogSonarState(0, 1_000, 29, options);
    while (!state.result) {
      const helm = state.sonarSeat === 0 ? 1 : 0;
      for (const direction of pathToBeacon(state)) state = unwrap(steerFogVessel(state, helm, direction, state.turnDeadline - 100));
      if (!state.result) state = advanceFogSonarClock(state, state.turnDeadline);
    }
    expect(state.result.kind).toBe("success");
    expect(state.result.reason).toBe("fog_sonar_complete");
    expect(state.zonesCleared).toBe(2);
    expect(state.collisions).toBe(0);
  });
});
