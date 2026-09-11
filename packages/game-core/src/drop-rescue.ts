import {
  otherSeat,
  type DropBrakePower,
  type DropRescueOutcome,
  type DropRescueState,
  type DropRescueViewState,
  type GameActionResult,
  type GameOptions,
  type Seat,
} from "./types";

const RESULT_REVEAL_MS = 1_800;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function mixedValue(seed: number, landing: number, salt: number): number {
  let value = (seed ^ Math.imul(landing + salt, 0x9e3779b1)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}

function rescueConfig(options: GameOptions): Pick<
  DropRescueState,
  "totalLandings" | "laneCount" | "maxHull" | "maxPropellant" | "descentDurationMs"
> & { windLimit: 1 | 2 } {
  const totalLandings = { short: 4 as const, standard: 6 as const, long: 8 as const }[options.length];
  const difficulty = {
    easy: { laneCount: 5 as const, maxHull: 4 as const, windLimit: 1 as const, reserve: 8 },
    standard: { laneCount: 7 as const, maxHull: 3 as const, windLimit: 1 as const, reserve: 4 },
    hard: { laneCount: 9 as const, maxHull: 2 as const, windLimit: 2 as const, reserve: 2 },
  }[options.difficulty];
  return {
    ...difficulty,
    totalLandings,
    maxPropellant: totalLandings * 2 + difficulty.reserve,
    descentDurationMs: { relaxed: 24_000, standard: 17_000, blitz: 11_000 }[options.pace],
  };
}

function landingTelemetry(
  seed: number,
  landing: number,
  laneCount: number,
  windLimit: number,
): Pick<DropRescueState, "podLane" | "targetLane" | "wind" | "descentSpeed" | "targetSpeed"> {
  const laneRoll = mixedValue(seed, landing, 3);
  const windRoll = mixedValue(seed, landing, 17);
  const brakeRoll = mixedValue(seed, landing, 31);
  const correctionRoll = mixedValue(seed, landing, 47);
  const wind = (windRoll % (windLimit * 2 + 1)) - windLimit;
  const minimumTarget = Math.max(1, wind);
  const maximumTarget = Math.min(laneCount - 2, laneCount - 1 + wind);
  const targetLane = minimumTarget + (laneRoll % (maximumTarget - minimumTarget + 1));
  const correction = [-2, -1, 1, 2][correctionRoll % 4]!;
  const idealPodLane = targetLane - wind;
  const proposedPodLane = idealPodLane + correction;
  const podLane = proposedPodLane >= 0 && proposedPodLane < laneCount
    ? proposedPodLane
    : idealPodLane + (correction < 0 ? 1 : -1);
  const targetSpeed = (2 + ((brakeRoll >>> 4) % 2)) as 2 | 3;
  const descentSpeed = targetSpeed + (brakeRoll % 4);
  return { podLane, targetLane, wind, descentSpeed, targetSpeed };
}

export function createDropRescueState(
  pilotSeat: Seat,
  now: number,
  seed: number,
  options: GameOptions,
): DropRescueState {
  const config = rescueConfig(options);
  return {
    kind: "drop_rescue",
    rulesVersion: 1,
    seed,
    landing: 1,
    totalLandings: config.totalLandings,
    phase: "descent",
    pilotSeat,
    laneCount: config.laneCount,
    ...landingTelemetry(seed, 1, config.laneCount, config.windLimit),
    brakePower: 0,
    locked: [false, false],
    hull: config.maxHull,
    maxHull: config.maxHull,
    propellant: config.maxPropellant,
    maxPropellant: config.maxPropellant,
    softLandings: 0,
    roughLandings: 0,
    totalMoves: 0,
    totalBrakeAdjustments: 0,
    stageMoves: 0,
    stageBrakeAdjustments: 0,
    score: 0,
    finalLane: null,
    finalSpeed: null,
    lastOutcome: null,
    descentDurationMs: config.descentDurationMs,
    turnDeadline: now + config.descentDurationMs,
    result: null,
  };
}

function resolveLanding(state: DropRescueState, now: number, timedOut: boolean): DropRescueState {
  const finalLane = clamp(state.podLane + state.wind, 0, state.laneCount - 1);
  const finalSpeed = Math.max(0, state.descentSpeed - state.brakePower);
  const laneCorrect = finalLane === state.targetLane;
  const speedCorrect = finalSpeed === state.targetSpeed;
  const lastOutcome: DropRescueOutcome = timedOut
    ? "descent_timeout"
    : laneCorrect && speedCorrect
      ? "soft_landing"
      : !laneCorrect && !speedCorrect
        ? "double_fault"
        : laneCorrect ? "hard_landing" : "off_pad";
  const damage = lastOutcome === "soft_landing" ? 0 : lastOutcome === "double_fault" ? 2 : 1;
  const hull = state.hull - damage;
  const softLandings = state.softLandings + (lastOutcome === "soft_landing" ? 1 : 0);
  const roughLandings = state.roughLandings + (lastOutcome === "soft_landing" ? 0 : 1);
  const score = state.score + (lastOutcome === "soft_landing"
    ? Math.max(180, 420 - state.stageMoves * 20 - state.stageBrakeAdjustments * 12)
    : laneCorrect || speedCorrect ? 70 : 0);
  const finished = state.landing >= state.totalLandings;
  const result = hull <= 0
    ? { kind: "failure" as const, score, reason: "rescue_capsule_lost" as const }
    : finished
      ? { kind: "success" as const, score: score + hull * 90 + state.propellant * 8, reason: "drop_rescue_complete" as const }
      : state.propellant <= 0
        ? { kind: "failure" as const, score, reason: "propellant_depleted" as const }
        : null;
  return {
    ...state,
    phase: "landing_result",
    hull,
    softLandings,
    roughLandings,
    score,
    finalLane,
    finalSpeed,
    lastOutcome,
    turnDeadline: now + RESULT_REVEAL_MS,
    result,
  };
}

export function moveDropPod(
  state: DropRescueState,
  actor: Seat,
  direction: -1 | 1,
  now: number,
): GameActionResult {
  if (state.result) return { ok: false, reason: "game_finished" };
  if (state.phase !== "descent") return { ok: false, reason: "wrong_phase" };
  if (now >= state.turnDeadline) return { ok: false, reason: "turn_expired" };
  if (actor !== state.pilotSeat) return { ok: false, reason: "wrong_role" };
  if (state.locked[actor]) return { ok: false, reason: "already_chosen" };
  if (direction !== -1 && direction !== 1) return { ok: false, reason: "invalid_move" };
  if (state.propellant <= 0) return { ok: false, reason: "no_propellant" };
  const podLane = state.podLane + direction;
  if (podLane < 0 || podLane >= state.laneCount) return { ok: false, reason: "pod_edge" };
  return {
    ok: true,
    state: {
      ...state,
      podLane,
      propellant: state.propellant - 1,
      totalMoves: state.totalMoves + 1,
      stageMoves: state.stageMoves + 1,
    },
  };
}

export function adjustDropBrake(
  state: DropRescueState,
  actor: Seat,
  direction: -1 | 1,
  now: number,
): GameActionResult {
  if (state.result) return { ok: false, reason: "game_finished" };
  if (state.phase !== "descent") return { ok: false, reason: "wrong_phase" };
  if (now >= state.turnDeadline) return { ok: false, reason: "turn_expired" };
  if (actor === state.pilotSeat) return { ok: false, reason: "wrong_role" };
  if (state.locked[actor]) return { ok: false, reason: "already_chosen" };
  if (direction !== -1 && direction !== 1) return { ok: false, reason: "invalid_move" };
  const brakePower = state.brakePower + direction;
  if (brakePower < 0 || brakePower > 3) return { ok: false, reason: "brake_limit" };
  return {
    ok: true,
    state: {
      ...state,
      brakePower: brakePower as DropBrakePower,
      totalBrakeAdjustments: state.totalBrakeAdjustments + 1,
      stageBrakeAdjustments: state.stageBrakeAdjustments + 1,
    },
  };
}

export function lockDropControl(
  state: DropRescueState,
  actor: Seat,
  now: number,
): GameActionResult {
  if (state.result) return { ok: false, reason: "game_finished" };
  if (state.phase !== "descent") return { ok: false, reason: "wrong_phase" };
  if (now >= state.turnDeadline) return { ok: false, reason: "turn_expired" };
  if (state.locked[actor]) return { ok: false, reason: "already_chosen" };
  const locked: [boolean, boolean] = [...state.locked];
  locked[actor] = true;
  const next = { ...state, locked };
  return { ok: true, state: locked[0] && locked[1] ? resolveLanding(next, now, false) : next };
}

export function advanceDropRescueClock(state: DropRescueState, now: number): DropRescueState {
  if (state.result || now < state.turnDeadline) return state;
  if (state.phase === "descent") return resolveLanding(state, now, true);
  const landing = state.landing + 1;
  const windLimit = state.laneCount === 9 ? 2 : 1;
  return {
    ...state,
    landing,
    phase: "descent",
    pilotSeat: otherSeat(state.pilotSeat),
    ...landingTelemetry(state.seed, landing, state.laneCount, windLimit),
    brakePower: 0,
    locked: [false, false],
    stageMoves: 0,
    stageBrakeAdjustments: 0,
    finalLane: null,
    finalSpeed: null,
    lastOutcome: null,
    turnDeadline: now + state.descentDurationMs,
  };
}

export function getDropRescueView(
  state: DropRescueState,
  viewerSeat: Seat | null,
): DropRescueViewState {
  const reveal = state.phase === "landing_result" || Boolean(state.result);
  const pilot = viewerSeat !== null && viewerSeat === state.pilotSeat;
  const engineer = viewerSeat !== null && viewerSeat !== state.pilotSeat;
  return {
    ...state,
    targetLane: reveal || pilot ? state.targetLane : null,
    wind: reveal || pilot ? state.wind : null,
    descentSpeed: reveal || engineer ? state.descentSpeed : null,
    targetSpeed: reveal || engineer ? state.targetSpeed : null,
  };
}
