import type { EmberCrewState, EmberOperation } from "./ember-crew";

export const GOMOKU_SIZE = 15;
export const GOMOKU_CELL_COUNT = GOMOKU_SIZE * GOMOKU_SIZE;
export const REVERSI_SIZE = 8;
export const MAZE_ROWS = 9;
export const MAZE_COLS = 9;
export const DEFAULT_TURN_DURATION_MS = 30_000;
export const MAZE_DURATION_MS = 75_000;
export const SYNC_ROUNDS = 5;
export const SYNC_COUNTDOWN_MS = 2_500;
export const SYNC_TAP_WINDOW_MS = 8_000;

export const GAME_IDS = ["gomoku", "split_maze", "reversi", "sync_tap", "cover_hunt", "starship_defuse", "quantum_duel", "starway_escort", "orbital_repair", "rhythm_gravity", "shadow_shuttle", "echo_relay", "core_rally", "skyline_rescue", "meteor_dash", "dual_thrusters", "fog_sonar", "storm_grid", "trajectory_intercept", "star_trace", "magnet_haul", "lumen_bridge", "neon_dash", "signal_bluff", "prism_heist", "nova_volley", "pulse_pass", "drop_rescue", "ember_crew"] as const;

export const GAME_PACES = ["relaxed", "standard", "blitz"] as const;
export const GAME_DIFFICULTIES = ["easy", "standard", "hard"] as const;
export const GAME_LENGTHS = ["short", "standard", "long"] as const;

export type GameId = (typeof GAME_IDS)[number];
export type Seat = 0 | 1;
export type Piece = 0 | 1 | 2;
export type MazeDirection = "up" | "right" | "down" | "left";
export type GamePace = (typeof GAME_PACES)[number];
export type GameDifficulty = (typeof GAME_DIFFICULTIES)[number];
export type GameLength = (typeof GAME_LENGTHS)[number];

export type GameOptions = {
  pace: GamePace;
  difficulty: GameDifficulty;
  length: GameLength;
};

export const DEFAULT_GAME_OPTIONS: GameOptions = {
  pace: "standard",
  difficulty: "standard",
  length: "standard",
};

export type CompetitiveResult =
  | {
      kind: "win";
      winnerSeat: Seat;
      reason:
        | "five_in_a_row"
        | "disc_majority"
        | "cover_hunt_score"
        | "quantum_duel_score"
        | "rhythm_gravity_score"
        | "shadow_shuttle_score"
        | "meteor_dash_score"
        | "trajectory_intercept_score"
        | "neon_dash_score"
        | "signal_bluff_score"
        | "nova_volley_score"
        | "pulse_pass_score"
        | "timeout"
        | "resigned"
        | "opponent_left";
    }
  | { kind: "draw"; reason: "board_full" | "board_tied" | "duel_tied" | "rhythm_tied" | "meteor_tied" | "intercept_tied" | "neon_dash_tied" | "signal_bluff_tied" | "both_left" };

export type CooperativeResult =
  | { kind: "success"; score: number; reason: "ember_crew_complete" }
  | { kind: "failure"; score: number; reason: "building_lost" }
  | { kind: "success"; score: number; reason: "exit_reached" | "rounds_complete" | "defuse_complete" | "escort_complete" | "relay_repaired" | "echo_relay_complete" | "core_rally_complete" | "skyline_rescue_complete" | "dual_thrusters_complete" | "fog_sonar_complete" | "storm_grid_complete" | "star_trace_complete" | "magnet_haul_complete" | "lumen_bridge_complete" | "prism_heist_complete" | "drop_rescue_complete" }
  | {
      kind: "failure";
      score: number;
      reason: "timeout" | "too_many_strikes" | "hull_lost" | "reactor_overload" | "core_lost" | "tower_lost" | "water_depleted" | "shuttle_lost" | "fog_lost" | "grid_collapsed" | "trace_lost" | "magnet_lost" | "bridge_lost" | "heist_failed" | "rescue_capsule_lost" | "propellant_depleted" | "player_left" | "both_left" | "abandoned";
    };

export type GameResult = CompetitiveResult | CooperativeResult;

export type GomokuState = {
  kind: "gomoku";
  rulesVersion: 1;
  size: typeof GOMOKU_SIZE;
  board: Piece[];
  blackSeat: Seat;
  currentSeat: Seat;
  moveCount: number;
  lastMove: number | null;
  turnDeadline: number;
  /** Optional only for saved rooms created before pace was persisted. */
  turnDurationMs?: number;
  winningLine: number[] | null;
  result: CompetitiveResult | null;
};

export type ReversiState = {
  kind: "reversi";
  rulesVersion: 1;
  size: typeof REVERSI_SIZE;
  board: Piece[];
  blackSeat: Seat;
  currentSeat: Seat;
  moveCount: number;
  lastMove: number | null;
  passedSeat: Seat | null;
  turnDeadline: number;
  /** Optional only for saved rooms created before pace was persisted. */
  turnDurationMs?: number;
  result: CompetitiveResult | null;
};

export type SplitMazeState = {
  kind: "split_maze";
  rulesVersion: 1;
  rows: number;
  cols: number;
  walls: number[];
  position: number;
  exit: number;
  verticalSeat: Seat;
  moveCount: number;
  wallHits: number;
  startedAt: number;
  turnDeadline: number;
  result: CooperativeResult | null;
};

export type SyncTapState = {
  kind: "sync_tap";
  rulesVersion: 1;
  round: number;
  totalRounds: 3 | 5 | 7;
  countdownMs: number;
  tapWindowMs: number;
  goAt: number;
  taps: [number | null, number | null];
  lastDeltaMs: number | null;
  roundScores: number[];
  turnDeadline: number;
  result: CooperativeResult | null;
};

export type CoverHuntPhase = "hiding" | "hunting" | "round_result";
export type CoverSignal = "cold" | "warm" | "hot";
export type CoverRoundOutcome = "hit" | "miss" | "hide_timeout" | "hunt_timeout";

export type CoverScanFeedback = {
  cover: number;
  signal: CoverSignal;
};

export type CoverHuntState = {
  kind: "cover_hunt";
  rulesVersion: 1;
  round: number;
  totalRounds: 3 | 5 | 7;
  covers: 4 | 5 | 6;
  phase: CoverHuntPhase;
  hunterSeat: Seat;
  hiddenSpot: number | null;
  scanCharges: number;
  scanFeedback: CoverScanFeedback | null;
  shotSpot: number | null;
  roundWinner: Seat | null;
  roundOutcome: CoverRoundOutcome | null;
  scores: [number, number];
  hideDurationMs: number;
  huntDurationMs: number;
  turnDeadline: number;
  result: CompetitiveResult | null;
};

export type CoverHuntViewState = Omit<CoverHuntState, "hiddenSpot" | "scanFeedback"> & {
  hiddenSpot: number | null;
  scanFeedback: CoverScanFeedback | null;
};

export const DEFUSE_SYMBOLS = ["triangle", "diamond", "circle", "square", "wave", "star"] as const;
export type DefuseSymbol = (typeof DEFUSE_SYMBOLS)[number];

export type DefuseState = {
  kind: "starship_defuse";
  rulesVersion: 1;
  seed: number;
  stage: number;
  totalStages: 3 | 5 | 7;
  operatorSeat: Seat;
  availableSymbols: DefuseSymbol[];
  solution: DefuseSymbol[];
  progress: number;
  sequenceLength: 3 | 4 | 5;
  strikes: number;
  maxStrikes: 1 | 2 | 3;
  stageDurationMs: number;
  lastInput: { symbol: DefuseSymbol; correct: boolean; stageComplete: boolean } | null;
  turnDeadline: number;
  result: CooperativeResult | null;
};

export type DefuseViewState = Omit<DefuseState, "solution"> & {
  solution: DefuseSymbol[] | null;
};

export const ECHO_TONES = ["ember", "tide", "nova", "bloom", "comet"] as const;
export type EchoTone = (typeof ECHO_TONES)[number];

export type EchoRelayState = {
  kind: "echo_relay";
  rulesVersion: 1;
  seed: number;
  stage: number;
  totalStages: 3 | 5 | 7;
  completedStages: number;
  phase: "transmitting" | "stage_result";
  decoderSeat: Seat;
  availableTones: EchoTone[];
  sequence: EchoTone[];
  progress: number;
  sequenceLength: 3 | 4 | 5;
  strikes: number;
  maxStrikes: 1 | 2 | 3;
  totalInputs: number;
  stageDurationMs: number;
  lastInput: { tone: EchoTone; correct: boolean; stageComplete: boolean } | null;
  turnDeadline: number;
  result: CooperativeResult | null;
};

export type EchoRelayViewState = Omit<EchoRelayState, "sequence"> & {
  sequence: EchoTone[] | null;
};

export type CoreRallyPhase = "approach" | "return_window" | "rally_result";
export type CoreRallyOutcome = "returned" | "missed_lane" | "timed_out";

export type CoreRallyState = {
  kind: "core_rally";
  rulesVersion: 1;
  seed: number;
  rally: number;
  targetReturns: 6 | 10 | 14;
  phase: CoreRallyPhase;
  receiverSeat: Seat;
  laneCount: 3 | 4 | 5;
  incomingLane: number;
  paddleLanes: [number, number];
  stability: number;
  maxStability: 2 | 3 | 4;
  successfulReturns: number;
  totalAttempts: number;
  totalMoves: number;
  combo: number;
  bestCombo: number;
  score: number;
  flightDurationMs: number;
  returnWindowMs: number;
  strikeAt: number;
  lastOutcome: CoreRallyOutcome | null;
  lastAccuracyMs: number | null;
  turnDeadline: number;
  result: CooperativeResult | null;
};

export type RescueZone = 0 | 1 | 2;
export type RescuePressure = 1 | 2 | 3;
export type SkylineRescueOutcome = "contained" | "wrong_zone" | "pressure_mismatch" | "dispatch_timeout";

export type SkylineRescueState = {
  kind: "skyline_rescue";
  rulesVersion: 1;
  seed: number;
  wave: number;
  totalWaves: 4 | 6 | 8;
  phase: "planning" | "wave_result";
  pumpSeat: Seat;
  priorityZone: RescueZone;
  requiredPressure: RescuePressure;
  aimChoice: RescueZone | null;
  pressureChoice: RescuePressure | null;
  locked: [boolean, boolean];
  integrity: number;
  maxIntegrity: 3 | 4 | 5;
  water: number;
  maxWater: 12 | 15 | 18;
  containedWaves: number;
  mistakes: number;
  totalWaterUsed: number;
  waveDurationMs: number;
  waveOutcome: SkylineRescueOutcome | null;
  turnDeadline: number;
  result: CooperativeResult | null;
};

export type SkylineRescueViewState = Omit<
  SkylineRescueState,
  "priorityZone" | "requiredPressure" | "aimChoice" | "pressureChoice"
> & {
  priorityZone: RescueZone | null;
  requiredPressure: RescuePressure | null;
  aimChoice: RescueZone | null;
  pressureChoice: RescuePressure | null;
};

export type MeteorResponse = {
  cell: number;
  reactionMs: number;
  correct: boolean;
};

export type MeteorDashState = {
  kind: "meteor_dash";
  rulesVersion: 1;
  seed: number;
  round: number;
  totalRounds: 5 | 7 | 9;
  phase: "signal" | "catching" | "round_result";
  cellCount: 4 | 6 | 8;
  targetCell: number | null;
  catchStartedAt: number;
  responses: [MeteorResponse | null, MeteorResponse | null];
  locked: [boolean, boolean];
  scores: [number, number];
  roundWinner: Seat | null;
  countdownMs: number;
  catchWindowMs: number;
  turnDeadline: number;
  result: CompetitiveResult | null;
};

export type MeteorDashViewState = MeteorDashState;

export type ThrusterPower = 0 | 1 | 2;
export type DualThrustersOutcome = "gate_cleared" | "gate_hit" | "burn_timeout";

export type DualThrustersState = {
  kind: "dual_thrusters";
  rulesVersion: 1;
  seed: number;
  gate: number;
  totalGates: 5 | 7 | 9;
  phase: "planning" | "gate_result";
  laneCount: 5 | 7 | 9;
  shipLane: number;
  targetLane: number;
  drift: number;
  powers: [ThrusterPower | null, ThrusterPower | null];
  locked: [boolean, boolean];
  hull: number;
  maxHull: 2 | 3 | 4;
  clearedGates: number;
  collisions: number;
  score: number;
  burnDurationMs: number;
  gateOutcome: DualThrustersOutcome | null;
  lastMovement: number;
  turnDeadline: number;
  result: CooperativeResult | null;
};

export type DualThrustersViewState = DualThrustersState;

export type FogSonarOutcome = "sailed" | "reef_hit" | "beacon_reached";

export type FogSonarState = {
  kind: "fog_sonar";
  rulesVersion: 1;
  seed: number;
  zone: number;
  totalZones: 2 | 3 | 4;
  phase: "navigating" | "zone_result";
  sonarSeat: Seat;
  gridSize: 5 | 6 | 7;
  reefs: number[];
  ship: number;
  beacon: number;
  pulseCharges: number;
  maxPulseCharges: 3 | 4 | 5;
  hull: number;
  maxHull: 2 | 3 | 4;
  moves: number;
  collisions: number;
  zonesCleared: number;
  score: number;
  lastPing: MazeDirection | null;
  lastMove: { direction: MazeDirection; from: number; to: number; outcome: FogSonarOutcome } | null;
  zoneDurationMs: number;
  turnDeadline: number;
  result: CooperativeResult | null;
};

export type FogSonarViewState = Omit<FogSonarState, "reefs"> & {
  reefs: number[] | null;
};

export type GridPolarity = "positive" | "negative";
export type StormGridOutcome = "stabilized" | "misrouted" | "surge_timeout";

export type StormGridState = {
  kind: "storm_grid";
  rulesVersion: 1;
  seed: number;
  wave: number;
  totalWaves: 4 | 6 | 8;
  phase: "charging" | "discharge_window" | "wave_result";
  sensorSeat: Seat;
  nodeCount: 4 | 5 | 6;
  selectorNode: number;
  polarity: GridPolarity;
  targetNode: number;
  targetPolarity: GridPolarity;
  integrity: number;
  maxIntegrity: 2 | 3 | 4;
  stabilizedWaves: number;
  faults: number;
  totalAdjustments: number;
  score: number;
  chargeDurationMs: number;
  dischargeWindowMs: number;
  windowStartedAt: number;
  waveOutcome: StormGridOutcome | null;
  lastAccuracyMs: number | null;
  turnDeadline: number;
  result: CooperativeResult | null;
};

export type StormGridViewState = Omit<StormGridState, "targetNode" | "targetPolarity"> & {
  targetNode: number | null;
  targetPolarity: GridPolarity | null;
};

export type InterceptResponse = { lane: number; reactionMs: number; correct: boolean };
export type InterceptRoundOutcome = "captured" | "near_tie" | "missed" | "intercept_timeout";

export type TrajectoryInterceptState = {
  kind: "trajectory_intercept";
  rulesVersion: 1;
  seed: number;
  round: number;
  totalRounds: 5 | 7 | 9;
  phase: "signal" | "intercepting" | "round_result";
  laneCount: 5 | 7 | 9;
  targetLane: number | null;
  cursors: [number, number];
  responses: [InterceptResponse | null, InterceptResponse | null];
  locked: [boolean, boolean];
  scores: [number, number];
  roundWinner: Seat | null;
  roundOutcome: InterceptRoundOutcome | null;
  baseCountdownMs: number;
  countdownMs: number;
  interceptWindowMs: number;
  interceptStartedAt: number;
  lastActorSeat: Seat | null;
  turnDeadline: number;
  result: CompetitiveResult | null;
};

export type TrajectoryInterceptViewState = Omit<TrajectoryInterceptState, "cursors" | "responses"> & {
  cursors: [number | null, number | null];
  responses: [InterceptResponse | null, InterceptResponse | null];
};

export type StarTracePoint = { x: number; y: number };
export type StarTraceOutcome = "charted" | "ink_depleted" | "trace_timeout";

export type StarTraceState = {
  kind: "star_trace";
  rulesVersion: 1;
  seed: number;
  stage: number;
  totalStages: 2 | 3 | 4;
  phase: "tracing" | "stage_result";
  guideSeat: Seat;
  gridSize: 7 | 9 | 11;
  start: StarTracePoint;
  cursor: StarTracePoint;
  checkpoints: StarTracePoint[];
  checkpointCount: 3 | 4 | 5;
  currentTarget: number;
  trail: StarTracePoint[];
  ink: number;
  maxInk: number;
  moves: number;
  completedStages: number;
  score: number;
  stageDurationMs: number;
  lastOutcome: StarTraceOutcome | null;
  lastMove: MazeDirection | null;
  turnDeadline: number;
  result: CooperativeResult | null;
};

export type StarTraceViewState = Omit<StarTraceState, "checkpoints"> & {
  checkpoints: StarTracePoint[] | null;
};

export type MagnetHaulOutcome = "aligned" | "battery_depleted" | "haul_timeout";

export type MagnetHaulState = {
  kind: "magnet_haul";
  rulesVersion: 1;
  seed: number;
  checkpoint: number;
  totalCheckpoints: 4 | 6 | 8;
  phase: "moving" | "checkpoint_result";
  laneCount: 5 | 7 | 9;
  magnetPositions: [number, number];
  targetPositions: [number, number];
  tensionLimit: 1 | 2 | 3;
  battery: number;
  maxBattery: number;
  completedCheckpoints: number;
  moves: number;
  score: number;
  checkpointDurationMs: number;
  lastActorSeat: Seat | null;
  lastMove: { seat: Seat; from: number; to: number } | null;
  lastOutcome: MagnetHaulOutcome | null;
  turnDeadline: number;
  result: CooperativeResult | null;
};

export type LumenBridgeOutcome = "resonated" | "desynced" | "energy_depleted" | "bridge_timeout";

export type LumenBridgeState = {
  kind: "lumen_bridge";
  rulesVersion: 1;
  seed: number;
  stage: number;
  totalStages: 4 | 6 | 8;
  phase: "aligning" | "resonance" | "stage_result";
  originSeat: Seat;
  laneCount: 5 | 7 | 9;
  maxArc: 1 | 2 | 3;
  originLane: number;
  arcOffset: number;
  targetLane: number;
  energy: number;
  maxEnergy: number;
  stability: number;
  maxStability: 2 | 3 | 4;
  completedStages: number;
  totalAdjustments: number;
  score: number;
  stageDurationMs: number;
  resonanceWindowMs: number;
  stageDeadline: number;
  resonanceStartedAt: number;
  resonanceDeadline: number;
  confirmations: [boolean, boolean];
  lastActorSeat: Seat | null;
  lastOutcome: LumenBridgeOutcome | null;
  turnDeadline: number;
  result: CooperativeResult | null;
};

export const NEON_DASH_MOVES = ["jump", "slide", "dodge_left", "dodge_right", "brake"] as const;
export type NeonDashMove = (typeof NEON_DASH_MOVES)[number];
export const NEON_OBSTACLES = ["low_barrier", "high_arch", "right_wall", "left_wall", "pulse_field"] as const;
export type NeonObstacle = (typeof NEON_OBSTACLES)[number];
export type NeonDashResponse = { move: NeonDashMove; reactionMs: number; correct: boolean };
export type NeonDashOutcome = "clean_pass" | "photo_finish" | "single_clear" | "double_crash" | "dash_timeout";

export type NeonDashState = {
  kind: "neon_dash";
  rulesVersion: 1;
  seed: number;
  round: number;
  totalRounds: 5 | 7 | 9;
  phase: "countdown" | "reacting" | "round_result";
  availableMoves: NeonDashMove[];
  obstacle: NeonObstacle | null;
  signalStartedAt: number;
  responses: [NeonDashResponse | null, NeonDashResponse | null];
  locked: [boolean, boolean];
  scores: [number, number];
  lives: [number, number];
  maxLives: 2 | 3 | 4;
  combos: [number, number];
  bestCombos: [number, number];
  roundWinner: Seat | null;
  roundOutcome: NeonDashOutcome | null;
  baseCountdownMs: number;
  countdownMs: number;
  responseWindowMs: number;
  turnDeadline: number;
  result: CompetitiveResult | null;
};

export type NeonDashViewState = NeonDashState;

export const SIGNAL_RUNES = ["prism", "orbit", "wave", "crown", "spiral"] as const;
export type SignalRune = (typeof SIGNAL_RUNES)[number];
export type SignalVerdict = "trust" | "challenge";
export type SignalScanHint = "group_a" | "group_b";
export type SignalBluffOutcome =
  | "truth_trusted"
  | "truth_challenged"
  | "bluff_believed"
  | "bluff_exposed"
  | "claim_timeout"
  | "judge_timeout";

export type SignalBluffState = {
  kind: "signal_bluff";
  rulesVersion: 1;
  seed: number;
  round: number;
  totalRounds: 5 | 7 | 9;
  phase: "claiming" | "judging" | "round_result";
  senderSeat: Seat;
  signalCount: 3 | 4 | 5;
  availableSignals: SignalRune[];
  truthSignal: SignalRune;
  claimSignal: SignalRune | null;
  verdict: SignalVerdict | null;
  scanCharges: [number, number];
  scanned: boolean;
  scanHint: SignalScanHint | null;
  scores: [number, number];
  roundWinner: Seat | null;
  roundOutcome: SignalBluffOutcome | null;
  claimDurationMs: number;
  judgeDurationMs: number;
  turnDeadline: number;
  result: CompetitiveResult | null;
};

export type SignalBluffViewState = Omit<SignalBluffState, "truthSignal" | "scanHint"> & {
  truthSignal: SignalRune | null;
  scanHint: SignalScanHint | null;
};

export type PrismHeistOutcome = "clean_breach" | "laser_hit" | "sync_missed";

export type PrismHeistState = {
  kind: "prism_heist";
  rulesVersion: 1;
  seed: number;
  corridor: number;
  totalCorridors: 4 | 6 | 8;
  phase: "approach" | "breach" | "corridor_result";
  scoutSeat: Seat;
  laneCount: 3 | 4 | 5;
  safeLane: number;
  runnerLane: number;
  bypassLocked: boolean;
  dashLocked: boolean;
  integrity: number;
  maxIntegrity: 2 | 3 | 4;
  cleanBreaches: number;
  moves: number;
  totalSyncs: number;
  score: number;
  lastOutcome: PrismHeistOutcome | null;
  approachDurationMs: number;
  breachWindowMs: number;
  turnDeadline: number;
  result: CooperativeResult | null;
};

export type PrismHeistViewState = Omit<PrismHeistState, "safeLane"> & {
  safeLane: number | null;
};

export type NovaVolleyOutcome = "misaligned_return" | "return_timeout";

export type NovaVolleyState = {
  kind: "nova_volley";
  rulesVersion: 1;
  seed: number;
  phase: "approach" | "strike_window" | "point_result";
  receiverSeat: Seat;
  laneCount: 3 | 4 | 5;
  incomingLane: number;
  paddleLanes: [number, number];
  scores: [number, number];
  targetScore: 3 | 5 | 7;
  serveNumber: number;
  rallyCount: number;
  bestRally: number;
  successfulReturns: [number, number];
  totalMoves: [number, number];
  pointWinner: Seat | null;
  lastOutcome: NovaVolleyOutcome | null;
  baseFlightMs: number;
  currentFlightMs: number;
  strikeWindowMs: number;
  turnDeadline: number;
  result: CompetitiveResult | null;
};

export type PulsePower = 1 | 2 | 3;
export type PulseHeatBand = "stable" | "warm" | "critical";
export type PulsePassOutcome = "burst" | "holder_timeout";

export type PulsePassState = {
  kind: "pulse_pass";
  rulesVersion: 1;
  seed: number;
  round: number;
  totalRounds: 3 | 5 | 7;
  phase: "handling" | "round_result";
  firstHolderSeat: Seat;
  holderSeat: Seat;
  charge: number;
  burstAt: number;
  burstMin: number;
  burstMax: number;
  heatBand: PulseHeatBand;
  availablePowers: PulsePower[];
  ventCharges: [number, number];
  initialVentCharges: 0 | 1 | 2;
  scores: [number, number];
  passes: number;
  totalPasses: number;
  totalPower: [number, number];
  ventsUsed: [number, number];
  lastActor: Seat | null;
  lastPower: PulsePower | null;
  roundWinner: Seat | null;
  roundOutcome: PulsePassOutcome | null;
  turnDurationMs: number;
  turnDeadline: number;
  result: CompetitiveResult | null;
};

export type PulsePassViewState = Omit<PulsePassState, "burstAt"> & {
  burstAt: number | null;
};

export type DropBrakePower = 0 | 1 | 2 | 3;
export type DropRescueOutcome = "soft_landing" | "off_pad" | "hard_landing" | "double_fault" | "descent_timeout";

export type DropRescueState = {
  kind: "drop_rescue";
  rulesVersion: 1;
  seed: number;
  landing: number;
  totalLandings: 4 | 6 | 8;
  phase: "descent" | "landing_result";
  pilotSeat: Seat;
  laneCount: 5 | 7 | 9;
  podLane: number;
  targetLane: number;
  wind: number;
  descentSpeed: number;
  targetSpeed: 2 | 3;
  brakePower: DropBrakePower;
  locked: [boolean, boolean];
  hull: number;
  maxHull: 2 | 3 | 4;
  propellant: number;
  maxPropellant: number;
  softLandings: number;
  roughLandings: number;
  totalMoves: number;
  totalBrakeAdjustments: number;
  stageMoves: number;
  stageBrakeAdjustments: number;
  score: number;
  finalLane: number | null;
  finalSpeed: number | null;
  lastOutcome: DropRescueOutcome | null;
  descentDurationMs: number;
  turnDeadline: number;
  result: CooperativeResult | null;
};

export type DropRescueViewState = Omit<DropRescueState, "targetLane" | "wind" | "descentSpeed" | "targetSpeed"> & {
  targetLane: number | null;
  wind: number | null;
  descentSpeed: number | null;
  targetSpeed: 2 | 3 | null;
};

export const DUEL_MOVES = ["strike", "guard", "charge"] as const;
export type DuelMove = (typeof DUEL_MOVES)[number];
export type DuelRoundOutcome = "decisive" | "draw" | "choice_timeout" | "double_timeout";

export type QuantumDuelState = {
  kind: "quantum_duel";
  rulesVersion: 1;
  round: number;
  totalRounds: 3 | 5 | 7;
  phase: "choosing" | "round_result";
  choices: [DuelMove | null, DuelMove | null];
  locked: [boolean, boolean];
  roundWinner: Seat | null;
  roundOutcome: DuelRoundOutcome | null;
  scores: [number, number];
  chooseDurationMs: number;
  turnDeadline: number;
  result: CompetitiveResult | null;
};

export type QuantumDuelViewState = QuantumDuelState;

export type EscortLane = 0 | 1 | 2;
export type EscortOutcome = "energy_collected" | "safe_passage" | "shield_block" | "hull_hit";

export type StarwayEscortState = {
  kind: "starway_escort";
  rulesVersion: 1;
  seed: number;
  sector: number;
  totalSectors: 3 | 5 | 7;
  phase: "planning" | "sector_result";
  pilotSeat: Seat;
  energyLane: EscortLane;
  obstacleLane: EscortLane;
  routeChoice: EscortLane | null;
  shieldChoice: EscortLane | null;
  locked: [boolean, boolean];
  hull: number;
  maxHull: 2 | 3 | 4;
  cargo: number;
  sectorOutcome: EscortOutcome | null;
  sectorDurationMs: number;
  turnDeadline: number;
  result: CooperativeResult | null;
};

export type StarwayEscortViewState = Omit<
  StarwayEscortState,
  "energyLane" | "obstacleLane" | "routeChoice" | "shieldChoice"
> & {
  energyLane: EscortLane | null;
  obstacleLane: EscortLane | null;
  routeChoice: EscortLane | null;
  shieldChoice: EscortLane | null;
};

export type OrbitRing = 0 | 1 | 2;
export type OrbitDirection = "counterclockwise" | "clockwise";

export type OrbitalRepairState = {
  kind: "orbital_repair";
  rulesVersion: 1;
  seed: number;
  stage: number;
  totalStages: 3 | 5 | 7;
  phase: "aligning" | "stage_result";
  engineerSeat: Seat;
  ringCount: 2 | 3;
  slotCount: 4 | 6;
  currentSlots: [number, number, number];
  targetSlots: [number, number, number];
  stageRotations: number;
  totalRotations: number;
  launchAttempts: number;
  strikes: number;
  maxStrikes: 1 | 2 | 3;
  lastLaunchCorrect: boolean | null;
  stageDurationMs: number;
  turnDeadline: number;
  result: CooperativeResult | null;
};

export type OrbitalRepairViewState = Omit<OrbitalRepairState, "targetSlots"> & {
  targetSlots: [number, number, number] | null;
};

export type RhythmGravityState = {
  kind: "rhythm_gravity";
  rulesVersion: 1;
  round: number;
  totalRounds: 3 | 5 | 7;
  phase: "beat" | "round_result";
  beatAt: number;
  taps: [number | null, number | null];
  locked: [boolean, boolean];
  accuracies: [number | null, number | null];
  roundWinner: Seat | null;
  corePosition: number;
  pullLimit: 3;
  countdownMs: number;
  tapWindowMs: number;
  turnDeadline: number;
  result: CompetitiveResult | null;
};

export type RhythmGravityViewState = RhythmGravityState;

export type ShadowShufflePhase = "marking" | "memorizing" | "shuffling" | "guessing" | "round_result";
export type ShadowShuffleOutcome = "found" | "escaped" | "mark_timeout" | "guess_timeout";

export type ShadowShuttleState = {
  kind: "shadow_shuttle";
  rulesVersion: 1;
  seed: number;
  round: number;
  totalRounds: 3 | 5 | 7;
  phase: ShadowShufflePhase;
  infiltratorSeat: Seat;
  podCount: 4 | 5 | 6;
  targetPod: number | null;
  permutation: number[];
  shufflePlan: [number, number][];
  shuffleStep: number;
  guessSlot: number | null;
  roundWinner: Seat | null;
  roundOutcome: ShadowShuffleOutcome | null;
  scores: [number, number];
  markDurationMs: number;
  guessDurationMs: number;
  swapDurationMs: number;
  turnDeadline: number;
  result: CompetitiveResult | null;
};

export type ShadowShuttleViewState = Omit<ShadowShuttleState, "targetPod"> & {
  targetPod: number | null;
};

export type GameState =
  | EmberCrewState
  | GomokuState
  | ReversiState
  | SplitMazeState
  | SyncTapState
  | CoverHuntState
  | DefuseState
  | QuantumDuelState
  | StarwayEscortState
  | OrbitalRepairState
  | RhythmGravityState
  | ShadowShuttleState
  | EchoRelayState
  | CoreRallyState
  | SkylineRescueState
  | MeteorDashState
  | DualThrustersState
  | FogSonarState
  | StormGridState
  | TrajectoryInterceptState
  | StarTraceState
  | MagnetHaulState
  | LumenBridgeState
  | NeonDashState
  | SignalBluffState
  | PrismHeistState
  | NovaVolleyState
  | PulsePassState
  | DropRescueState;

export type GameViewState =
  | EmberCrewState
  | GomokuState
  | ReversiState
  | SplitMazeState
  | SyncTapState
  | CoverHuntViewState
  | DefuseViewState
  | QuantumDuelViewState
  | StarwayEscortViewState
  | OrbitalRepairViewState
  | RhythmGravityViewState
  | ShadowShuttleViewState
  | EchoRelayViewState
  | CoreRallyState
  | SkylineRescueViewState
  | MeteorDashViewState
  | DualThrustersViewState
  | FogSonarViewState
  | StormGridViewState
  | TrajectoryInterceptViewState
  | StarTraceViewState
  | MagnetHaulState
  | LumenBridgeState
  | NeonDashViewState
  | SignalBluffViewState
  | PrismHeistViewState
  | NovaVolleyState
  | PulsePassViewState
  | DropRescueViewState;

export type GameAction =
  | { kind: "ember_plan"; round: number; operation: EmberOperation; cell: number }
  | { kind: "ember_commit"; round: number }
  | { kind: "place_stone"; row: number; col: number }
  | { kind: "place_disc"; row: number; col: number }
  | { kind: "maze_move"; direction: MazeDirection }
  | { kind: "sync_tap" }
  | { kind: "cover_hide"; cover: number }
  | { kind: "cover_scan"; cover: number }
  | { kind: "cover_shoot"; cover: number }
  | { kind: "defuse_press"; symbol: DefuseSymbol }
  | { kind: "duel_choose"; move: DuelMove }
  | { kind: "escort_route"; lane: EscortLane }
  | { kind: "escort_shield"; lane: EscortLane }
  | { kind: "orbit_rotate"; ring: OrbitRing; direction: OrbitDirection }
  | { kind: "orbit_launch" }
  | { kind: "rhythm_gravity_tap" }
  | { kind: "shadow_mark"; pod: number }
  | { kind: "shadow_guess"; slot: number }
  | { kind: "echo_press"; tone: EchoTone }
  | { kind: "core_move"; direction: -1 | 1 }
  | { kind: "core_return" }
  | { kind: "rescue_aim"; zone: RescueZone }
  | { kind: "rescue_pressure"; pressure: RescuePressure }
  | { kind: "meteor_catch"; cell: number }
  | { kind: "thruster_burn"; power: ThrusterPower }
  | { kind: "sonar_ping"; direction: MazeDirection }
  | { kind: "fog_steer"; direction: MazeDirection }
  | { kind: "grid_shift"; direction: -1 | 1 }
  | { kind: "grid_toggle" }
  | { kind: "grid_discharge" }
  | { kind: "intercept_move"; direction: -1 | 1 }
  | { kind: "intercept_capture" }
  | { kind: "star_trace_move"; direction: MazeDirection }
  | { kind: "magnet_move"; direction: -1 | 1 }
  | { kind: "bridge_adjust"; direction: -1 | 1 }
  | { kind: "bridge_lock" }
  | { kind: "neon_dodge"; move: NeonDashMove }
  | { kind: "signal_claim"; signal: SignalRune }
  | { kind: "signal_scan" }
  | { kind: "signal_judge"; verdict: SignalVerdict }
  | { kind: "heist_move"; direction: -1 | 1 }
  | { kind: "heist_bypass" }
  | { kind: "heist_dash" }
  | { kind: "volley_move"; direction: -1 | 1 }
  | { kind: "volley_strike"; lane: number }
  | { kind: "pulse_charge"; power: PulsePower }
  | { kind: "pulse_vent" }
  | { kind: "drop_move"; direction: -1 | 1 }
  | { kind: "drop_brake"; direction: -1 | 1 }
  | { kind: "drop_lock" };

export type GameActionError =
  | "game_finished"
  | "not_your_turn"
  | "invalid_position"
  | "cell_occupied"
  | "illegal_move"
  | "wrong_control"
  | "already_tapped"
  | "already_chosen"
  | "too_early"
  | "wrong_phase"
  | "wrong_role"
  | "no_scans_left"
  | "cover_out_of_range"
  | "invalid_symbol"
  | "invalid_move"
  | "invalid_lane"
  | "invalid_ring"
  | "invalid_pod"
  | "paddle_edge"
  | "tracker_edge"
  | "tension_limit"
  | "invalid_pressure"
  | "insufficient_water"
  | "invalid_cell"
  | "invalid_power"
  | "no_pulses_left"
  | "no_vents_left"
  | "pod_edge"
  | "brake_limit"
  | "no_propellant"
  | "wrong_game_action"
  | "turn_expired";

export type GameActionResult =
  | { ok: true; state: GameState }
  | { ok: false; reason: GameActionError };

export type PlaceStoneError = Extract<
  GameActionError,
  "game_finished" | "not_your_turn" | "invalid_position" | "cell_occupied" | "turn_expired"
>;

export type PlaceStoneResult =
  | { ok: true; state: GomokuState }
  | { ok: false; reason: PlaceStoneError };

export function otherSeat(seat: Seat): Seat {
  return seat === 0 ? 1 : 0;
}
