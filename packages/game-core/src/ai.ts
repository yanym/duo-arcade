import { chooseGomokuAction, chooseMazeAction, chooseReversiAction, nextMazeDirection } from "./ai-boards";
import { aiMistakeRate, aiReactionDelay, type AiOptions } from "./ai-options";
import { getGameView } from "./game";
import { requiredMoveForObstacle } from "./neon-dash";
import {
  otherSeat,
  type GameAction,
  type GameState,
  type GameViewState,
  type MazeDirection,
  type PulsePower,
  type Seat,
  type SignalRune,
} from "./types";

export type AiMemory = {
  shadowTargetPod: number | null;
};

export const EMPTY_AI_MEMORY: AiMemory = {
  shadowTargetPod: null,
};

export type AiPlanTiming = "deliberate" | "rapid" | "reaction" | "precision";

export type AiActionPlan = {
  action: GameAction;
  timing: AiPlanTiming;
};

const COMPETITIVE_GAMES = new Set<GameState["kind"]>([
  "gomoku",
  "reversi",
  "cover_hunt",
  "quantum_duel",
  "rhythm_gravity",
  "shadow_shuttle",
  "meteor_dash",
  "trajectory_intercept",
  "neon_dash",
  "signal_bluff",
  "nova_volley",
  "pulse_pass",
]);

export function isCompetitiveGame(state: GameState): boolean {
  return COMPETITIVE_GAMES.has(state.kind);
}

function choose<T>(items: readonly T[], random: () => number): T | undefined {
  if (items.length === 0) return undefined;
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function sign(value: number): -1 | 1 {
  return value < 0 ? -1 : 1;
}

function makesMistake(options: AiOptions, random: () => number, multiplier = 1): boolean {
  const intelligenceMultiplier = { casual: 1.25, balanced: 1, strategic: 0.55 }[options.intelligence];
  return random() < Math.min(0.42, aiMistakeRate(options) * intelligenceMultiplier * multiplier);
}

function wrongChoice<T>(correct: T, choices: readonly T[], random: () => number): T {
  return choose(choices.filter((choice) => choice !== correct), random) ?? correct;
}

function directionToward(from: number, to: number): -1 | 1 | null {
  return from === to ? null : sign(to - from);
}

function directionTowardPoint(
  from: { x: number; y: number },
  to: { x: number; y: number },
): MazeDirection | null {
  if (from.x !== to.x) return from.x < to.x ? "right" : "left";
  if (from.y !== to.y) return from.y < to.y ? "down" : "up";
  return null;
}

function safeFogDirection(state: Extract<GameState, { kind: "fog_sonar" }>): MazeDirection | null {
  const directions: [MazeDirection, number][] = [
    ["up", -state.gridSize],
    ["right", 1],
    ["down", state.gridSize],
    ["left", -1],
  ];
  const visited = new Set([state.ship]);
  const queue: { cell: number; first: MazeDirection | null }[] = [{ cell: state.ship, first: null }];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor]!;
    if (current.cell === state.beacon) return current.first;
    const row = Math.floor(current.cell / state.gridSize);
    const col = current.cell % state.gridSize;
    for (const [direction, delta] of directions) {
      if (
        (direction === "up" && row === 0) ||
        (direction === "right" && col === state.gridSize - 1) ||
        (direction === "down" && row === state.gridSize - 1) ||
        (direction === "left" && col === 0)
      ) continue;
      const next = current.cell + delta;
      if (visited.has(next) || state.reefs.includes(next)) continue;
      visited.add(next);
      queue.push({ cell: next, first: current.first ?? direction });
    }
  }
  return null;
}

function chooseCoverAction(
  state: Extract<GameViewState, { kind: "cover_hunt" }>,
  seat: Seat,
  options: AiOptions,
  random: () => number,
): GameAction | null {
  if (state.phase === "hiding" && seat !== state.hunterSeat) {
    return { kind: "cover_hide", cover: Math.floor(random() * state.covers) };
  }
  if (state.phase !== "hunting" || seat !== state.hunterSeat) return null;
  const feedback = state.scanFeedback;
  if (feedback?.signal === "hot") return { kind: "cover_shoot", cover: feedback.cover };
  if (feedback?.signal === "warm") {
    const candidates = [feedback.cover - 1, feedback.cover + 1].filter(
      (cover) => cover >= 0 && cover < state.covers,
    );
    return { kind: "cover_shoot", cover: choose(candidates, random) ?? feedback.cover };
  }
  if (feedback?.signal === "cold") {
    const candidates = Array.from({ length: state.covers }, (_, cover) => cover).filter(
      (cover) => Math.abs(cover - feedback.cover) >= 2,
    );
    return { kind: "cover_shoot", cover: choose(candidates, random) ?? 0 };
  }
  if (state.scanCharges > 0 && options.intelligence !== "casual" && !makesMistake(options, random, 0.7)) {
    return { kind: "cover_scan", cover: Math.floor((state.covers - 1) / 2) };
  }
  return { kind: "cover_shoot", cover: Math.floor(random() * state.covers) };
}

function chooseSignalAction(
  state: Extract<GameViewState, { kind: "signal_bluff" }>,
  seat: Seat,
  options: AiOptions,
  random: () => number,
): GameAction | null {
  if (state.phase === "claiming" && seat === state.senderSeat) {
    const truth = state.truthSignal;
    if (!truth) return null;
    const bluffChance = { casual: 0.28, balanced: 0.42, strategic: 0.5 }[options.intelligence];
    const signal = random() < bluffChance
      ? wrongChoice(truth, state.availableSignals, random)
      : truth;
    return { kind: "signal_claim", signal };
  }
  if (state.phase !== "judging" || seat === state.senderSeat || !state.claimSignal) return null;
  if (!state.scanned && state.scanCharges[seat] > 0 && options.intelligence !== "casual") {
    return { kind: "signal_scan" };
  }
  let challenge = random() < 0.45;
  if (state.scanHint) {
    const claimIndex = state.availableSignals.indexOf(state.claimSignal);
    const claimGroup = claimIndex % 2 === 0 ? "group_a" : "group_b";
    challenge = claimGroup !== state.scanHint;
  }
  if (makesMistake(options, random, 0.8)) challenge = !challenge;
  return { kind: "signal_judge", verdict: challenge ? "challenge" : "trust" };
}

function chooseDualThrusterAction(
  state: Extract<GameState, { kind: "dual_thrusters" }>,
  seat: Seat,
): GameAction | null {
  if (state.phase !== "planning" || state.locked[seat]) return null;
  const partner = otherSeat(seat);
  const desiredThrust = state.targetLane - state.shipLane - state.drift;
  // A neutral one-step assumption lets the AI lead without forcing the human to move first.
  // If the human has already locked in, the real value is used for an exact complement.
  const partnerPower = state.powers[partner] ?? 1;
  const power = seat === 0
    ? clamp(desiredThrust + partnerPower, 0, 2)
    : clamp(partnerPower - desiredThrust, 0, 2);
  return { kind: "thruster_burn", power: power as 0 | 1 | 2 };
}

function chooseDropAction(
  state: Extract<GameState, { kind: "drop_rescue" }>,
  seat: Seat,
): AiActionPlan | null {
  if (state.phase !== "descent" || state.locked[seat]) return null;
  if (seat === state.pilotSeat) {
    const ideal = state.targetLane - state.wind;
    const direction = directionToward(state.podLane, ideal);
    return direction
      ? { action: { kind: "drop_move", direction }, timing: "rapid" }
      : { action: { kind: "drop_lock" }, timing: "deliberate" };
  }
  const idealBrake = clamp(state.descentSpeed - state.targetSpeed, 0, 3);
  const direction = directionToward(state.brakePower, idealBrake);
  return direction
    ? { action: { kind: "drop_brake", direction }, timing: "rapid" }
    : { action: { kind: "drop_lock" }, timing: "deliberate" };
}

export function updateAiMemory(
  state: GameState,
  seat: Seat,
  memory: AiMemory = EMPTY_AI_MEMORY,
): AiMemory {
  if (state.kind !== "shadow_shuttle") {
    return memory.shadowTargetPod === null ? memory : { shadowTargetPod: null };
  }
  if (state.phase === "marking") return { shadowTargetPod: null };
  if (state.phase === "memorizing" && seat !== state.infiltratorSeat) {
    return { shadowTargetPod: state.targetPod };
  }
  return memory;
}

export function chooseAiAction(
  state: GameState,
  seat: Seat,
  options: AiOptions,
  random: () => number,
  memory: AiMemory = EMPTY_AI_MEMORY,
): AiActionPlan | null {
  if (state.result) return null;
  const visible = (isCompetitiveGame(state) ? getGameView(state, seat) : state) as GameViewState;

  switch (visible.kind) {
    case "gomoku": {
      const action = chooseGomokuAction(visible, seat, options, random);
      return action ? { action, timing: "deliberate" } : null;
    }
    case "reversi": {
      const action = chooseReversiAction(visible, seat, options, random);
      return action ? { action, timing: "deliberate" } : null;
    }
    case "split_maze": {
      const action = chooseMazeAction(visible, seat);
      return action ? { action, timing: "rapid" } : null;
    }
    case "sync_tap":
      return visible.taps[seat] === null
        ? { action: { kind: "sync_tap" }, timing: "reaction" }
        : null;
    case "cover_hunt": {
      const action = chooseCoverAction(visible, seat, options, random);
      return action ? { action, timing: action.kind === "cover_scan" ? "rapid" : "deliberate" } : null;
    }
    case "starship_defuse": {
      if (seat !== visible.operatorSeat || !visible.solution) return null;
      const correct = visible.solution[visible.progress];
      if (!correct) return null;
      const symbol = makesMistake(options, random, 0.35)
        ? wrongChoice(correct, visible.availableSymbols, random)
        : correct;
      return { action: { kind: "defuse_press", symbol }, timing: "rapid" };
    }
    case "quantum_duel": {
      if (visible.phase !== "choosing" || visible.locked[seat]) return null;
      const moves = ["strike", "guard", "charge"] as const;
      return { action: { kind: "duel_choose", move: choose(moves, random)! }, timing: "deliberate" };
    }
    case "starway_escort": {
      if (visible.phase !== "planning" || visible.locked[seat]) return null;
      if (state.kind !== "starway_escort") return null;
      const full = state;
      if (seat === full.pilotSeat) {
        const bestLane = full.energyLane;
        const lane = makesMistake(options, random, 0.35)
          ? wrongChoice(bestLane, [0, 1, 2] as const, random)
          : bestLane;
        return { action: { kind: "escort_route", lane }, timing: "deliberate" };
      }
      const bestLane = full.routeChoice ?? full.energyLane;
      return { action: { kind: "escort_shield", lane: bestLane }, timing: "deliberate" };
    }
    case "orbital_repair": {
      if (visible.phase !== "aligning") return null;
      const full = state.kind === "orbital_repair" ? state : null;
      if (!full) return null;
      if (seat === full.engineerSeat) {
        for (let ring = 0; ring < full.ringCount; ring += 1) {
          const current = full.currentSlots[ring]!;
          const target = full.targetSlots[ring]!;
          if (current === target) continue;
          const clockwise = (target - current + full.slotCount) % full.slotCount;
          const counterclockwise = (current - target + full.slotCount) % full.slotCount;
          return {
            action: {
              kind: "orbit_rotate",
              ring: ring as 0 | 1 | 2,
              direction: clockwise <= counterclockwise ? "clockwise" : "counterclockwise",
            },
            timing: "rapid",
          };
        }
        return null;
      }
      const aligned = full.currentSlots.slice(0, full.ringCount).every(
        (slot, ring) => slot === full.targetSlots[ring],
      );
      return aligned ? { action: { kind: "orbit_launch" }, timing: "deliberate" } : null;
    }
    case "rhythm_gravity":
      return visible.phase === "beat" && !visible.locked[seat]
        ? { action: { kind: "rhythm_gravity_tap" }, timing: "precision" }
        : null;
    case "shadow_shuttle": {
      if (visible.phase === "marking" && seat === visible.infiltratorSeat) {
        return { action: { kind: "shadow_mark", pod: Math.floor(random() * visible.podCount) }, timing: "deliberate" };
      }
      if (visible.phase !== "guessing" || seat === visible.infiltratorSeat) return null;
      const remembered = memory.shadowTargetPod;
      let slot = remembered === null ? -1 : visible.permutation.indexOf(remembered);
      if (slot < 0 || makesMistake(options, random)) slot = Math.floor(random() * visible.podCount);
      return { action: { kind: "shadow_guess", slot }, timing: "deliberate" };
    }
    case "echo_relay": {
      if (visible.phase !== "transmitting" || seat === visible.decoderSeat) return null;
      const full = state.kind === "echo_relay" ? state : null;
      const correct = full?.sequence[full.progress];
      if (!correct) return null;
      const tone = makesMistake(options, random, 0.35)
        ? wrongChoice(correct, full.availableTones, random)
        : correct;
      return { action: { kind: "echo_press", tone }, timing: "rapid" };
    }
    case "core_rally": {
      if (seat !== visible.receiverSeat || visible.phase === "rally_result") return null;
      const direction = directionToward(visible.paddleLanes[seat], visible.incomingLane);
      if (direction) return { action: { kind: "core_move", direction }, timing: "rapid" };
      return visible.phase === "return_window"
        ? { action: { kind: "core_return" }, timing: "precision" }
        : null;
    }
    case "skyline_rescue": {
      if (visible.phase !== "planning" || visible.locked[seat]) return null;
      const full = state.kind === "skyline_rescue" ? state : null;
      if (!full) return null;
      if (seat === full.pumpSeat) {
        const pressure = makesMistake(options, random, 0.35)
          ? wrongChoice(full.requiredPressure, [1, 2, 3] as const, random)
          : full.requiredPressure;
        return { action: { kind: "rescue_pressure", pressure }, timing: "deliberate" };
      }
      const zone = makesMistake(options, random, 0.35)
        ? wrongChoice(full.priorityZone, [0, 1, 2] as const, random)
        : full.priorityZone;
      return { action: { kind: "rescue_aim", zone }, timing: "deliberate" };
    }
    case "meteor_dash": {
      if (visible.phase !== "catching" || visible.locked[seat] || visible.targetCell === null) return null;
      const cell = makesMistake(options, random)
        ? wrongChoice(visible.targetCell, Array.from({ length: visible.cellCount }, (_, index) => index), random)
        : visible.targetCell;
      return { action: { kind: "meteor_catch", cell }, timing: "reaction" };
    }
    case "dual_thrusters": {
      const action = chooseDualThrusterAction(visible, seat);
      return action ? { action, timing: "deliberate" } : null;
    }
    case "fog_sonar": {
      if (visible.phase !== "navigating") return null;
      const full = state.kind === "fog_sonar" ? state : null;
      if (!full) return null;
      const direction = safeFogDirection(full);
      if (!direction) return null;
      if (seat === full.sonarSeat) {
        return full.pulseCharges > 0 && full.lastPing !== direction
          ? { action: { kind: "sonar_ping", direction }, timing: "deliberate" }
          : null;
      }
      return { action: { kind: "fog_steer", direction }, timing: "rapid" };
    }
    case "storm_grid": {
      if (visible.phase === "wave_result") return null;
      const full = state.kind === "storm_grid" ? state : null;
      if (!full) return null;
      if (seat === full.sensorSeat) {
        return full.phase === "discharge_window"
          ? { action: { kind: "grid_discharge" }, timing: "precision" }
          : null;
      }
      const direction = directionToward(full.selectorNode, full.targetNode);
      if (direction) return { action: { kind: "grid_shift", direction }, timing: "rapid" };
      if (full.polarity !== full.targetPolarity) return { action: { kind: "grid_toggle" }, timing: "rapid" };
      return null;
    }
    case "trajectory_intercept": {
      if (visible.phase !== "intercepting" || visible.locked[seat] || visible.targetLane === null) return null;
      const ownCursor = visible.cursors[seat];
      if (ownCursor === null) return null;
      const direction = directionToward(ownCursor, visible.targetLane);
      if (direction && !makesMistake(options, random, 0.25)) {
        return { action: { kind: "intercept_move", direction }, timing: "rapid" };
      }
      return { action: { kind: "intercept_capture" }, timing: "reaction" };
    }
    case "star_trace": {
      if (visible.phase !== "tracing" || seat === visible.guideSeat) return null;
      const full = state.kind === "star_trace" ? state : null;
      const target = full?.checkpoints[full.currentTarget];
      const direction = target ? directionTowardPoint(full.cursor, target) : null;
      return direction ? { action: { kind: "star_trace_move", direction }, timing: "rapid" } : null;
    }
    case "magnet_haul": {
      if (visible.phase !== "moving") return null;
      const direction = directionToward(visible.magnetPositions[seat], visible.targetPositions[seat]);
      if (!direction) return null;
      const positions = [...visible.magnetPositions] as [number, number];
      positions[seat] += direction;
      if (Math.abs(positions[0] - positions[1]) > visible.tensionLimit) return null;
      return { action: { kind: "magnet_move", direction }, timing: "rapid" };
    }
    case "lumen_bridge": {
      if (visible.phase === "resonance") {
        return visible.confirmations[seat]
          ? null
          : { action: { kind: "bridge_lock" }, timing: "precision" };
      }
      if (visible.phase !== "aligning") return null;
      const delta = visible.targetLane - (visible.originLane + visible.arcOffset);
      if (delta === 0) return null;
      const direction = sign(delta);
      if (seat === visible.originSeat) {
        const next = visible.originLane + direction;
        if (next < 0 || next >= visible.laneCount || next + visible.arcOffset < 0 || next + visible.arcOffset >= visible.laneCount) return null;
      } else if (Math.abs(visible.arcOffset + direction) > visible.maxArc) {
        return null;
      }
      return { action: { kind: "bridge_adjust", direction }, timing: "rapid" };
    }
    case "neon_dash": {
      if (visible.phase !== "reacting" || visible.locked[seat] || !visible.obstacle) return null;
      const correct = requiredMoveForObstacle(visible.obstacle);
      const move = makesMistake(options, random)
        ? wrongChoice(correct, visible.availableMoves, random)
        : correct;
      return { action: { kind: "neon_dodge", move }, timing: "reaction" };
    }
    case "signal_bluff": {
      const action = chooseSignalAction(visible, seat, options, random);
      return action ? { action, timing: action.kind === "signal_scan" ? "rapid" : "deliberate" } : null;
    }
    case "prism_heist": {
      const full = state.kind === "prism_heist" ? state : null;
      if (!full) return null;
      if (full.phase === "approach" && seat !== full.scoutSeat) {
        const direction = directionToward(full.runnerLane, full.safeLane);
        return direction ? { action: { kind: "heist_move", direction }, timing: "rapid" } : null;
      }
      if (full.phase !== "breach") return null;
      if (seat === full.scoutSeat && !full.bypassLocked) {
        return { action: { kind: "heist_bypass" }, timing: "precision" };
      }
      if (seat !== full.scoutSeat && !full.dashLocked) {
        return { action: { kind: "heist_dash" }, timing: "precision" };
      }
      return null;
    }
    case "nova_volley": {
      if (visible.phase === "point_result" || seat !== visible.receiverSeat) return null;
      const direction = directionToward(visible.paddleLanes[seat], visible.incomingLane);
      if (direction) return { action: { kind: "volley_move", direction }, timing: "rapid" };
      if (visible.phase !== "strike_window") return null;
      const opponent = otherSeat(seat);
      const candidates = Array.from({ length: visible.laneCount }, (_, lane) => lane);
      const target = options.intelligence === "casual"
        ? choose(candidates, random)!
        : candidates.sort((a, b) => Math.abs(b - visible.paddleLanes[opponent]) - Math.abs(a - visible.paddleLanes[opponent]))[0]!;
      return { action: { kind: "volley_strike", lane: target }, timing: "precision" };
    }
    case "pulse_pass": {
      if (visible.phase !== "handling" || seat !== visible.holderSeat) return null;
      if (visible.heatBand === "critical" && visible.ventCharges[seat] > 0 && options.intelligence !== "casual") {
        return { action: { kind: "pulse_vent" }, timing: "deliberate" };
      }
      const powers = visible.availablePowers;
      const power = visible.heatBand === "critical"
        ? 1
        : options.intelligence === "strategic"
          ? (visible.heatBand === "warm" ? Math.min(2, powers.at(-1)!) : powers.at(-1)!)
          : choose(powers, random)!;
      return { action: { kind: "pulse_charge", power: power as PulsePower }, timing: "deliberate" };
    }
    case "drop_rescue":
      return state.kind === "drop_rescue" ? chooseDropAction(state, seat) : null;
  }
}

export function aiPlanDelayMs(
  state: GameState,
  plan: AiActionPlan,
  options: AiOptions,
  random: () => number,
  updatedAt: number,
): number {
  const reaction = aiReactionDelay(options, random);
  if (plan.timing === "rapid") return Math.max(90, Math.round(reaction * 0.32));
  if (plan.timing === "deliberate") return reaction;
  if (plan.timing === "reaction") {
    const anchor = state.kind === "sync_tap" ? state.goAt
      : state.kind === "meteor_dash" ? state.catchStartedAt
        : state.kind === "trajectory_intercept" ? state.interceptStartedAt
          : state.kind === "neon_dash" ? state.signalStartedAt
            : updatedAt;
    return Math.max(0, anchor - updatedAt) + reaction;
  }

  const precisionOffset = {
    easy: { relaxed: 190, natural: 135, quick: 95 },
    standard: { relaxed: 105, natural: 65, quick: 38 },
    hard: { relaxed: 62, natural: 34, quick: 18 },
  }[options.difficulty][options.reactionSpeed];
  const jitter = Math.round(precisionOffset * (0.72 + random() * 0.56));
  const anchor = state.kind === "rhythm_gravity" ? state.beatAt
    : state.kind === "core_rally" ? state.strikeAt
      : state.kind === "storm_grid" ? state.windowStartedAt + state.dischargeWindowMs / 2
        : state.kind === "lumen_bridge" ? state.resonanceStartedAt + state.resonanceWindowMs / 3
          : state.kind === "nova_volley" ? updatedAt + state.strikeWindowMs / 3
            : updatedAt;
  return Math.max(0, anchor - updatedAt) + jitter;
}

export function suggestedAiTeamAction(state: GameState, humanSeat: Seat): GameAction | null {
  if (isCompetitiveGame(state) || state.result) return null;
  const options: AiOptions = { difficulty: "hard", intelligence: "strategic", reactionSpeed: "quick" };
  const plan = chooseAiAction(state, humanSeat, options, () => 0.99);
  return plan?.action ?? null;
}

export function suggestedMazeDirection(state: Extract<GameState, { kind: "split_maze" }>): MazeDirection | null {
  return nextMazeDirection(state);
}

export function signalGroup(signal: SignalRune, available: readonly SignalRune[]): "group_a" | "group_b" {
  return available.indexOf(signal) % 2 === 0 ? "group_a" : "group_b";
}
