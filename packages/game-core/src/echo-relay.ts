import { roundsForLength } from "./options";
import {
  ECHO_TONES,
  otherSeat,
  type EchoRelayState,
  type EchoRelayViewState,
  type EchoTone,
  type GameActionResult,
  type GameOptions,
  type Seat,
} from "./types";

const RESULT_DURATION_MS = 1_600;

function relayConfig(options: GameOptions): Pick<
  EchoRelayState,
  "totalStages" | "sequenceLength" | "maxStrikes" | "stageDurationMs"
> {
  const difficulty = {
    easy: { sequenceLength: 3 as const, maxStrikes: 3 as const },
    standard: { sequenceLength: 4 as const, maxStrikes: 2 as const },
    hard: { sequenceLength: 5 as const, maxStrikes: 1 as const },
  }[options.difficulty];
  return {
    ...difficulty,
    totalStages: roundsForLength(options.length),
    stageDurationMs: { relaxed: 55_000, standard: 38_000, blitz: 26_000 }[options.pace],
  };
}

function sequenceFor(
  state: Pick<EchoRelayState, "seed" | "stage" | "sequenceLength">,
): EchoTone[] {
  let value = (state.seed ^ Math.imul(state.stage, 0x85ebca6b)) >>> 0;
  const randomIndex = () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) % ECHO_TONES.length;
  };
  const sequence: EchoTone[] = [];
  while (sequence.length < state.sequenceLength) {
    let index = randomIndex();
    if (
      sequence.length >= 2 &&
      sequence.at(-1) === ECHO_TONES[index] &&
      sequence.at(-2) === ECHO_TONES[index]
    ) {
      index = (index + 1) % ECHO_TONES.length;
    }
    sequence.push(ECHO_TONES[index]!);
  }
  return sequence;
}

function failureScore(state: EchoRelayState): number {
  return state.completedStages * 180 + state.progress * 25;
}

export function createEchoRelayState(
  decoderSeat: Seat,
  now: number,
  seed: number,
  options: GameOptions,
): EchoRelayState {
  const config = relayConfig(options);
  const base = {
    kind: "echo_relay" as const,
    rulesVersion: 1 as const,
    seed,
    stage: 1,
    totalStages: config.totalStages,
    completedStages: 0,
    phase: "transmitting" as const,
    decoderSeat,
    availableTones: [...ECHO_TONES],
    progress: 0,
    sequenceLength: config.sequenceLength,
    strikes: 0,
    maxStrikes: config.maxStrikes,
    totalInputs: 0,
    stageDurationMs: config.stageDurationMs,
    lastInput: null,
    turnDeadline: now + config.stageDurationMs,
    result: null,
  };
  return { ...base, sequence: sequenceFor(base) };
}

export function pressEchoTone(
  state: EchoRelayState,
  actor: Seat,
  tone: EchoTone,
  now: number,
): GameActionResult {
  if (state.result) return { ok: false, reason: "game_finished" };
  if (now >= state.turnDeadline) return { ok: false, reason: "turn_expired" };
  if (state.phase !== "transmitting") return { ok: false, reason: "wrong_phase" };
  if (actor === state.decoderSeat) return { ok: false, reason: "wrong_role" };
  if (!state.availableTones.includes(tone)) return { ok: false, reason: "invalid_symbol" };

  const totalInputs = state.totalInputs + 1;
  const correct = state.sequence[state.progress] === tone;
  if (!correct) {
    const strikes = state.strikes + 1;
    const next = {
      ...state,
      progress: 0,
      strikes,
      totalInputs,
      lastInput: { tone, correct: false, stageComplete: false },
    };
    return {
      ok: true,
      state: strikes >= state.maxStrikes
        ? {
            ...next,
            result: { kind: "failure", score: failureScore(next), reason: "too_many_strikes" },
          }
        : next,
    };
  }

  const progress = state.progress + 1;
  if (progress < state.sequenceLength) {
    return {
      ok: true,
      state: {
        ...state,
        progress,
        totalInputs,
        lastInput: { tone, correct: true, stageComplete: false },
      },
    };
  }

  const completedStages = state.completedStages + 1;
  if (state.stage >= state.totalStages) {
    return {
      ok: true,
      state: {
        ...state,
        progress,
        completedStages,
        totalInputs,
        lastInput: { tone, correct: true, stageComplete: true },
        result: {
          kind: "success",
          score: Math.max(
            100,
            1_000 + state.totalStages * 100 - state.strikes * 110 -
              Math.max(0, totalInputs - state.totalStages * state.sequenceLength) * 5,
          ),
          reason: "echo_relay_complete",
        },
      },
    };
  }

  return {
    ok: true,
    state: {
      ...state,
      progress,
      completedStages,
      totalInputs,
      phase: "stage_result",
      lastInput: { tone, correct: true, stageComplete: true },
      turnDeadline: now + RESULT_DURATION_MS,
    },
  };
}

export function advanceEchoRelayClock(state: EchoRelayState, now: number): EchoRelayState {
  if (state.result || now < state.turnDeadline) return state;
  if (state.phase === "transmitting") {
    return {
      ...state,
      result: { kind: "failure", score: failureScore(state), reason: "timeout" },
    };
  }

  const next = {
    ...state,
    stage: state.stage + 1,
    phase: "transmitting" as const,
    decoderSeat: otherSeat(state.decoderSeat),
    progress: 0,
    lastInput: null,
    turnDeadline: now + state.stageDurationMs,
  };
  return { ...next, sequence: sequenceFor(next) };
}

export function getEchoRelayView(
  state: EchoRelayState,
  viewerSeat: Seat | null,
): EchoRelayViewState {
  const reveal = state.phase === "stage_result" || Boolean(state.result);
  return {
    ...state,
    sequence: reveal || viewerSeat === state.decoderSeat ? state.sequence : null,
  };
}
