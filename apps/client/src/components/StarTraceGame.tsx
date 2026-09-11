import { memo } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ScaledText";
import { useI18n } from "@/i18n";

import type { MazeDirection, Seat, StarTracePoint, StarTraceViewState } from "@duo/game-core";
import type { RoomPhase } from "@duo/protocol";

import { useSettings } from "@/settings/SettingsContext";
import { colors, createGameStyles, radii, shadows } from "@/theme";

type Props = {
  game: StarTraceViewState;
  ownSeat: Seat;
  phase: RoomPhase;
  onMove: (direction: MazeDirection) => void;
};

const directionInfo: Record<MazeDirection, { arrow: string; label: string }> = {
  up: { arrow: "↑", label: "向上" },
  right: { arrow: "→", label: "向右" },
  down: { arrow: "↓", label: "向下" },
  left: { arrow: "←", label: "向左" },
};

const pad: (MazeDirection | null)[][] = [[null, "up", null], ["left", null, "right"], [null, "down", null]];

function pointStyle(point: StarTracePoint, size: number) {
  return {
    left: `${point.x / (size - 1) * 100}%` as `${number}%`,
    top: `${point.y / (size - 1) * 100}%` as `${number}%`,
  };
}

function statusCopy(game: StarTraceViewState, isGuide: boolean): string {
  if (game.lastOutcome === "charted") return game.result ? "任务完成：完整星图已经公开复盘" : "星图已经闭合，路径公开复盘，准备交换岗位";
  if (game.lastOutcome === "ink_depleted") return "星墨耗尽：完整路径现已公开";
  if (game.lastOutcome === "trace_timeout") return "星图窗口关闭：完整路径现已公开";
  if (isGuide) return `请口述前往第 ${game.currentTarget + 1} 号星点的方向和格数`;
  return "你的画布没有目标提示，请按搭档口述逐格移动光笔";
}

export const StarTraceGame = memo(function StarTraceGame({ game, ownSeat, phase, onMove }: Props) {
  const { t } = useI18n();
  const { feedback, settings } = useSettings();
  const isGuide = ownSeat === game.guideSeat;
  const ended = Boolean(game.result) || phase === "completed";
  const paused = !ended && phase !== "playing";
  const canMove = phase === "playing" && game.phase === "tracing" && !game.result && !isGuide;
  const showChart = game.checkpoints !== null;
  const atBoundary = (direction: MazeDirection) =>
    direction === "up" ? game.cursor.y === 0
      : direction === "right" ? game.cursor.x === game.gridSize - 1
        : direction === "down" ? game.cursor.y === game.gridSize - 1
          : game.cursor.x === 0;

  function move(direction: MazeDirection) {
    feedback("place", "medium");
    onMove(direction);
  }

  return (
    <View style={[styles.shell, settings.highContrast && styles.highContrast]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>CONSTELLATION // BLIND LINK</Text>
          <Text style={styles.title}>星图盲绘台</Text>
        </View>
        <View accessibilityLabel={t(`第 ${game.stage} 张星图，共 ${game.totalStages} 张`)} style={styles.stageBadge}>
          <Text style={styles.stageLabel}>星图</Text>
          <Text style={styles.stageValue}>{game.stage}/{game.totalStages}</Text>
        </View>
      </View>

      <View style={styles.metrics}>
        <View style={styles.metric}><Text style={styles.metricLabel}>已连星点</Text><Text style={styles.metricValue}>{game.currentTarget}/{game.checkpointCount}</Text></View>
        <View style={styles.metric}><Text style={styles.metricLabel}>剩余星墨</Text><Text style={[styles.metricValue, game.ink <= 3 && styles.inkLow]}>{game.ink}/{game.maxInk}</Text></View>
        <View style={styles.metric}><Text style={styles.metricLabel}>完成星图</Text><Text style={styles.metricValue}>{game.completedStages}</Text></View>
        <View style={styles.metric}><Text style={styles.metricLabel}>团队得分</Text><Text style={styles.metricValue}>{game.score}</Text></View>
      </View>

      <View style={[styles.roleCard, !isGuide && styles.tracerRole]}>
        <View style={[styles.roleGlyphWrap, !isGuide && styles.tracerGlyphWrap]}><Text style={styles.roleGlyph}>{isGuide ? "✦" : "⌁"}</Text></View>
        <View style={styles.roleCopy}>
          <Text style={styles.roleTitle}>{isGuide ? "你是星图引导员" : "你是盲绘操笔员"}</Text>
          <Text style={styles.roleHint}>{game.phase === "stage_result" ? "本张星图已向双方公开，可以一起复盘路线。" : isGuide ? "私密星点只在你这里发光；把方向和格数清楚地说给搭档。" : "你看不到隐藏星点；按搭档指引移动，走错同样会消耗星墨。"}</Text>
        </View>
        <View style={[styles.privacyBadge, showChart && styles.chartVisible]}>
          <Text style={styles.privacyLabel}>{showChart ? "PRIVATE CHART" : "BLIND CANVAS"}</Text>
          <Text style={styles.privacyValue}>{showChart ? "星点可见" : "目标隐藏"}</Text>
        </View>
      </View>

      <View style={styles.chartWrap}>
        <View style={styles.chartHeader}>
          <Text style={styles.chartTitle}>{`MAP ${String(game.stage).padStart(2, "0")} // ${game.gridSize}×${game.gridSize}`}</Text>
          <Text style={styles.chartLegend}>● 光笔 · · 已走轨迹 · ✦ 私密星点</Text>
        </View>
        <View
          accessibilityLabel={t(`${game.gridSize} 乘 ${game.gridSize} 星域；光笔位于第 ${game.cursor.y + 1} 行第 ${game.cursor.x + 1} 列；已连接 ${game.currentTarget} 个星点`)}
          accessibilityRole="summary"
          style={styles.chart}
        >
          {Array.from({ length: game.gridSize * game.gridSize }, (_, index) => (
            <View
              key={`grid-${index}`}
              style={[styles.gridDot, pointStyle({ x: index % game.gridSize, y: Math.floor(index / game.gridSize) }, game.gridSize)]}
            />
          ))}
          {game.trail.map((point, index) => (
            <View key={`trail-${index}`} style={[styles.trailDot, pointStyle(point, game.gridSize), index === 0 && styles.startDot]} />
          ))}
          {showChart && game.checkpoints!.map((point, index) => {
            const reached = index < game.currentTarget;
            const next = index === game.currentTarget && game.phase === "tracing";
            return (
              <View
                accessibilityLabel={t(`第 ${index + 1} 号${reached ? "已连接" : next ? "下一个" : "待连接"}星点，第 ${point.y + 1} 行第 ${point.x + 1} 列`)}
                key={`star-${index}`}
                style={[styles.star, pointStyle(point, game.gridSize), reached && styles.starReached, next && styles.starNext]}
              >
                <Text style={styles.starGlyph}>✦</Text><Text style={styles.starNumber}>{index + 1}</Text>
              </View>
            );
          })}
          <View style={[styles.cursor, pointStyle(game.cursor, game.gridSize)]}><Text style={styles.cursorGlyph}>●</Text></View>
        </View>
      </View>

      <View accessibilityLiveRegion="polite" style={[styles.status, game.lastOutcome && styles.statusReveal]}>
        <Text style={styles.statusText}>{ended ? "本局星图盲绘已结束，查看最终复盘" : paused ? "星图盲绘已暂停，等待连接恢复" : statusCopy(game, isGuide)}</Text>
        <Text style={styles.coordinate}>光笔坐标 · 行 {game.cursor.y + 1} / 列 {game.cursor.x + 1}</Text>
      </View>

      <View style={styles.controls}>
        <View style={styles.controlHeading}>
          <View><Text style={styles.controlKicker}>{isGuide ? "VOICE GUIDANCE" : "LIGHT PEN"}</Text><Text style={styles.controlTitle}>{isGuide ? "观察星图并口述路线" : "逐格移动盲绘光笔"}</Text></View>
          <Text style={styles.controlState}>{game.currentTarget >= game.checkpointCount ? "全部连接" : isGuide ? `下一目标 ${game.currentTarget + 1} 号` : `星墨 ${game.ink}`}</Text>
        </View>
        <View testID="star-trace-direction-pad" style={styles.pad}>
          {pad.map((row, rowIndex) => <View key={rowIndex} style={styles.padRow}>
          {row.map((direction, index) => direction === null
            ? <View key={`blank-${index}`} style={styles.padBlank} />
            : (
              <Pressable
                accessibilityHint={t("让光笔向该方向移动一格，每次移动消耗一格星墨")}
                accessibilityLabel={t(`光笔${directionInfo[direction].label}一格`)}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canMove || atBoundary(direction) }}
                disabled={!canMove || atBoundary(direction)}
                key={direction}
                onPress={() => move(direction)}
                style={({ pressed }) => [styles.padButton, (!canMove || atBoundary(direction)) && styles.disabled, pressed && !settings.reducedMotion && styles.pressed]}
              >
                <Text style={styles.padArrow}>{directionInfo[direction].arrow}</Text>
                <Text style={styles.padLabel}>{directionInfo[direction].label}</Text>
              </Pressable>
            ))}
          </View>)}
        </View>
      </View>
    </View>
  );
});

const styles = createGameStyles({
  shell: { width: "100%", maxWidth: 940, alignSelf: "center", backgroundColor: "#071527", borderRadius: radii.large, padding: 18, overflow: "hidden", ...shadows.card },
  highContrast: { borderWidth: 3, borderColor: colors.surface },
  header: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 14 },
  kicker: { color: "#60E0D1", fontSize: 9, fontWeight: "900", letterSpacing: 1.3 },
  title: { color: "#F1FCFA", fontSize: 21, fontWeight: "900", marginTop: 3 },
  stageBadge: { minWidth: 82, alignItems: "center", backgroundColor: "#15344A", borderRadius: radii.small, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: "#2B6680" },
  stageLabel: { color: "#7AA4B7", fontSize: 8, fontWeight: "900" },
  stageValue: { color: "#E9FFFB", fontSize: 17, fontWeight: "900", marginTop: 1 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 12 },
  metric: { flexGrow: 1, flexBasis: 70, minHeight: 49, justifyContent: "center", backgroundColor: "#102A3D", borderRadius: radii.small, paddingHorizontal: 9 },
  metricLabel: { color: "#769BAA", fontSize: 7, fontWeight: "900" },
  metricValue: { color: "#F0FAF8", fontSize: 14, fontWeight: "900", marginTop: 3 },
  inkLow: { color: "#FF937D" },
  roleCard: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10, backgroundColor: "#12364A", borderRadius: radii.medium, padding: 12, marginTop: 10, borderLeftWidth: 4, borderLeftColor: "#F3D273" },
  tracerRole: { borderLeftColor: "#63E1D1" },
  roleGlyphWrap: { width: 39, height: 39, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: "#6F5A2B" },
  tracerGlyphWrap: { backgroundColor: "#176864" },
  roleGlyph: { color: colors.surface, fontSize: 18, fontWeight: "900" },
  roleCopy: { flexGrow: 1, flexShrink: 1, flexBasis: 125, minWidth: 0 },
  roleTitle: { color: colors.surface, fontSize: 12, fontWeight: "900" },
  roleHint: { color: "#A7C3CE", fontSize: 8, lineHeight: 12, marginTop: 2 },
  privacyBadge: { minWidth: 92, backgroundColor: "#243848", borderRadius: 9, paddingHorizontal: 9, paddingVertical: 7 },
  chartVisible: { backgroundColor: "#4D442B" },
  privacyLabel: { color: "#D8D2C2", fontSize: 6, fontWeight: "900" },
  privacyValue: { color: "#E8F5F3", fontSize: 9, fontWeight: "900", marginTop: 2 },
  chartWrap: { backgroundColor: "#020913", borderRadius: radii.medium, padding: 11, marginTop: 10, borderWidth: 1, borderColor: "#173B55" },
  chartHeader: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8, marginBottom: 8 },
  chartTitle: { color: "#61CABF", fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  chartLegend: { color: "#668795", fontSize: 7, fontWeight: "800" },
  chart: { width: "100%", maxWidth: 430, alignSelf: "center", aspectRatio: 1, backgroundColor: "#061524", borderWidth: 1, borderColor: "#24506A", borderRadius: 13, position: "relative", margin: 8 },
  gridDot: { position: "absolute", width: 3, height: 3, borderRadius: 2, backgroundColor: "#284358", transform: [{ translateX: -1.5 }, { translateY: -1.5 }] },
  trailDot: { position: "absolute", width: 7, height: 7, borderRadius: 4, backgroundColor: "#32AFA7", borderWidth: 1, borderColor: "#6DE6D7", transform: [{ translateX: -3.5 }, { translateY: -3.5 }] },
  startDot: { backgroundColor: "#F0CC6B", borderColor: "#FFF0A9" },
  star: { position: "absolute", width: 27, height: 27, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#4B4025", borderWidth: 1, borderColor: "#B18F41", transform: [{ translateX: -13.5 }, { translateY: -13.5 }] },
  starReached: { backgroundColor: "#17645E", borderColor: "#65E4D3" },
  starNext: { borderWidth: 3, borderColor: "#FFE18A" },
  starGlyph: { color: "#FFE07F", fontSize: 11, fontWeight: "900", lineHeight: 11 },
  starNumber: { color: "#FFF6D7", fontSize: 6, fontWeight: "900", lineHeight: 7 },
  cursor: { position: "absolute", width: 25, height: 25, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#5A5FD2", borderWidth: 3, borderColor: "#B5B7FF", transform: [{ translateX: -12.5 }, { translateY: -12.5 }] },
  cursorGlyph: { color: colors.surface, fontSize: 10, fontWeight: "900" },
  status: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8, backgroundColor: "#102E40", borderRadius: radii.small, padding: 10, marginTop: 10 },
  statusReveal: { backgroundColor: "#3F3A32" },
  statusText: { flexGrow: 1, flexShrink: 1, flexBasis: 220, minWidth: 0, color: "#E8F5F4", fontSize: 12, lineHeight: 18, fontWeight: "700" },
  coordinate: { color: "#F2D275", fontSize: 8, fontWeight: "900" },
  controls: { backgroundColor: "#102B3D", borderRadius: radii.medium, padding: 12, marginTop: 10, borderWidth: 1, borderColor: "#27516A" },
  controlHeading: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 10 },
  controlKicker: { color: "#65D8CC", fontSize: 7, fontWeight: "900", letterSpacing: 0.8 },
  controlTitle: { color: colors.surface, fontSize: 11, fontWeight: "900", marginTop: 2 },
  controlState: { color: "#F0D076", fontSize: 8, fontWeight: "900" },
  pad: { width: 234, maxWidth: "100%", alignSelf: "center", marginTop: 9, gap: 6 },
  padRow: { flexDirection: "row", gap: 6 },
  padBlank: { flex: 1, minWidth: 0, minHeight: 53, borderWidth: 1.5, borderColor: "transparent" },
  padButton: { flex: 1, minWidth: 0, minHeight: 53, paddingVertical: 7, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: "#17465A", borderWidth: 1.5, borderColor: "#3E7388" },
  padArrow: { color: "#A8FFF3", fontSize: 17, fontWeight: "900" },
  padLabel: { color: "#C9DDE1", fontSize: 7, fontWeight: "900", marginTop: 1 },
  disabled: { opacity: 0.3 },
  pressed: { transform: [{ scale: 0.94 }] },
});
