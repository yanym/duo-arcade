import { otherSeat, type CooperativeResult, type GameActionError, type GameOptions, type Seat } from "./types";

export type EmberOperation = "move" | "extinguish" | "refill" | "share" | "wait";
export type EmberPlan = { operation: EmberOperation; cell: number };
export type EmberCrewState = {
  kind: "ember_crew";
  rulesVersion: 1;
  seed: number;
  size: 5;
  walls: number[];
  depots: number[];
  civilians: number[];
  fire: number[];
  positions: [number, number];
  water: [number, number];
  carrying: [boolean, boolean];
  plans: [EmberPlan | null, EmberPlan | null];
  locked: [boolean, boolean];
  lastActorSeat: Seat | null;
  phase: "planning" | "round_result";
  round: number;
  maxRounds: number;
  rescued: number;
  target: number;
  integrity: number;
  maxIntegrity: number;
  forecast: number[];
  report: [string, string];
  roundDurationMs: number;
  turnDeadline: number;
  result: CooperativeResult | null;
};

export const EMBER_OPERATIONS = ["move", "extinguish", "refill", "share", "wait"] as const;
const WATER_CAPACITY = 4;
const REVEAL_MS = 1800;

// Distinct route networks, not just different artwork. Every layout has open
// station approaches and all four pickup sites reachable from either station.
const EMBER_LAYOUTS = [
  // Include the central rescue in short missions too, so the shared burning
  // approach leads to an objective rather than an optional dead-end detour.
  { walls: [7, 11, 13], civilians: [12, 1, 3, 2], fires: [6, 8, 17] },
  // A shared central approach with rescue branches to either side.
  { walls: [6, 8, 16, 18], civilians: [12, 2, 5, 9], fires: [17, 7, 11] },
  // Upper-floor rescues behind the staggered fire line. The old short layout
  // allowed two safe edge walks and left the first rescuer idle at the exit.
  // Keep distinct left/right approaches, but give firefighting a real purpose.
  { walls: [6, 12, 18], civilians: [8, 1, 10, 3], fires: [10, 13, 14] },
] as const;

function mix(seed: number, n: number): number {
  let v = (seed ^ Math.imul(n + 1, 0x9e3779b1)) >>> 0;
  v = Math.imul(v ^ (v >>> 16), 0x85ebca6b);
  return (v ^ (v >>> 13)) >>> 0;
}

export function emberDistance(a: number, b: number): number {
  return Math.abs(a % 5 - b % 5) + Math.abs(Math.floor(a / 5) - Math.floor(b / 5));
}

function nextForecast(state: EmberCrewState): number[] {
  const candidates = Array.from({ length: 25 }, (_, i) => i).filter((cell) =>
    !state.walls.includes(cell) && !state.depots.includes(cell) &&
    (state.fire[cell]! > 0 || state.fire.some((level, source) => level > 0 && emberDistance(source, cell) === 1)),
  );
  if (!candidates.length) return [];
  return [candidates[mix(state.seed, state.round) % candidates.length]!];
}

export function emberCrewConfig(options: GameOptions) {
  return {
    target: { short: 2, standard: 3, long: 4 }[options.length],
    maxRounds: { short: 22, standard: 34, long: 44 }[options.length],
    integrity: { easy: 32, standard: 24, hard: 18 }[options.difficulty],
    roundDurationMs: { relaxed: 90_000, standard: 60_000, blitz: 40_000 }[options.pace],
  };
}

export function createEmberCrewState(now: number, seed: number, options: GameOptions): EmberCrewState {
  const { target, integrity, roundDurationMs, maxRounds } = emberCrewConfig(options);
  const layout = EMBER_LAYOUTS[(seed >>> 1) % EMBER_LAYOUTS.length]!;
  const mirrored = (seed & 1) === 1;
  const mirror = (cell: number) => mirrored ? Math.floor(cell / 5) * 5 + 4 - cell % 5 : cell;
  const fire = Array<number>(25).fill(0);
  for (const cell of layout.fires) fire[mirror(cell)] = 1;
  const state: EmberCrewState = {
    kind: "ember_crew", rulesVersion: 1, seed, size: 5,
    walls: layout.walls.map(mirror), depots: [20, 24],
    civilians: layout.civilians.slice(0, target).map(mirror), fire,
    positions: [20, 24], water: [4, 4], carrying: [false, false],
    plans: [null, null], locked: [false, false], lastActorSeat: null,
    phase: "planning", round: 1, maxRounds,
    rescued: 0, target, integrity, maxIntegrity: integrity, forecast: [], report: ["", ""],
    roundDurationMs, turnDeadline: now + roundDurationMs, result: null,
  };
  return { ...state, forecast: nextForecast(state) };
}

/** Planning allows a blocked route: a teammate may clear it in the same beat. */
export function validateEmberPlan(state: EmberCrewState, seat: Seat, plan: EmberPlan): GameActionError | null {
  if (!EMBER_OPERATIONS.includes(plan.operation)) return "invalid_move";
  if (!Number.isInteger(plan.cell) || plan.cell < 0 || plan.cell >= 25) return "invalid_cell";
  const position = state.positions[seat];
  if (plan.operation === "move") {
    return emberDistance(position, plan.cell) === 1 && !state.walls.includes(plan.cell) ? null : "illegal_move";
  }
  if (plan.operation === "extinguish") {
    if (emberDistance(position, plan.cell) > 1 || state.fire[plan.cell] === 0) return "illegal_move";
    return state.water[seat] > 0 ? null : "insufficient_water";
  }
  if (plan.cell !== position) return "invalid_cell";
  if (plan.operation === "refill") return state.depots.includes(position) && state.water[seat] < WATER_CAPACITY ? null : "illegal_move";
  if (plan.operation === "share") {
    const partner = otherSeat(seat);
    return emberDistance(position, state.positions[partner]) <= 1 && state.water[seat] > 0 && state.water[partner] < WATER_CAPACITY ? null : "illegal_move";
  }
  return null;
}

type EmberResult = { ok: true; state: EmberCrewState } | { ok: false; reason: GameActionError };

export function planEmberAction(state: EmberCrewState, seat: Seat, round: number, plan: EmberPlan, now: number): EmberResult {
  if (state.result) return { ok: false, reason: "game_finished" };
  if (state.phase !== "planning" || round !== state.round) return { ok: false, reason: "wrong_phase" };
  if (now >= state.turnDeadline) return { ok: false, reason: "turn_expired" };
  if (state.locked[seat]) return { ok: false, reason: "already_chosen" };
  const reason = validateEmberPlan(state, seat, plan);
  if (reason) return { ok: false, reason };
  const plans: EmberCrewState["plans"] = [...state.plans];
  plans[seat] = { operation: plan.operation, cell: plan.cell };
  return { ok: true, state: { ...state, plans, lastActorSeat: seat } };
}

export function commitEmberAction(state: EmberCrewState, seat: Seat, round: number, now: number): EmberResult {
  if (state.result) return { ok: false, reason: "game_finished" };
  if (state.phase !== "planning" || round !== state.round) return { ok: false, reason: "wrong_phase" };
  if (now >= state.turnDeadline) return { ok: false, reason: "turn_expired" };
  if (state.locked[seat]) return { ok: false, reason: "already_chosen" };
  if (!state.plans[seat]) return { ok: false, reason: "invalid_move" };
  const locked: [boolean, boolean] = [...state.locked];
  locked[seat] = true;
  const next = { ...state, locked, lastActorSeat: seat };
  return { ok: true, state: locked.every(Boolean) ? resolveEmberRound(next, now) : next };
}

function resolveEmberRound(state: EmberCrewState, now: number): EmberCrewState {
  const fire = [...state.fire];
  const suppressed = new Set<number>();
  const water: [number, number] = [...state.water];
  const positions: [number, number] = [...state.positions];
  const carrying: [boolean, boolean] = [...state.carrying];
  let civilians = [...state.civilians];
  let rescued = state.rescued;
  const report: [string, string] = ["留在原地", "留在原地"];
  const seats: Seat[] = state.round % 2 ? [0, 1] : [1, 0];
  // Locked plans only. A timed-out draft never silently becomes a committed action.
  const plans = state.plans.map((plan, seat) => state.locked[seat] ? plan : null);
  for (const seat of seats) {
    const plan = plans[seat];
    if (!state.locked[seat]) report[seat] = "未确认，本轮留守";
    if (plan?.operation === "share") {
      const amount = Math.min(2, water[seat], WATER_CAPACITY - water[otherSeat(seat)]);
      water[seat] -= amount; water[otherSeat(seat)] += amount;
      report[seat] = "已给搭档补水";
    }
    if (plan?.operation === "refill") { water[seat] = WATER_CAPACITY; report[seat] = "水箱已补满"; }
  }
  for (const seat of seats) {
    const plan = plans[seat];
    if (plan?.operation === "extinguish") {
      if (fire[plan.cell]! > 0 && water[seat] > 0) {
        suppressed.add(plan.cell);
        fire[plan.cell] = 0; water[seat] -= 1; report[seat] = "已扑灭火势";
      } else report[seat] = "搭档已灭火，保留水量";
    }
  }
  for (const seat of seats) {
    const plan = plans[seat];
    if (plan?.operation === "move") {
      if (fire[plan.cell] === 0) { positions[seat] = plan.cell; report[seat] = "已抵达目标"; }
      else report[seat] = "道路仍有火，留在原地";
    }
    if (!carrying[seat] && civilians.includes(positions[seat]) && fire[positions[seat]] === 0) {
      civilians = civilians.filter((cell) => cell !== positions[seat]);
      carrying[seat] = true; report[seat] = "已接到居民，前往救援站";
    }
    if (carrying[seat] && state.depots.includes(positions[seat])) {
      rescued += 1; carrying[seat] = false; report[seat] = "居民已安全撤离";
    }
  }
  // Clearing every fire prevents further spread. Otherwise the public forecast is authoritative.
  if (fire.some((level) => level > 0)) {
    for (const cell of state.forecast) {
      // A freshly extinguished tile is safe for this round. Spread also needs
      // a surviving local source; clearing it can avert the forecast entirely.
      if (!suppressed.has(cell) && fire.some((level, source) => level > 0 && emberDistance(source, cell) <= 1)) {
        fire[cell] = Math.min(2, fire[cell]! + 1);
      }
    }
  }
  const damage = Math.floor(fire.filter((level) => level === 2).length / 2) + positions.filter((cell) => fire[cell]! > 0).length;
  const integrity = Math.max(0, state.integrity - damage);
  const score = rescued * 250 + integrity * 10 + Math.max(0, state.maxRounds - state.round) * 5;
  const result: CooperativeResult | null = rescued >= state.target
    ? { kind: "success", score, reason: "ember_crew_complete" }
    : integrity === 0 ? { kind: "failure", score, reason: "building_lost" }
      : state.round >= state.maxRounds ? { kind: "failure", score, reason: "timeout" } : null;
  return { ...state, fire, water, positions, carrying, civilians, rescued, integrity, report,
    phase: "round_result", turnDeadline: now + REVEAL_MS, result };
}

export function advanceEmberCrewClock(state: EmberCrewState, now: number): EmberCrewState {
  if (state.result || now < state.turnDeadline) return state;
  if (state.phase === "planning") return resolveEmberRound(state, now);
  const next: EmberCrewState = { ...state, round: state.round + 1, phase: "planning",
    plans: [null, null], locked: [false, false], lastActorSeat: null, turnDeadline: now + state.roundDurationMs };
  return { ...next, forecast: nextForecast(next) };
}

/** Cooperative AI chooses its own task from the same public board and partner plan. */
export function chooseEmberPlan(state: EmberCrewState, seat: Seat): EmberPlan {
  const position = state.positions[seat];
  const partner = otherSeat(seat);
  const partnerPlan = state.plans[partner];
  const partnerClears = (cell: number) => partnerPlan?.operation === "extinguish" && partnerPlan.cell === cell;
  const partnerPickup = !state.carrying[seat] && !state.carrying[partner] &&
    partnerPlan?.operation === "move" && state.fire[partnerPlan.cell] === 0 &&
    emberDistance(state.positions[partner], partnerPlan.cell) === 1 &&
    state.civilians.includes(partnerPlan.cell) ? partnerPlan.cell : null;
  // Route costs include the action needed to clear a fire. An empty tank must
  // take a safe route, not repeatedly approach and retreat from the same fire.
  const routes = new Map<string, { cost: number; first: number }>();
  function route(from: number, to: number, dry = false): { cost: number; first: number } {
    const key = `${from}:${to}:${dry}`;
    const cached = routes.get(key);
    if (cached) return cached;
    const distance = Array<number>(25).fill(Infinity);
    const first = Array<number>(25).fill(from);
    const visited = new Set<number>();
    distance[from] = 0;
    for (let step = 0; step < 25; step++) {
      let cell = -1;
      for (let i = 0; i < 25; i++) if (!visited.has(i) && (cell < 0 || distance[i]! < distance[cell]!)) cell = i;
      if (cell < 0 || !Number.isFinite(distance[cell])) break;
      if (cell === to) break;
      visited.add(cell);
      for (let next = 0; next < 25; next++) {
        if (state.walls.includes(next) || emberDistance(cell, next) !== 1) continue;
        const burning = state.fire[next]! > 0 && !(cell === position && partnerClears(next));
        if (dry && burning) continue;
        const cost = distance[cell]! + 1 + (burning ? 2 : 0) + (state.forecast.includes(next) ? 0.5 : 0);
        if (cost < distance[next]!) { distance[next] = cost; first[next] = cell === from ? next : first[cell]!; }
      }
    }
    const result = { cost: distance[to]!, first: first[to]! };
    routes.set(key, result);
    return result;
  }
  const depotFor = (from: number, dry = false) => [...state.depots].sort((a, b) => route(from, a, dry).cost - route(from, b, dry).cost)[0]!;
  if (state.water[seat] > 0 && state.fire[position]! > 0 && !partnerClears(position)) return { operation: "extinguish", cell: position };
  if (state.water[seat] > 0 && partnerPlan?.operation === "move" && state.fire[partnerPlan.cell]! > 0 && emberDistance(position, partnerPlan.cell) <= 1) {
    return { operation: "extinguish", cell: partnerPlan.cell };
  }
  if (state.water[partner] === 0 && state.water[seat] >= 2 && emberDistance(position, state.positions[partner]) <= 1) {
    const partnerPosition = state.positions[partner];
    // An escort with a fire-free exit needs to deliver, not receive the water
    // they just gave us. Keep useful supplies and avoid spending a whole turn
    // handing them back; still help when the partner cannot evacuate dry.
    const safeDelivery = state.carrying[partner] && state.fire[partnerPosition] === 0
      && Number.isFinite(route(partnerPosition, depotFor(partnerPosition, true), true).cost);
    if (!safeDelivery) return { operation: "share", cell: position };
  }
  if (state.depots.includes(position) && state.water[seat] <= 1) return { operation: "refill", cell: position };
  const nearbyHazards = state.fire.map((level, cell) => ({ level, cell }))
    .filter(({ level, cell }) => level > 0 && emberDistance(position, cell) <= 1 && !partnerClears(cell))
    .sort((a, b) => b.level - a.level || a.cell - b.cell);
  if (state.water[seat] >= 2 && nearbyHazards.length) {
    const hazard = nearbyHazards[0]!;
    // Contain nearby sources while there is water to spare, particularly before
    // going into a long rescue route. Carrying crews keep delivery priority
    // unless an intense fire is actively damaging the building.
    if (!state.carrying[seat] || hazard.level === 2) return { operation: "extinguish", cell: hazard.cell };
  }

  if (!state.carrying[seat] && state.water[seat] === 0) {
    // A dry tank prevents firefighting, not rescue. After using the last water
    // to clear a resident's tile, take them along on the refill trip when a
    // currently fire-free delivery route exists. Do not take the partner's
    // explicitly planned pickup or enter a burning tile without water.
    const pickup = state.civilians.filter((cell) => cell !== partnerPickup &&
      state.fire[cell] === 0 && emberDistance(position, cell) === 1)
      .map((cell) => ({ cell, cost: route(cell, depotFor(cell, true), true).cost }))
      .filter(({ cost }) => Number.isFinite(cost))
      .sort((a, b) => a.cost - b.cost || a.cell - b.cell)[0];
    if (pickup) return { operation: "move", cell: pickup.cell };
  }

  let target: number | undefined;
  if (state.carrying[seat] || state.water[seat] === 0) target = depotFor(position, state.water[seat] === 0);
  else {
    // At most four residents: evaluate complete allocations, not just the
    // nearest pickup. This avoids both rescuers chasing the central resident
    // and leaving a long second trip to one side of the building.
    let best = Infinity;
    let assignment: (number | undefined)[] = [];
    const starts = state.positions.map((cell, player) => state.carrying[player] || state.water[player] === 0 ? depotFor(cell) : cell);
    const loads = starts.map((cell, player) => route(state.positions[player]!, cell).cost);
    function allocate(remaining: number[], ends: number[], costs: number[], firstTargets: (number | undefined)[]) {
      const score = Math.max(...costs) + 0.05 * (costs[0]! + costs[1]!);
      if (score >= best) return;
      if (!remaining.length) { best = score; assignment = firstTargets; return; }
      for (const civilian of remaining) {
        for (const player of [0, 1]) {
          const depot = depotFor(civilian);
          const nextCosts = [...costs];
          nextCosts[player] = costs[player]! + route(ends[player]!, civilian).cost + route(civilian, depot).cost;
          const nextEnds = [...ends]; nextEnds[player] = depot;
          const nextTargets = [...firstTargets]; nextTargets[player] ??= civilian;
          allocate(remaining.filter((cell) => cell !== civilian), nextEnds, nextCosts, nextTargets);
        }
      }
    }
    allocate(state.civilians, starts, loads, [undefined, undefined]);
    target = assignment[seat];
    // If the partner owns the remaining rescue, clear hazards rather than
    // standing still. Both players retain useful independent work.
    if (target === undefined) {
      target = state.fire.map((level, cell) => ({ level, cell })).filter(({ level, cell }) => level > 0 && !partnerClears(cell))
        .sort((a, b) => (route(position, a.cell).cost - a.level) - (route(position, b.cell).cost - b.level))[0]?.cell;
    }
  }
  if (target !== undefined) {
    if (state.water[seat] > 0 && state.fire[target]! > 0 && emberDistance(position, target) <= 1 && !partnerClears(target)) return { operation: "extinguish", cell: target };
    const next = route(position, target, state.water[seat] === 0);
    if (Number.isFinite(next.cost) && next.first !== position) {
      // Let the partner's explicit pickup happen first. The resident remains in
      // the authoritative state until both confirm, so even using this tile as
      // a route to a different target could otherwise steal their pickup.
      // Re-evaluate next beat (or immediately when the partner revises a draft).
      if (next.first === partnerPickup) return { operation: "wait", cell: position };
      if (state.fire[next.first]! > 0 && !partnerClears(next.first)) return { operation: "extinguish", cell: next.first };
      return { operation: "move", cell: next.first };
    }
  }
  return { operation: "wait", cell: position };
}
