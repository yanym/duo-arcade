import { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, ActivityIndicator, Keyboard, Platform, Share, StyleSheet, View, useWindowDimensions, type ScrollView } from "react-native";
import { Text, TextInput } from "@/components/ScaledText";
import * as Clipboard from "expo-clipboard";
import { router, Stack, useLocalSearchParams, useNavigation } from "expo-router";

import { isPlayableGameId, type GameAction, type GameResult, type GameViewState, type Seat } from "@duo/game-core";
import type { ReactionId, RoomPhase, RoomView } from "@duo/protocol";

import { Brand } from "@/components/Brand";
import { Button } from "@/components/Button";
import { ConfirmSheet } from "@/components/ConfirmSheet";
import { CoverHuntGame } from "@/components/CoverHuntGame";
import { CoreRallyGame } from "@/components/CoreRallyGame";
import { DualThrustersGame } from "@/components/DualThrustersGame";
import { DropRescueGame } from "@/components/DropRescueGame";
import { EmberCrewGame } from "@/components/EmberCrewGame";
import { useNow } from "@/hooks/useNow";
import { EchoRelayGame } from "@/components/EchoRelayGame";
import { FogSonarGame } from "@/components/FogSonarGame";
import { GomokuBoard } from "@/components/GomokuBoard";
import { MazeBoard } from "@/components/MazeBoard";
import { MagnetHaulGame } from "@/components/MagnetHaulGame";
import { LumenBridgeGame } from "@/components/LumenBridgeGame";
import { MeteorDashGame } from "@/components/MeteorDashGame";
import { NeonDashGame } from "@/components/NeonDashGame";
import { NovaVolleyGame } from "@/components/NovaVolleyGame";
import { OrbitalRepairGame } from "@/components/OrbitalRepairGame";
import { PlayerPill } from "@/components/PlayerPill";
import { PrismHeistGame } from "@/components/PrismHeistGame";
import { PulsePassGame } from "@/components/PulsePassGame";
import { QuantumDuelGame } from "@/components/QuantumDuelGame";
import { ReversiBoard } from "@/components/ReversiBoard";
import { RhythmGravityGame } from "@/components/RhythmGravityGame";
import { Screen } from "@/components/Screen";
import { SignalBluffGame } from "@/components/SignalBluffGame";
import { ShadowShuttleGame } from "@/components/ShadowShuttleGame";
import { SkylineRescueGame } from "@/components/SkylineRescueGame";
import { StarshipDefuseGame } from "@/components/StarshipDefuseGame";
import { StarwayEscortGame } from "@/components/StarwayEscortGame";
import { StarTraceGame } from "@/components/StarTraceGame";
import { StormGridGame } from "@/components/StormGridGame";
import { SyncTapGame } from "@/components/SyncTapGame";
import { TrajectoryInterceptGame } from "@/components/TrajectoryInterceptGame";
import { TutorialOverlay } from "@/components/TutorialOverlay";
import { useRoom } from "@/hooks/useRoom";
import { useWebDocumentTitle } from "@/hooks/useWebDocumentTitle";
import { useI18n } from "@/i18n";
import { API_BASE_URL } from "@/lib/api";
import { phaseHint } from "@/lib/phaseHint";
import { getConfiguredGameInfo, getRoomOptionsCopy } from "@/lib/games";
import { isCompetitive, isSeatActive, isTimedActionExpired } from "@/lib/playerActivity";
import { hasSeenTutorial, markTutorialSeen } from "@/lib/tutorial";
import { successResultCopy, winResultCopy } from "@/lib/winResultCopy";
import { localizeGeneratedNickname } from "@/lib/session";
import { useSettings } from "@/settings/SettingsContext";
import { colors, radii, shadows } from "@/theme";

const reactionEmoji: Record<ReactionId, string> = {
  wave: "👋",
  wow: "😮",
  clap: "👏",
  gg: "🤝",
};

const reactionName: Record<ReactionId, string> = {
  wave: "挥手",
  wow: "惊叹",
  clap: "鼓掌",
  gg: "友好握手",
};

const FAST_CLOCK_GAMES = new Set<GameViewState["kind"]>([
  "sync_tap", "rhythm_gravity", "core_rally", "meteor_dash", "neon_dash", "signal_bluff",
  "prism_heist", "nova_volley", "pulse_pass", "drop_rescue", "lumen_bridge",
]);
const ROOM_CODE_PATTERN = /^[2-9A-HJ-NP-Z]{6}$/;

function DeadlineTimer({ deadline, reconnecting }: { deadline: number; reconnecting: boolean }) {
  const { t } = useI18n();
  // A new deadline must refresh before paint, not reuse the previous 500ms tick.
  const now = useNow(true, 500, deadline);
  const secondsLeft = Math.max(0, Math.ceil((deadline - now) / 1_000));
  const urgent = secondsLeft <= 8;
  return (
    <View accessibilityLabel={t(reconnecting ? `还有 ${secondsLeft} 秒可以恢复对局` : `本回合剩余 ${secondsLeft} 秒`)} style={[styles.timer, urgent && styles.timerDanger]}>
      <Text style={[styles.timerNumber, urgent && styles.timerDangerText]}>{secondsLeft}</Text>
      <Text style={[styles.timerUnit, urgent && styles.timerDangerText]}>{reconnecting ? "秒可恢复" : "秒"}</Text>
    </View>
  );
}

function phaseCopy(room: RoomView, ownSeat: Seat, now: number): string {
  if (room.phase === "waiting") return "正在等待第二位玩家";
  if (room.phase === "ready") return "双方准备后开始";
  if (room.phase === "reconnect_grace") {
    const partner = room.players[ownSeat === 0 ? 1 : 0];
    return `${partner?.nickname ?? "好友"}暂时掉线，对局已暂停`;
  }
  if (room.phase === "completed") return "本局已经结束";
  if (isTimedActionExpired(room, now)) return "时间已到，正在同步本轮结果";
  if (room.game.kind === "ember_crew") {
    if (room.game.phase === "round_result") return "本轮行动已完成";
    return room.game.locked[ownSeat] ? "已确认，等待搭档" : "共同规划，分别确认";
  }
  if (room.game.kind === "gomoku") {
    return room.game.currentSeat === ownSeat ? "轮到你落子" : room.mode === "ai" ? "AI 对手正在落子" : "等待对手落子";
  }
  if (room.game.kind === "reversi") {
    return room.game.currentSeat === ownSeat ? "轮到你翻转棋局" : room.mode === "ai" ? "AI 对手正在思考" : "等待对手落子";
  }
  if (room.game.kind === "split_maze") return "一起把光点送到旗帜";
  if (room.game.kind === "sync_tap") {
    if (now < room.game.goAt) return "保持默契，准备倒计时";
    return room.game.taps[ownSeat] === null ? "现在凭感觉按下" : "保持安静，等待搭档";
  }
  if (room.game.kind === "starship_defuse") {
    return ownSeat === room.game.operatorSeat ? "按搭档口述输入维修序列" : "读取私密序列并依次口述";
  }
  if (room.game.kind === "echo_relay") {
    if (room.game.phase === "stage_result") return "脉冲复现成功，准备交换岗位";
    return ownSeat === room.game.decoderSeat ? "试听私密脉冲并依次口述" : "按搭档口述复现脉冲序列";
  }
  if (room.game.kind === "core_rally") {
    if (room.game.phase === "rally_result") {
      return room.game.lastOutcome === "returned" ? "接力成功，准备换边" : "稳定场救回星核，准备下一拍";
    }
    if (ownSeat !== room.game.receiverSeat) return "观察搭档接球，准备下一拍";
    return room.game.phase === "approach" ? "移动挡板对准来球轨道" : "弹射窗口已开启";
  }
  if (room.game.kind === "skyline_rescue") {
    if (room.game.phase === "wave_result") return room.game.waveOutcome === "contained" ? "热源已经稳定" : "塔体受损，准备下一波";
    if (room.game.locked[ownSeat]) return "你的方案已锁定，等待搭档";
    return ownSeat === room.game.pumpSeat ? "读取压力情报并锁定水压" : "读取区域情报并锁定云梯目标";
  }
  if (room.game.kind === "meteor_dash") {
    if (room.game.phase === "signal") return "扫描阵列，等待流星信标";
    if (room.game.phase === "round_result") return room.game.roundWinner === null
      ? room.game.responses.some((response) => response?.correct) ? "双方几乎同时命中" : "本轮双方都未命中"
      : "本轮反应时间已经揭晓";
    return room.game.locked[ownSeat] ? "坐标已锁定，等待对手" : "点击发光的流星信标";
  }
  if (room.game.kind === "dual_thrusters") {
    if (room.game.phase === "gate_result") return room.game.gateOutcome === "gate_cleared" ? "航门穿越成功" : "船体受损，航向已回正";
    return room.game.locked[ownSeat] ? "推进档位已锁定，等待搭档" : "计算合力并锁定你的推进档位";
  }
  if (room.game.kind === "fog_sonar") {
    if (room.game.phase === "zone_result") return "信标已抵达，准备交换岗位";
    return ownSeat === room.game.sonarSeat ? "读取暗礁图并引导搭档" : "按照声呐指引逐格掌舵";
  }
  if (room.game.kind === "storm_grid") {
    if (room.game.phase === "wave_result") return room.game.waveOutcome === "stabilized" ? "电网已经稳定" : "电网受到雷暴冲击";
    if (room.game.phase === "discharge_window") return ownSeat === room.game.sensorSeat ? "窗口开启，现在释放稳定脉冲" : "保持路由正确，等待搭档放电";
    return ownSeat === room.game.sensorSeat ? "读取目标并口述给调度员" : "按搭档口述校准节点与极性";
  }
  if (room.game.kind === "trajectory_intercept") {
    if (room.game.phase === "signal") return "扫描跃迁轨迹，保持准备";
    if (room.game.phase === "round_result") return room.game.roundWinner === null ? "本轮截获未分胜负" : "双方轨迹与反应时间已经揭晓";
    return room.game.locked[ownSeat] ? "截获记录已封存，等待对手" : "上下移动追踪器并确认截获";
  }
  if (room.game.kind === "star_trace") {
    if (room.game.phase === "stage_result") return room.game.lastOutcome === "charted" ? "星图闭合，准备交换岗位" : "完整星图已经公开";
    return ownSeat === room.game.guideSeat ? "读取私密星点并口述方向与格数" : "按照搭档指引逐格移动光笔";
  }
  if (room.game.kind === "magnet_haul") {
    if (room.game.phase === "checkpoint_result") return "双臂入槽，准备下一道装卸门";
    return `移动你的${ownSeat === 0 ? "左侧" : "右侧"}磁臂并保持缆索张力`;
  }
  if (room.game.kind === "lumen_bridge") {
    if (room.game.phase === "stage_result") return "光桥节点贯通，准备交换控制岗位";
    if (room.game.phase === "resonance") return room.game.confirmations[ownSeat] ? "你的共振已锁定，等待搭档" : "光束命中目标，现在按下共振锁定";
    return ownSeat === room.game.originSeat ? "升降发射台，让光束落点接近目标" : "调节星弧曲率，让光束落点接近目标";
  }
  if (room.game.kind === "neon_dash") {
    if (room.game.phase === "countdown") return "盯住赛道，等待随机障碍信号";
    if (room.game.phase === "round_result") return room.game.roundWinner === null ? "本段没有拉开差距" : "动作与反应时间已经揭晓";
    return room.game.locked[ownSeat] ? "你的动作已封存，等待对手" : "识别障碍并立刻选择跑酷动作";
  }
  if (room.game.kind === "signal_bluff") {
    if (room.game.phase === "round_result") return room.game.roundWinner === ownSeat ? "你赢得了本轮谍报交锋" : "本轮真相与裁决已经公开";
    if (room.game.phase === "claiming") return ownSeat === room.game.senderSeat ? "读取私密真相并发送公开宣称" : "等待发报员发送公开宣称";
    return ownSeat === room.game.senderSeat ? "观察审查员是否识破你的讯号" : "判断公开宣称：相信还是质疑";
  }
  if (room.game.kind === "prism_heist") {
    if (room.game.phase === "corridor_result") return room.game.lastOutcome === "clean_breach" ? "无痕穿越，准备交换岗位" : "舱体受到冲击，准备下一段";
    if (room.game.phase === "breach") return ownSeat === room.game.scoutSeat ? "突破窗口开启：执行光栅旁路" : "突破窗口开启：驾驶潜入舱冲刺";
    return ownSeat === room.game.scoutSeat ? "读取私密安全航道并口述" : "按照侦察员口述移动潜入舱";
  }
  if (room.game.kind === "nova_volley") {
    if (room.game.phase === "point_result") return room.game.pointWinner === ownSeat ? "你拿下这一分，准备重新发球" : "对手拿下这一分，准备接发球";
    if (ownSeat !== room.game.receiverSeat) return "观察对手站位，准备防守回球";
    return room.game.phase === "approach" ? "移动挡板追上公开来球轨道" : "击球窗开启：选择回球落点";
  }
  if (room.game.kind === "pulse_pass") {
    if (room.game.phase === "round_result") return room.game.roundWinner === ownSeat ? "核心在对手手中爆裂，你赢下本轮" : "爆点已经揭晓，准备下一轮";
    return ownSeat === room.game.holderSeat
      ? room.game.ventCharges[ownSeat] > 0 ? "核心在你手中：充能传出或消耗冷却" : "核心在你手中：选择充能强度"
      : "观察公开热度，准备接过核心";
  }
  if (room.game.kind === "drop_rescue") {
    if (room.game.phase === "landing_result") return room.game.lastOutcome === "soft_landing" ? "柔性着陆完成，准备交换岗位" : "着陆遥测已公开，检查偏差";
    if (room.game.locked[ownSeat]) return "你的控制已锁定，等待搭档";
    return ownSeat === room.game.pilotSeat ? "读取侧风并校准着陆航道" : "读取速度并校准反推档位";
  }
  if (room.game.kind === "quantum_duel") {
    if (room.game.phase === "round_result") return room.game.roundWinner === null ? "本轮势均力敌" : "量子招式已揭晓";
    return room.game.locked[ownSeat] ? "招式已锁定，等待对手" : "秘密选择你的机甲招式";
  }
  if (room.game.kind === "starway_escort") {
    if (room.game.phase === "sector_result") return "航段结果已同步揭晓";
    if (room.game.locked[ownSeat]) return "方案已锁定，等待搭档";
    return ownSeat === room.game.pilotSeat ? "根据能量情报选择航线" : "根据障碍情报分配护盾";
  }
  if (room.game.kind === "orbital_repair") {
    if (room.game.phase === "stage_result") return "中继链路已接通，准备换岗";
    return ownSeat === room.game.engineerSeat ? "按照搭档口述旋转轨道" : "读取私密蓝图并决定发射时机";
  }
  if (room.game.kind === "rhythm_gravity") {
    if (room.game.phase === "round_result") return room.game.roundWinner === null ? "这一拍势均力敌" : "本轮节拍已经结算";
    if (room.game.locked[ownSeat]) return "击拍已锁定，等待对手";
    return now < room.game.beatAt ? "等待引力信标" : "现在击拍";
  }
  if (room.game.kind === "shadow_shuttle") {
    if (room.game.phase === "marking") return ownSeat === room.game.infiltratorSeat ? "秘密选择逃逸舱" : "等待幻影标记目标";
    if (room.game.phase === "memorizing") return "记住发光逃逸舱";
    if (room.game.phase === "shuffling") return "保持专注，追踪连续换位";
    if (room.game.phase === "guessing") return ownSeat === room.game.infiltratorSeat ? "等待追踪者判断" : "锁定目标最终位置";
    return room.game.roundOutcome === "found" ? "追踪者锁定了目标" : "幻影成功逃逸";
  }
  if (room.game.phase === "hiding") {
    return ownSeat === room.game.hunterSeat ? "等待潜行者藏好" : "选择你的秘密掩体";
  }
  if (room.game.phase === "hunting") {
    return ownSeat === room.game.hunterSeat ? "扫描线索，然后锁定一枪" : "保持隐蔽，别被发现";
  }
  return room.game.roundOutcome === "hit" ? "猎手命中目标" : "潜行者守住了这一轮";
}


function resultCopy(result: GameResult, ownSeat: Seat): { title: string; detail: string } {
  if (result.kind === "draw") {
    const detail = result.reason === "both_left"
      ? "双方都离开了对局"
      : result.reason === "board_tied"
        ? "黑白棋子数量完全相同"
        : result.reason === "duel_tied"
          ? "多轮招式对决后比分相同"
          : result.reason === "rhythm_tied"
            ? "能量核最终停在零点"
            : result.reason === "meteor_tied"
              ? "流星捕捉总比分完全相同"
              : result.reason === "intercept_tied"
                ? "多轮轨迹截获后比分相同"
                : result.reason === "neon_dash_tied"
                  ? "障碍赛积分与剩余护盾完全相同"
                  : result.reason === "signal_bluff_tied" ? "多轮谍报交锋后比分完全相同" : "棋盘已满，旗鼓相当";
    return { title: result.reason === "both_left" ? "本局已结束" : "平局", detail };
  }
  if (result.kind === "success") {
    return successResultCopy(result);
  }
  if (result.kind === "failure") {
    const detail = {
      timeout: "时间用完了，再配合一次一定会更好",
      building_lost: "楼体已无法支撑，下一次分工控制火势并优先撤离居民",
      too_many_strikes: "错误次数已用完，重新分工再试一次",
      hull_lost: "船体完整度归零，下一次先保护关键航线",
      reactor_overload: "误发次数耗尽导致反应堆过载，重新校准后再试一次",
      core_lost: "团队稳定度已经耗尽，下一局提前移动挡板再接球",
      tower_lost: "塔体完整度归零，下一局先复述区域和压力再锁定",
      water_depleted: "储水量已经耗尽，准确选择压力才能完成全部波次",
      shuttle_lost: "船体完整度已经耗尽，下一局先把惯性和两侧合力一起算好",
      fog_lost: "船体被暗礁耗尽，下一局先让声呐员报出完整路线再掌舵",
      grid_collapsed: "电网完整度已经耗尽，下一局先复述节点与极性，再等待放电窗口",
      trace_lost: "星墨已经耗尽，下一局把路线拆成更短的方向和格数再移动",
      magnet_lost: "公共电量已经耗尽，下一局让两侧轮流移动并减少折返",
      bridge_lost: "光桥稳定度或公共光能已经耗尽，下一局先对准落点，再一起锁定",
      heist_failed: "潜入舱完整度已经耗尽，下一局先对准私密安全航道，再等待突破窗口同步行动",
      rescue_capsule_lost: "救援舱完整度已经耗尽，下一局先分别复述侧风补偿和反推差值再锁定",
      propellant_depleted: "侧推燃料已经耗尽，下一局算好预补偿航道再移动，避免来回试探",
      player_left: "一位玩家未能在 60 秒内重连",
      both_left: "双方都离开了本局",
      abandoned: "你们提前结束了这轮合作",
    }[result.reason];
    return { title: "合作暂未完成", detail };
  }
  return winResultCopy(result, ownSeat);
}

function gameActionLabel(room: RoomView): string {
  if (room.game.kind === "gomoku" || room.game.kind === "reversi") return "落子";
  if (room.game.kind === "split_maze") return "协作";
  if (room.game.kind === "sync_tap") return "同频";
  if (room.game.kind === "cover_hunt") return "攻防";
  if (room.game.kind === "starship_defuse") return "协作";
  if (room.game.kind === "quantum_duel") return "锁定";
  if (room.game.kind === "starway_escort") return "规划";
  if (room.game.kind === "orbital_repair") return "抢修";
  if (room.game.kind === "rhythm_gravity") return "击拍";
  if (room.game.kind === "shadow_shuttle") return "追踪";
  if (room.game.kind === "echo_relay") return "译码";
  if (room.game.kind === "core_rally") return "接力";
  if (room.game.kind === "skyline_rescue") return "调度";
  if (room.game.kind === "meteor_dash") return "捕捉";
  if (room.game.kind === "dual_thrusters") return "推进";
  if (room.game.kind === "fog_sonar") return "领航";
  if (room.game.kind === "storm_grid") return "调度";
  if (room.game.kind === "trajectory_intercept") return "截获";
  if (room.game.kind === "star_trace") return "盲绘";
  if (room.game.kind === "magnet_haul") return "搬运";
  if (room.game.kind === "lumen_bridge") return "共振";
  if (room.game.kind === "neon_dash") return "跑酷";
  if (room.game.kind === "signal_bluff") return "谍报";
  if (room.game.kind === "prism_heist") return "潜入";
  if (room.game.kind === "nova_volley") return "对攻";
  if (room.game.kind === "pulse_pass") return "传核";
  if (room.game.kind === "drop_rescue") return "着陆";
  return "回合";
}

function gameStats(game: GameViewState): { label: string; value: string }[] {
  if (game.kind === "ember_crew") return [{ label: "居民撤离", value: `${game.rescued}/${game.target}` }, { label: "楼体完整度", value: `${game.integrity}/${game.maxIntegrity}` }, { label: "完成轮次", value: String(Math.max(0, game.round - (game.phase === "planning" ? 1 : 0))) }];
  if (game.kind === "gomoku") return [{ label: "总手数", value: String(game.moveCount) }];
  if (game.kind === "reversi") {
    return [
      { label: "黑棋", value: String(game.board.filter((piece) => piece === 1).length) },
      { label: "白棋", value: String(game.board.filter((piece) => piece === 2).length) },
    ];
  }
  if (game.kind === "split_maze") return [{ label: "移动", value: String(game.moveCount) }, { label: "撞墙", value: String(game.wallHits) }];
  if (game.kind === "sync_tap") {
    const average = game.roundScores.length
      ? Math.round(game.roundScores.reduce((sum, score) => sum + score, 0) / game.roundScores.length)
      : 0;
    return [{ label: "完成轮次", value: String(game.roundScores.length) }, { label: "平均误差", value: `${average}ms` }];
  }
  if (game.kind === "cover_hunt") return [{ label: "双方比分", value: `${game.scores[0]} : ${game.scores[1]}` }, { label: "完成轮次", value: String(game.round) }];
  if (game.kind === "starship_defuse") return [{ label: "完成舱段", value: String(game.stage - (game.result?.kind === "success" ? 0 : 1)) }, { label: "故障", value: `${game.strikes}/${game.maxStrikes}` }];
  if (game.kind === "quantum_duel") return [{ label: "双方比分", value: `${game.scores[0]} : ${game.scores[1]}` }, { label: "完成轮次", value: String(game.round) }];
  if (game.kind === "starway_escort") return [{ label: "货舱能量", value: String(game.cargo) }, { label: "剩余船体", value: `${game.hull}/${game.maxHull}` }];
  if (game.kind === "orbital_repair") return [{ label: "总旋转", value: String(game.totalRotations) }, { label: "发射次数", value: String(game.launchAttempts) }];
  if (game.kind === "rhythm_gravity") return [{ label: "能量核偏移", value: String(Math.abs(game.corePosition)) }, { label: "完成节拍", value: String(game.round) }];
  if (game.kind === "echo_relay") return [{ label: "完成信号段", value: `${game.completedStages}/${game.totalStages}` }, { label: "总输入", value: String(game.totalInputs) }, { label: "干扰", value: `${game.strikes}/${game.maxStrikes}` }];
  if (game.kind === "core_rally") return [
    { label: "成功接力", value: `${game.successfulReturns}/${game.targetReturns}` },
    { label: "最佳连击", value: `×${game.bestCombo}` },
    { label: "接力基础分", value: String(game.score) },
    ...(game.result?.kind === "success" ? [{ label: "通关加分", value: `+${game.result.score - game.score}` }] : []),
  ];
  if (game.kind === "skyline_rescue") return [{ label: "稳定热源", value: `${game.containedWaves}/${game.totalWaves}` }, { label: "剩余水量", value: String(game.water) }, { label: "调度失误", value: String(game.mistakes) }];
  if (game.kind === "meteor_dash") return [{ label: "双方比分", value: `${game.scores[0]} : ${game.scores[1]}` }, { label: "完成轮次", value: String(game.round) }];
  if (game.kind === "dual_thrusters") return [{ label: "通过航门", value: `${game.clearedGates}/${game.totalGates}` }, { label: "撞击", value: String(game.collisions) }, { label: "团队分数", value: String(game.score) }];
  if (game.kind === "fog_sonar") return [{ label: "穿越雾区", value: `${game.zonesCleared}/${game.totalZones}` }, { label: "航行步数", value: String(game.moves) }, { label: "撞礁", value: String(game.collisions) }, { label: "团队分数", value: String(game.score) }];
  if (game.kind === "storm_grid") return [{ label: "稳定波次", value: `${game.stabilizedWaves}/${game.totalWaves}` }, { label: "电网故障", value: String(game.faults) }, { label: "校准次数", value: String(game.totalAdjustments) }, { label: "团队分数", value: String(game.score) }];
  if (game.kind === "trajectory_intercept") return [{ label: "双方比分", value: `${game.scores[0]} : ${game.scores[1]}` }, { label: "完成轮次", value: String(game.round) }, { label: "轨道数量", value: String(game.laneCount) }];
  if (game.kind === "star_trace") return [{ label: "完成星图", value: `${game.completedStages}/${game.totalStages}` }, { label: "总移动", value: String(game.moves) }, { label: "剩余星墨", value: String(game.ink) }, { label: "团队分数", value: String(game.score) }];
  if (game.kind === "magnet_haul") return [{ label: "通过装卸门", value: `${game.completedCheckpoints}/${game.totalCheckpoints}` }, { label: "总移动", value: String(game.moves) }, { label: "剩余电量", value: String(game.battery) }, { label: "团队分数", value: String(game.score) }];
  if (game.kind === "lumen_bridge") return [{ label: "贯通节点", value: `${game.completedStages}/${game.totalStages}` }, { label: "总校准", value: String(game.totalAdjustments) }, { label: "剩余光能", value: String(game.energy) }, { label: "团队分数", value: String(game.score) }];
  if (game.kind === "neon_dash") return [{ label: "双方积分", value: `${game.scores[0]} : ${game.scores[1]}` }, { label: "剩余护盾", value: `${game.lives[0]} : ${game.lives[1]}` }, { label: "最佳连段", value: `${game.bestCombos[0]} : ${game.bestCombos[1]}` }, { label: "完成赛段", value: `${game.round}/${game.totalRounds}` }];
  if (game.kind === "signal_bluff") return [{ label: "双方比分", value: `${game.scores[0]} : ${game.scores[1]}` }, { label: "完成轮次", value: `${game.round}/${game.totalRounds}` }, { label: "剩余扫描", value: `${game.scanCharges[0]} : ${game.scanCharges[1]}` }];
  if (game.kind === "prism_heist") return [{ label: "无痕穿越", value: `${game.cleanBreaches}/${game.totalCorridors}` }, { label: "同步突破", value: String(game.totalSyncs) }, { label: "总换道", value: String(game.moves) }, { label: "行动分", value: String(game.score) }];
  if (game.kind === "nova_volley") return [{ label: "双方比分", value: `${game.scores[0]} : ${game.scores[1]}` }, { label: "最佳连拍", value: `×${game.bestRally}` }, { label: "成功回击", value: `${game.successfulReturns[0]} : ${game.successfulReturns[1]}` }, { label: "挡板移动", value: `${game.totalMoves[0]} : ${game.totalMoves[1]}` }];
  if (game.kind === "pulse_pass") return [{ label: "双方比分", value: `${game.scores[0]} : ${game.scores[1]}` }, { label: "总传递", value: String(game.totalPasses) }, { label: "总注入", value: `${game.totalPower[0]} : ${game.totalPower[1]}` }, { label: "使用冷却", value: `${game.ventsUsed[0]} : ${game.ventsUsed[1]}` }];
  if (game.kind === "drop_rescue") return [{ label: "柔性着陆", value: `${game.softLandings}/${game.totalLandings}` }, { label: "粗暴着陆", value: String(game.roughLandings) }, { label: "侧推次数", value: String(game.totalMoves) }, { label: "救援分", value: String(game.score) }];
  return [{ label: "双方比分", value: `${game.scores[0]} : ${game.scores[1]}` }, { label: "完成换位", value: String(game.shuffleStep) }];
}

function aiSuggestionCopy(action: GameAction): string | null {
  const direction = (value: "up" | "right" | "down" | "left") => ({ up: "向上", right: "向右", down: "向下", left: "向左" })[value];
  const horizontal = (value: -1 | 1) => value < 0 ? "向左" : "向右";
  const symbol = (value: Extract<GameAction, { kind: "defuse_press" }>["symbol"]) => ({
    triangle: "三角", diamond: "菱形", circle: "圆形", square: "方形", wave: "波纹", star: "星形",
  })[value];
  const tone = (value: Extract<GameAction, { kind: "echo_press" }>["tone"]) => ({
    ember: "余烬", tide: "潮汐", nova: "新星", bloom: "绽放", comet: "彗星",
  })[value];
  switch (action.kind) {
    case "maze_move": return `${direction(action.direction)}移动一步`;
    case "sync_tap": return "现在按下同步按钮";
    case "defuse_press": return `按下“${symbol(action.symbol)}”`;
    case "escort_route": return `锁定 ${action.lane + 1} 号航道`;
    case "escort_shield": return `把护盾分配到 ${action.lane + 1} 号航道`;
    case "orbit_rotate": return `将第 ${action.ring + 1} 环${action.direction === "clockwise" ? "顺时针" : "逆时针"}旋转一格`;
    case "orbit_launch": return "现在确认发射";
    case "echo_press": return `按下“${tone(action.tone)}”脉冲`;
    case "core_move": return `${horizontal(action.direction)}移动挡板`;
    case "core_return": return "现在弹射星核";
    case "rescue_aim": return `锁定 ${action.zone + 1} 号区域`;
    case "rescue_pressure": return `锁定 ${action.pressure} 档水压`;
    case "thruster_burn": return `锁定 ${action.power} 档推进`;
    case "sonar_ping": return `发送${direction(action.direction)}声呐`;
    case "fog_steer": return `${direction(action.direction)}掌舵`;
    case "grid_shift": return `${horizontal(action.direction)}切换节点`;
    case "grid_toggle": return "切换当前节点极性";
    case "grid_discharge": return "现在释放稳定脉冲";
    case "star_trace_move": return `${direction(action.direction)}移动一格`;
    case "magnet_move": return `${horizontal(action.direction)}移动磁臂`;
    case "bridge_adjust": return `${action.direction < 0 ? "降低" : "提高"}当前控制值`;
    case "bridge_lock": return "现在锁定共振";
    case "heist_move": return `${horizontal(action.direction)}移动潜入舱`;
    case "heist_bypass": return "现在执行光栅旁路";
    case "heist_dash": return "现在驾驶潜入舱冲刺";
    case "drop_move": return `${horizontal(action.direction)}校准着陆航道`;
    case "drop_brake": return `${action.direction < 0 ? "降低" : "提高"}一级反推`;
    case "drop_lock": return "锁定当前控制";
    default: return null;
  }
}

export default function RoomScreen() {
  const navigation = useNavigation();
  const { fontScale, width } = useWindowDimensions();
  const params = useLocalSearchParams<{ code?: string | string[] }>();
  const rawCode = Array.isArray(params.code) ? params.code[0] : params.code;
  const code = (rawCode ?? "").toUpperCase();
  const validCode = ROOM_CODE_PATTERN.test(code) ? code : "";
  const roomState = useRoom(validCode);
  const { feedback, settings } = useSettings();
  const { t } = useI18n();
  const roomScreenRef = useRef<ScrollView | null>(null);
  const [gameTop, setGameTop] = useState(0);
  const playedResultRef = useRef<string | null>(null);
  const allowNavigationRef = useRef(false);
  const tutorialCheckedRef = useRef<string | null>(null);
  const partnerJoinedRef = useRef<boolean | null>(null);
  const partnerConnectedRef = useRef<boolean | null>(null);
  const partnerReadyRef = useRef<boolean | null>(null);
  const previousPhaseRef = useRef<RoomPhase | null>(null);
  const previousConnectionRef = useRef(roomState.status);
  const previousTurnRef = useRef<Seat | null>(null);
  const [nickname, setNickname] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);
  const [confirmingResign, setConfirmingResign] = useState(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const ownSeat = roomState.session?.seat ?? 0;
  const room = roomState.room;
  const retiredGame = Boolean(room && !isPlayableGameId(room.gameId));
  const showRetiredNotice = retiredGame && (!roomState.session || room?.phase === "waiting" || room?.phase === "ready");
  const stackedForLargeText = width < 520 && fontScale > 1.2;
  const needsGameClock = Boolean(room && room.phase === "playing");
  const needsFastClock = Boolean(needsGameClock && room && FAST_CLOCK_GAMES.has(room.game.kind));
  const now = useNow(needsGameClock, needsFastClock ? 100 : null, room?.game.turnDeadline);
  const fallbackWebUrl = Platform.OS === "web" && typeof globalThis.location !== "undefined"
    ? globalThis.location.origin
    : API_BASE_URL;
  const inviteBase = (process.env.EXPO_PUBLIC_WEB_URL?.trim() || fallbackWebUrl).replace(/\/$/, "");
  const inviteUrl = `${inviteBase}/room/${code}`;
  const ownPlayer = room?.players[ownSeat] ?? null;
  const partnerSeat: Seat = ownSeat === 0 ? 1 : 0;
  const partner = room?.players[partnerSeat] ?? null;
  const roomIsFull = Boolean(room?.players.every(Boolean));
  const seat0Active = room ? isSeatActive(room, 0, now) : false;
  const seat1Active = room ? isSeatActive(room, 1, now) : false;
  const showExclusiveAction = seat0Active !== seat1Active;
  const result = room?.game.result ? resultCopy(room.game.result, ownSeat) : null;
  const stats = room ? gameStats(room.game) : [];
  const gameInfo = room ? getConfiguredGameInfo(room.gameId, room.options) : null;
  const roomDocumentTitle = !validCode
    ? `${t("房间码不正确")} · ${t("Duo Arcade")}`
    : roomState.status === "error"
      ? `${t(roomState.errorCode === "room_not_found" ? "邀请已经失效" : roomState.errorCode === "protocol_mismatch" ? "需要更新应用" : "暂时无法打开房间")} · ${t("Duo Arcade")}`
      : `${gameInfo ? t(gameInfo.title) : t("Duo Arcade")} · ${code}`;
  useWebDocumentTitle(roomDocumentTitle);
  const joinNickname = nickname === null
    ? localizeGeneratedNickname(roomState.identity?.nickname ?? "", settings.language)
    : nickname.trim();
  const gameInteractionPhase: RoomPhase = roomState.status === "connected" ? room?.phase ?? "reconnect_grace" : "reconnect_grace";
  const timedActionExpired = Boolean(room && isTimedActionExpired(room, now));
  const gameInteractionBlocked = roomState.actionPending || roomState.status !== "connected" || timedActionExpired;
  const gameAccessibilityBlocked = roomState.actionPending || timedActionExpired;
  const partnerDisconnected = Boolean(partner && !partner.connected);
  const isAiRoom = room?.mode === "ai";
  const aiIntent = room?.ai?.intent ? aiSuggestionCopy(room.ai.intent) : null;
  const aiSuggestion = room?.ai?.suggestion ? aiSuggestionCopy(room.ai.suggestion) : null;

  useEffect(() => {
    if (Platform.OS !== "ios" || roomState.session || roomIsFull) return;
    const subscription = Keyboard.addListener("keyboardDidShow", () => {
      roomScreenRef.current?.scrollToEnd({ animated: !settings.reducedMotion });
    });
    return () => subscription.remove();
  }, [roomIsFull, roomState.session, settings.reducedMotion]);

  useEffect(() => {
    if (!room?.game.result) {
      playedResultRef.current = null;
      return;
    }
    const resultKey = `${room.round}:${JSON.stringify(room.game.result)}`;
    if (playedResultRef.current === resultKey) return;
    playedResultRef.current = resultKey;
    const result = room.game.result;
    const positive = result.kind === "success" || (result.kind === "win" && result.winnerSeat === ownSeat);
    feedback(positive || result.kind === "draw" ? "success" : "failure", positive || result.kind === "draw" ? "success" : "warning");
    if (Platform.OS === "ios") {
      const copy = resultCopy(result, ownSeat);
      AccessibilityInfo.announceForAccessibility(`${t(copy.title)}. ${t(copy.detail)}`);
    }
  }, [feedback, ownSeat, room, t]);

  useEffect(() => {
    const previous = previousPhaseRef.current;
    if (previous === "ready" && room?.phase === "playing") feedback("success", "success");
    previousPhaseRef.current = room?.phase ?? null;
  }, [feedback, room?.phase]);

  useEffect(() => {
    if (!room || !isPlayableGameId(room.gameId) || !roomState.session || room.phase !== "ready" || !room.players.every(Boolean)) return;
    if (tutorialCheckedRef.current === room.gameId) return;
    tutorialCheckedRef.current = room.gameId;
    void hasSeenTutorial(room.gameId).then((seen) => {
      if (!seen) setTutorialOpen(true);
    });
  }, [room, roomState.session]);

  useEffect(() => {
    const joined = Boolean(partner);
    if (joined && partnerJoinedRef.current === false) {
      feedback("success", "success");
      if (Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(t(`${partner?.nickname ?? "好友"}已加入房间`));
    }
    partnerJoinedRef.current = joined;
  }, [feedback, partner, t]);

  useEffect(() => {
    const connected = partner ? partner.connected : null;
    const previous = partnerConnectedRef.current;
    if (connected !== null && previous !== null && previous !== connected && Platform.OS === "ios") {
      AccessibilityInfo.announceForAccessibility(t(connected
        ? `${partner?.nickname ?? "好友"}已重新连接`
        : `${partner?.nickname ?? "好友"}暂时离线，对局已暂停`));
    }
    partnerConnectedRef.current = connected;
  }, [partner, t]);

  useEffect(() => {
    const ready = partner ? partner.ready : null;
    const previous = partnerReadyRef.current;
    if (ready === true && previous === false && Platform.OS === "ios") {
      AccessibilityInfo.announceForAccessibility(t(`${partner?.nickname ?? "好友"}准备好了`));
    }
    partnerReadyRef.current = ready;
  }, [partner, t]);

  useEffect(() => {
    const previous = previousConnectionRef.current;
    if (Platform.OS === "ios") {
      if (previous === "connected" && (roomState.status === "connecting" || roomState.status === "reconnecting")) {
        AccessibilityInfo.announceForAccessibility(t("连接中断，操作已暂停，正在重连"));
      } else if (previous === "reconnecting" && roomState.status === "connected") {
        AccessibilityInfo.announceForAccessibility(t("连接已恢复，进度已经同步"));
      }
    }
    previousConnectionRef.current = roomState.status;
  }, [roomState.status, t]);

  useEffect(() => {
    const turn = room?.game.kind === "gomoku" || room?.game.kind === "reversi" ? room.game.currentSeat : null;
    const previous = previousTurnRef.current;
    if (turn !== null && previous !== null && previous !== turn && room?.phase === "playing" && Platform.OS === "ios") {
      AccessibilityInfo.announceForAccessibility(t(phaseCopy(room, ownSeat, Date.now())));
    }
    previousTurnRef.current = turn;
  }, [ownSeat, room, t]);

  useEffect(() => {
    if (Platform.OS !== "web" || (room?.phase !== "playing" && room?.phase !== "reconnect_grace")) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    globalThis.addEventListener("beforeunload", warnBeforeUnload);
    return () => globalThis.removeEventListener("beforeunload", warnBeforeUnload);
  }, [room?.phase]);

  useEffect(() => {
    if (room?.phase !== "playing" && room?.phase !== "reconnect_grace") return;
    return navigation.addListener("beforeRemove", (event) => {
      if (allowNavigationRef.current) return;
      event.preventDefault();
      if (Platform.OS === "web") {
        setTimeout(() => {
          if (globalThis.location.pathname !== `/room/${code}`) globalThis.history.forward();
        }, 0);
      }
      setConfirmingLeave(true);
    });
  }, [code, navigation, room?.phase]);

  const connectionLabel = useMemo(() => {
    if (roomState.status === "connected") return roomState.actionSyncStatus === "slow" ? "网络响应较慢" : "已连接";
    if (roomState.status === "reconnecting") return "正在重连";
    if (roomState.status === "connecting") return "正在连接";
    if (roomState.status === "loading") return "正在打开";
    if (roomState.status === "error") return "连接失败";
    return retiredGame ? "游戏已下架" : roomIsFull ? "房间已满" : "邀请有效";
  }, [retiredGame, roomIsFull, roomState.actionSyncStatus, roomState.status]);

  const roomHeaderTitle = showRetiredNotice ? "游戏已下架" : room?.phase === "waiting"
    ? "等待好友"
    : room?.phase === "ready"
      ? partnerDisconnected
        ? "等待好友重连"
        : isAiRoom ? "AI 已入座" : "准备开始"
      : room?.phase === "completed"
        ? "本局结束"
        : gameInfo?.title ?? "双人游戏";

  const lobbyTitle = isAiRoom
    ? ownPlayer?.ready ? "你已准备，正在开始" : `${partner?.nickname ?? "AI"}准备好了`
    : !partner
    ? "邀请一位好友加入"
    : partnerDisconnected
      ? ownPlayer?.ready && partner.ready
        ? `双方已准备，等待${partner.nickname}回来`
        : `${partner.nickname}暂时离线`
    : ownPlayer?.ready
      ? `已准备，等待${partner.nickname}`
      : partner.ready
        ? `${partner.nickname}准备好了`
        : "两个人都到齐了";

  const lobbyDetail = isAiRoom
    ? "看完本局规则后确认准备；AI 会按你保存的难度、策略和反应速度行动。"
    : !partner
    ? "分享邀请链接或房间码；好友加入后，你们再一起确认准备。"
    : partnerDisconnected
      ? ownPlayer?.ready && partner.ready
        ? "开局条件已经保留；搭档重连后会自动开始。"
        : "房间仍然有效；搭档重新连接后再一起确认准备。"
    : ownPlayer?.ready
      ? "你的状态已经同步；搭档准备后会自动开局。"
      : partner.ready
        ? "现在轮到你确认，准备后会立即开始。"
        : "各自看完玩法后点击准备，双方确认即自动开局。";

  async function copyInvite() {
    try {
      await Clipboard.setStringAsync(inviteUrl);
      setInviteNotice(null);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setInviteNotice(`暂时无法复制，请手动分享房间码 ${code}。`);
    }
  }

  function requestLeave() {
    if (room?.phase === "playing" || room?.phase === "reconnect_grace") {
      setConfirmingLeave(true);
      return;
    }
    router.replace("/");
  }

  async function shareInvite() {
    try {
      const message = t(`来 Duo Arcade 和我玩${gameInfo?.title ?? "双人游戏"}！房间码 ${code}`);
      const shareTitle = t("Duo Arcade 双人邀请");
      await Share.share(
        Platform.OS === "ios"
          ? { message, url: inviteUrl }
          : { message: `${message}\n${inviteUrl}`, title: shareTitle },
        Platform.OS === "ios" ? { subject: shareTitle } : undefined,
      );
    } catch {
      await copyInvite();
    }
  }

  function closeTutorial() {
    setTutorialOpen(false);
    if (room) void markTutorialSeen(room.gameId);
  }

  function joinRoom() {
    if (!joinNickname) return;
    Keyboard.dismiss();
    roomState.join(joinNickname);
  }

  const focusGameBoard = room?.game.kind === "neon_dash" || room?.game.kind === "meteor_dash" || room?.game.kind === "nova_volley" || room?.game.kind === "signal_bluff" || room?.game.kind === "cover_hunt" || room?.game.kind === "quantum_duel";
  const compactGameShell = focusGameBoard || room?.game.kind === "ember_crew" || room?.game.kind === "pulse_pass";

  if (!ROOM_CODE_PATTERN.test(code)) {
    return (
      <Screen>
        <View style={styles.centerCard}>
          <Text accessibilityRole="header" style={styles.resultTitle}>房间码不正确</Text>
          <Text style={styles.muted}>请检查邀请链接，或返回首页输入 6 位房间码。</Text>
          <Button onPress={() => router.replace("/")}>返回首页</Button>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scrollRef={roomScreenRef} scrollResetKey={room?.phase ?? null}
      scrollResetOffset={width < 600 && focusGameBoard && room?.phase === "playing" ? gameTop : 0}>
      <Stack.Screen options={{ gestureEnabled: room?.phase !== "playing" && room?.phase !== "reconnect_grace", title: `${t(gameInfo?.title ?? "双人游戏")} · ${code}` }} />
      <View style={styles.nav}>
        <Brand compact iconOnly={width < 440 || fontScale > 1.2} />
        <View style={styles.navRight}>
          <View accessibilityLiveRegion="polite" style={styles.connectionPill}>
            <View style={[styles.connectionDot, roomState.status === "connected" && styles.connectedDot]} />
            <Text style={styles.connectionText}>{connectionLabel}</Text>
          </View>
          {room && (
            <Button accessibilityHint={room.phase === "playing" ? "会先询问是否暂时离开当前对局" : undefined} onPress={requestLeave} style={styles.exitButton} variant="ghost">{roomState.session ? "离开" : "返回"}</Button>
          )}
        </View>
      </View>

      {(room || roomState.status === "loading" || roomState.status === "connecting") && (
        <View style={[styles.roomHeader, (width < 360 || stackedForLargeText) && styles.roomHeaderCompact]}>
          <View style={styles.roomHeadingCopy}>
            <Text style={styles.kicker}>{gameInfo?.title ?? "正在打开房间"} · 第 {room?.round ?? 1} 局</Text>
            <Text accessibilityRole="header" style={styles.roomTitle}>{roomHeaderTitle}</Text>
          </View>
          <View accessibilityLabel={t(`房间码 ${code}`)} style={[styles.codeBadge, (width < 360 || stackedForLargeText) && styles.codeBadgeCompact]}>
            <Text style={styles.codeLabel}>房间码</Text>
            <Text selectable style={styles.code}>{code}</Text>
          </View>
        </View>
      )}

      {roomState.notice && room && roomState.status !== "error" && <View accessibilityLiveRegion="assertive" accessibilityRole="alert" style={styles.notice}><Text style={styles.noticeText}>{roomState.notice}</Text></View>}

      {roomState.status === "error" && room && (
        <View accessibilityLiveRegion="assertive" accessibilityRole="alert" style={styles.recoveryCard}>
          <View style={styles.recoveryCopy}>
            <Text accessibilityRole="header" aria-level={2} style={styles.recoveryTitle}>实时连接已暂停</Text>
            <Text style={styles.muted}>{roomState.notice ?? "画面保留了最后进度；重新连接后会以服务端状态为准。"}</Text>
          </View>
          <Button onPress={roomState.retry} style={styles.recoveryButton} variant="secondary">重新连接</Button>
        </View>
      )}

      {!room && (
        <View
          accessibilityLiveRegion={roomState.status === "error" ? "assertive" : "polite"}
          accessibilityRole={roomState.status === "error" ? "alert" : undefined}
          style={styles.centerCard}
        >
          {roomState.status !== "error" && <ActivityIndicator color={colors.primary} size="large" />}
          <Text accessibilityRole="header" aria-level={roomState.status === "error" ? 1 : 2} style={styles.resultTitle}>
            {roomState.status !== "error" ? roomState.status === "reconnecting" ? "正在恢复房间…" : "正在打开房间…" : roomState.errorCode === "room_not_found" ? "邀请已经失效" : roomState.errorCode === "protocol_mismatch" ? "需要更新应用" : "暂时无法打开房间"}
          </Text>
          <Text style={styles.muted}>{roomState.notice ?? (roomState.status === "error" ? "请检查网络连接后再试。" : "正在获取最新进度，连接后即可继续。")}</Text>
          {roomState.status === "error" && roomState.errorCode !== "room_not_found" && (
            <Button onPress={() => {
              if (roomState.errorCode === "protocol_mismatch" && Platform.OS === "web" && typeof globalThis.location !== "undefined") {
                globalThis.location.reload();
                return;
              }
              roomState.retry();
            }}>{roomState.errorCode === "protocol_mismatch" && Platform.OS === "web" ? "刷新应用" : "重新连接"}</Button>
          )}
          <Button onPress={() => router.replace("/")} variant="secondary">{roomState.status === "error" ? "回首页创建新房" : "返回大厅"}</Button>
        </View>
      )}

      {showRetiredNotice && (
        <View accessibilityLiveRegion="polite" style={styles.centerCard}>
          <Text accessibilityRole="header" aria-level={2} style={styles.resultTitle}>这款游戏已下架</Text>
          <Text style={styles.muted}>这款游戏不再接受新玩家或开新局。回到首页，选一款新的游戏一起玩。</Text>
          <Button onPress={requestLeave}>选择其他游戏</Button>
        </View>
      )}

      {room && !retiredGame && !roomState.session && roomIsFull && (
        <View accessibilityLiveRegion="polite" style={styles.centerCard}>
          <Text accessibilityRole="header" aria-level={2} style={styles.resultTitle}>这桌已经坐满了</Text>
          <Text style={styles.muted}>邀请仍然有效，但两位玩家都已经入席。如果你已经在玩，请回到原来的浏览器标签页；否则请让好友结束后重新开房。</Text>
          <Button onPress={() => router.replace("/")} variant="secondary">返回首页</Button>
        </View>
      )}

      {room && !retiredGame && !roomState.session && !roomIsFull && (
        <View style={styles.joinCard}>
          <View style={styles.joinIcon}><Text style={styles.joinIconText}>{gameInfo?.icon}</Text></View>
          <Text accessibilityRole="header" aria-level={2} style={styles.resultTitle}>好友在等你</Text>
          <Text style={styles.muted}>
            {settings.language === "en"
              ? `This is a ${t(gameInfo?.mode ?? "双人")} game. Join to play together across browsers and iPhone.`
              : `这是一个${gameInfo?.mode ?? "双人"}小游戏，加入后可直接跨浏览器和 iPhone 联机。`}
          </Text>
            <TextInput
              accessibilityLabel="你的游戏昵称"
              autoCapitalize="words"
              autoCorrect={false}
              clearButtonMode="while-editing"
              editable={roomState.status !== "loading"}
              maxLength={24}
              onChangeText={setNickname}
              onSubmitEditing={joinRoom}
              placeholder="你的游戏名"
              placeholderTextColor={colors.muted}
              returnKeyType="go"
            style={styles.input}
            value={nickname ?? roomState.identity?.nickname ?? ""}
          />
          <Button
            accessibilityLabel={settings.language === "en" ? `Join ${t(gameInfo?.title ?? "双人游戏")} room` : `加入${gameInfo?.title ?? "双人游戏"}房间`}
            disabled={!joinNickname}
            loading={roomState.status === "loading"}
            loadingLabel="正在加入"
            onPress={joinRoom}
          >
            {settings.language === "en" ? `Join ${t(gameInfo?.title ?? "双人游戏")} room` : `加入${gameInfo?.title ?? "双人游戏"}房间`}
          </Button>
        </View>
      )}

      {room && roomState.session && (
        <>
          {(room.game.kind !== "ember_crew" || room.phase === "waiting" || room.phase === "ready" || room.phase === "completed") && <View style={[styles.players, (width < 380 || stackedForLargeText) && styles.playersCompact]}>
            <PlayerPill
              actionLabel={gameActionLabel(room)}
              active={seat0Active}
              aiActing={Boolean(room.players[0]?.isAi && room.ai?.status === "thinking")}
              isYou={ownSeat === 0}
              player={room.players[0] ?? null}
              showActionLabel={showExclusiveAction && width >= 430}
              showReady={room.phase === "waiting" || room.phase === "ready"}
            />
            <Text style={[styles.versus, (width < 360 || stackedForLargeText) && styles.versusCompact]}>{isCompetitive(room) ? "VS" : "+"}</Text>
            <PlayerPill
              actionLabel={gameActionLabel(room)}
              active={seat1Active}
              aiActing={Boolean(room.players[1]?.isAi && room.ai?.status === "thinking")}
              isYou={ownSeat === 1}
              player={room.players[1] ?? null}
              showActionLabel={showExclusiveAction && width >= 430}
              showReady={room.phase === "waiting" || room.phase === "ready"}
            />
          </View>}

          {!retiredGame && (room.phase === "waiting" || room.phase === "ready") && (
            <View style={[styles.lobbyCard, width < 720 && styles.lobbyCardStacked]}>
              <View style={[styles.lobbyCopy, width < 720 && styles.lobbyCopyStacked]}>
                <Text accessibilityLiveRegion="polite" accessibilityRole="header" aria-level={2} style={styles.lobbyTitle}>{lobbyTitle}</Text>
                <Text style={styles.muted}>{lobbyDetail}</Text>
                <View style={styles.rulesBox}>
                  <Text style={styles.rulesLabel}>本局规则</Text>
                  <Text style={styles.rulesText}>{gameInfo?.rules}</Text>
                  <Text style={styles.optionsText}>{getRoomOptionsCopy(room.gameId, room.options)}</Text>
                </View>
                <View style={styles.shareRow}>
                  {!partner && <Button onPress={copyInvite} style={styles.shareButton} variant="secondary">{copied ? "邀请已复制" : "复制邀请"}</Button>}
                  {!partner && <Button onPress={shareInvite} style={styles.shareButton} variant="ghost">系统分享</Button>}
                  <Button onPress={() => setTutorialOpen(true)} style={styles.shareButton} variant="ghost">玩法说明</Button>
                </View>
                {inviteNotice && <Text accessibilityLiveRegion="assertive" accessibilityRole="alert" style={styles.inlineError}>{inviteNotice}</Text>}
              </View>
              <View accessibilityLiveRegion="polite" style={[styles.readyBox, width < 720 && styles.readyBoxStacked, partner?.ready && !ownPlayer?.ready && styles.readyBoxAttention]}>
                {!partner && <ActivityIndicator color={colors.primary} size="small" style={styles.waitingIndicator} />}
                <Text style={styles.readyLabel}>
                  {isAiRoom
                    ? ownPlayer?.ready ? "已同步准备状态" : "现在轮到你确认"
                    : !partner
                    ? "等待好友加入"
                    : partnerDisconnected
                      ? ownPlayer?.ready && partner.ready ? "已就绪，等待重连" : "好友暂时离线"
                      : ownPlayer?.ready ? "你已准备" : partner.ready ? "现在轮到你" : "准备好了吗？"}
                </Text>
                <Button
                  disabled={!partner || roomState.status !== "connected"}
                  loading={roomState.controlPending === "ready"}
                  loadingLabel={ownPlayer?.ready ? "正在取消" : "正在确认准备"}
                  onPress={() => {
                    roomScreenRef.current?.scrollTo({ animated: false, y: 0 });
                    roomState.setReady(!ownPlayer?.ready);
                  }}
                  variant={ownPlayer?.ready ? "ghost" : "primary"}
                >
                  {isAiRoom
                    ? ownPlayer?.ready ? "取消准备" : "准备并开始"
                    : !partner
                    ? "等待好友"
                    : ownPlayer?.ready
                      ? "取消准备"
                      : partnerDisconnected && partner.ready
                        ? "准备，等好友回来"
                        : partner.ready ? "准备并开始" : "我准备好了"}
                </Button>
              </View>
            </View>
          )}

          {(room.phase === "playing" || room.phase === "reconnect_grace" || room.phase === "completed") && (
            <View onLayout={({ nativeEvent }) => setGameTop(nativeEvent.layout.y)} style={[styles.gameShell, compactGameShell && styles.emberShell]}>
              {!result && (
              <View style={[styles.gameStatusRow, stackedForLargeText && styles.gameStatusRowLargeText]}>
                {!compactGameShell && <View accessibilityLiveRegion="polite" style={styles.statusCopy}>
                  <Text accessibilityRole="header" aria-level={2} style={styles.phaseLabel}>{roomState.status === "error" ? "连接恢复后继续" : roomState.status === "reconnecting" || roomState.status === "connecting" ? "正在恢复对局连接" : phaseCopy(room, ownSeat, now)}</Text>
                  <Text style={styles.phaseHint}>{roomState.status !== "connected" ? "操作已暂停；恢复后会自动同步最新进度" : phaseHint(room, ownSeat)}</Text>
                </View>}
                <View style={[styles.statusTools, stackedForLargeText && styles.statusToolsLargeText]}>
                  {roomState.actionSyncStatus !== "idle" && (
                    <View
                      accessibilityLabel={t(roomState.actionSyncStatus === "confirmed" ? "操作已同步" : "操作正在同步")}
                      accessibilityLiveRegion="polite"
                      style={[styles.syncPill, roomState.actionSyncStatus === "slow" && styles.syncPillSlow]}
                    >
                      {roomState.actionPending
                        ? <ActivityIndicator color={roomState.actionSyncStatus === "slow" ? colors.danger : colors.primaryDark} size="small" />
                        : <Text style={styles.syncCheck}>✓</Text>}
                      <Text style={[styles.syncText, roomState.actionSyncStatus === "slow" && styles.syncTextSlow]}>
                        {roomState.actionSyncStatus === "sending" ? "同步中" : roomState.actionSyncStatus === "slow" ? "同步较慢" : "已同步"}
                      </Text>
                    </View>
                  )}
                  <Button onPress={() => setTutorialOpen(true)} style={styles.guideButton} variant="ghost">玩法</Button>
                  {room.phase === "playing" && room.game.turnDeadline && <DeadlineTimer deadline={room.game.turnDeadline} reconnecting={false} />}
                  {room.phase === "reconnect_grace" && room.reconnectDeadline && <DeadlineTimer deadline={room.reconnectDeadline} reconnecting />}
                </View>
              </View>
              )}

              {!result && room.game.kind !== "ember_crew" && room.ai && (room.ai.status === "thinking" || aiIntent || aiSuggestion) && (
                <View accessibilityLiveRegion="polite" style={styles.aiAssistCard}>
                  <View style={[styles.aiAssistDot, room.ai.status === "thinking" && styles.aiAssistDotThinking]} />
                  <View style={styles.aiAssistCopy}>
                    <Text style={styles.aiAssistTitle}>
                      {aiIntent || aiSuggestion
                        ? "与 AI 搭档配合"
                        : `${partner?.nickname ?? "AI 对手"}正在思考`}
                    </Text>
                    {aiIntent && (
                      <Text style={styles.aiAssistDetail}>
                        {partner?.nickname ?? t("AI 搭档")} · {t("准备执行")}：{t(aiIntent)}
                      </Text>
                    )}
                    {aiSuggestion && (
                      <Text style={styles.aiAssistDetail}>{t("建议你")}：{t(aiSuggestion)}</Text>
                    )}
                    {!aiIntent && !aiSuggestion && (
                      <Text style={styles.aiAssistDetail}>动作完成后会自动同步，无需刷新。</Text>
                    )}
                  </View>
                </View>
              )}

              {result && (
                <View accessibilityLiveRegion="assertive" style={[styles.resultCard, (width < 600 || fontScale > 1.2) && styles.resultCardStacked]}>
                  <View style={[styles.resultCopy, (width < 600 || fontScale > 1.2) && styles.resultCopyStacked]}>
                    <Text accessibilityRole="header" aria-level={2} style={styles.resultTitle}>{result.title}</Text>
                    <Text style={styles.muted}>{result.detail}</Text>
                    <View style={styles.resultStats}>
                      {stats.map((stat) => (
                        <View key={stat.label} style={styles.resultStat}>
                          <Text style={styles.resultStatLabel}>{stat.label}</Text>
                          <Text style={styles.resultStatValue}>{stat.value}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                  <View style={styles.resultActions}>
                  {retiredGame ? <>
                    <Text style={styles.muted}>本局结果已保留，请回首页选择其他游戏。</Text>
                    <Button onPress={requestLeave}>选择其他游戏</Button>
                  </> : <Button
                    disabled={roomState.status !== "connected"}
                    loading={roomState.controlPending === "rematch"}
                    loadingLabel={room.rematchVotes.includes(ownSeat) ? "正在取消" : "正在确认"}
                    onPress={() => {
                      setConfirmingResign(false);
                      roomState.voteRematch(!room.rematchVotes.includes(ownSeat));
                    }}
                    variant={room.rematchVotes.includes(ownSeat) ? "ghost" : "primary"}
                  >
                    {room.rematchVotes.includes(ownSeat)
                      ? "取消再战"
                      : room.rematchVotes.includes(ownSeat === 0 ? 1 : 0)
                        ? "对方已同意，轮到你"
                        : "再来一局"}
                  </Button>}
                  <Button onPress={() => setTutorialOpen(true)} style={styles.guideButton} variant="ghost">玩法</Button>
                  {!retiredGame && room.rematchVotes.length > 0 && <Text accessibilityLiveRegion="polite" style={styles.resultNextHint}>{phaseHint(room, ownSeat)}</Text>}
                  </View>
                </View>
              )}

              <View
                accessibilityElementsHidden={gameAccessibilityBlocked}
                aria-hidden={gameAccessibilityBlocked}
                importantForAccessibility={gameAccessibilityBlocked ? "no-hide-descendants" : "auto"}
                style={[styles.gameStage, gameInteractionBlocked && styles.gameStagePending, { pointerEvents: gameInteractionBlocked ? "none" : "auto" }]}
              >
              {room.game.kind === "gomoku" && (
                <GomokuBoard
                  canPlay={room.game.currentSeat === ownSeat}
                  game={room.game}
                  onPlace={roomState.placeStone}
                  phase={gameInteractionPhase}
                />
              )}
              {room.game.kind === "reversi" && (
                <ReversiBoard game={room.game} onPlace={roomState.placeDisc} ownSeat={ownSeat} phase={gameInteractionPhase} />
              )}
              {room.game.kind === "split_maze" && (
                <MazeBoard game={room.game} onMove={roomState.moveMaze} ownSeat={ownSeat} phase={gameInteractionPhase} />
              )}
              {room.game.kind === "sync_tap" && (
                <SyncTapGame game={room.game} now={now} onTap={roomState.tapInSync} ownSeat={ownSeat} phase={gameInteractionPhase} />
              )}
              {room.game.kind === "cover_hunt" && (
                <CoverHuntGame
                  key={`cover-hunt-${room.round}`}
                  game={room.game}
                  onHide={roomState.hideInCover}
                  onScan={roomState.scanCover}
                  onShoot={roomState.shootCover}
                  ownSeat={ownSeat}
                  phase={gameInteractionPhase}
                />
              )}
              {room.game.kind === "starship_defuse" && (
                <StarshipDefuseGame
                  game={room.game}
                  onPressSymbol={roomState.pressDefuseSymbol}
                  ownSeat={ownSeat}
                  phase={gameInteractionPhase}
                />
              )}
              {room.game.kind === "quantum_duel" && (
                <QuantumDuelGame
                  game={room.game}
                  onChoose={roomState.chooseDuelMove}
                  ownSeat={ownSeat}
                  phase={gameInteractionPhase}
                />
              )}
              {room.game.kind === "starway_escort" && (
                <StarwayEscortGame
                  game={room.game}
                  onRoute={roomState.chooseEscortRoute}
                  onShield={roomState.chooseEscortShield}
                  ownSeat={ownSeat}
                  phase={gameInteractionPhase}
                />
              )}
              {room.game.kind === "orbital_repair" && (
                <OrbitalRepairGame
                  game={room.game}
                  onLaunch={roomState.launchRepairPulse}
                  onRotate={roomState.rotateOrbitRing}
                  ownSeat={ownSeat}
                  phase={gameInteractionPhase}
                />
              )}
              {room.game.kind === "rhythm_gravity" && (
                <RhythmGravityGame
                  game={room.game}
                  now={now}
                  onTap={roomState.tapRhythmGravity}
                  ownSeat={ownSeat}
                  phase={gameInteractionPhase}
                />
              )}
              {room.game.kind === "shadow_shuttle" && (
                <ShadowShuttleGame
                  game={room.game}
                  onGuess={roomState.guessShadowPod}
                  onMark={roomState.markShadowPod}
                  ownSeat={ownSeat}
                  phase={gameInteractionPhase}
                />
              )}
              {room.game.kind === "echo_relay" && (
                <EchoRelayGame
                  game={room.game}
                  onPressTone={roomState.pressEchoTone}
                  ownSeat={ownSeat}
                  phase={gameInteractionPhase}
                />
              )}
              {room.game.kind === "core_rally" && (
                <CoreRallyGame
                  game={room.game}
                  now={now}
                  onMove={roomState.moveCorePaddle}
                  onReturn={roomState.returnCore}
                  ownSeat={ownSeat}
                  phase={gameInteractionPhase}
                />
              )}
              {room.game.kind === "skyline_rescue" && (
                <SkylineRescueGame
                  game={room.game}
                  onAim={roomState.chooseRescueAim}
                  onPressure={roomState.chooseRescuePressure}
                  ownSeat={ownSeat}
                  phase={gameInteractionPhase}
                />
              )}
              {room.game.kind === "meteor_dash" && (
                <MeteorDashGame
                  game={room.game}
                  now={now}
                  onCatch={roomState.catchMeteor}
                  ownSeat={ownSeat}
                  phase={gameInteractionPhase}
                />
              )}
              {room.game.kind === "neon_dash" && (
                <NeonDashGame
                  game={room.game}
                  now={now}
                  onDodge={roomState.dodgeNeonObstacle}
                  ownSeat={ownSeat}
                  phase={gameInteractionPhase}
                />
              )}
              {room.game.kind === "signal_bluff" && (
                <SignalBluffGame
                  game={room.game}
                  now={now}
                  onClaim={roomState.claimSignal}
                  onJudge={roomState.judgeSignal}
                  onScan={roomState.scanSignal}
                  ownSeat={ownSeat}
                  phase={gameInteractionPhase}
                />
              )}
              {room.game.kind === "prism_heist" && (
                <PrismHeistGame
                  game={room.game}
                  now={now}
                  onBypass={roomState.bypassHeistGrid}
                  onDash={roomState.dashThroughHeist}
                  onMove={roomState.moveHeistRunner}
                  ownSeat={ownSeat}
                  phase={gameInteractionPhase}
                />
              )}
              {room.game.kind === "nova_volley" && (
                <NovaVolleyGame
                  game={room.game}
                  now={now}
                  onMove={roomState.moveNovaPaddle}
                  onStrike={roomState.strikeNovaBall}
                  ownSeat={ownSeat}
                  phase={gameInteractionPhase}
                />
              )}
              {room.game.kind === "pulse_pass" && (
                <PulsePassGame
                  game={room.game}
                  now={now}
                  onCharge={roomState.chargePulseCore}
                  onVent={roomState.ventPulseCore}
                  ownSeat={ownSeat}
                  phase={gameInteractionPhase}
                />
              )}
              {room.game.kind === "drop_rescue" && (
                <DropRescueGame
                  game={room.game}
                  now={now}
                  onBrake={roomState.adjustDropBrake}
                  onLock={roomState.lockDropControl}
                  onMove={roomState.moveDropPod}
                  ownSeat={ownSeat}
                  phase={gameInteractionPhase}
                />
              )}
              {room.game.kind === "dual_thrusters" && (
                <DualThrustersGame
                  game={room.game}
                  onChoosePower={roomState.chooseThrusterPower}
                  ownSeat={ownSeat}
                  phase={gameInteractionPhase}
                />
              )}
              {room.game.kind === "fog_sonar" && (
                <FogSonarGame
                  game={room.game}
                  onPing={roomState.sendSonarPing}
                  onSteer={roomState.steerFogVessel}
                  ownSeat={ownSeat}
                  phase={gameInteractionPhase}
                />
              )}
              {room.game.kind === "storm_grid" && (
                <StormGridGame
                  game={room.game}
                  onDischarge={roomState.dischargeStormGrid}
                  onShift={roomState.shiftGridSelector}
                  onToggle={roomState.toggleGridPolarity}
                  ownSeat={ownSeat}
                  phase={gameInteractionPhase}
                />
              )}
              {room.game.kind === "trajectory_intercept" && (
                <TrajectoryInterceptGame
                  game={room.game}
                  onCapture={roomState.captureTrajectory}
                  onMove={roomState.moveInterceptCursor}
                  ownSeat={ownSeat}
                  phase={gameInteractionPhase}
                />
              )}
              {room.game.kind === "star_trace" && (
                <StarTraceGame
                  game={room.game}
                  onMove={roomState.moveStarTrace}
                  ownSeat={ownSeat}
                  phase={gameInteractionPhase}
                />
              )}
              {room.game.kind === "magnet_haul" && (
                <MagnetHaulGame
                  game={room.game}
                  onMove={roomState.moveMagnetArm}
                  ownSeat={ownSeat}
                  phase={gameInteractionPhase}
                />
              )}
              {room.game.kind === "ember_crew" && (
                <EmberCrewGame key={`${room.round}:${room.game.round}`} game={room.game} now={now}
                  playerNames={[room.players[0]?.nickname ?? "", room.players[1]?.nickname ?? ""]}
                  playerConnected={[Boolean(room.players[0]?.connected), Boolean(room.players[1]?.connected)]}
                  partnerIsAi={Boolean(room.players[ownSeat === 0 ? 1 : 0]?.isAi)}
                  ownSeat={ownSeat} phase={gameInteractionPhase} pending={roomState.actionPending}
                  onPlan={(plan) => { if (room.game.kind === "ember_crew") roomState.planEmber(room.game.round, plan); }}
                  onCommit={() => { if (room.game.kind === "ember_crew") roomState.commitEmber(room.game.round); }} />
              )}
              {room.game.kind === "lumen_bridge" && (
                <LumenBridgeGame
                  game={room.game}
                  now={now}
                  onAdjust={roomState.adjustLumenBridge}
                  onLock={roomState.lockLumenBridge}
                  ownSeat={ownSeat}
                  phase={gameInteractionPhase}
                />
              )}
              </View>

              <View style={styles.reactions}>
                {(Object.keys(reactionEmoji) as ReactionId[]).map((id) => (
                  <Button accessibilityLabel={`发送${reactionName[id]}回应`} disabled={roomState.reactionCooldown || roomState.status !== "connected"} key={id} onPress={() => roomState.sendReaction(id)} style={styles.reactionButton} variant="ghost">
                    {reactionEmoji[id]}
                  </Button>
                ))}
                {room.phase !== "completed" && (
                  <Button onPress={() => setConfirmingResign(true)} style={styles.resignButton} variant="danger">
                    {isCompetitive(room) ? "认输" : "结束本局"}
                  </Button>
                )}
              </View>

              {roomState.reaction && (
                <View
                  accessibilityLabel={t(`${room.players[roomState.reaction.fromSeat]?.nickname ?? "好友"}发来${reactionName[roomState.reaction.id]}回应`)}
                  accessibilityLiveRegion="polite"
                  style={[styles.reactionBubble, roomState.reaction.fromSeat === ownSeat ? styles.reactionRight : styles.reactionLeft]}
                >
                  <Text style={styles.reactionLarge}>{reactionEmoji[roomState.reaction.id]}</Text>
                </View>
              )}

            </View>
          )}
          {gameInfo && (
            <TutorialOverlay
              closeLabel={room?.phase === "waiting" ? "知道了，继续邀请" : room?.phase === "ready" ? "知道了，去准备" : "知道了，继续游戏"}
              game={gameInfo}
              onClose={closeTutorial}
              visible={tutorialOpen}
            />
          )}
          <ConfirmSheet
            confirmLabel="暂时离开"
            detail="对局会为搭档暂停；60 秒内用同一设备回来，可以从原处继续。"
            onCancel={() => setConfirmingLeave(false)}
            onConfirm={() => {
              allowNavigationRef.current = true;
              setConfirmingLeave(false);
              router.replace("/");
            }}
            title="暂时离开这局？"
            visible={confirmingLeave}
          />
          <ConfirmSheet
            confirmLabel={room && isCompetitive(room) ? "确认认输" : "结束本局"}
            confirming={roomState.controlPending === "resign"}
            destructive
            detail={room && isCompetitive(room) ? "本局会立即结束，对手获胜。" : "本局会立即结束，合作目标不会完成。"}
            onCancel={() => setConfirmingResign(false)}
            onConfirm={() => {
              roomState.resign();
            }}
            title={room && isCompetitive(room) ? "确定认输吗？" : "确定结束合作吗？"}
            visible={Boolean(confirmingResign && room && room.phase !== "completed")}
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 30, gap: 14 },
  navRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  connectionPill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.surface, paddingHorizontal: 11, paddingVertical: 8, borderRadius: radii.pill },
  connectionDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.coral },
  connectedDot: { backgroundColor: colors.teal },
  connectionText: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  exitButton: { minHeight: 44, paddingHorizontal: 14 },
  roomHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 18, marginBottom: 22 },
  roomHeaderCompact: { flexDirection: "column", alignItems: "stretch", gap: 12 },
  roomHeadingCopy: { flex: 1, minWidth: 0 },
  kicker: { color: colors.primary, fontWeight: "900", fontSize: 12, letterSpacing: 0.8 },
  roomTitle: { color: colors.ink, fontWeight: "900", fontSize: 30, marginTop: 4 },
  codeBadge: { backgroundColor: colors.surface, borderRadius: radii.medium, paddingHorizontal: 16, paddingVertical: 10, alignItems: "center", ...shadows.card },
  codeBadgeCompact: { alignSelf: "flex-start" },
  codeLabel: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 0.7 },
  code: { color: colors.ink, fontSize: 19, fontWeight: "900", letterSpacing: 2 },
  notice: { backgroundColor: colors.coralSoft, borderRadius: radii.small, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 14 },
  noticeText: { color: colors.danger, fontSize: 13, fontWeight: "700" },
  recoveryCard: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 14, backgroundColor: colors.coralSoft, borderWidth: 1.5, borderColor: colors.coral, borderRadius: radii.medium, padding: 16, marginBottom: 16 },
  recoveryCopy: { flex: 1, minWidth: 210 },
  recoveryTitle: { color: colors.ink, fontSize: 16, fontWeight: "900", marginBottom: 3 },
  recoveryButton: { minWidth: 124 },
  players: { flexDirection: "row", alignItems: "stretch", gap: 10, marginBottom: 18 },
  playersCompact: { flexDirection: "column", alignItems: "stretch", gap: 6 },
  versus: { alignSelf: "center", color: colors.muted, fontSize: 16, fontWeight: "900" },
  versusCompact: { alignSelf: "center" },
  lobbyCard: { flexDirection: "row", flexWrap: "wrap", gap: 24, backgroundColor: colors.surface, padding: 24, borderRadius: radii.large, ...shadows.card },
  lobbyCardStacked: { flexDirection: "column", flexWrap: "nowrap", gap: 18 },
  lobbyCopy: { flex: 1, minWidth: 260 },
  lobbyCopyStacked: { width: "100%", minWidth: 0 },
  lobbyTitle: { color: colors.ink, fontSize: 22, fontWeight: "900", marginBottom: 8 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  rulesBox: { backgroundColor: colors.canvas, borderRadius: radii.small, padding: 13, marginTop: 15 },
  rulesLabel: { color: colors.primary, fontSize: 10, fontWeight: "900", letterSpacing: 0.8, marginBottom: 4 },
  rulesText: { color: colors.ink, fontSize: 13, lineHeight: 20 },
  optionsText: { color: colors.primaryDark, fontSize: 11, fontWeight: "900", marginTop: 7 },
  shareRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 20 },
  shareButton: { minWidth: 124 },
  inlineError: { color: colors.danger, fontSize: 12, lineHeight: 18, fontWeight: "700", marginTop: 10 },
  readyBox: { minWidth: 220, backgroundColor: colors.canvas, borderRadius: radii.medium, padding: 18, justifyContent: "center" },
  readyBoxStacked: { width: "100%", minWidth: 0, alignSelf: "stretch" },
  readyBoxAttention: { backgroundColor: colors.tealSoft, borderWidth: 1.5, borderColor: colors.teal },
  waitingIndicator: { marginBottom: 10 },
  readyLabel: { color: colors.ink, fontSize: 13, fontWeight: "800", marginBottom: 10, textAlign: "center" },
  gameShell: { position: "relative", backgroundColor: colors.surface, borderRadius: radii.large, padding: 18, ...shadows.card },
  emberShell: { padding: 8 },
  gameStatusRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 4, marginBottom: 16 },
  aiAssistCard: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 16, paddingHorizontal: 14, paddingVertical: 11, borderRadius: radii.medium, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primarySoft },
  aiAssistDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.teal },
  aiAssistDotThinking: { backgroundColor: colors.primary },
  aiAssistCopy: { flex: 1, minWidth: 0 },
  aiAssistTitle: { color: colors.primaryDark, fontSize: 12, fontWeight: "900" },
  aiAssistDetail: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  gameStatusRowLargeText: { flexDirection: "column", alignItems: "stretch" },
  statusCopy: { flex: 1, minWidth: 190 },
  statusTools: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end", gap: 8 },
  statusToolsLargeText: { justifyContent: "flex-start" },
  syncPill: { minHeight: 36, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.tealSoft, paddingHorizontal: 10, borderRadius: radii.pill },
  syncPillSlow: { backgroundColor: colors.coralSoft },
  syncCheck: { color: colors.tealInk, fontSize: 15, fontWeight: "900" },
  syncText: { color: colors.tealInk, fontSize: 11, fontWeight: "900" },
  syncTextSlow: { color: colors.danger },
  guideButton: { minHeight: 44, paddingHorizontal: 12 },
  phaseLabel: { color: colors.ink, fontSize: 20, fontWeight: "900" },
  phaseHint: { color: colors.muted, fontSize: 12, marginTop: 3 },
  timer: { flexDirection: "row", alignItems: "baseline", backgroundColor: colors.primarySoft, paddingHorizontal: 13, paddingVertical: 7, borderRadius: radii.pill },
  timerDanger: { backgroundColor: colors.coralSoft },
  timerNumber: { color: colors.primaryDark, fontSize: 20, fontWeight: "900", fontVariant: ["tabular-nums"] },
  timerUnit: { color: colors.primaryDark, fontSize: 10, fontWeight: "800", marginLeft: 2 },
  timerDangerText: { color: colors.danger },
  gameStage: { opacity: 1 },
  gameStagePending: { opacity: 0.78 },
  reactions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 16 },
  reactionButton: { minHeight: 44, width: 48, paddingHorizontal: 0 },
  resignButton: { minHeight: 44, marginLeft: 8 },
  reactionBubble: { position: "absolute", top: 80, zIndex: 5, backgroundColor: colors.surface, padding: 12, borderRadius: radii.pill, ...shadows.card },
  reactionLeft: { left: 22 },
  reactionRight: { right: 22 },
  reactionLarge: { fontSize: 30 },
  resultCard: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 18, marginBottom: 18, backgroundColor: colors.primarySoft, borderRadius: radii.medium, padding: 18 },
  resultCopy: { flexGrow: 1, flexShrink: 1, flexBasis: 210, minWidth: 0 },
  resultCardStacked: { flexDirection: "column", alignItems: "stretch" },
  resultCopyStacked: { flexBasis: "auto", width: "100%" },
  resultActions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, maxWidth: "100%" },
  resultNextHint: { flexBasis: "100%", color: colors.muted, fontSize: 12, lineHeight: 18 },
  resultStats: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 10 },
  resultStat: { minWidth: 84, backgroundColor: colors.surface, borderRadius: radii.small, paddingHorizontal: 10, paddingVertical: 7 },
  resultStatLabel: { color: colors.muted, fontSize: 10, fontWeight: "800" },
  resultStatValue: { color: colors.ink, fontSize: 14, fontWeight: "900", marginTop: 1 },
  resultTitle: { color: colors.ink, fontSize: 23, fontWeight: "900", marginBottom: 5 },
  joinCard: { width: "100%", maxWidth: 480, alignSelf: "center", alignItems: "stretch", backgroundColor: colors.surface, borderRadius: radii.large, padding: 26, gap: 16, ...shadows.card },
  joinIcon: { width: 58, height: 58, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
  joinIconText: { color: colors.primary, fontSize: 19, fontWeight: "900" },
  input: { minHeight: 52, borderWidth: 1.5, borderColor: colors.faint, borderRadius: radii.medium, backgroundColor: colors.canvas, color: colors.ink, paddingHorizontal: 16, fontSize: 16 },
  centerCard: { width: "100%", maxWidth: 480, alignSelf: "center", backgroundColor: colors.surface, borderRadius: radii.large, padding: 26, gap: 16, marginTop: 60, ...shadows.card },
});
