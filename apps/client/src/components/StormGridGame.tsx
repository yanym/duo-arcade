import { memo } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ScaledText";

import { useI18n } from "@/i18n";

import type { Seat, StormGridViewState } from "@duo/game-core";
import type { RoomPhase } from "@duo/protocol";

import { useSettings } from "@/settings/SettingsContext";
import { colors, createGameStyles, radii, shadows } from "@/theme";

type Props = {
  game: StormGridViewState;
  ownSeat: Seat;
  phase: RoomPhase;
  onShift: (direction: -1 | 1) => void;
  onToggle: () => void;
  onDischarge: () => void;
};

function outcomeCopy(game: StormGridViewState): string {
  if (game.waveOutcome === "stabilized") return `回路稳定${game.lastAccuracyMs === null ? "" : ` · 偏差 ${game.lastAccuracyMs}ms`}`;
  if (game.waveOutcome === "misrouted") return "节点或极性不匹配，电网完整度受损";
  if (game.waveOutcome === "surge_timeout") return "错过放电窗口，雷暴击穿了回路";
  if (game.phase === "discharge_window") return "放电窗口已开启：观测员现在释放脉冲";
  return "雷暴正在预充：先完成节点与极性校准";
}

export const StormGridGame = memo(function StormGridGame({ game, ownSeat, phase, onShift, onToggle, onDischarge }: Props) {
  const { t } = useI18n();
  const { feedback, settings } = useSettings();
  const ended = !!game.result || phase === "completed";
  const paused = !ended && phase !== "playing";
  const isSensor = ownSeat === game.sensorSeat;
  const canAdjust = phase === "playing" && game.phase !== "wave_result" && !isSensor && !game.result;
  const canDischarge = phase === "playing" && game.phase === "discharge_window" && isSensor && !game.result;
  const polarityLabel = game.polarity === "positive" ? "正极 +" : "负极 −";
  const targetPolarityLabel = game.targetPolarity === "positive" ? "正极 +" : game.targetPolarity === "negative" ? "负极 −" : "未知";

  function shift(direction: -1 | 1) {
    feedback("place", "medium");
    onShift(direction);
  }

  function toggle() {
    feedback("tap", "medium");
    onToggle();
  }

  function discharge() {
    feedback("hit", "heavy");
    onDischarge();
  }

  return (
    <View style={[styles.shell, settings.highContrast && styles.highContrast]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>TEMPEST GRID // LIVE</Text>
          <Text style={styles.title}>风暴电网调度舱</Text>
        </View>
        <View style={styles.waveBadge} accessibilityLabel={t(`第 ${game.wave} 波雷暴，共 ${game.totalWaves} 波`)}>
          <Text style={styles.waveLabel}>雷暴波</Text>
          <Text style={styles.waveValue}>{game.wave}/{game.totalWaves}</Text>
        </View>
      </View>

      <View style={styles.metrics}>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>电网完整度</Text>
          <Text accessibilityLabel={t(`剩余完整度 ${game.integrity}/${game.maxIntegrity}`)} style={styles.integrity}>{"▮".repeat(game.integrity)}{"▯".repeat(game.maxIntegrity - game.integrity)}</Text>
        </View>
        <View style={styles.metric}><Text style={styles.metricLabel}>稳定波次</Text><Text style={styles.metricValue}>{game.stabilizedWaves}</Text></View>
        <View style={styles.metric}><Text style={styles.metricLabel}>故障</Text><Text style={styles.metricValue}>{game.faults}</Text></View>
        <View style={styles.metric}><Text style={styles.metricLabel}>得分</Text><Text style={styles.metricValue}>{game.score}</Text></View>
      </View>

      <View style={styles.roleCard}>
        <View style={[styles.roleMark, !isSensor && styles.operatorMark]}><Text style={styles.roleGlyph}>{isSensor ? "⌁" : "⌬"}</Text></View>
        <View style={styles.roleCopy}>
          <Text style={styles.roleTitle}>{isSensor ? "你是风暴观测员" : "你是电网调度员"}</Text>
          <Text style={styles.roleHint}>{isSensor ? "读取私密目标并口述；窗口亮起后由你亲自放电。" : "你看不到目标；按搭档口述调整节点和正负极。"}</Text>
        </View>
        <View style={[styles.targetCode, game.targetNode !== null && styles.targetCodeLive]}>
          <Text style={styles.targetLabel}>私密风暴坐标</Text>
          <Text style={styles.targetValue}>{game.targetNode === null ? "节点 ? · 极性 ?" : `节点 ${game.targetNode + 1} · ${targetPolarityLabel}`}</Text>
        </View>
      </View>

      <View style={styles.gridPanel}>
        <View style={styles.gridHeading}>
          <Text style={styles.gridLabel}>POWER ROUTING BUS</Text>
          <View style={[styles.phaseBadge, game.phase === "discharge_window" && styles.phaseBadgeLive]}>
            <Text style={[styles.phaseText, game.phase === "discharge_window" && styles.phaseTextLive]}>{ended ? "已结束" : paused ? "已暂停" : game.phase === "charging" ? "预充中" : game.phase === "discharge_window" ? "放电窗" : "波次复盘"}</Text>
          </View>
        </View>
        <View accessibilityLabel={t(`当前选择节点 ${game.selectorNode + 1}，${polarityLabel}`)} style={styles.nodeRail}>
          <View style={styles.busLine} />
          {Array.from({ length: game.nodeCount }, (_, node) => {
            const selected = node === game.selectorNode;
            const target = game.phase === "wave_result" && node === game.targetNode;
            return (
              <View key={node} style={styles.nodeColumn}>
                <View style={[styles.node, selected && styles.nodeSelected, target && styles.nodeTarget]}>
                  <Text style={[styles.nodeNumber, selected && styles.nodeNumberSelected]}>{node + 1}</Text>
                </View>
                <Text style={styles.nodeState}>{selected ? "接通" : target ? "目标" : "待机"}</Text>
              </View>
            );
          })}
        </View>
        <View style={styles.polarityRail}>
          <Text style={styles.polarityCaption}>当前极性</Text>
          <View style={[styles.polarityPill, game.polarity === "negative" && styles.polarityNegative]}>
            <Text style={styles.polarityValue}>{polarityLabel}</Text>
          </View>
          <Text style={styles.adjustmentCount}>累计校准 {game.totalAdjustments} 次</Text>
        </View>
      </View>

      <View style={[styles.surge, game.phase === "discharge_window" && styles.surgeLive, game.waveOutcome && game.waveOutcome !== "stabilized" && styles.surgeDanger]}>
        <View style={styles.surgeBars}>
          {Array.from({ length: 11 }, (_, index) => <View key={index} style={[styles.surgeBar, { height: 6 + (index % 4) * 4 }, game.phase === "discharge_window" && styles.surgeBarLive]} />)}
        </View>
        <Text accessibilityLiveRegion="assertive" style={styles.surgeText}>{ended ? "本局电网调度已结束" : paused ? "等待连接恢复" : outcomeCopy(game)}</Text>
        <Text style={styles.surgeMeta}>{game.phase === "charging" ? `预充 ${game.chargeDurationMs / 1000} 秒` : game.phase === "discharge_window" ? `有效窗 ${game.dischargeWindowMs}ms` : "服务器已封存本波结果"}</Text>
      </View>

      {isSensor ? (
        <View style={styles.sensorControls}>
          <Text style={styles.controlKicker}>OBSERVER DISCHARGE</Text>
          <Text style={styles.controlTitle}>{ended ? "查看上方团队结果" : paused ? "恢复连接后继续放电" : game.phase === "wave_result" ? "本波已判定，即将交换岗位" : game.phase === "discharge_window" ? "窗口已开启，释放稳定脉冲" : "先让搭档完成校准，等待风暴窗口"}</Text>
          <Pressable
            accessibilityHint={t("只有目标节点、极性和放电时机都正确，才能稳定本波雷暴")}
            accessibilityLabel={t("释放电网稳定脉冲")}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canDischarge }}
            disabled={!canDischarge}
            onPress={discharge}
            style={({ pressed }) => [styles.dischargeButton, !canDischarge && styles.disabled, pressed && !settings.reducedMotion && styles.pressed]}
          >
            <Text style={styles.dischargeGlyph}>⚡</Text>
            <Text style={styles.dischargeLabel}>{ended ? "已结束" : paused ? "已暂停" : "稳定放电"}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.operatorControls}>
          <View style={styles.controlHeading}>
            <View><Text style={styles.controlKicker}>GRID OPERATOR</Text><Text style={styles.controlTitle}>按口述校准路由</Text></View>
            <Text style={styles.controlHint}>{ended ? "本局校准已结算" : paused ? "恢复连接后继续校准" : game.phase === "wave_result" ? "本波已判定" : "放电前可继续修正"}</Text>
          </View>
          <View style={styles.controlRow}>
            <Pressable accessibilityLabel={t("选择前一个电网节点")} accessibilityRole="button" accessibilityState={{ disabled: !canAdjust }} disabled={!canAdjust} onPress={() => shift(-1)} style={({ pressed }) => [styles.routeButton, !canAdjust && styles.disabled, pressed && !settings.reducedMotion && styles.pressed]}><Text style={styles.routeGlyph}>←</Text><Text style={styles.routeLabel}>前一节点</Text></Pressable>
            <Pressable accessibilityLabel={t(`切换电网极性，当前${polarityLabel}`)} accessibilityRole="button" accessibilityState={{ disabled: !canAdjust }} disabled={!canAdjust} onPress={toggle} style={({ pressed }) => [styles.toggleButton, !canAdjust && styles.disabled, pressed && !settings.reducedMotion && styles.pressed]}><Text style={styles.toggleGlyph}>±</Text><Text style={styles.toggleLabel}>切换极性</Text></Pressable>
            <Pressable accessibilityLabel={t("选择后一个电网节点")} accessibilityRole="button" accessibilityState={{ disabled: !canAdjust }} disabled={!canAdjust} onPress={() => shift(1)} style={({ pressed }) => [styles.routeButton, !canAdjust && styles.disabled, pressed && !settings.reducedMotion && styles.pressed]}><Text style={styles.routeGlyph}>→</Text><Text style={styles.routeLabel}>后一节点</Text></Pressable>
          </View>
        </View>
      )}
    </View>
  );
});

const styles = createGameStyles({
  shell: { width: "100%", maxWidth: 940, alignSelf: "center", backgroundColor: "#15142A", borderRadius: radii.large, padding: 18, overflow: "hidden", ...shadows.card },
  highContrast: { borderWidth: 3, borderColor: colors.surface },
  header: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 14 },
  kicker: { color: "#FF9D83", fontSize: 9, fontWeight: "900", letterSpacing: 1.3 },
  title: { color: colors.surface, fontSize: 21, fontWeight: "900", marginTop: 3 },
  waveBadge: { minWidth: 83, alignItems: "center", backgroundColor: "#30284A", borderRadius: radii.small, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: "#5C4875" },
  waveLabel: { color: "#A59AB7", fontSize: 8, fontWeight: "900" },
  waveValue: { color: "#FFF3EE", fontSize: 17, fontWeight: "900", marginTop: 1 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 12 },
  metric: { flexGrow: 1, flexShrink: 1, flexBasis: 80, minWidth: 0, minHeight: 49, justifyContent: "center", backgroundColor: "#27233E", borderRadius: radii.small, paddingHorizontal: 9 },
  metricLabel: { color: "#938AA6", fontSize: 8, fontWeight: "900" },
  metricValue: { color: "#F5EEF8", fontSize: 15, fontWeight: "900", marginTop: 3 },
  integrity: { color: "#75E1CC", fontSize: 11, fontWeight: "900", letterSpacing: 1, marginTop: 5 },
  roleCard: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10, backgroundColor: "#28243F", borderRadius: radii.medium, padding: 12, marginTop: 10, borderLeftWidth: 4, borderLeftColor: "#F0785F" },
  roleMark: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#B85848" },
  operatorMark: { backgroundColor: "#5658C4" },
  roleGlyph: { color: colors.surface, fontSize: 17, fontWeight: "900" },
  roleCopy: { flexGrow: 1, flexShrink: 1, flexBasis: 120, minWidth: 0 },
  roleTitle: { color: colors.surface, fontSize: 12, fontWeight: "900" },
  roleHint: { color: "#B8B1C9", fontSize: 8, lineHeight: 12, marginTop: 2 },
  targetCode: { flexGrow: 1, flexShrink: 1, flexBasis: 160, minWidth: 0, backgroundColor: "#353044", borderRadius: 9, paddingHorizontal: 9, paddingVertical: 7 },
  targetCodeLive: { backgroundColor: "#54323B", borderWidth: 1, borderColor: "#B86057" },
  targetLabel: { color: "#C2B8D1", fontSize: 7, fontWeight: "900" },
  targetValue: { color: "#FFD3C7", fontSize: 9, fontWeight: "900", marginTop: 2 },
  gridPanel: { backgroundColor: "#090817", borderRadius: radii.medium, padding: 12, marginTop: 10, borderWidth: 1, borderColor: "#37304E" },
  gridHeading: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  gridLabel: { color: "#9B90AA", fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  phaseBadge: { backgroundColor: "#2D293D", borderRadius: radii.pill, paddingHorizontal: 9, paddingVertical: 5 },
  phaseBadgeLive: { backgroundColor: "#7E382F" },
  phaseText: { color: "#A59CAD", fontSize: 7, fontWeight: "900" },
  phaseTextLive: { color: "#FFE2D7" },
  nodeRail: { flexDirection: "row", alignItems: "flex-start", position: "relative", gap: 8, paddingHorizontal: 4 },
  busLine: { position: "absolute", left: 25, right: 25, top: 21, height: 2, backgroundColor: "#514666" },
  nodeColumn: { flex: 1, alignItems: "center", zIndex: 1 },
  node: { width: 42, maxWidth: "100%", aspectRatio: 1, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: "#211D31", borderWidth: 2, borderColor: "#544A67" },
  nodeSelected: { backgroundColor: "#5658C4", borderColor: "#A9ABFF" },
  nodeTarget: { borderColor: "#F6C969", borderWidth: 3 },
  nodeNumber: { color: "#9288A2", fontSize: 11, fontWeight: "900" },
  nodeNumberSelected: { color: colors.surface },
  nodeState: { color: "#9A90A4", fontSize: 6, fontWeight: "900", marginTop: 4 },
  polarityRail: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 9, marginTop: 13 },
  polarityCaption: { color: "#887F96", fontSize: 8, fontWeight: "900" },
  polarityPill: { minWidth: 70, alignItems: "center", backgroundColor: "#7D4138", borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 6 },
  polarityNegative: { backgroundColor: "#344C83" },
  polarityValue: { color: colors.surface, fontSize: 9, fontWeight: "900" },
  adjustmentCount: { color: "#91869B", fontSize: 7, fontWeight: "800" },
  surge: { alignItems: "center", backgroundColor: "#29253D", borderRadius: radii.small, padding: 10, marginTop: 10, borderWidth: 1, borderColor: "#423A55" },
  surgeLive: { backgroundColor: "#58312F", borderColor: "#D16C57" },
  surgeDanger: { backgroundColor: "#47272D", borderColor: "#97505A" },
  surgeBars: { height: 20, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3 },
  surgeBar: { width: 4, borderRadius: 2, backgroundColor: "#5D536C" },
  surgeBarLive: { backgroundColor: "#FFB18E" },
  surgeText: { color: "#F6EFF5", fontSize: 10, fontWeight: "900", textAlign: "center", marginTop: 3 },
  surgeMeta: { color: "#9A90A7", fontSize: 7, fontWeight: "800", marginTop: 2 },
  sensorControls: { alignItems: "center", backgroundColor: "#27233D", borderRadius: radii.medium, padding: 12, marginTop: 10 },
  operatorControls: { backgroundColor: "#27233D", borderRadius: radii.medium, padding: 12, marginTop: 10 },
  controlHeading: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 10 },
  controlKicker: { color: "#EF8E75", fontSize: 7, fontWeight: "900", letterSpacing: 0.8 },
  controlTitle: { color: colors.surface, fontSize: 11, fontWeight: "900", marginTop: 2 },
  controlHint: { color: "#B8ACC8", fontSize: 7, fontWeight: "800" },
  controlRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  routeButton: { flex: 1, minHeight: 65, alignItems: "center", justifyContent: "center", backgroundColor: "#373451", borderRadius: radii.small, borderWidth: 1, borderColor: "#5A5674" },
  toggleButton: { flex: 1.15, minHeight: 65, alignItems: "center", justifyContent: "center", backgroundColor: "#5C3C3D", borderRadius: radii.small, borderWidth: 1, borderColor: "#976054" },
  routeGlyph: { color: "#B7B8FF", fontSize: 19, fontWeight: "900" },
  routeLabel: { color: "#D3CEDD", fontSize: 8, fontWeight: "900", marginTop: 2 },
  toggleGlyph: { color: "#FFD0C1", fontSize: 20, fontWeight: "900" },
  toggleLabel: { color: "#F1D9D1", fontSize: 8, fontWeight: "900", marginTop: 2 },
  dischargeButton: { width: "100%", maxWidth: 390, minHeight: 65, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#D96048", borderRadius: radii.medium, borderWidth: 2, borderColor: "#FFB497", marginTop: 9 },
  dischargeGlyph: { color: "#FFF4DC", fontSize: 22 },
  dischargeLabel: { color: colors.surface, fontSize: 13, fontWeight: "900" },
  disabled: { opacity: 0.34 },
  pressed: { transform: [{ scale: 0.96 }] },
});
