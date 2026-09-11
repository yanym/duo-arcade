import { memo } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ScaledText";

import { useI18n } from "@/i18n";

import type { MagnetHaulState, Seat } from "@duo/game-core";
import type { RoomPhase } from "@duo/protocol";

import { useSettings } from "@/settings/SettingsContext";
import { colors, createGameStyles, radii, shadows } from "@/theme";

type Props = { game: MagnetHaulState; ownSeat: Seat; phase: RoomPhase; onMove: (direction: -1 | 1) => void };

function statusCopy(game: MagnetHaulState): string {
  if (game.lastOutcome === "aligned") return game.result ? "全部货箱已经安全送达" : "双臂同步入槽，货箱通过装卸门";
  if (game.lastOutcome === "battery_depleted") return "公共电量耗尽，磁力连接已经中断";
  if (game.lastOutcome === "haul_timeout") return "装卸门关闭，搬运任务超时";
  if (!game.lastMove) return "观察两侧目标，协调谁先移动，保持张力安全";
  return `${game.lastMove.seat === 0 ? "左侧" : "右侧"}磁臂移动到高度轨 ${game.lastMove.to + 1}`;
}

export const MagnetHaulGame = memo(function MagnetHaulGame({ game, ownSeat, phase, onMove }: Props) {
  const { t } = useI18n();
  const { feedback, settings } = useSettings();
  const ended = Boolean(game.result) || phase === "completed";
  const paused = !ended && phase !== "playing";
  const canMove = phase === "playing" && game.phase === "moving" && !game.result;
  const ownPosition = game.magnetPositions[ownSeat];
  const nextUnsafe = (direction: -1 | 1) => {
    const next = ownPosition + direction;
    if (next < 0 || next >= game.laneCount) return true;
    const positions = [...game.magnetPositions] as [number, number];
    positions[ownSeat] = next;
    return Math.abs(positions[0] - positions[1]) > game.tensionLimit;
  };
  const tension = Math.abs(game.magnetPositions[0] - game.magnetPositions[1]);
  const cargoLevel = (game.magnetPositions[0] + game.magnetPositions[1]) / 2 + 1;

  function move(direction: -1 | 1) { feedback("place", "heavy"); onMove(direction); }

  return (
    <View style={[styles.shell, settings.highContrast && styles.highContrast]}>
      <View style={styles.header}>
        <View style={styles.headerCopy}><Text style={styles.kicker}>MAGNETIC FREIGHT // CO-LIFT</Text><Text style={styles.title}>双臂磁力搬运站</Text></View>
        <View accessibilityLabel={t(`第 ${game.checkpoint} 道装卸门，共 ${game.totalCheckpoints} 道`)} style={styles.gateBadge}><Text style={styles.gateLabel}>装卸门</Text><Text style={styles.gateValue}>{game.checkpoint}/{game.totalCheckpoints}</Text></View>
      </View>

      <View style={styles.metrics}>
        <View style={styles.metric}><Text style={styles.metricLabel}>已通过</Text><Text style={styles.metricValue}>{game.completedCheckpoints}</Text></View>
        <View style={styles.metric}><Text style={styles.metricLabel}>公共电量</Text><Text style={[styles.metricValue, game.battery <= 5 && styles.batteryLow]}>{game.battery}/{game.maxBattery}</Text></View>
        <View style={styles.metric}><Text style={styles.metricLabel}>总移动</Text><Text style={styles.metricValue}>{game.moves}</Text></View>
        <View style={styles.metric}><Text style={styles.metricLabel}>团队得分</Text><Text style={styles.metricValue}>{game.score}</Text></View>
      </View>

      <View style={styles.roleRow}>
        {([0, 1] as const).map((seat) => (
          <View key={seat} style={[styles.roleCard, seat === 1 && styles.rightRole, ownSeat === seat && styles.ownRole]}>
            <Text style={styles.roleKicker}>{seat === ownSeat ? "你的控制台" : "搭档控制台"}</Text>
            <Text style={styles.roleTitle}>{seat === 0 ? "L · 左侧磁臂" : "R · 右侧磁臂"}</Text>
            <Text style={styles.rolePosition}>当前 {game.magnetPositions[seat] + 1} → 目标 {game.targetPositions[seat] + 1}</Text>
          </View>
        ))}
      </View>

      <View style={styles.rig}>
        <View style={styles.rigHeader}><Text style={styles.rigTitle}>{`FREIGHT GATE ${String(game.checkpoint).padStart(2, "0")}`}</Text><Text style={styles.rigLegend}>◎ 目标 · ● 磁臂 · ◆ 货箱</Text></View>
        <View accessibilityLabel={t(`磁力搬运轨道，左臂高度 ${game.magnetPositions[0] + 1}，右臂高度 ${game.magnetPositions[1] + 1}`)} style={styles.lanes}>
          {Array.from({ length: game.laneCount }, (_, lane) => {
            const leftHere = game.magnetPositions[0] === lane;
            const rightHere = game.magnetPositions[1] === lane;
            const leftTarget = game.targetPositions[0] === lane;
            const rightTarget = game.targetPositions[1] === lane;
            const cargoHere = Math.round(cargoLevel - 1) === lane;
            return (
              <View key={lane} style={[styles.lane, game.laneCount >= 7 && styles.laneCompact, game.laneCount >= 9 && styles.laneDense, (leftTarget || rightTarget) && styles.targetLane]}>
                <Text style={styles.laneNumber}>{lane + 1}</Text>
                <View style={[styles.leftSlot, game.laneCount >= 7 && styles.slotCompact]}>{leftTarget && <Text style={styles.targetGlyph}>L◎</Text>}{leftHere && <View style={[styles.magnet, styles.leftMagnet]}><Text style={styles.magnetText}>L●</Text></View>}</View>
                <View style={[styles.cargoSlot, game.laneCount >= 7 && styles.slotCompact]}>{cargoHere && <View style={[styles.cargo, game.laneCount >= 9 && styles.cargoDense, tension >= game.tensionLimit && styles.cargoTaut]}><Text style={styles.cargoGlyph}>◆</Text></View>}</View>
                <View style={[styles.rightSlot, game.laneCount >= 7 && styles.slotCompact]}>{rightHere && <View style={[styles.magnet, styles.rightMagnet]}><Text style={styles.magnetText}>●R</Text></View>}{rightTarget && <Text style={styles.targetGlyph}>◎R</Text>}</View>
              </View>
            );
          })}
        </View>
      </View>

      <View style={[styles.tensionPanel, tension >= game.tensionLimit && styles.tensionTaut]}>
        <View><Text style={styles.tensionLabel}>缆索张力</Text><Text style={styles.tensionValue}>{tension}/{game.tensionLimit} {tension >= game.tensionLimit ? "· 已绷紧" : "· 安全"}</Text></View>
        <View style={styles.tensionBars}>{Array.from({ length: game.tensionLimit }, (_, index) => <View key={index} style={[styles.tensionBar, index < tension && styles.tensionBarLive]} />)}</View>
        <Text style={styles.cargoLevel}>货箱高度 {Number.isInteger(cargoLevel) ? cargoLevel : cargoLevel.toFixed(1)}</Text>
      </View>

      <View accessibilityLiveRegion="polite" style={[styles.status, game.lastOutcome && styles.statusResult]}><Text style={styles.statusText}>{ended ? "本局搬运已结束" : paused ? "搬运已暂停，等待连接恢复" : statusCopy(game)}</Text></View>

      <View style={styles.controls}>
        <View style={styles.controlHeading}><View style={styles.controlCopy}><Text style={styles.controlKicker}>YOUR MAGNET ARM</Text><Text style={styles.controlTitle}>控制{ownSeat === 0 ? "左侧" : "右侧"}磁臂 · 高度轨 {ownPosition + 1}</Text></View><Text style={styles.targetReadout}>目标 {game.targetPositions[ownSeat] + 1}</Text></View>
        <View style={styles.controlRow}>
          <Pressable accessibilityHint={t("每步消耗一格公共电量，超过张力上限时会被阻止")} accessibilityLabel={t("磁臂向上移动一条高度轨")} accessibilityRole="button" accessibilityState={{ disabled: !canMove || nextUnsafe(-1) }} disabled={!canMove || nextUnsafe(-1)} onPress={() => move(-1)} style={({ pressed }) => [styles.moveButton, (!canMove || nextUnsafe(-1)) && styles.disabled, pressed && !settings.reducedMotion && styles.pressed]}><Text style={styles.moveArrow}>↑</Text><Text style={styles.moveLabel}>向上</Text></Pressable>
          <View style={styles.syncCore}><Text style={styles.syncGlyph}>∩◆∩</Text><Text style={styles.syncLabel}>{ended ? "本局结束" : paused ? "等待恢复" : game.phase === "checkpoint_result" ? "搬运完成" : "保持同步"}</Text></View>
          <Pressable accessibilityHint={t("每步消耗一格公共电量，超过张力上限时会被阻止")} accessibilityLabel={t("磁臂向下移动一条高度轨")} accessibilityRole="button" accessibilityState={{ disabled: !canMove || nextUnsafe(1) }} disabled={!canMove || nextUnsafe(1)} onPress={() => move(1)} style={({ pressed }) => [styles.moveButton, (!canMove || nextUnsafe(1)) && styles.disabled, pressed && !settings.reducedMotion && styles.pressed]}><Text style={styles.moveArrow}>↓</Text><Text style={styles.moveLabel}>向下</Text></Pressable>
        </View>
      </View>
    </View>
  );
});

const styles = createGameStyles({
  shell: { width: "100%", maxWidth: 940, alignSelf: "center", backgroundColor: "#171025", borderRadius: radii.large, padding: 18, overflow: "hidden", ...shadows.card },
  highContrast: { borderWidth: 3, borderColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14 },
  headerCopy: { flex: 1, minWidth: 0 },
  kicker: { color: "#FF9A83", fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  title: { color: "#FFF7F3", fontSize: 21, fontWeight: "900", marginTop: 3 },
  gateBadge: { minWidth: 86, alignItems: "center", backgroundColor: "#40253E", borderRadius: radii.small, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: "#704565" },
  gateLabel: { color: "#B895AB", fontSize: 7, fontWeight: "900" },
  gateValue: { color: "#FFF1EA", fontSize: 17, fontWeight: "900", marginTop: 1 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 12 },
  metric: { flex: 1, minWidth: 56, minHeight: 49, justifyContent: "center", backgroundColor: "#2B1C38", borderRadius: radii.small, paddingHorizontal: 9 },
  metricLabel: { color: "#A68DAA", fontSize: 7, fontWeight: "900" },
  metricValue: { color: "#FFF4F0", fontSize: 14, fontWeight: "900", marginTop: 3 },
  batteryLow: { color: "#FF8B75" },
  roleRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  roleCard: { flex: 1, minWidth: 0, backgroundColor: "#28244D", borderRadius: radii.small, padding: 10, borderLeftWidth: 4, borderLeftColor: "#777CE1" },
  rightRole: { backgroundColor: "#49263A", borderLeftColor: "#D96761" },
  ownRole: { borderWidth: 2, borderColor: "#F1D075" },
  roleKicker: { color: "#A094AE", fontSize: 7, fontWeight: "900" },
  roleTitle: { color: colors.surface, fontSize: 10, fontWeight: "900", marginTop: 2 },
  rolePosition: { color: "#C9BFCB", fontSize: 8, fontWeight: "800", marginTop: 3 },
  rig: { backgroundColor: "#080712", borderRadius: radii.medium, padding: 11, marginTop: 10, borderWidth: 1, borderColor: "#3D294D" },
  rigHeader: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8, marginBottom: 8 },
  rigTitle: { color: "#E27C71", fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  rigLegend: { color: "#B9AFC1", fontSize: 7, fontWeight: "800" },
  lanes: { gap: 4 },
  lane: { height: 39, flexDirection: "row", alignItems: "center", backgroundColor: "#17152A", borderRadius: 7, borderWidth: 1, borderColor: "#2A2340", overflow: "hidden" },
  laneCompact: { height: 34 },
  laneDense: { height: 29 },
  targetLane: { borderColor: "#725C46", backgroundColor: "#211D2C" },
  laneNumber: { width: 25, color: "#B5A8BE", fontSize: 7, fontWeight: "900", textAlign: "center" },
  leftSlot: { flex: 1, minHeight: 36, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 8, borderLeftWidth: 1, borderColor: "#332C4E" },
  cargoSlot: { width: 78, minHeight: 36, alignItems: "center", justifyContent: "center", borderLeftWidth: 1, borderRightWidth: 1, borderColor: "#332C4E" },
  rightSlot: { flex: 1, minHeight: 36, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 8 },
  slotCompact: { minHeight: 27 },
  targetGlyph: { color: "#F2CE72", fontSize: 9, fontWeight: "900" },
  magnet: { minWidth: 43, borderRadius: 11, paddingVertical: 5, alignItems: "center" },
  leftMagnet: { backgroundColor: "#5257B9", borderWidth: 1, borderColor: "#9397FF" },
  rightMagnet: { backgroundColor: "#A34A52", borderWidth: 1, borderColor: "#F68E8D" },
  magnetText: { color: colors.surface, fontSize: 8, fontWeight: "900" },
  cargo: { width: 31, height: 31, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: "#8E5F28", borderWidth: 2, borderColor: "#F3D278" },
  cargoDense: { width: 25, height: 25, borderRadius: 7 },
  cargoTaut: { backgroundColor: "#97382E", borderColor: "#FF9A82" },
  cargoGlyph: { color: "#FFF4D7", fontSize: 13, fontWeight: "900" },
  tensionPanel: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, backgroundColor: "#272034", borderRadius: radii.small, padding: 10, marginTop: 10, borderLeftWidth: 4, borderLeftColor: "#69D5C8" },
  tensionTaut: { borderLeftColor: "#FF826D", backgroundColor: "#3E2730" },
  tensionLabel: { color: "#9C899E", fontSize: 7, fontWeight: "900" },
  tensionValue: { color: "#F4EAEF", fontSize: 10, fontWeight: "900", marginTop: 2 },
  tensionBars: { flex: 1, maxWidth: 180, flexDirection: "row", gap: 4 },
  tensionBar: { flex: 1, height: 8, borderRadius: 5, backgroundColor: "#44394C" },
  tensionBarLive: { backgroundColor: "#F0806E" },
  cargoLevel: { color: "#EACB76", fontSize: 8, fontWeight: "900" },
  status: { backgroundColor: "#292036", borderRadius: radii.small, padding: 10, marginTop: 10 },
  statusResult: { backgroundColor: "#42302F" },
  statusText: { color: "#F5EDF1", fontSize: 9, fontWeight: "900", textAlign: "center" },
  controls: { backgroundColor: "#292039", borderRadius: radii.medium, padding: 12, marginTop: 10, borderWidth: 1, borderColor: "#4B385A" },
  controlHeading: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 10 },
  controlCopy: { flex: 1, minWidth: 150 },
  controlKicker: { color: "#DD776F", fontSize: 7, fontWeight: "900", letterSpacing: 0.8 },
  controlTitle: { color: colors.surface, fontSize: 11, fontWeight: "900", marginTop: 2 },
  targetReadout: { color: "#F0D073", fontSize: 9, fontWeight: "900" },
  controlRow: { flexDirection: "row", gap: 8, marginTop: 9 },
  moveButton: { flex: 1, minHeight: 63, alignItems: "center", justifyContent: "center", backgroundColor: "#39365F", borderRadius: radii.small, borderWidth: 1, borderColor: "#615D91" },
  moveArrow: { color: "#B7B8FF", fontSize: 20, fontWeight: "900" },
  moveLabel: { color: "#E0DCE6", fontSize: 8, fontWeight: "900", marginTop: 2 },
  syncCore: { flex: 1.15, minHeight: 63, alignItems: "center", justifyContent: "center", backgroundColor: "#463039", borderRadius: radii.small },
  syncGlyph: { color: "#F2CE73", fontSize: 15, fontWeight: "900" },
  syncLabel: { color: "#D6C6CC", fontSize: 7, fontWeight: "900", marginTop: 3 },
  disabled: { opacity: 0.3 },
  pressed: { transform: [{ scale: 0.94 }] },
});
