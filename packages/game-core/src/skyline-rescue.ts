import {
  otherSeat,
  type GameActionResult,
  type GameOptions,
  type RescuePressure,
  type RescueZone,
  type Seat,
  type SkylineRescueOutcome,
  type SkylineRescueState,
  type SkylineRescueViewState,
} from "./types";

const RESULT_REVEAL_MS = 1_800;

function rescueConfig(options: GameOptions): Pick<
  SkylineRescueState,
  "totalWaves" | "maxIntegrity" | "maxWater" | "waveDurationMs"
> {
  const difficulty = {
    easy: { maxIntegrity: 5 as const, maxWater: 18 as const },
    standard: { maxIntegrity: 4 as const, maxWater: 15 as const },
    hard: { maxIntegrity: 3 as const, maxWater: 12 as const },
  }[options.difficulty];
  return {
    ...difficulty,
    totalWaves: { short: 4 as const, standard: 6 as const, long: 8 as const }[options.length],
    waveDurationMs: { relaxed: 45_000, standard: 30_000, blitz: 20_000 }[options.pace],
  };
}

function rescueIntel(seed: number, wave: number): {
  priorityZone: RescueZone;
  requiredPressure: RescuePressure;
} {
  let mixed = (seed ^ Math.imul(wave, 0x45d9f3b)) >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x45d9f3b) >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x45d9f3b) >>> 0;
  mixed = (mixed ^ (mixed >>> 16)) >>> 0;
  return {
    priorityZone: (mixed % 3) as RescueZone,
    requiredPressure: (1 + ((mixed >>> 8) % 3)) as RescuePressure,
  };
}

export function createSkylineRescueState(
  pumpSeat: Seat,
  now: number,
  seed: number,
  options: GameOptions,
): SkylineRescueState {
  const config = rescueConfig(options);
  return {
    kind: "skyline_rescue",
    rulesVersion: 1,
    seed,
    wave: 1,
    totalWaves: config.totalWaves,
    phase: "planning",
    pumpSeat,
    ...rescueIntel(seed, 1),
    aimChoice: null,
    pressureChoice: null,
    locked: [false, false],
    integrity: config.maxIntegrity,
    maxIntegrity: config.maxIntegrity,
    water: config.maxWater,
    maxWater: config.maxWater,
    containedWaves: 0,
    mistakes: 0,
    totalWaterUsed: 0,
    waveDurationMs: config.waveDurationMs,
    waveOutcome: null,
    turnDeadline: now + config.waveDurationMs,
    result: null,
  };
}

function resolveWave(state: SkylineRescueState, now: number): SkylineRescueState {
  const missingChoice = state.aimChoice === null || state.pressureChoice === null;
  const zoneCorrect = state.aimChoice === state.priorityZone;
  const pressureCorrect = state.pressureChoice === state.requiredPressure;
  const contained = !missingChoice && zoneCorrect && pressureCorrect;
  const waveOutcome: SkylineRescueOutcome = missingChoice
    ? "dispatch_timeout"
    : !zoneCorrect ? "wrong_zone" : pressureCorrect ? "contained" : "pressure_mismatch";
  const waterUsed = state.pressureChoice ?? 0;
  const water = state.water - waterUsed;
  const integrity = state.integrity - (contained ? 0 : 1);
  const containedWaves = state.containedWaves + (contained ? 1 : 0);
  const mistakes = state.mistakes + (contained ? 0 : 1);
  const totalWaterUsed = state.totalWaterUsed + waterUsed;
  const baseScore = containedWaves * 250 + integrity * 100 + water * 30 - mistakes * 40;
  const isLastWave = state.wave >= state.totalWaves;
  return {
    ...state,
    phase: "wave_result",
    water,
    integrity,
    containedWaves,
    mistakes,
    totalWaterUsed,
    waveOutcome,
    turnDeadline: now + RESULT_REVEAL_MS,
    result: integrity <= 0
      ? { kind: "failure", score: Math.max(0, baseScore), reason: "tower_lost" }
      : isLastWave
        ? { kind: "success", score: Math.max(100, baseScore), reason: "skyline_rescue_complete" }
        : water <= 0
          ? { kind: "failure", score: Math.max(0, baseScore), reason: "water_depleted" }
          : null,
  };
}

function chooseRescueControl(
  state: SkylineRescueState,
  actor: Seat,
  now: number,
  choice: { kind: "aim"; zone: RescueZone } | { kind: "pressure"; pressure: RescuePressure },
): GameActionResult {
  if (state.result) return { ok: false, reason: "game_finished" };
  if (now >= state.turnDeadline) return { ok: false, reason: "turn_expired" };
  if (state.phase !== "planning") return { ok: false, reason: "wrong_phase" };
  const isPump = actor === state.pumpSeat;
  if ((choice.kind === "pressure") !== isPump) return { ok: false, reason: "wrong_role" };
  if (state.locked[actor]) return { ok: false, reason: "already_chosen" };

  const locked: [boolean, boolean] = [...state.locked];
  locked[actor] = true;
  const next = {
    ...state,
    locked,
    aimChoice: choice.kind === "aim" ? choice.zone : state.aimChoice,
    pressureChoice: choice.kind === "pressure" ? choice.pressure : state.pressureChoice,
  };
  return { ok: true, state: locked[0] && locked[1] ? resolveWave(next, now) : next };
}

export function chooseRescueAim(
  state: SkylineRescueState,
  actor: Seat,
  zone: RescueZone,
  now: number,
): GameActionResult {
  if (!Number.isInteger(zone) || zone < 0 || zone > 2) return { ok: false, reason: "invalid_lane" };
  return chooseRescueControl(state, actor, now, { kind: "aim", zone });
}

export function chooseRescuePressure(
  state: SkylineRescueState,
  actor: Seat,
  pressure: RescuePressure,
  now: number,
): GameActionResult {
  if (!Number.isInteger(pressure) || pressure < 1 || pressure > 3) return { ok: false, reason: "invalid_pressure" };
  if (pressure > state.water) return { ok: false, reason: "insufficient_water" };
  return chooseRescueControl(state, actor, now, { kind: "pressure", pressure });
}

export function advanceSkylineRescueClock(
  state: SkylineRescueState,
  now: number,
): SkylineRescueState {
  if (state.result || now < state.turnDeadline) return state;
  if (state.phase === "planning") return resolveWave(state, now);
  const wave = state.wave + 1;
  return {
    ...state,
    wave,
    phase: "planning",
    pumpSeat: otherSeat(state.pumpSeat),
    ...rescueIntel(state.seed, wave),
    aimChoice: null,
    pressureChoice: null,
    locked: [false, false],
    waveOutcome: null,
    turnDeadline: now + state.waveDurationMs,
  };
}

export function getSkylineRescueView(
  state: SkylineRescueState,
  viewerSeat: Seat | null,
): SkylineRescueViewState {
  const reveal = state.phase === "wave_result" || Boolean(state.result);
  const pump = viewerSeat !== null && viewerSeat === state.pumpSeat;
  const guide = viewerSeat !== null && viewerSeat !== state.pumpSeat;
  return {
    ...state,
    priorityZone: reveal || guide ? state.priorityZone : null,
    requiredPressure: reveal || pump ? state.requiredPressure : null,
    aimChoice: reveal || guide ? state.aimChoice : null,
    pressureChoice: reveal || pump ? state.pressureChoice : null,
  };
}
