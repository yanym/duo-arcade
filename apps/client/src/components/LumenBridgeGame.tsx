import { memo } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ScaledText";

import { beamEndLane, otherSeat, type LumenBridgeState, type Seat } from "@duo/game-core";
import { useI18n } from "@/i18n";

import type { RoomPhase } from "@duo/protocol";

import { useSettings } from "@/settings/SettingsContext";
import { colors, createGameStyles, radii, shadows } from "@/theme";

type Props = {
  game: LumenBridgeState;
  ownSeat: Seat;
  phase: RoomPhase;
  now: number;
  onAdjust: (direction: -1 | 1) => void;
  onLock: () => void;
};

const PATH_COLUMNS = 7;

function signedArc(offset: number): string {
  return offset === 0 ? "0 · 平直" : `${offset > 0 ? "+" : "−"}${Math.abs(offset)} · 向${offset > 0 ? "下" : "上"}弯`;
}

function statusCopy(game: LumenBridgeState): string {
  if (game.lastOutcome === "resonated") return game.result ? "所有光桥节点已经稳定贯通" : "双人共振成功，光桥节点已接通";
  if (game.lastOutcome === "desynced") return "共振窗错过，稳定度下降；重新对准后再同步";
  if (game.lastOutcome === "energy_depleted") return "公共光能耗尽，桥面已经熄灭";
  if (game.lastOutcome === "bridge_timeout") return "节点时限结束，光桥未能锁定";
  if (game.phase === "resonance") return "光束已经命中目标——两人现在都按下共振锁定";
  return "升降发射台与调节弧度会共同改变光束落点";
}

export const LumenBridgeGame = memo(function LumenBridgeGame({ game, ownSeat, phase, now, onAdjust, onLock }: Props) {
  const { t } = useI18n();
  const { feedback, settings } = useSettings();
  const ended = Boolean(game.result) || phase === "completed";
  const paused = !ended && phase !== "playing";
  const controlsOrigin = ownSeat === game.originSeat;
  const arcSeat = otherSeat(game.originSeat);
  const endLane = beamEndLane(game);
  const beforeDeadline = now < game.turnDeadline;
  const actionExpired = phase === "playing" && !beforeDeadline && (game.phase === "aligning" || game.phase === "resonance") && !game.result;
  const canAdjust = phase === "playing" && game.phase === "aligning" && beforeDeadline && !game.result;
  const canLock = phase === "playing" && game.phase === "resonance" && beforeDeadline && !game.confirmations[ownSeat] && !game.result;
  const resonanceLeft = game.phase === "resonance" ? Math.max(0, game.turnDeadline - now) : 0;

  function adjustmentUnsafe(direction: -1 | 1): boolean {
    const originLane = game.originLane + (controlsOrigin ? direction : 0);
    const arcOffset = game.arcOffset + (controlsOrigin ? 0 : direction);
    return originLane < 0 || originLane >= game.laneCount || Math.abs(arcOffset) > game.maxArc ||
      originLane + arcOffset < 0 || originLane + arcOffset >= game.laneCount;
  }

  function adjust(direction: -1 | 1) {
    feedback("place", "light");
    onAdjust(direction);
  }

  function lock() {
    feedback("hit", "heavy");
    onLock();
  }

  return (
    <View style={[styles.shell, settings.highContrast && styles.highContrast]}>
      <View style={styles.header}>
        <View style={styles.headerCopy}><Text style={styles.kicker}>LUMEN BRIDGE // DUAL RESONANCE</Text><Text style={styles.title}>双人光桥共振台</Text></View>
        <View accessibilityLabel={t(`第 ${game.stage} 个光桥节点，共 ${game.totalStages} 个`)} style={styles.stageBadge}><Text style={styles.stageLabel}>光桥节点</Text><Text style={styles.stageValue}>{game.stage}/{game.totalStages}</Text></View>
      </View>

      <View style={styles.metrics}>
        <View style={styles.metric}><Text style={styles.metricLabel}>已贯通</Text><Text style={styles.metricValue}>{game.completedStages}</Text></View>
        <View style={styles.metric}><Text style={styles.metricLabel}>公共光能</Text><Text style={[styles.metricValue, game.energy <= 5 && styles.energyLow]}>{game.energy}/{game.maxEnergy}</Text></View>
        <View style={styles.metric}><Text style={styles.metricLabel}>稳定度</Text><Text style={styles.metricValue}>{game.stability}/{game.maxStability}</Text></View>
        <View style={styles.metric}><Text style={styles.metricLabel}>团队得分</Text><Text style={styles.metricValue}>{game.score}</Text></View>
      </View>

      <View style={styles.roleRow}>
        {([game.originSeat, arcSeat] as const).map((seat, index) => (
          <View key={seat} style={[styles.roleCard, index === 1 && styles.arcRole, seat === ownSeat && styles.ownRole]}>
            <Text style={styles.roleKicker}>{seat === ownSeat ? "你的控制台" : "搭档控制台"}</Text>
            <Text style={styles.roleTitle}>{index === 0 ? "升降员 · 发射台高度" : "调制员 · 星弧曲率"}</Text>
            <Text style={styles.roleValue}>{index === 0 ? `高度轨 ${game.originLane + 1}` : signedArc(game.arcOffset)}</Text>
          </View>
        ))}
      </View>

      <View style={styles.bridgeRig}>
        <View style={styles.rigHeader}><Text style={styles.rigTitle}>{`BRIDGE NODE ${String(game.stage).padStart(2, "0")}`}</Text><Text style={styles.rigLegend}>● 光束 · ◎ 目标 · ✦ 落点</Text></View>
        <View
          accessibilityLabel={t(`光桥发射台在高度轨 ${game.originLane + 1}，弧度 ${signedArc(game.arcOffset)}，当前落点 ${endLane + 1}，目标 ${game.targetLane + 1}`)}
          style={styles.grid}
        >
          {Array.from({ length: game.laneCount }, (_, lane) => (
              <View key={lane} style={[styles.lane, game.laneCount >= 7 && styles.laneCompact, game.laneCount >= 9 && styles.laneDense, lane === game.targetLane && styles.targetLane]}>
              <Text style={styles.laneNumber}>{lane + 1}</Text>
              <View style={[styles.pathCells, game.laneCount >= 7 && styles.pathCellsCompact]}>
                {Array.from({ length: PATH_COLUMNS }, (_, column) => {
                  const beamLane = Math.round(game.originLane + game.arcOffset * (column / (PATH_COLUMNS - 1)));
                  const onBeam = beamLane === lane;
                  const isEmitter = column === 0 && lane === game.originLane;
                  const isEnd = column === PATH_COLUMNS - 1 && lane === endLane;
                  const isTarget = column === PATH_COLUMNS - 1 && lane === game.targetLane;
                  return (
                    <View key={column} style={[styles.pathCell, game.laneCount >= 7 && styles.pathCellCompact, onBeam && styles.beamCell, isTarget && styles.targetCell, isEnd && isTarget && styles.alignedCell]}>
                      {isEmitter ? <Text style={styles.emitterGlyph}>◉</Text> : isEnd && isTarget ? <Text style={styles.alignedGlyph}>✦</Text> : isEnd ? <Text style={styles.endGlyph}>✦</Text> : isTarget ? <Text style={styles.targetGlyph}>◎</Text> : onBeam ? <View style={styles.beamDot} /> : null}
                    </View>
                  );
                })}
              </View>
            </View>
          ))}
        </View>
        <View style={styles.readoutRow}>
          <Text style={styles.readout}>发射 {game.originLane + 1}</Text>
          <Text style={styles.arcReadout}>星弧 {signedArc(game.arcOffset)}</Text>
          <Text style={[styles.readout, endLane === game.targetLane && styles.readoutAligned]}>落点 {endLane + 1} / 目标 {game.targetLane + 1}</Text>
        </View>
      </View>

      <View accessibilityLiveRegion="polite" style={[styles.status, game.phase === "resonance" && !paused && !ended && styles.statusLive, game.lastOutcome && styles.statusResult]}><Text style={styles.statusText}>{ended ? "本局光桥已结束" : paused ? "光桥已暂停，等待连接恢复" : actionExpired ? "时间已到，正在同步节点结果" : statusCopy(game)}</Text></View>

      {game.phase === "resonance" ? (
        <View style={styles.resonancePanel}>
          <View style={styles.resonanceHeading}>
            <View><Text style={styles.controlKicker}>RESONANCE WINDOW</Text><Text style={styles.controlTitle}>双人同步锁定</Text></View>
            <Text style={styles.windowValue}>{ended ? "已结束" : paused ? "已暂停" : `${Math.ceil(resonanceLeft / 100) / 10}s`}</Text>
          </View>
          <View style={styles.confirmRow}>
            {([0, 1] as const).map((seat) => <View key={seat} style={[styles.confirmChip, game.confirmations[seat] && styles.confirmedChip]}><Text style={styles.confirmText}>{seat === ownSeat ? "你" : "搭档"} · {game.confirmations[seat] ? "已锁定" : "等待"}</Text></View>)}
          </View>
          <Pressable accessibilityHint={t("两名玩家都必须在共振倒计时结束前各按一次")} accessibilityLabel={t("按下共振锁定")} accessibilityRole="button" accessibilityState={{ disabled: !canLock }} disabled={!canLock} onPress={lock} style={({ pressed }) => [styles.lockButton, !canLock && styles.disabled, pressed && !settings.reducedMotion && styles.pressed]}><Text style={styles.lockGlyph}>◎</Text><Text style={styles.lockLabel}>{ended ? "本局已结束" : paused ? "等待连接恢复" : actionExpired ? "等待服务器结算" : game.confirmations[ownSeat] ? "你的锁定已提交" : "按下共振锁定"}</Text></Pressable>
        </View>
      ) : (
        <View style={styles.controls}>
          <View style={styles.controlHeading}><View style={styles.controlCopy}><Text style={styles.controlKicker}>YOUR BRIDGE CONTROL</Text><Text style={styles.controlTitle}>{controlsOrigin ? `升降发射台 · 高度轨 ${game.originLane + 1}` : `调节星弧 · ${signedArc(game.arcOffset)}`}</Text></View><Text style={styles.targetReadout}>目标轨 {game.targetLane + 1}</Text></View>
          <View style={styles.controlRow}>
            <Pressable accessibilityLabel={t(controlsOrigin ? "发射台向上移动一条高度轨" : "光束弧度向上调整一档")} accessibilityRole="button" accessibilityState={{ disabled: !canAdjust || adjustmentUnsafe(-1) }} disabled={!canAdjust || adjustmentUnsafe(-1)} onPress={() => adjust(-1)} style={({ pressed }) => [styles.adjustButton, (!canAdjust || adjustmentUnsafe(-1)) && styles.disabled, pressed && !settings.reducedMotion && styles.pressed]}><Text style={styles.adjustArrow}>↟</Text><Text style={styles.adjustLabel}>{controlsOrigin ? "发射台上移" : "星弧上弯"}</Text></Pressable>
            <View style={styles.core}><Text style={styles.coreGlyph}>◉⌁◎</Text><Text style={styles.coreLabel}>{ended ? "本局结束" : paused ? "等待恢复" : actionExpired ? "等待结算" : game.phase === "stage_result" ? "节点贯通" : "共同校准"}</Text></View>
            <Pressable accessibilityLabel={t(controlsOrigin ? "发射台向下移动一条高度轨" : "光束弧度向下调整一档")} accessibilityRole="button" accessibilityState={{ disabled: !canAdjust || adjustmentUnsafe(1) }} disabled={!canAdjust || adjustmentUnsafe(1)} onPress={() => adjust(1)} style={({ pressed }) => [styles.adjustButton, (!canAdjust || adjustmentUnsafe(1)) && styles.disabled, pressed && !settings.reducedMotion && styles.pressed]}><Text style={styles.adjustArrow}>↡</Text><Text style={styles.adjustLabel}>{controlsOrigin ? "发射台下移" : "星弧下弯"}</Text></Pressable>
          </View>
        </View>
      )}
    </View>
  );
});

const styles = createGameStyles({
  shell: { width: "100%", maxWidth: 940, alignSelf: "center", backgroundColor: "#071A28", borderRadius: radii.large, padding: 18, overflow: "hidden", ...shadows.card },
  highContrast: { borderWidth: 3, borderColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14 },
  headerCopy: { flex: 1, minWidth: 0 },
  kicker: { color: "#61E7D7", fontSize: 9, fontWeight: "900", letterSpacing: 1.1 },
  title: { color: "#F2FFFF", fontSize: 21, fontWeight: "900", marginTop: 3 },
  stageBadge: { minWidth: 88, flexShrink: 0, alignItems: "center", backgroundColor: "#103A47", borderRadius: radii.small, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: "#277381" },
  stageLabel: { color: "#86B4BA", fontSize: 7, fontWeight: "900" },
  stageValue: { color: "#EEFFFF", fontSize: 17, fontWeight: "900", marginTop: 1 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 12 },
  metric: { flex: 1, minWidth: 56, minHeight: 49, justifyContent: "center", backgroundColor: "#102B3A", borderRadius: radii.small, paddingHorizontal: 9 },
  metricLabel: { color: "#77A1AC", fontSize: 7, fontWeight: "900" },
  metricValue: { color: "#F2FFFF", fontSize: 14, fontWeight: "900", marginTop: 3 },
  energyLow: { color: "#FF9B7D" },
  roleRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  roleCard: { flex: 1, minWidth: 0, backgroundColor: "#153B52", borderRadius: radii.small, padding: 10, borderLeftWidth: 4, borderLeftColor: "#67D7F0" },
  arcRole: { backgroundColor: "#2A2850", borderLeftColor: "#A99CFF" },
  ownRole: { borderWidth: 2, borderColor: "#F3D77E" },
  roleKicker: { color: "#83A7B4", fontSize: 7, fontWeight: "900" },
  roleTitle: { color: colors.surface, fontSize: 10, fontWeight: "900", marginTop: 2 },
  roleValue: { color: "#BDE5E9", fontSize: 8, fontWeight: "800", marginTop: 3 },
  bridgeRig: { backgroundColor: "#020A12", borderRadius: radii.medium, padding: 11, marginTop: 10, borderWidth: 1, borderColor: "#174858" },
  rigHeader: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8, marginBottom: 8 },
  rigTitle: { color: "#55D7C8", fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  rigLegend: { color: "#60818A", fontSize: 7, fontWeight: "800" },
  grid: { gap: 3 },
  lane: { minHeight: 34, flexDirection: "row", alignItems: "center", backgroundColor: "#091722", borderRadius: 6, borderWidth: 1, borderColor: "#102A38", overflow: "hidden" },
  laneCompact: { minHeight: 29 },
  laneDense: { minHeight: 25 },
  targetLane: { backgroundColor: "#172532", borderColor: "#715E43" },
  laneNumber: { width: 25, color: "#7898A2", fontSize: 7, fontWeight: "900", textAlign: "center" },
  pathCells: { flex: 1, minHeight: 32, flexDirection: "row" },
  pathCellsCompact: { minHeight: 23 },
  pathCell: { flex: 1, minHeight: 32, alignItems: "center", justifyContent: "center", borderLeftWidth: 1, borderColor: "#112A38" },
  pathCellCompact: { minHeight: 23 },
  beamCell: { backgroundColor: "rgba(80, 220, 206, 0.10)" },
  targetCell: { borderWidth: 1, borderColor: "#967946", backgroundColor: "rgba(242, 207, 107, 0.10)" },
  alignedCell: { backgroundColor: "rgba(96, 231, 215, 0.24)", borderColor: "#6AE4D6" },
  beamDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: "#58DCCD", borderWidth: 2, borderColor: "#C0FFF7" },
  emitterGlyph: { color: "#83F1E6", fontSize: 15, fontWeight: "900" },
  endGlyph: { color: "#B09EFF", fontSize: 14, fontWeight: "900" },
  targetGlyph: { color: "#F1CF70", fontSize: 14, fontWeight: "900" },
  alignedGlyph: { color: "#F8DF83", fontSize: 16, fontWeight: "900" },
  readoutRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8, marginTop: 8 },
  readout: { color: "#8EAFB8", fontSize: 8, fontWeight: "900" },
  arcReadout: { color: "#B4A9EF", fontSize: 8, fontWeight: "900" },
  readoutAligned: { color: "#6FE3D5" },
  status: { backgroundColor: "#102B39", borderRadius: radii.small, padding: 10, marginTop: 10 },
  statusLive: { backgroundColor: "#304632", borderWidth: 1, borderColor: "#75D99B" },
  statusResult: { borderLeftWidth: 4, borderLeftColor: "#F0C96A" },
  statusText: { color: "#E9FBFC", fontSize: 9, fontWeight: "900", textAlign: "center" },
  controls: { backgroundColor: "#102E40", borderRadius: radii.medium, padding: 12, marginTop: 10, borderWidth: 1, borderColor: "#22536A" },
  controlHeading: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 10 },
  controlCopy: { flex: 1, minWidth: 150 },
  controlKicker: { color: "#61D9D0", fontSize: 7, fontWeight: "900", letterSpacing: 0.8 },
  controlTitle: { color: colors.surface, fontSize: 11, fontWeight: "900", marginTop: 2 },
  targetReadout: { color: "#F0D174", fontSize: 9, fontWeight: "900" },
  controlRow: { flexDirection: "row", gap: 8, marginTop: 9 },
  adjustButton: { flex: 1, minHeight: 63, alignItems: "center", justifyContent: "center", backgroundColor: "#1E4A61", borderRadius: radii.small, borderWidth: 1, borderColor: "#39758E" },
  adjustArrow: { color: "#A9F6EE", fontSize: 20, fontWeight: "900" },
  adjustLabel: { color: "#D9F3F3", fontSize: 8, fontWeight: "900", marginTop: 2 },
  core: { flex: 1.15, minHeight: 63, alignItems: "center", justifyContent: "center", backgroundColor: "#292C4E", borderRadius: radii.small },
  coreGlyph: { color: "#F2D376", fontSize: 15, fontWeight: "900" },
  coreLabel: { color: "#BFC4D7", fontSize: 7, fontWeight: "900", marginTop: 3 },
  resonancePanel: { backgroundColor: "#163B38", borderRadius: radii.medium, padding: 12, marginTop: 10, borderWidth: 1, borderColor: "#478F82" },
  resonanceHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  windowValue: { color: "#F8D978", fontSize: 18, fontWeight: "900", fontVariant: ["tabular-nums"] },
  confirmRow: { flexDirection: "row", gap: 7, marginTop: 9 },
  confirmChip: { flex: 1, padding: 7, borderRadius: 8, backgroundColor: "#274D4B", borderWidth: 1, borderColor: "#44706A" },
  confirmedChip: { backgroundColor: "#356B55", borderColor: "#79D79A" },
  confirmText: { color: "#E5FBF6", fontSize: 8, fontWeight: "900", textAlign: "center" },
  lockButton: { minHeight: 64, marginTop: 8, flexDirection: "row", gap: 9, alignItems: "center", justifyContent: "center", borderRadius: radii.small, backgroundColor: "#DA7B55", borderWidth: 2, borderColor: "#FFD08C" },
  lockGlyph: { color: "#FFF8E3", fontSize: 20, fontWeight: "900" },
  lockLabel: { color: "#FFF9EC", fontSize: 11, fontWeight: "900" },
  disabled: { opacity: 0.3 },
  pressed: { transform: [{ scale: 0.95 }] },
});
