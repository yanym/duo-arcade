import { memo } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ScaledText";

import { useI18n } from "@/i18n";

import type { DualThrustersViewState, Seat, ThrusterPower } from "@duo/game-core";
import type { RoomPhase } from "@duo/protocol";

import { useSettings } from "@/settings/SettingsContext";
import { colors, createGameStyles, radii, shadows } from "@/theme";

type Props = {
  game: DualThrustersViewState;
  ownSeat: Seat;
  phase: RoomPhase;
  onChoosePower: (power: ThrusterPower) => void;
};

const powerCopy: Record<ThrusterPower, { label: string; glyph: string; detail: string }> = {
  0: { label: "惯性滑行", glyph: "○", detail: "不增加推力" },
  1: { label: "轻推", glyph: "›", detail: "改变 1 格惯性" },
  2: { label: "强推", glyph: "»", detail: "改变 2 格惯性" },
};

function outcomeCopy(game: DualThrustersViewState): string {
  if (game.gateOutcome === "gate_cleared") return "航门穿越成功，保留当前惯性";
  if (game.gateOutcome === "gate_hit") return "偏离航门，船体受损并已自动回正";
  if (game.gateOutcome === "burn_timeout") return "推进指令未齐，自动驾驶撞上航门";
  return "两台推进器的推力会与当前惯性相加";
}

export const DualThrustersGame = memo(function DualThrustersGame({
  game,
  ownSeat,
  phase,
  onChoosePower,
}: Props) {
  const { t } = useI18n();
  const { feedback, settings } = useSettings();
  const ended = !!game.result || phase === "completed";
  const paused = !ended && phase !== "playing";
  const partner: Seat = ownSeat === 0 ? 1 : 0;
  const canChoose = phase === "playing" && game.phase === "planning" && !game.locked[ownSeat] && !game.result;
  const ownSide = ownSeat === 0 ? "左舷" : "右舷";
  const ownDirection = ownSeat === 0 ? "较大编号" : "较小编号";

  function choose(power: ThrusterPower) {
    feedback(power === 2 ? "hit" : "tap", power === 2 ? "heavy" : "medium");
    onChoosePower(power);
  }

  return (
    <View style={[styles.shell, settings.highContrast && styles.highContrast]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>TWIN ENGINE // FLIGHT</Text>
          <Text style={styles.title}>双擎穿梭航道</Text>
        </View>
        <View style={styles.progressBadge} accessibilityLabel={t(`第 ${game.gate} 道航门，共 ${game.totalGates} 道`)}>
          <Text style={styles.progressLabel}>航门</Text>
          <Text style={styles.progressValue}>{game.gate}/{game.totalGates}</Text>
        </View>
      </View>

      <View style={styles.metrics}>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>船体完整度</Text>
          <View style={styles.hullRow} accessibilityLabel={t(`剩余船体 ${game.hull}/${game.maxHull}`)}>
            {Array.from({ length: game.maxHull }, (_, index) => (
              <View key={index} style={[styles.hull, index < game.hull && styles.hullLive]} />
            ))}
          </View>
        </View>
        <View style={styles.metric}><Text style={styles.metricLabel}>通过</Text><Text style={styles.metricValue}>{game.clearedGates}</Text></View>
        <View style={styles.metric}><Text style={styles.metricLabel}>团队分数</Text><Text style={styles.metricValue}>{game.score}</Text></View>
      </View>

      <View style={styles.tunnel}>
        <View style={styles.tunnelHeading}>
          <Text accessibilityLabel={t(game.drift === 0 ? "惯性稳定" : `惯性向较${game.drift > 0 ? "大" : "小"}编号 ${Math.abs(game.drift)} 格`)} style={styles.tunnelLabel}>惯性 {game.drift > 0 ? `+${game.drift}` : game.drift < 0 ? `−${Math.abs(game.drift)}` : "稳定"}</Text>
          <Text style={styles.targetLabel}>目标航门 · 轨道 {game.targetLane + 1}</Text>
        </View>
        <View style={styles.lanes} accessibilityLabel={t(`飞船位于轨道 ${game.shipLane + 1}，目标是轨道 ${game.targetLane + 1}`)}>
          {Array.from({ length: game.laneCount }, (_, lane) => (
            <View key={lane} style={[styles.lane, lane === game.targetLane && styles.laneTarget]}>
              <Text style={styles.laneNumber}>{lane + 1}</Text>
              <View style={styles.flightLine} />
              {lane === game.shipLane && (
                <View style={[styles.ship, game.phase === "gate_result" && game.gateOutcome !== "gate_cleared" && styles.shipDamaged]}>
                  <Text style={styles.shipGlyph}>◈</Text>
                  <View style={[styles.flame, styles.flameLeft]} />
                  <View style={[styles.flame, styles.flameRight]} />
                </View>
              )}
              <View style={[styles.gate, lane === game.targetLane && styles.gateOpen]}>
                <Text style={[styles.gateGlyph, lane === game.targetLane && styles.gateGlyphOpen]}>{lane === game.targetLane ? "〔 〕" : "││"}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View accessibilityLiveRegion="polite" style={[styles.status, game.gateOutcome && game.gateOutcome !== "gate_cleared" && styles.statusDanger]}>
        <Text style={styles.statusTitle}>{ended ? "本局飞行已结束" : paused ? "飞行已暂停" : outcomeCopy(game)}</Text>
        <Text style={styles.statusHint}>
          {ended ? "查看上方团队结果" : paused ? "恢复连接后继续当前航门" : game.phase === "planning"
            ? game.locked[ownSeat]
              ? game.locked[partner] ? "双方指令已到达，等待服务器结算" : "你的档位已封存，等待搭档"
              : `${ownSide}推进器把飞船推向${ownDirection}轨道；先和搭档算好合力`
            : `左舷 ${game.powers[0] ?? 0} 档 − 右舷 ${game.powers[1] ?? 0} 档；本段位移 ${game.lastMovement > 0 ? "+" : ""}${game.lastMovement}`}
        </Text>
      </View>

      <View style={styles.controlPanel}>
        <View style={styles.controlHeading}>
          <View style={[styles.engineMark, ownSeat === 1 && styles.engineMarkCoral]}><Text style={styles.engineGlyph}>{ownSeat === 0 ? "L" : "R"}</Text></View>
          <View style={styles.controlCopy}>
            <Text style={styles.controlTitle}>{ownSide}推进器 · 你的控制台</Text>
            <Text style={styles.controlHint}>{ended ? "本局指令已结算" : game.locked[ownSeat] ? "指令已锁定，不能重复修改" : "每道航门只能锁定一次"}</Text>
          </View>
          <View style={[styles.lockBadge, game.locked[partner] && styles.lockBadgeLive]}>
            <Text accessibilityLiveRegion="polite" style={styles.lockText}>{ended ? "本局已结束" : paused ? "等待恢复" : game.phase === "gate_result" ? "双方已执行" : game.locked[partner] ? "搭档已锁定" : "搭档思考中"}</Text>
          </View>
        </View>
        <View style={styles.powerRow}>
          {([0, 1, 2] as ThrusterPower[]).map((power) => {
            const selected = game.powers[ownSeat] === power;
            return (
              <Pressable
                accessibilityHint={t(`${powerCopy[power].detail}，选择后本段不能修改`)}
                accessibilityLabel={t(`${ownSide}推进器${powerCopy[power].label}，${power}档`)}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canChoose, selected }}
                disabled={!canChoose}
                key={power}
                onPress={() => choose(power)}
                style={({ pressed }) => [styles.powerButton, selected && styles.powerSelected, !canChoose && !selected && styles.powerDisabled, pressed && !settings.reducedMotion && styles.powerPressed]}
              >
                <Text style={[styles.powerGlyph, selected && styles.powerGlyphSelected]}>{powerCopy[power].glyph}</Text>
                <Text style={[styles.powerLabel, selected && styles.powerLabelSelected]}>{powerCopy[power].label}</Text>
                <Text style={styles.powerMeta}>{power} 档</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.formula}>
        <Text style={styles.formulaMark}>∑</Text>
        <Text style={styles.formulaText}>位移 = 惯性 + 左档 − 右档，最多 ±2 格；抵达边界后惯性归零</Text>
      </View>
    </View>
  );
});

const styles = createGameStyles({
  shell: { width: "100%", maxWidth: 940, alignSelf: "center", backgroundColor: "#071924", borderRadius: radii.large, padding: 18, overflow: "hidden", ...shadows.card },
  highContrast: { borderWidth: 3, borderColor: colors.surface },
  header: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 14 },
  kicker: { color: "#62DCCB", fontSize: 9, fontWeight: "900", letterSpacing: 1.3 },
  title: { color: colors.surface, fontSize: 21, fontWeight: "900", marginTop: 3 },
  progressBadge: { minWidth: 82, alignItems: "center", backgroundColor: "#113444", borderRadius: radii.small, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: "#24566A" },
  progressLabel: { color: "#79AAB7", fontSize: 8, fontWeight: "900" },
  progressValue: { color: "#EBFBF7", fontSize: 17, fontWeight: "900", marginTop: 1 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  metric: { flexGrow: 1, flexShrink: 1, flexBasis: 80, minWidth: 0, minHeight: 50, justifyContent: "center", backgroundColor: "#0E2A38", borderRadius: radii.small, paddingHorizontal: 10 },
  metricLabel: { color: "#719AA7", fontSize: 8, fontWeight: "900" },
  metricValue: { color: "#E8F8F5", fontSize: 15, fontWeight: "900", marginTop: 3 },
  hullRow: { flexDirection: "row", gap: 4, marginTop: 7 },
  hull: { flex: 1, maxWidth: 24, height: 7, borderRadius: 4, backgroundColor: "#314B55" },
  hullLive: { backgroundColor: "#62DCCB" },
  tunnel: { backgroundColor: "#020B13", borderRadius: radii.medium, padding: 12, marginTop: 11, borderWidth: 1, borderColor: "#163442" },
  tunnelHeading: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8, marginBottom: 8 },
  tunnelLabel: { color: "#7895A2", fontSize: 8, fontWeight: "900" },
  targetLabel: { color: "#F3D374", fontSize: 9, fontWeight: "900" },
  lanes: { gap: 4 },
  lane: { height: 31, borderRadius: 7, position: "relative", justifyContent: "center", backgroundColor: "#071722", borderWidth: 1, borderColor: "#102B39", overflow: "hidden" },
  laneTarget: { backgroundColor: "#102C32", borderColor: "#407C7A" },
  laneNumber: { position: "absolute", left: 7, top: 3, color: "#8CA8B2", fontSize: 7, fontWeight: "900" },
  flightLine: { position: "absolute", left: 27, right: 50, height: 1, backgroundColor: "#183643" },
  ship: { position: "absolute", left: "27%", width: 39, height: 22, marginLeft: -20, alignItems: "center", justifyContent: "center", backgroundColor: "#4E55C7", borderRadius: 11, borderWidth: 1.5, borderColor: "#9297FF", zIndex: 3 },
  shipDamaged: { backgroundColor: "#95443C", borderColor: "#FF9A86" },
  shipGlyph: { color: colors.surface, fontSize: 11, fontWeight: "900" },
  flame: { position: "absolute", left: -5, width: 7, height: 4, borderRadius: 3, backgroundColor: "#F3C969" },
  flameLeft: { top: 5 },
  flameRight: { bottom: 5 },
  gate: { position: "absolute", right: 8, width: 40, height: 25, alignItems: "center", justifyContent: "center", opacity: 0.32 },
  gateOpen: { opacity: 1, backgroundColor: "#184D4A", borderRadius: 8 },
  gateGlyph: { color: "#506773", fontSize: 10, fontWeight: "900" },
  gateGlyphOpen: { color: "#97F6E8", fontSize: 13 },
  status: { backgroundColor: "#0E2A38", borderRadius: radii.small, padding: 11, marginTop: 10 },
  statusDanger: { backgroundColor: "#3B252B" },
  statusTitle: { color: "#EAF5F4", fontSize: 11, fontWeight: "900", textAlign: "center" },
  statusHint: { color: "#85A1AB", fontSize: 8, lineHeight: 13, textAlign: "center", marginTop: 3 },
  controlPanel: { backgroundColor: "#102534", borderRadius: radii.medium, padding: 12, marginTop: 10, borderWidth: 1, borderColor: "#284654" },
  controlHeading: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 9 },
  engineMark: { width: 35, height: 35, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "#4F56C8" },
  engineMarkCoral: { backgroundColor: "#B55445" },
  engineGlyph: { color: colors.surface, fontSize: 13, fontWeight: "900" },
  controlCopy: { flexGrow: 1, flexShrink: 1, flexBasis: 120, minWidth: 0 },
  controlTitle: { color: colors.surface, fontSize: 11, fontWeight: "900" },
  controlHint: { color: "#A5C2CC", fontSize: 8, marginTop: 2 },
  lockBadge: { backgroundColor: "#293B45", borderRadius: radii.pill, paddingHorizontal: 9, paddingVertical: 6 },
  lockBadgeLive: { backgroundColor: "#15584F" },
  lockText: { color: "#A9C0C7", fontSize: 7, fontWeight: "900" },
  powerRow: { flexDirection: "row", gap: 8, marginTop: 11 },
  powerButton: { flex: 1, minHeight: 78, alignItems: "center", justifyContent: "center", backgroundColor: "#172F3D", borderRadius: radii.small, borderWidth: 1.5, borderColor: "#365466" },
  powerSelected: { backgroundColor: "#B6832C", borderColor: "#FFE099" },
  powerDisabled: { opacity: 0.42 },
  powerPressed: { transform: [{ scale: 0.95 }] },
  powerGlyph: { color: "#A7CED5", fontSize: 21, fontWeight: "900" },
  powerGlyphSelected: { color: "#FFF2C1" },
  powerLabel: { color: "#D5E4E7", fontSize: 10, fontWeight: "900", marginTop: 2 },
  powerLabelSelected: { color: colors.surface },
  powerMeta: { color: "#7D9AA4", fontSize: 7, fontWeight: "800", marginTop: 2 },
  formula: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4, marginTop: 10 },
  formulaMark: { color: "#F3C969", fontSize: 14, fontWeight: "900" },
  formulaText: { flex: 1, color: "#8CA8B2", fontSize: 8, lineHeight: 12, fontWeight: "800" },
});
