import { roundsForLength } from "./options";
import {
  otherSeat,
  type EscortLane,
  type GameActionResult,
  type GameOptions,
  type Seat,
  type StarwayEscortState,
  type StarwayEscortViewState,
} from "./types";

const RESULT_REVEAL_MS = 3_200;

function laneIntel(seed: number, sector: number): { obstacleLane: EscortLane; energyLane: EscortLane } {
  let mixed = (seed ^ Math.imul(sector, 0x45d9f3b)) >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x45d9f3b);
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x45d9f3b);
  mixed = (mixed ^ (mixed >>> 16)) >>> 0;
  const obstacleLane = (mixed % 3) as EscortLane;
  const energyLane = ((obstacleLane + 1 + ((mixed >>> 8) % 2)) % 3) as EscortLane;
  return { obstacleLane, energyLane };
}

export function createStarwayEscortState(
  pilotSeat: Seat,
  now: number,
  seed: number,
  options: GameOptions,
): StarwayEscortState {
  const totalSectors = roundsForLength(options.length);
  const maxHull = { easy: 4 as const, standard: 3 as const, hard: 2 as const }[options.difficulty];
  const sectorDurationMs = { relaxed: 45_000, standard: 30_000, blitz: 18_000 }[options.pace];
  return {
    kind: "starway_escort",
    rulesVersion: 1,
    seed,
    sector: 1,
    totalSectors,
    phase: "planning",
    pilotSeat,
    ...laneIntel(seed, 1),
    routeChoice: null,
    shieldChoice: null,
    locked: [false, false],
    hull: maxHull,
    maxHull,
    cargo: 0,
    sectorOutcome: null,
    sectorDurationMs,
    turnDeadline: now + sectorDurationMs,
    result: null,
  };
}

function validLane(lane: number): lane is EscortLane {
  return Number.isInteger(lane) && lane >= 0 && lane <= 2;
}

function resolveSector(state: StarwayEscortState, now: number): StarwayEscortState {
  const hitObstacle = state.routeChoice === state.obstacleLane;
  const protectedRoute = state.shieldChoice === state.routeChoice;
  const collectedEnergy = state.routeChoice === state.energyLane;
  const hull = hitObstacle && !protectedRoute ? state.hull - 1 : state.hull;
  const cargo = state.cargo + (collectedEnergy ? 2 : hitObstacle && protectedRoute ? 1 : 0);
  const sectorOutcome = hitObstacle
    ? protectedRoute ? "shield_block" : "hull_hit"
    : collectedEnergy ? "energy_collected" : "safe_passage";
  const isLastSector = state.sector >= state.totalSectors;
  return {
    ...state,
    phase: "sector_result",
    hull,
    cargo,
    sectorOutcome,
    turnDeadline: now + RESULT_REVEAL_MS,
    result: hull <= 0
      ? { kind: "failure", score: cargo * 150, reason: "hull_lost" }
      : isLastSector
        ? { kind: "success", score: cargo * 150 + hull * 100, reason: "escort_complete" }
        : null,
  };
}

function chooseEscortLane(
  state: StarwayEscortState,
  actor: Seat,
  lane: EscortLane,
  now: number,
  role: "pilot" | "shield",
): GameActionResult {
  if (state.result) return { ok: false, reason: "game_finished" };
  if (now >= state.turnDeadline) return { ok: false, reason: "turn_expired" };
  if (state.phase !== "planning") return { ok: false, reason: "wrong_phase" };
  if (!validLane(lane)) return { ok: false, reason: "invalid_lane" };
  if ((role === "pilot") !== (actor === state.pilotSeat)) return { ok: false, reason: "wrong_role" };
  if (state.locked[actor]) return { ok: false, reason: "already_chosen" };

  const locked: [boolean, boolean] = [...state.locked];
  locked[actor] = true;
  const next = {
    ...state,
    locked,
    routeChoice: role === "pilot" ? lane : state.routeChoice,
    shieldChoice: role === "shield" ? lane : state.shieldChoice,
  };
  return { ok: true, state: locked[0] && locked[1] ? resolveSector(next, now) : next };
}

export function chooseEscortRoute(
  state: StarwayEscortState,
  actor: Seat,
  lane: EscortLane,
  now: number,
): GameActionResult {
  return chooseEscortLane(state, actor, lane, now, "pilot");
}

export function chooseEscortShield(
  state: StarwayEscortState,
  actor: Seat,
  lane: EscortLane,
  now: number,
): GameActionResult {
  return chooseEscortLane(state, actor, lane, now, "shield");
}

export function advanceStarwayEscortClock(state: StarwayEscortState, now: number): StarwayEscortState {
  if (state.result || now < state.turnDeadline) return state;
  if (state.phase === "planning") {
    return {
      ...state,
      result: { kind: "failure", score: state.cargo * 150, reason: "timeout" },
    };
  }
  const sector = state.sector + 1;
  return {
    ...state,
    sector,
    phase: "planning",
    pilotSeat: otherSeat(state.pilotSeat),
    ...laneIntel(state.seed, sector),
    routeChoice: null,
    shieldChoice: null,
    locked: [false, false],
    sectorOutcome: null,
    turnDeadline: now + state.sectorDurationMs,
  };
}

export function getStarwayEscortView(
  state: StarwayEscortState,
  viewerSeat: Seat | null,
): StarwayEscortViewState {
  const reveal = state.phase === "sector_result" || state.result !== null;
  const pilot = viewerSeat !== null && viewerSeat === state.pilotSeat;
  const shield = viewerSeat !== null && viewerSeat !== state.pilotSeat;
  return {
    ...state,
    energyLane: reveal || pilot ? state.energyLane : null,
    obstacleLane: reveal || shield ? state.obstacleLane : null,
    routeChoice: reveal || pilot ? state.routeChoice : null,
    shieldChoice: reveal || shield ? state.shieldChoice : null,
  };
}
