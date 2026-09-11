import type {
  FogSonarState,
  FogSonarViewState,
  GameActionResult,
  GameOptions,
  MazeDirection,
  Seat,
} from "./types";

const ZONE_REVEAL_MS = 1_600;

type FogConfig = Pick<
  FogSonarState,
  "totalZones" | "gridSize" | "maxHull" | "maxPulseCharges" | "zoneDurationMs"
> & { reefCount: number };

function fogConfig(options: GameOptions): FogConfig {
  const difficulty = {
    easy: { gridSize: 5 as const, maxHull: 4 as const, maxPulseCharges: 5 as const, reefCount: 6 },
    standard: { gridSize: 6 as const, maxHull: 3 as const, maxPulseCharges: 4 as const, reefCount: 13 },
    hard: { gridSize: 7 as const, maxHull: 2 as const, maxPulseCharges: 3 as const, reefCount: 22 },
  }[options.difficulty];
  return {
    ...difficulty,
    totalZones: { short: 2 as const, standard: 3 as const, long: 4 as const }[options.length],
    zoneDurationMs: { relaxed: 70_000, standard: 50_000, blitz: 35_000 }[options.pace],
  };
}

function mixedValue(seed: number, index: number): number {
  let value = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}

function createZoneLayout(seed: number, zone: number, size: number, reefCount: number) {
  const zoneSeed = mixedValue(seed, zone * 97);
  let column = mixedValue(zoneSeed, 0) % size;
  const ship = (size - 1) * size + column;
  const safe = new Set<number>([ship]);

  for (let row = size - 1; row > 0; row -= 1) {
    const choice = mixedValue(zoneSeed, size - row) % 3;
    const shift = choice === 0 ? -1 : choice === 2 ? 1 : 0;
    const nextColumn = Math.max(0, Math.min(size - 1, column + shift));
    if (nextColumn !== column) safe.add(row * size + nextColumn);
    column = nextColumn;
    safe.add((row - 1) * size + column);
  }

  const beacon = column;
  const candidates = Array.from({ length: size * size }, (_, index) => index)
    .filter((index) => !safe.has(index))
    .sort((a, b) => mixedValue(zoneSeed, a + 131) - mixedValue(zoneSeed, b + 131));

  return { ship, beacon, reefs: candidates.slice(0, Math.min(reefCount, candidates.length)).sort((a, b) => a - b) };
}

function nextCell(position: number, direction: MazeDirection, size: number): number | null {
  const row = Math.floor(position / size);
  const col = position % size;
  if (direction === "up") return row === 0 ? null : position - size;
  if (direction === "right") return col === size - 1 ? null : position + 1;
  if (direction === "down") return row === size - 1 ? null : position + size;
  return col === 0 ? null : position - 1;
}

export function createFogSonarState(
  startingSeat: Seat,
  now: number,
  seed: number,
  options: GameOptions,
): FogSonarState {
  const config = fogConfig(options);
  const layout = createZoneLayout(seed, 1, config.gridSize, config.reefCount);
  return {
    kind: "fog_sonar",
    rulesVersion: 1,
    seed,
    zone: 1,
    totalZones: config.totalZones,
    phase: "navigating",
    sonarSeat: startingSeat,
    gridSize: config.gridSize,
    reefs: layout.reefs,
    ship: layout.ship,
    beacon: layout.beacon,
    pulseCharges: config.maxPulseCharges,
    maxPulseCharges: config.maxPulseCharges,
    hull: config.maxHull,
    maxHull: config.maxHull,
    moves: 0,
    collisions: 0,
    zonesCleared: 0,
    score: 0,
    lastPing: null,
    lastMove: null,
    zoneDurationMs: config.zoneDurationMs,
    turnDeadline: now + config.zoneDurationMs,
    result: null,
  };
}

export function sendSonarPing(
  state: FogSonarState,
  actor: Seat,
  direction: MazeDirection,
  now: number,
): GameActionResult {
  if (state.result) return { ok: false, reason: "game_finished" };
  if (state.phase !== "navigating") return { ok: false, reason: "wrong_phase" };
  if (now >= state.turnDeadline) return { ok: false, reason: "turn_expired" };
  if (actor !== state.sonarSeat) return { ok: false, reason: "wrong_role" };
  if (state.pulseCharges <= 0) return { ok: false, reason: "no_pulses_left" };
  return {
    ok: true,
    state: { ...state, pulseCharges: state.pulseCharges - 1, lastPing: direction },
  };
}

export function steerFogVessel(
  state: FogSonarState,
  actor: Seat,
  direction: MazeDirection,
  now: number,
): GameActionResult {
  if (state.result) return { ok: false, reason: "game_finished" };
  if (state.phase !== "navigating") return { ok: false, reason: "wrong_phase" };
  if (now >= state.turnDeadline) return { ok: false, reason: "turn_expired" };
  if (actor === state.sonarSeat) return { ok: false, reason: "wrong_role" };
  const destination = nextCell(state.ship, direction, state.gridSize);
  if (destination === null) return { ok: false, reason: "invalid_position" };

  const moves = state.moves + 1;
  if (state.reefs.includes(destination)) {
    const hull = state.hull - 1;
    return {
      ok: true,
      state: {
        ...state,
        hull,
        moves,
        collisions: state.collisions + 1,
        lastMove: { direction, from: state.ship, to: destination, outcome: "reef_hit" },
        result: hull <= 0 ? { kind: "failure", score: state.score, reason: "fog_lost" } : null,
      },
    };
  }

  if (destination === state.beacon) {
    const zonesCleared = state.zonesCleared + 1;
    const score = state.score + 300 + state.hull * 40 + state.pulseCharges * 15;
    const result = state.zone >= state.totalZones
      ? { kind: "success" as const, score, reason: "fog_sonar_complete" as const }
      : null;
    return {
      ok: true,
      state: {
        ...state,
        phase: "zone_result",
        ship: destination,
        moves,
        zonesCleared,
        score,
        lastMove: { direction, from: state.ship, to: destination, outcome: "beacon_reached" },
        turnDeadline: now + ZONE_REVEAL_MS,
        result,
      },
    };
  }

  return {
    ok: true,
    state: {
      ...state,
      ship: destination,
      moves,
      score: state.score + 5,
      lastMove: { direction, from: state.ship, to: destination, outcome: "sailed" },
    },
  };
}

export function advanceFogSonarClock(state: FogSonarState, now: number): FogSonarState {
  if (state.result || now < state.turnDeadline) return state;
  if (state.phase === "navigating") {
    return { ...state, result: { kind: "failure", score: state.score, reason: "timeout" } };
  }
  const zone = state.zone + 1;
  const reefCount = state.gridSize === 5 ? 6 : state.gridSize === 6 ? 13 : 22;
  const layout = createZoneLayout(state.seed, zone, state.gridSize, reefCount);
  return {
    ...state,
    zone,
    phase: "navigating",
    sonarSeat: state.sonarSeat === 0 ? 1 : 0,
    reefs: layout.reefs,
    ship: layout.ship,
    beacon: layout.beacon,
    pulseCharges: state.maxPulseCharges,
    lastPing: null,
    lastMove: null,
    turnDeadline: now + state.zoneDurationMs,
  };
}

export function getFogSonarView(state: FogSonarState, viewerSeat: Seat | null): FogSonarViewState {
  if (state.phase === "zone_result" || state.result || viewerSeat === state.sonarSeat) return state;
  return { ...state, reefs: null };
}
