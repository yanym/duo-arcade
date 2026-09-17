import { advanceEmberCrewClock, commitEmberAction, createEmberCrewState, planEmberAction } from "./ember-crew";
import {
  advanceCoverHuntClock,
  createCoverHuntState,
  getCoverHuntView,
  hideBehindCover,
  scanCover,
  shootCover,
} from "./cover-hunt";
import { createDefuseState, expireDefuse, getDefuseView, pressDefuseSymbol } from "./defuse";
import {
  advanceCoreRallyClock,
  createCoreRallyState,
  moveCorePaddle,
  returnCoreRally,
} from "./core-rally";
import {
  advanceEchoRelayClock,
  createEchoRelayState,
  getEchoRelayView,
  pressEchoTone,
} from "./echo-relay";
import {
  advanceDualThrustersClock,
  chooseThrusterPower,
  createDualThrustersState,
  getDualThrustersView,
} from "./dual-thrusters";
import {
  advanceFogSonarClock,
  createFogSonarState,
  getFogSonarView,
  sendSonarPing,
  steerFogVessel,
} from "./fog-sonar";
import { createGomokuState, getSeatPiece, placeStone } from "./gomoku";
import { createSplitMazeState, moveInMaze } from "./maze";
import {
  advanceMeteorDashClock,
  catchMeteor,
  createMeteorDashState,
  getMeteorDashView,
} from "./meteor-dash";
import {
  advanceOrbitalRepairClock,
  createOrbitalRepairState,
  getOrbitalRepairView,
  launchRepairPulse,
  rotateOrbitRing,
} from "./orbital-repair";
import { roundsForLength, turnDurationForPace } from "./options";
import {
  advanceQuantumDuelClock,
  chooseDuelMove,
  createQuantumDuelState,
  getQuantumDuelView,
} from "./quantum-duel";
import { createReversiState, placeDisc } from "./reversi";
import {
  advanceRhythmGravityClock,
  createRhythmGravityState,
  getRhythmGravityView,
  tapRhythmGravity,
} from "./rhythm-gravity";
import { createSyncTapState, tapInSync } from "./sync-tap";
import {
  advanceSkylineRescueClock,
  chooseRescueAim,
  chooseRescuePressure,
  createSkylineRescueState,
  getSkylineRescueView,
} from "./skyline-rescue";
import {
  advanceShadowShuttleClock,
  createShadowShuttleState,
  getShadowShuttleView,
  guessShadowPod,
  markShadowPod,
} from "./shadow-shuttle";
import {
  advanceStarwayEscortClock,
  chooseEscortRoute,
  chooseEscortShield,
  createStarwayEscortState,
  getStarwayEscortView,
} from "./starway-escort";
import {
  advanceStormGridClock,
  createStormGridState,
  dischargeStormGrid,
  getStormGridView,
  shiftGridSelector,
  toggleGridPolarity,
} from "./storm-grid";
import {
  advanceTrajectoryInterceptClock,
  captureTrajectory,
  createTrajectoryInterceptState,
  getTrajectoryInterceptView,
  moveInterceptCursor,
} from "./trajectory-intercept";
import {
  advanceStarTraceClock,
  createStarTraceState,
  getStarTraceView,
  moveStarTrace,
} from "./star-trace";
import {
  advanceMagnetHaulClock,
  createMagnetHaulState,
  moveMagnet,
} from "./magnet-haul";
import {
  adjustLumenBridge,
  advanceLumenBridgeClock,
  createLumenBridgeState,
  lockLumenBridge,
} from "./lumen-bridge";
import {
  advanceNeonDashClock,
  createNeonDashState,
  dodgeNeonObstacle,
  getNeonDashView,
} from "./neon-dash";
import {
  advanceSignalBluffClock,
  claimSignal,
  createSignalBluffState,
  getSignalBluffView,
  judgeSignal,
  scanSignal,
} from "./signal-bluff";
import {
  advancePrismHeistClock,
  bypassHeistGrid,
  createPrismHeistState,
  dashThroughHeist,
  getPrismHeistView,
  moveHeistRunner,
} from "./prism-heist";
import {
  advanceNovaVolleyClock,
  createNovaVolleyState,
  moveNovaPaddle,
  strikeNovaBall,
} from "./nova-volley";
import {
  advancePulsePassClock,
  chargePulseCore,
  createPulsePassState,
  getPulsePassView,
  ventPulseCore,
} from "./pulse-pass";
import {
  adjustDropBrake,
  advanceDropRescueClock,
  createDropRescueState,
  getDropRescueView,
  lockDropControl,
  moveDropPod,
} from "./drop-rescue";
import {
  DEFAULT_GAME_OPTIONS,
  GAME_IDS,
  otherSeat,
  type CompetitiveResult,
  type GameAction,
  type GameActionResult,
  type GameId,
  type GameOptions,
  type GameState,
  type GameViewState,
  type Seat,
} from "./types";

export function isGameId(value: unknown): value is GameId {
  return typeof value === "string" && (GAME_IDS as readonly string[]).includes(value);
}

export function createGameState(
  gameId: GameId,
  startingSeat: Seat,
  now: number,
  seed: number,
  options: GameOptions = DEFAULT_GAME_OPTIONS,
): GameState {
  const turnDurationMs = turnDurationForPace(options.pace);
  switch (gameId) {
    case "ember_crew": return createEmberCrewState(now, seed, options);
    case "gomoku": return createGomokuState(startingSeat, now, turnDurationMs);
    case "reversi": return createReversiState(startingSeat, now, turnDurationMs);
    case "split_maze": {
      const size = { easy: 7, standard: 9, hard: 11 }[options.difficulty];
      const durationMs = { relaxed: 105_000, standard: 75_000, blitz: 55_000 }[options.pace];
      return createSplitMazeState(startingSeat, now, seed, durationMs, size);
    }
    case "sync_tap": {
      const countdownMs = { relaxed: 3_500, standard: 2_500, blitz: 1_800 }[options.pace];
      const tapWindowMs = { easy: 10_000, standard: 8_000, hard: 5_000 }[options.difficulty];
      return createSyncTapState(now, roundsForLength(options.length), countdownMs, tapWindowMs);
    }
    case "cover_hunt": return createCoverHuntState(startingSeat, now, options);
    case "starship_defuse": return createDefuseState(startingSeat, now, seed, options);
    case "quantum_duel": return createQuantumDuelState(now, options);
    case "starway_escort": return createStarwayEscortState(startingSeat, now, seed, options);
    case "orbital_repair": return createOrbitalRepairState(startingSeat, now, seed, options);
    case "rhythm_gravity": return createRhythmGravityState(now, options);
    case "shadow_shuttle": return createShadowShuttleState(startingSeat, now, seed, options);
    case "echo_relay": return createEchoRelayState(startingSeat, now, seed, options);
    case "core_rally": return createCoreRallyState(startingSeat, now, seed, options);
    case "skyline_rescue": return createSkylineRescueState(startingSeat, now, seed, options);
    case "meteor_dash": return createMeteorDashState(now, seed, options);
    case "dual_thrusters": return createDualThrustersState(now, seed, options);
    case "fog_sonar": return createFogSonarState(startingSeat, now, seed, options);
    case "storm_grid": return createStormGridState(startingSeat, now, seed, options);
    case "trajectory_intercept": return createTrajectoryInterceptState(now, seed, options);
    case "star_trace": return createStarTraceState(startingSeat, now, seed, options);
    case "magnet_haul": return createMagnetHaulState(now, seed, options);
    case "lumen_bridge": return createLumenBridgeState(startingSeat, now, seed, options);
    case "neon_dash": return createNeonDashState(now, seed, options);
    case "signal_bluff": return createSignalBluffState(startingSeat, now, seed, options);
    case "prism_heist": return createPrismHeistState(startingSeat, now, seed, options);
    case "nova_volley": return createNovaVolleyState(startingSeat, now, seed, options);
    case "pulse_pass": return createPulsePassState(startingSeat, now, seed, options);
    case "drop_rescue": return createDropRescueState(startingSeat, now, seed, options);
  }
}

export function applyGameAction(
  state: GameState,
  actor: Seat,
  action: GameAction,
  now: number,
): GameActionResult {
  if (state.kind === "ember_crew" && action.kind === "ember_plan") {
    return planEmberAction(state, actor, action.round, action, now);
  }
  if (state.kind === "ember_crew" && action.kind === "ember_commit") {
    return commitEmberAction(state, actor, action.round, now);
  }
  if (state.kind === "gomoku" && action.kind === "place_stone") {
    return placeStone(state, actor, action.row, action.col, now);
  }
  if (state.kind === "reversi" && action.kind === "place_disc") {
    return placeDisc(state, actor, action.row, action.col, now);
  }
  if (state.kind === "split_maze" && action.kind === "maze_move") {
    return moveInMaze(state, actor, action.direction, now);
  }
  if (state.kind === "sync_tap" && action.kind === "sync_tap") {
    return tapInSync(state, actor, now);
  }
  if (state.kind === "cover_hunt" && action.kind === "cover_hide") {
    return hideBehindCover(state, actor, action.cover, now);
  }
  if (state.kind === "cover_hunt" && action.kind === "cover_scan") {
    return scanCover(state, actor, action.cover, now);
  }
  if (state.kind === "cover_hunt" && action.kind === "cover_shoot") {
    return shootCover(state, actor, action.cover, now);
  }
  if (state.kind === "starship_defuse" && action.kind === "defuse_press") {
    return pressDefuseSymbol(state, actor, action.symbol, now);
  }
  if (state.kind === "quantum_duel" && action.kind === "duel_choose") {
    return chooseDuelMove(state, actor, action.move, now);
  }
  if (state.kind === "starway_escort" && action.kind === "escort_route") {
    return chooseEscortRoute(state, actor, action.lane, now);
  }
  if (state.kind === "starway_escort" && action.kind === "escort_shield") {
    return chooseEscortShield(state, actor, action.lane, now);
  }
  if (state.kind === "orbital_repair" && action.kind === "orbit_rotate") {
    return rotateOrbitRing(state, actor, action.ring, action.direction, now);
  }
  if (state.kind === "orbital_repair" && action.kind === "orbit_launch") {
    return launchRepairPulse(state, actor, now);
  }
  if (state.kind === "rhythm_gravity" && action.kind === "rhythm_gravity_tap") {
    return tapRhythmGravity(state, actor, now);
  }
  if (state.kind === "shadow_shuttle" && action.kind === "shadow_mark") {
    return markShadowPod(state, actor, action.pod, now);
  }
  if (state.kind === "shadow_shuttle" && action.kind === "shadow_guess") {
    return guessShadowPod(state, actor, action.slot, now);
  }
  if (state.kind === "echo_relay" && action.kind === "echo_press") {
    return pressEchoTone(state, actor, action.tone, now);
  }
  if (state.kind === "core_rally" && action.kind === "core_move") {
    return moveCorePaddle(state, actor, action.direction, now);
  }
  if (state.kind === "core_rally" && action.kind === "core_return") {
    return returnCoreRally(state, actor, now);
  }
  if (state.kind === "skyline_rescue" && action.kind === "rescue_aim") {
    return chooseRescueAim(state, actor, action.zone, now);
  }
  if (state.kind === "skyline_rescue" && action.kind === "rescue_pressure") {
    return chooseRescuePressure(state, actor, action.pressure, now);
  }
  if (state.kind === "meteor_dash" && action.kind === "meteor_catch") {
    return catchMeteor(state, actor, action.cell, now);
  }
  if (state.kind === "dual_thrusters" && action.kind === "thruster_burn") {
    return chooseThrusterPower(state, actor, action.power, now);
  }
  if (state.kind === "fog_sonar" && action.kind === "sonar_ping") {
    return sendSonarPing(state, actor, action.direction, now);
  }
  if (state.kind === "fog_sonar" && action.kind === "fog_steer") {
    return steerFogVessel(state, actor, action.direction, now);
  }
  if (state.kind === "storm_grid" && action.kind === "grid_shift") {
    return shiftGridSelector(state, actor, action.direction, now);
  }
  if (state.kind === "storm_grid" && action.kind === "grid_toggle") {
    return toggleGridPolarity(state, actor, now);
  }
  if (state.kind === "storm_grid" && action.kind === "grid_discharge") {
    return dischargeStormGrid(state, actor, now);
  }
  if (state.kind === "trajectory_intercept" && action.kind === "intercept_move") {
    return moveInterceptCursor(state, actor, action.direction, now);
  }
  if (state.kind === "trajectory_intercept" && action.kind === "intercept_capture") {
    return captureTrajectory(state, actor, now);
  }
  if (state.kind === "star_trace" && action.kind === "star_trace_move") {
    return moveStarTrace(state, actor, action.direction, now);
  }
  if (state.kind === "magnet_haul" && action.kind === "magnet_move") {
    return moveMagnet(state, actor, action.direction, now);
  }
  if (state.kind === "lumen_bridge" && action.kind === "bridge_adjust") {
    return adjustLumenBridge(state, actor, action.direction, now);
  }
  if (state.kind === "lumen_bridge" && action.kind === "bridge_lock") {
    return lockLumenBridge(state, actor, now);
  }
  if (state.kind === "neon_dash" && action.kind === "neon_dodge") {
    return dodgeNeonObstacle(state, actor, action.move, now);
  }
  if (state.kind === "signal_bluff" && action.kind === "signal_claim") {
    return claimSignal(state, actor, action.signal, now);
  }
  if (state.kind === "signal_bluff" && action.kind === "signal_scan") {
    return scanSignal(state, actor, now);
  }
  if (state.kind === "signal_bluff" && action.kind === "signal_judge") {
    return judgeSignal(state, actor, action.verdict, now);
  }
  if (state.kind === "prism_heist" && action.kind === "heist_move") {
    return moveHeistRunner(state, actor, action.direction, now);
  }
  if (state.kind === "prism_heist" && action.kind === "heist_bypass") {
    return bypassHeistGrid(state, actor, now);
  }
  if (state.kind === "prism_heist" && action.kind === "heist_dash") {
    return dashThroughHeist(state, actor, now);
  }
  if (state.kind === "nova_volley" && action.kind === "volley_move") {
    return moveNovaPaddle(state, actor, action.direction, now);
  }
  if (state.kind === "nova_volley" && action.kind === "volley_strike") {
    return strikeNovaBall(state, actor, action.lane, now);
  }
  if (state.kind === "pulse_pass" && action.kind === "pulse_charge") {
    return chargePulseCore(state, actor, action.power, now);
  }
  if (state.kind === "pulse_pass" && action.kind === "pulse_vent") {
    return ventPulseCore(state, actor, now);
  }
  if (state.kind === "drop_rescue" && action.kind === "drop_move") {
    return moveDropPod(state, actor, action.direction, now);
  }
  if (state.kind === "drop_rescue" && action.kind === "drop_brake") {
    return adjustDropBrake(state, actor, action.direction, now);
  }
  if (state.kind === "drop_rescue" && action.kind === "drop_lock") {
    return lockDropControl(state, actor, now);
  }
  return { ok: false, reason: "wrong_game_action" };
}

export function getGameSeatMarker(state: GameState, seat: Seat): 1 | 2 {
  return state.kind === "gomoku" || state.kind === "reversi"
    ? getSeatPiece(state, seat)
    : seat === 0
      ? 1
      : 2;
}

export function getGameRoleLabel(state: GameState, seat: Seat): string {
  if (state.kind === "ember_crew") return seat === 0 ? "一号救援员" : "二号救援员";
  if (state.kind === "gomoku" || state.kind === "reversi") {
    return getSeatPiece(state, seat) === 1 ? "黑方" : "白方";
  }
  if (state.kind === "split_maze") {
    return seat === state.verticalSeat ? "控制上下" : "控制左右";
  }
  if (state.kind === "cover_hunt") {
    return seat === state.hunterSeat ? "猎手" : "潜行者";
  }
  if (state.kind === "starship_defuse") {
    return seat === state.operatorSeat ? "控制台操作员" : "维修分析员";
  }
  if (state.kind === "quantum_duel") {
    return seat === 0 ? "靛虎机甲" : "珊瑚机甲";
  }
  if (state.kind === "starway_escort") {
    return seat === state.pilotSeat ? "星舰驾驶员" : "护盾领航员";
  }
  if (state.kind === "orbital_repair") {
    return seat === state.engineerSeat ? "轨道工程师" : "能量发射员";
  }
  if (state.kind === "rhythm_gravity") {
    return seat === 0 ? "靛蓝引力手" : "珊瑚引力手";
  }
  if (state.kind === "shadow_shuttle") {
    return seat === state.infiltratorSeat ? "幻影引航员" : "追踪观察员";
  }
  if (state.kind === "echo_relay") {
    return seat === state.decoderSeat ? "回声译码员" : "信号复现员";
  }
  if (state.kind === "core_rally") {
    return seat === state.receiverSeat ? "星核接球手" : "接力预备员";
  }
  if (state.kind === "skyline_rescue") {
    return seat === state.pumpSeat ? "云塔泵站员" : "高空引导员";
  }
  if (state.kind === "meteor_dash") {
    return seat === 0 ? "靛蓝捕手" : "珊瑚捕手";
  }
  if (state.kind === "dual_thrusters") {
    return seat === 0 ? "左舷推进手" : "右舷推进手";
  }
  if (state.kind === "fog_sonar") {
    return seat === state.sonarSeat ? "声呐领航员" : "雾航舵手";
  }
  if (state.kind === "storm_grid") {
    return seat === state.sensorSeat ? "风暴观测员" : "电网调度员";
  }
  if (state.kind === "trajectory_intercept") {
    return seat === 0 ? "靛蓝截获手" : "珊瑚截获手";
  }
  if (state.kind === "star_trace") {
    return seat === state.guideSeat ? "星图引导员" : "盲绘操笔员";
  }
  if (state.kind === "magnet_haul") {
    return seat === 0 ? "左侧磁臂手" : "右侧磁臂手";
  }
  if (state.kind === "lumen_bridge") {
    return seat === state.originSeat ? "光桥升降员" : "星弧调制员";
  }
  if (state.kind === "neon_dash") {
    return seat === 0 ? "靛蓝跑者" : "珊瑚跑者";
  }
  if (state.kind === "signal_bluff") {
    return seat === state.senderSeat ? "星港发报员" : "密令审查员";
  }
  if (state.kind === "prism_heist") {
    return seat === state.scoutSeat ? "光栅侦察员" : "潜入舱驾驶员";
  }
  if (state.kind === "nova_volley") {
    return seat === state.receiverSeat ? "星弧接球手" : "落点防守员";
  }
  if (state.kind === "pulse_pass") {
    return seat === state.holderSeat ? "脉冲持有者" : "接传观察员";
  }
  if (state.kind === "drop_rescue") {
    return seat === state.pilotSeat ? "着陆领航员" : "反推制动员";
  }
  return seat === 0 ? "紫色拍档" : "珊瑚拍档";
}

export function advanceGameClock<T extends GameState>(state: T, now: number): T {
  if (state.result || now < state.turnDeadline) return state;
  if (state.kind === "ember_crew") return advanceEmberCrewClock(state, now) as T;
  if (state.kind === "cover_hunt") {
    return advanceCoverHuntClock(state, now) as T;
  }
  if (state.kind === "starship_defuse") {
    return expireDefuse(state, now) as T;
  }
  if (state.kind === "quantum_duel") {
    return advanceQuantumDuelClock(state, now) as T;
  }
  if (state.kind === "starway_escort") {
    return advanceStarwayEscortClock(state, now) as T;
  }
  if (state.kind === "orbital_repair") {
    return advanceOrbitalRepairClock(state, now) as T;
  }
  if (state.kind === "rhythm_gravity") {
    return advanceRhythmGravityClock(state, now) as T;
  }
  if (state.kind === "shadow_shuttle") {
    return advanceShadowShuttleClock(state, now) as T;
  }
  if (state.kind === "echo_relay") {
    return advanceEchoRelayClock(state, now) as T;
  }
  if (state.kind === "core_rally") {
    return advanceCoreRallyClock(state, now) as T;
  }
  if (state.kind === "skyline_rescue") {
    return advanceSkylineRescueClock(state, now) as T;
  }
  if (state.kind === "meteor_dash") {
    return advanceMeteorDashClock(state, now) as T;
  }
  if (state.kind === "dual_thrusters") {
    return advanceDualThrustersClock(state, now) as T;
  }
  if (state.kind === "fog_sonar") {
    return advanceFogSonarClock(state, now) as T;
  }
  if (state.kind === "storm_grid") {
    return advanceStormGridClock(state, now) as T;
  }
  if (state.kind === "trajectory_intercept") {
    return advanceTrajectoryInterceptClock(state, now) as T;
  }
  if (state.kind === "star_trace") {
    return advanceStarTraceClock(state, now) as T;
  }
  if (state.kind === "magnet_haul") {
    return advanceMagnetHaulClock(state, now) as T;
  }
  if (state.kind === "lumen_bridge") {
    return advanceLumenBridgeClock(state, now) as T;
  }
  if (state.kind === "neon_dash") {
    return advanceNeonDashClock(state, now) as T;
  }
  if (state.kind === "signal_bluff") {
    return advanceSignalBluffClock(state, now) as T;
  }
  if (state.kind === "prism_heist") {
    return advancePrismHeistClock(state, now) as T;
  }
  if (state.kind === "nova_volley") {
    return advanceNovaVolleyClock(state, now) as T;
  }
  if (state.kind === "pulse_pass") {
    return advancePulsePassClock(state, now) as T;
  }
  if (state.kind === "drop_rescue") {
    return advanceDropRescueClock(state, now) as T;
  }
  if (state.kind === "gomoku" || state.kind === "reversi") {
    return {
      ...state,
      result: { kind: "win", winnerSeat: otherSeat(state.currentSeat), reason: "timeout" },
    } as T;
  }
  const score = state.kind === "sync_tap" && state.roundScores.length > 0
    ? Math.round(state.roundScores.reduce((sum, value) => sum + value, 0) / state.roundScores.length)
    : 0;
  return { ...state, result: { kind: "failure", score, reason: "timeout" } } as T;
}

export const finishByTimeout = advanceGameClock;

function isCompetitive(state: GameState): boolean {
  return state.kind === "gomoku" || state.kind === "reversi" || state.kind === "cover_hunt" || state.kind === "quantum_duel" || state.kind === "rhythm_gravity" || state.kind === "shadow_shuttle" || state.kind === "meteor_dash" || state.kind === "trajectory_intercept" || state.kind === "neon_dash" || state.kind === "signal_bluff" || state.kind === "nova_volley" || state.kind === "pulse_pass";
}

export function resignGame<T extends GameState>(state: T, actor: Seat): T {
  if (state.result) return state;
  if (isCompetitive(state)) {
    return { ...state, result: { kind: "win", winnerSeat: otherSeat(actor), reason: "resigned" } } as T;
  }
  return { ...state, result: { kind: "failure", score: 0, reason: "abandoned" } } as T;
}

export function finishByDeparture<T extends GameState>(state: T, departedSeats: Seat[]): T {
  if (state.result) return state;
  const bothLeft = departedSeats.length >= 2;
  if (isCompetitive(state)) {
    const result: CompetitiveResult = bothLeft
      ? { kind: "draw", reason: "both_left" }
      : { kind: "win", winnerSeat: otherSeat(departedSeats[0]!), reason: "opponent_left" };
    return { ...state, result } as T;
  }
  return {
    ...state,
    result: { kind: "failure", score: 0, reason: bothLeft ? "both_left" : "player_left" },
  } as T;
}

export function shiftGameClock<T extends GameState>(state: T, nextDeadline: number): T {
  const shift = nextDeadline - state.turnDeadline;
  if (state.kind === "sync_tap") {
    return { ...state, goAt: state.goAt + shift, turnDeadline: nextDeadline } as T;
  }
  if (state.kind === "split_maze") {
    return { ...state, startedAt: state.startedAt + shift, turnDeadline: nextDeadline } as T;
  }
  if (state.kind === "rhythm_gravity") {
    return { ...state, beatAt: state.beatAt + shift, turnDeadline: nextDeadline } as T;
  }
  if (state.kind === "core_rally") {
    return {
      ...state,
      strikeAt: state.strikeAt === 0 ? 0 : state.strikeAt + shift,
      turnDeadline: nextDeadline,
    } as T;
  }
  if (state.kind === "meteor_dash") {
    return {
      ...state,
      catchStartedAt: state.catchStartedAt === 0 ? 0 : state.catchStartedAt + shift,
      turnDeadline: nextDeadline,
    } as T;
  }
  if (state.kind === "trajectory_intercept") {
    return {
      ...state,
      interceptStartedAt: state.interceptStartedAt === 0 ? 0 : state.interceptStartedAt + shift,
      turnDeadline: nextDeadline,
    } as T;
  }
  if (state.kind === "lumen_bridge") {
    return {
      ...state,
      stageDeadline: state.stageDeadline + shift,
      resonanceStartedAt: state.resonanceStartedAt === 0 ? 0 : state.resonanceStartedAt + shift,
      resonanceDeadline: state.resonanceDeadline === 0 ? 0 : state.resonanceDeadline + shift,
      turnDeadline: nextDeadline,
    } as T;
  }
  if (state.kind === "neon_dash") {
    return {
      ...state,
      signalStartedAt: state.signalStartedAt === 0 ? 0 : state.signalStartedAt + shift,
      turnDeadline: nextDeadline,
    } as T;
  }
  return { ...state, turnDeadline: nextDeadline } as T;
}

function getUnsanitizedGameView(state: GameState, viewerSeat: Seat | null): GameViewState {
  if (state.kind === "cover_hunt") return getCoverHuntView(state, viewerSeat);
  if (state.kind === "starship_defuse") return getDefuseView(state, viewerSeat);
  if (state.kind === "quantum_duel") return getQuantumDuelView(state, viewerSeat);
  if (state.kind === "starway_escort") return getStarwayEscortView(state, viewerSeat);
  if (state.kind === "orbital_repair") return getOrbitalRepairView(state, viewerSeat);
  if (state.kind === "rhythm_gravity") return getRhythmGravityView(state, viewerSeat);
  if (state.kind === "shadow_shuttle") return getShadowShuttleView(state, viewerSeat);
  if (state.kind === "echo_relay") return getEchoRelayView(state, viewerSeat);
  if (state.kind === "skyline_rescue") return getSkylineRescueView(state, viewerSeat);
  if (state.kind === "meteor_dash") return getMeteorDashView(state, viewerSeat);
  if (state.kind === "dual_thrusters") return getDualThrustersView(state, viewerSeat);
  if (state.kind === "fog_sonar") return getFogSonarView(state, viewerSeat);
  if (state.kind === "storm_grid") return getStormGridView(state, viewerSeat);
  if (state.kind === "trajectory_intercept") return getTrajectoryInterceptView(state, viewerSeat);
  if (state.kind === "star_trace") return getStarTraceView(state, viewerSeat);
  if (state.kind === "neon_dash") return getNeonDashView(state, viewerSeat);
  if (state.kind === "signal_bluff") return getSignalBluffView(state, viewerSeat);
  if (state.kind === "prism_heist") return getPrismHeistView(state, viewerSeat);
  if (state.kind === "pulse_pass") return getPulsePassView(state);
  if (state.kind === "drop_rescue") return getDropRescueView(state, viewerSeat);
  return state;
}

export function getGameView(state: GameState, viewerSeat: Seat | null): GameViewState {
  const view = getUnsanitizedGameView(state, viewerSeat);
  // A hidden answer is not private if its deterministic generator seed is public.
  // Preserve the wire shape for installed clients, but never reveal a future-round seed.
  return "seed" in view ? { ...view, seed: 0 } : view;
}
