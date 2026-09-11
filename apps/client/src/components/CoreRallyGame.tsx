import { memo } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ScaledText";

import { useI18n } from "@/i18n";

import type { CoreRallyState, Seat } from "@duo/game-core";
import type { RoomPhase } from "@duo/protocol";

import { useSettings } from "@/settings/SettingsContext";
import { colors, createGameStyles, radii, shadows } from "@/theme";

type Props = {
  game: CoreRallyState;
  ownSeat: Seat;
  phase: RoomPhase;
  now: number;
  onMove: (direction: -1 | 1) => void;
  onReturn: () => void;
};

function outcomeCopy(game: CoreRallyState): string {
  if (game.lastOutcome === "returned") {
    if (game.lastAccuracyMs !== null && game.lastAccuracyMs <= 70) return "完美弹射！星核保持满速";
    return "接力成功，星核正在飞向搭档";
  }
  if (game.lastOutcome === "missed_lane") return "挡板没有对准来球轨道";
  if (game.lastOutcome === "timed_out") return "弹射窗口关闭，稳定度下降";
  if (game.phase === "approach") return "来球轨道已经标记，先移动挡板";
  return "窗口已开启，现在弹射";
}

function coreLeft(game: CoreRallyState): `${number}%` {
  if (game.phase === "rally_result") return game.receiverSeat === 0 ? "31%" : "69%";
  if (game.phase === "return_window") return game.receiverSeat === 0 ? "8%" : "92%";
  return game.receiverSeat === 0 ? "62%" : "38%";
}

export const CoreRallyGame = memo(function CoreRallyGame({
  game,
  ownSeat,
  phase,
  now,
  onMove,
  onReturn,
}: Props) {
  const { t } = useI18n();
  const { feedback, settings } = useSettings();
  const ended = !!game.result || phase === "completed";
  const paused = !ended && phase !== "playing";
  const isReceiver = ownSeat === game.receiverSeat;
  const canMove = phase === "playing" && isReceiver && game.phase !== "rally_result" && now < game.turnDeadline && !game.result;
  const canReturn = canMove && game.phase === "return_window";
  const actionExpired = !ended && !paused && game.phase !== "rally_result" && now >= game.turnDeadline;
  const ownLane = game.paddleLanes[ownSeat];
  const partner: Seat = ownSeat === 0 ? 1 : 0;
  const timeToWindow = Math.max(0, (game.turnDeadline - now) / 1_000);

  function move(direction: -1 | 1) {
    feedback("tap", "light");
    onMove(direction);
  }

  function returnCore() {
    feedback("hit", "heavy");
    onReturn();
  }

  return (
    <View style={[styles.shell, settings.highContrast && styles.shellContrast]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>CORE RELAY // LIVE</Text>
          <Text style={styles.title}>星核接力场</Text>
        </View>
        <View style={styles.goalBadge} accessibilityLabel={t(`已完成 ${game.successfulReturns} 次，共需 ${game.targetReturns} 次`)}>
          <Text style={styles.goalLabel}>接力进度</Text>
          <Text style={styles.goalValue}>{game.successfulReturns}/{game.targetReturns}</Text>
        </View>
      </View>

      <View style={styles.metrics}>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>团队稳定度</Text>
          <View style={styles.stabilityRow} accessibilityLabel={t(`剩余稳定度 ${game.stability}/${game.maxStability}`)}>
            {Array.from({ length: game.maxStability }, (_, index) => (
              <View key={index} style={[styles.stability, index < game.stability && styles.stabilityLive]} />
            ))}
          </View>
        </View>
        <View style={styles.metric}><Text style={styles.metricLabel}>连续接力</Text><Text style={styles.metricValue}>×{game.combo}</Text></View>
        <View style={styles.metric}><Text style={styles.metricLabel}>接力基础分</Text><Text style={styles.metricValue}>{game.score}</Text></View>
      </View>

      <View style={styles.arena}>
        <View style={styles.stationRow}>
          <View style={[styles.station, game.receiverSeat === 0 && styles.stationLive]}><Text style={styles.stationText}>A 舰</Text></View>
          <Text style={styles.incomingLabel}>目标轨道 {game.incomingLane + 1}</Text>
          <View style={[styles.station, styles.stationCoral, game.receiverSeat === 1 && styles.stationLive]}><Text style={styles.stationText}>B 舰</Text></View>
        </View>

        <View
          accessibilityLabel={t(`${ended ? "最终" : "星核正飞向" + (game.receiverSeat === ownSeat ? "你" : "搭档") + "，"}目标为第 ${game.incomingLane + 1} 轨道；你的挡板在第 ${ownLane + 1} 轨道`)}
          style={styles.lanes}
        >
          {Array.from({ length: game.laneCount }, (_, lane) => (
            <View key={lane} style={[styles.lane, lane === game.incomingLane && styles.laneTarget]}>
              <Text style={styles.laneNumber}>{lane + 1}</Text>
              <View style={styles.laneLine} />
              {game.paddleLanes[0] === lane && <View style={[styles.paddle, game.receiverSeat === 0 && styles.paddleLive]} />}
              {game.paddleLanes[1] === lane && <View style={[styles.paddle, styles.paddleRight, styles.paddleCoral, game.receiverSeat === 1 && styles.paddleLive]} />}
              {game.incomingLane === lane && (
                <View style={[styles.core, { left: coreLeft(game) }, game.phase === "return_window" && styles.coreLive]}>
                  <Text style={styles.coreGlyph}>◆</Text>
                </View>
              )}
            </View>
          ))}
        </View>
      </View>

      <View style={[styles.roleCard, isReceiver ? styles.roleActive : styles.roleWaiting]}>
        <View style={[styles.roleMark, isReceiver ? styles.roleMarkLive : styles.roleMarkWaiting]}><Text style={styles.roleGlyph}>{isReceiver ? "接" : "备"}</Text></View>
        <View style={styles.roleCopy}>
          <Text accessibilityLiveRegion="polite" style={styles.roleTitle}>{ended ? "本局接力已结束" : paused ? "等待连接恢复" : actionExpired ? "接球窗口已关闭，正在结算" : game.phase === "rally_result" ? "本次接力已判定" : isReceiver ? "轮到你接住星核" : "搭档正在接球"}</Text>
          <Text style={styles.roleHint}>
            {ended ? "查看上方团队结果，可一起再来一局" : paused ? "恢复连接后从暂停处继续" : actionExpired ? "双方操作已停止，等待服务器同步结果" : isReceiver
              ? game.phase === "approach"
                ? `在 ${timeToWindow.toFixed(1)} 秒内移到第 ${game.incomingLane + 1} 轨道，等窗口亮起`
                : game.phase === "return_window" ? "挡板对准后按下弹射，越靠近窗口中心得分越高" : outcomeCopy(game)
              : `你的挡板在第 ${ownLane + 1} 轨道；下一次接力将轮到你`}
          </Text>
        </View>
      </View>

      <View style={styles.controls}>
        <Pressable
          accessibilityLabel={t("挡板向上移动一条轨道")}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canMove || ownLane === 0 }}
          disabled={!canMove || ownLane === 0}
          onPress={() => move(-1)}
          style={({ pressed }) => [styles.moveButton, (!canMove || ownLane === 0) && styles.disabled, pressed && !settings.reducedMotion && styles.pressed]}
        >
          <Text style={styles.moveGlyph}>↑</Text><Text style={styles.moveLabel}>上移</Text>
        </Pressable>
        <Pressable
          accessibilityHint={t("仅在弹射窗口亮起后可用")}
          accessibilityLabel={t("弹射星核")}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canReturn }}
          disabled={!canReturn}
          onPress={returnCore}
          style={({ pressed }) => [styles.returnButton, canReturn && styles.returnButtonLive, !canReturn && styles.disabled, pressed && !settings.reducedMotion && styles.returnPressed]}
        >
          <Text style={styles.returnGlyph}>◆</Text>
          <Text style={styles.returnLabel}>{ended ? "已结束" : paused ? "已暂停" : actionExpired ? "等待结算" : game.phase === "rally_result" ? "已判定" : !isReceiver ? "搭档接球" : game.phase === "approach" ? "等待窗口" : "弹射！"}</Text>
        </Pressable>
        <Pressable
          accessibilityLabel={t("挡板向下移动一条轨道")}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canMove || ownLane === game.laneCount - 1 }}
          disabled={!canMove || ownLane === game.laneCount - 1}
          onPress={() => move(1)}
          style={({ pressed }) => [styles.moveButton, (!canMove || ownLane === game.laneCount - 1) && styles.disabled, pressed && !settings.reducedMotion && styles.pressed]}
        >
          <Text style={styles.moveGlyph}>↓</Text><Text style={styles.moveLabel}>下移</Text>
        </Pressable>
      </View>

      <View style={[styles.status, game.lastOutcome && game.lastOutcome !== "returned" && styles.statusDanger]}>
        <View style={[styles.statusDot, game.lastOutcome === "returned" && styles.statusGood]} />
        <Text accessibilityLiveRegion="polite" style={styles.statusText}>{ended ? "本局已结束" : paused ? "接力已暂停" : actionExpired ? "操作窗已关闭，服务器同步中" : !isReceiver && game.phase === "return_window" ? "窗口已开启，等待搭档弹射" : outcomeCopy(game)}</Text>
        <Text style={styles.statusMeta}>搭档挡板：轨道 {game.paddleLanes[partner] + 1} · 最佳连击 ×{game.bestCombo}</Text>
      </View>
    </View>
  );
});

const styles = createGameStyles({
  shell: { width: "100%", maxWidth: 940, alignSelf: "center", backgroundColor: "#071B28", borderRadius: radii.large, padding: 18, ...shadows.card },
  shellContrast: { borderWidth: 3, borderColor: colors.surface },
  header: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 14 },
  kicker: { color: "#63E0D0", fontSize: 9, fontWeight: "900", letterSpacing: 1.3 },
  title: { color: colors.surface, fontSize: 21, fontWeight: "900", marginTop: 3 },
  goalBadge: { minWidth: 90, alignItems: "center", backgroundColor: "#143344", borderRadius: radii.small, paddingHorizontal: 12, paddingVertical: 8 },
  goalLabel: { color: "#9EBEC7", fontSize: 8, fontWeight: "900" },
  goalValue: { color: colors.surface, fontSize: 18, fontWeight: "900", marginTop: 1 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  metric: { flexGrow: 1, flexShrink: 1, flexBasis: 80, minWidth: 0, minHeight: 48, justifyContent: "center", backgroundColor: "#102B3A", borderRadius: radii.small, paddingHorizontal: 10 },
  metricLabel: { color: "#9EBEC7", fontSize: 8, fontWeight: "900" },
  metricValue: { color: "#E9FBF7", fontSize: 14, fontWeight: "900", marginTop: 3 },
  stabilityRow: { flexDirection: "row", gap: 4, marginTop: 7 },
  stability: { flex: 1, maxWidth: 24, height: 7, borderRadius: 4, backgroundColor: "#344954" },
  stabilityLive: { backgroundColor: "#64DCCB" },
  arena: { backgroundColor: "#031019", borderRadius: radii.medium, padding: 13, marginTop: 11, overflow: "hidden" },
  stationRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 },
  station: { minWidth: 55, alignItems: "center", borderRadius: radii.pill, backgroundColor: "#3E4EBC", borderWidth: 2, borderColor: "#6979DF", paddingVertical: 6 },
  stationCoral: { backgroundColor: "#9B493F", borderColor: "#D97868" },
  stationLive: { borderColor: "#F6D879", shadowColor: "#F6D879", shadowOpacity: 0.55, shadowRadius: 8 },
  stationText: { color: colors.surface, fontSize: 9, fontWeight: "900" },
  incomingLabel: { flex: 1, color: "#F5D575", textAlign: "center", fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
  lanes: { gap: 5 },
  lane: { height: 34, borderRadius: 8, position: "relative", justifyContent: "center", backgroundColor: "#081B26", borderWidth: 1, borderColor: "#173543" },
  laneTarget: { backgroundColor: "#102F39", borderColor: "#3D807E" },
  laneNumber: { position: "absolute", left: "50%", marginLeft: -4, top: 2, color: "#A5C2CC", fontSize: 7, fontWeight: "900" },
  laneLine: { position: "absolute", left: 15, right: 15, top: 16, height: 2, backgroundColor: "#1B4050" },
  paddle: { position: "absolute", left: 8, width: 8, height: 23, borderRadius: 4, backgroundColor: "#737EF1", borderWidth: 1, borderColor: "#B1B7FF", zIndex: 3 },
  paddleRight: { left: undefined, right: 8 },
  paddleCoral: { backgroundColor: "#F37D69", borderColor: "#FFC0B4" },
  paddleLive: { width: 11, shadowColor: "#F8D76E", shadowOpacity: 0.75, shadowRadius: 6 },
  core: { position: "absolute", marginLeft: -13, width: 26, height: 26, top: 3, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#F2C65F", borderWidth: 2, borderColor: "#FFF1B6", zIndex: 4 },
  coreLive: { width: 30, height: 30, marginLeft: -15, top: 1, borderRadius: 15, shadowColor: "#FFF1A8", shadowOpacity: 0.9, shadowRadius: 10 },
  coreGlyph: { color: "#493D17", fontSize: 11, fontWeight: "900" },
  roleCard: { flexDirection: "row", alignItems: "center", gap: 11, borderRadius: radii.medium, padding: 12, marginTop: 11, borderWidth: 1.5 },
  roleActive: { backgroundColor: "#173B43", borderColor: "#3A8F89" },
  roleWaiting: { backgroundColor: "#17263A", borderColor: "#2C4561" },
  roleMark: { width: 39, height: 39, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  roleMarkLive: { backgroundColor: "#14827B" },
  roleMarkWaiting: { backgroundColor: "#3B4F66" },
  roleGlyph: { color: colors.surface, fontSize: 14, fontWeight: "900" },
  roleCopy: { flex: 1 },
  roleTitle: { color: colors.surface, fontSize: 13, fontWeight: "900" },
  roleHint: { color: "#A7BBC4", fontSize: 9, lineHeight: 14, marginTop: 3 },
  controls: { flexDirection: "row", justifyContent: "center", alignItems: "stretch", gap: 8, marginTop: 11 },
  moveButton: { flex: 1, maxWidth: 75, minWidth: 44, minHeight: 72, alignItems: "center", justifyContent: "center", backgroundColor: "#163346", borderWidth: 1.5, borderColor: "#386179", borderRadius: radii.medium },
  moveGlyph: { color: "#B9DDE5", fontSize: 23, fontWeight: "900" },
  moveLabel: { color: "#8FB3BF", fontSize: 8, fontWeight: "900", marginTop: 1 },
  returnButton: { flex: 1.5, minWidth: 74, maxWidth: 230, minHeight: 72, alignItems: "center", justifyContent: "center", backgroundColor: "#293B46", borderWidth: 2, borderColor: "#4B626D", borderRadius: radii.medium },
  returnButtonLive: { backgroundColor: "#C5902A", borderColor: "#FFE5A0", shadowColor: "#FFD66D", shadowOpacity: 0.5, shadowRadius: 10 },
  returnGlyph: { color: "#FFF3C0", fontSize: 17, fontWeight: "900" },
  returnLabel: { color: colors.surface, fontSize: 14, fontWeight: "900", marginTop: 2 },
  disabled: { opacity: 0.38 },
  pressed: { transform: [{ scale: 0.94 }] },
  returnPressed: { transform: [{ scale: 0.96 }] },
  status: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, backgroundColor: "#102B3A", borderRadius: radii.small, padding: 10, marginTop: 11 },
  statusDanger: { backgroundColor: "#43262B" },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#6F8791" },
  statusGood: { backgroundColor: "#64DCCB" },
  statusText: { flexGrow: 1, flexShrink: 1, flexBasis: 170, minWidth: 0, color: "#DCE9EB", fontSize: 12, lineHeight: 18, fontWeight: "700" },
  statusMeta: { color: "#9EBEC7", fontSize: 8, fontWeight: "800" },
});
