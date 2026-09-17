import {
  otherSeat,
  type GameActionResult,
  type GameOptions,
  type PulseHeatBand,
  type PulsePassOutcome,
  type PulsePassState,
  type PulsePassViewState,
  type PulsePower,
  type Seat,
} from "./types";

const ROUND_RESULT_DURATION_MS = 1_800;

export function pulsePassConfig(options: GameOptions): Pick<
  PulsePassState,
  "totalRounds" | "availablePowers" | "initialVentCharges" | "turnDurationMs" | "burstMin" | "burstMax"
> {
  return {
    totalRounds: { short: 3 as const, standard: 5 as const, long: 7 as const }[options.length],
    ...{
      easy: { availablePowers: [1, 2] as PulsePower[], initialVentCharges: 2 as const, burstMin: 9, burstMax: 11 },
      standard: { availablePowers: [1, 2, 3] as PulsePower[], initialVentCharges: 1 as const, burstMin: 8, burstMax: 10 },
      hard: { availablePowers: [1, 2, 3] as PulsePower[], initialVentCharges: 0 as const, burstMin: 7, burstMax: 9 },
    }[options.difficulty],
    turnDurationMs: { relaxed: 20_000, standard: 14_000, blitz: 9_000 }[options.pace],
  };
}

function mix(seed: number, round: number): number {
  let value = (seed ^ Math.imul(round + 17, 0x9e3779b1)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}

function thresholdFor(seed: number, round: number, min: number, max: number): number {
  return min + (mix(seed, round) % (max - min + 1));
}

function heatBand(charge: number, burstAt: number): PulseHeatBand {
  const remaining = burstAt - charge;
  if (remaining <= 3) return "critical";
  if (remaining <= 6) return "warm";
  return "stable";
}

export function createPulsePassState(
  startingSeat: Seat,
  now: number,
  seed: number,
  options: GameOptions,
): PulsePassState {
  const config = pulsePassConfig(options);
  const burstAt = thresholdFor(seed, 1, config.burstMin, config.burstMax);
  return {
    kind: "pulse_pass",
    rulesVersion: 1,
    seed,
    round: 1,
    totalRounds: config.totalRounds,
    phase: "handling",
    firstHolderSeat: startingSeat,
    holderSeat: startingSeat,
    charge: 0,
    burstAt,
    burstMin: config.burstMin,
    burstMax: config.burstMax,
    heatBand: heatBand(0, burstAt),
    availablePowers: config.availablePowers,
    ventCharges: [config.initialVentCharges, config.initialVentCharges],
    initialVentCharges: config.initialVentCharges,
    scores: [0, 0],
    passes: 0,
    totalPasses: 0,
    totalPower: [0, 0],
    ventsUsed: [0, 0],
    lastActor: null,
    lastPower: null,
    roundWinner: null,
    roundOutcome: null,
    turnDurationMs: config.turnDurationMs,
    turnDeadline: now + config.turnDurationMs,
    result: null,
  };
}

function resolveRound(
  state: PulsePassState,
  winnerSeat: Seat,
  outcome: PulsePassOutcome,
  now: number,
): PulsePassState {
  const scores: [number, number] = [...state.scores];
  scores[winnerSeat] += 1;
  const remainingRounds = state.totalRounds - state.round;
  const clinched = scores[winnerSeat] > scores[otherSeat(winnerSeat)] + remainingRounds;
  const finalRound = remainingRounds === 0;
  const matchWinner = scores[0] > scores[1] ? 0 : 1;
  return {
    ...state,
    phase: "round_result",
    scores,
    roundWinner: winnerSeat,
    roundOutcome: outcome,
    turnDeadline: now + ROUND_RESULT_DURATION_MS,
    result: clinched || finalRound
      ? { kind: "win", winnerSeat: matchWinner, reason: "pulse_pass_score" }
      : null,
  };
}

export function chargePulseCore(
  state: PulsePassState,
  actor: Seat,
  power: PulsePower,
  now: number,
): GameActionResult {
  if (state.result) return { ok: false, reason: "game_finished" };
  if (state.phase !== "handling") return { ok: false, reason: "wrong_phase" };
  if (actor !== state.holderSeat) return { ok: false, reason: "not_your_turn" };
  if (now >= state.turnDeadline) return { ok: false, reason: "turn_expired" };
  if (!state.availablePowers.includes(power)) return { ok: false, reason: "invalid_power" };

  const charge = state.charge + power;
  const totalPower: [number, number] = [...state.totalPower];
  totalPower[actor] += power;
  const charged = {
    ...state,
    charge,
    heatBand: heatBand(charge, state.burstAt),
    passes: state.passes + 1,
    totalPasses: state.totalPasses + 1,
    totalPower,
    lastActor: actor,
    lastPower: power,
  } satisfies PulsePassState;
  if (charge >= state.burstAt) {
    return { ok: true, state: resolveRound(charged, otherSeat(actor), "burst", now) };
  }
  return {
    ok: true,
    state: {
      ...charged,
      holderSeat: otherSeat(actor),
      turnDeadline: now + state.turnDurationMs,
    },
  };
}

export function ventPulseCore(
  state: PulsePassState,
  actor: Seat,
  now: number,
): GameActionResult {
  if (state.result) return { ok: false, reason: "game_finished" };
  if (state.phase !== "handling") return { ok: false, reason: "wrong_phase" };
  if (actor !== state.holderSeat) return { ok: false, reason: "not_your_turn" };
  if (now >= state.turnDeadline) return { ok: false, reason: "turn_expired" };
  if (state.ventCharges[actor] <= 0) return { ok: false, reason: "no_vents_left" };

  const ventCharges: [number, number] = [...state.ventCharges];
  const ventsUsed: [number, number] = [...state.ventsUsed];
  ventCharges[actor] -= 1;
  ventsUsed[actor] += 1;
  const charge = Math.max(0, state.charge - 2);
  return {
    ok: true,
    state: {
      ...state,
      holderSeat: otherSeat(actor),
      charge,
      heatBand: heatBand(charge, state.burstAt),
      ventCharges,
      ventsUsed,
      passes: state.passes + 1,
      totalPasses: state.totalPasses + 1,
      lastActor: actor,
      lastPower: null,
      turnDeadline: now + state.turnDurationMs,
    },
  };
}

export function advancePulsePassClock(state: PulsePassState, now: number): PulsePassState {
  if (state.result || now < state.turnDeadline) return state;
  if (state.phase === "handling") {
    return resolveRound(state, otherSeat(state.holderSeat), "holder_timeout", now);
  }

  const round = state.round + 1;
  const holderSeat = round % 2 === 1 ? state.firstHolderSeat : otherSeat(state.firstHolderSeat);
  const burstAt = thresholdFor(state.seed, round, state.burstMin, state.burstMax);
  return {
    ...state,
    round,
    phase: "handling",
    holderSeat,
    charge: 0,
    burstAt,
    heatBand: heatBand(0, burstAt),
    passes: 0,
    lastActor: null,
    lastPower: null,
    roundWinner: null,
    roundOutcome: null,
    turnDeadline: now + state.turnDurationMs,
  };
}

export function getPulsePassView(state: PulsePassState): PulsePassViewState {
  return state.phase === "round_result" || state.result
    ? state
    : { ...state, burstAt: null };
}
