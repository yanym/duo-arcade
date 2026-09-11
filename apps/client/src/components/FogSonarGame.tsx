import { memo } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ScaledText";

import { useI18n } from "@/i18n";

import type { FogSonarViewState, MazeDirection, Seat } from "@duo/game-core";
import type { RoomPhase } from "@duo/protocol";

import { useSettings } from "@/settings/SettingsContext";
import { colors, createGameStyles, radii, shadows } from "@/theme";

type Props = {
  game: FogSonarViewState;
  ownSeat: Seat;
  phase: RoomPhase;
  onPing: (direction: MazeDirection) => void;
  onSteer: (direction: MazeDirection) => void;
};

const directionInfo: Record<MazeDirection, { arrow: string; label: string }> = {
  up: { arrow: "↑", label: "向北" },
  right: { arrow: "→", label: "向东" },
  down: { arrow: "↓", label: "向南" },
  left: { arrow: "←", label: "向西" },
};

const pad: (MazeDirection | null)[][] = [[null, "up", null], ["left", "down", "right"]];

function statusCopy(game: FogSonarViewState): string {
  if (game.result) return game.result.kind === "success" ? "全部信标已抵达：海图已公开，可以一起复盘航线" : "本局航行已结束：海图已公开，可以一起复盘航线";
  if (game.lastMove?.outcome === "reef_hit") return "撞上暗礁：船体受损，位置未改变";
  if (game.lastMove?.outcome === "beacon_reached") return "信标已抵达：海图公开，准备交换岗位";
  if (game.lastMove?.outcome === "sailed") return "航行安全：继续沿声呐路线前进";
  return "浓雾会遮住舵手的暗礁图，声呐员负责引路";
}

function cellLabel(game: FogSonarViewState, index: number, hasReef: boolean): string {
  const row = Math.floor(index / game.gridSize) + 1;
  const col = index % game.gridSize + 1;
  if (index === game.ship) return `第 ${row} 行第 ${col} 列，雾航船当前位置`;
  if (index === game.beacon) return `第 ${row} 行第 ${col} 列，目标信标`;
  if (hasReef) return `第 ${row} 行第 ${col} 列，暗礁`;
  return `第 ${row} 行第 ${col} 列，${game.reefs === null ? "浓雾未知区域" : "安全水域"}`;
}

export const FogSonarGame = memo(function FogSonarGame({ game, ownSeat, phase, onPing, onSteer }: Props) {
  const { t } = useI18n();
  const { feedback, settings } = useSettings();
  const ended = Boolean(game.result) || phase === "completed";
  const paused = !ended && phase !== "playing";
  const isSonar = ownSeat === game.sonarSeat;
  const canAct = phase === "playing" && game.phase === "navigating" && !game.result;
  const showChart = game.reefs !== null;
  const ownAction = isSonar ? onPing : onSteer;
  const disabledFor = (direction: MazeDirection): boolean => {
    if (!canAct || (isSonar && game.pulseCharges <= 0)) return true;
    if (isSonar) return false;
    const row = Math.floor(game.ship / game.gridSize);
    const col = game.ship % game.gridSize;
    return (direction === "up" && row === 0) || (direction === "right" && col === game.gridSize - 1) ||
      (direction === "down" && row === game.gridSize - 1) || (direction === "left" && col === 0);
  };

  function act(direction: MazeDirection) {
    feedback(isSonar ? "scan" : "place", isSonar ? "light" : "medium");
    ownAction(direction);
  }

  return (
    <View style={[styles.shell, settings.highContrast && styles.highContrast]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>FOG SEA // SONAR LINK</Text>
          <Text style={styles.title}>雾海联合领航台</Text>
        </View>
        <View style={styles.zoneBadge} accessibilityLabel={t(`第 ${game.zone} 片雾区，共 ${game.totalZones} 片`)}>
          <Text style={styles.zoneLabel}>雾区</Text>
          <Text style={styles.zoneValue}>{game.zone}/{game.totalZones}</Text>
        </View>
      </View>

      <View style={styles.metrics}>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>船体</Text>
          <Text accessibilityLabel={t(`剩余船体 ${game.hull}/${game.maxHull}`)} style={styles.hullValue}>{"◆".repeat(game.hull)}{"◇".repeat(game.maxHull - game.hull)}</Text>
        </View>
        <View style={styles.metric}><Text style={styles.metricLabel}>穿越</Text><Text style={styles.metricValue}>{game.zonesCleared}</Text></View>
        <View style={styles.metric}><Text style={styles.metricLabel}>撞礁</Text><Text style={styles.metricValue}>{game.collisions}</Text></View>
        <View style={styles.metric}><Text style={styles.metricLabel}>得分</Text><Text style={styles.metricValue}>{game.score}</Text></View>
      </View>

      <View style={styles.roleCard}>
        <View style={[styles.roleMark, !isSonar && styles.helmMark]}><Text style={styles.roleGlyph}>{isSonar ? "◉" : "⌁"}</Text></View>
        <View style={styles.roleCopy}>
          <Text style={styles.roleTitle}>{isSonar ? "你是声呐领航员" : "你是雾航舵手"}</Text>
          <Text style={styles.roleHint}>{isSonar ? "你能看见暗礁，但不能移动船；口述路线或发送方向脉冲。" : "你能掌舵，但暗礁藏在雾里；按搭档指引逐格航行。"}</Text>
        </View>
        <View style={[styles.privacyBadge, showChart && styles.privacyLive]}>
          <Text style={styles.privacyLabel}>{showChart ? "声呐海图" : "浓雾视野"}</Text>
          <Text style={styles.privacyValue}>{showChart ? "暗礁可见" : "暗礁隐藏"}</Text>
        </View>
      </View>

      <View style={styles.chartWrap}>
        <View style={styles.chartHeader}>
          <Text style={styles.chartTitle}>{`SECTOR ${String(game.zone).padStart(2, "0")} // ${game.gridSize}×${game.gridSize}`}</Text>
          <Text style={styles.chartLegend}>⌁ 船 · ◎ 信标 · ▲ 暗礁</Text>
        </View>
        <View accessibilityLabel={t(`${game.gridSize} 乘 ${game.gridSize} 雾海图`)} accessibilityRole="summary" style={styles.chart}>
          {Array.from({ length: game.gridSize * game.gridSize }, (_, index) => {
            const hasReef = showChart && game.reefs!.includes(index);
            const hitReef = game.lastMove?.outcome === "reef_hit" && game.lastMove.to === index;
            const isShip = game.ship === index;
            const isBeacon = game.beacon === index;
            const width = `${100 / game.gridSize}%` as `${number}%`;
            return (
              <View
                accessibilityLabel={t(cellLabel(game, index, hasReef))}
                key={index}
                style={[styles.cell, { width }, hasReef && styles.reefCell, hitReef && styles.hitCell, isBeacon && styles.beaconCell]}
              >
                <View style={styles.ripple} />
                <Text style={[styles.cellGlyph, hasReef && styles.reefGlyph, isBeacon && styles.beaconGlyph, isShip && styles.shipGlyph]}>
                  {isShip ? "⌁" : isBeacon ? "◎" : hasReef || hitReef ? "▲" : showChart ? "·" : "≈"}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      <View accessibilityLiveRegion="polite" style={[styles.status, game.lastMove?.outcome === "reef_hit" && styles.statusDanger]}>
        <Text style={styles.statusText}>{ended ? statusCopy(game) : paused ? "雾航已暂停，等待连接恢复；当前海图与航位已保留" : statusCopy(game)}</Text>
        <View style={styles.pingReadout}>
          <Text style={styles.pingLabel}>最近方向脉冲</Text>
          <Text style={styles.pingValue}>{game.lastPing ? `${directionInfo[game.lastPing].arrow} ${directionInfo[game.lastPing].label}` : "等待声呐员发送"}</Text>
        </View>
      </View>

      <View style={styles.controls}>
        <View style={styles.controlHeading}>
          <View>
            <Text style={styles.controlKicker}>{isSonar ? "SONAR PULSE" : "HELM CONTROL"}</Text>
            <Text style={styles.controlTitle}>{isSonar ? "发送公开方向脉冲" : "逐格改变航向"}</Text>
          </View>
          <Text style={styles.charge}>{isSonar ? `脉冲 ${game.pulseCharges}/${game.maxPulseCharges}` : "等待搭档指引"}</Text>
        </View>
        <View testID="fog-direction-pad" style={styles.pad}>
          {pad.map((row, rowIndex) => <View key={rowIndex} style={styles.padRow}>
          {row.map((direction, index) => direction === null
            ? <View key={`blank-${index}`} style={styles.padBlank} />
            : (
              <Pressable
                accessibilityHint={t(isSonar ? "把方向提示公开发送给舵手，每次消耗一枚脉冲" : "让雾航船向该方向移动一格")}
                accessibilityLabel={t(`${isSonar ? "发送脉冲" : "掌舵"}${directionInfo[direction].label}`)}
                accessibilityRole="button"
                accessibilityState={{ disabled: disabledFor(direction) }}
                disabled={disabledFor(direction)}
                key={direction}
                onPress={() => act(direction)}
                style={({ pressed }) => [styles.padButton, disabledFor(direction) && styles.disabled, pressed && !settings.reducedMotion && styles.pressed]}
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
  shell: { width: "100%", maxWidth: 940, alignSelf: "center", backgroundColor: "#061D24", borderRadius: radii.large, padding: 18, overflow: "hidden", ...shadows.card },
  highContrast: { borderWidth: 3, borderColor: colors.surface },
  header: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 14 },
  kicker: { color: "#69E0D0", fontSize: 9, fontWeight: "900", letterSpacing: 1.3 },
  title: { color: "#F0FBFA", fontSize: 21, fontWeight: "900", marginTop: 3 },
  zoneBadge: { minWidth: 82, alignItems: "center", backgroundColor: "#103B44", borderRadius: radii.small, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: "#28717A" },
  zoneLabel: { color: "#78AEB4", fontSize: 8, fontWeight: "900" },
  zoneValue: { color: "#E6FFFB", fontSize: 17, fontWeight: "900", marginTop: 1 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 12 },
  metric: { flexGrow: 1, flexBasis: 70, minHeight: 49, justifyContent: "center", backgroundColor: "#0E3038", borderRadius: radii.small, paddingHorizontal: 9 },
  metricLabel: { color: "#87AAB0", fontSize: 8, fontWeight: "900" },
  metricValue: { color: "#ECFAF8", fontSize: 15, fontWeight: "900", marginTop: 3 },
  hullValue: { color: "#69E0D0", fontSize: 10, fontWeight: "900", letterSpacing: 1, marginTop: 5 },
  roleCard: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10, backgroundColor: "#12333E", borderRadius: radii.medium, padding: 12, marginTop: 10, borderLeftWidth: 4, borderLeftColor: "#69E0D0" },
  roleMark: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#146B70" },
  helmMark: { backgroundColor: "#5254BD" },
  roleGlyph: { color: colors.surface, fontSize: 17, fontWeight: "900" },
  roleCopy: { flexGrow: 1, flexShrink: 1, flexBasis: 125, minWidth: 0 },
  roleTitle: { color: colors.surface, fontSize: 12, fontWeight: "900" },
  roleHint: { color: "#A2C1C5", fontSize: 8, lineHeight: 12, marginTop: 2 },
  privacyBadge: { minWidth: 91, borderRadius: 9, backgroundColor: "#263D43", paddingHorizontal: 9, paddingVertical: 7 },
  privacyLive: { backgroundColor: "#164F50" },
  privacyLabel: { color: "#B1CAD1", fontSize: 7, fontWeight: "900" },
  privacyValue: { color: "#D6F5F0", fontSize: 9, fontWeight: "900", marginTop: 2 },
  chartWrap: { backgroundColor: "#031116", borderRadius: radii.medium, padding: 11, marginTop: 10, borderWidth: 1, borderColor: "#19444C" },
  chartHeader: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8, marginBottom: 8 },
  chartTitle: { color: "#6FC8C1", fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  chartLegend: { color: "#87AAB0", fontSize: 7, fontWeight: "800" },
  chart: { width: "100%", maxWidth: 410, alignSelf: "center", aspectRatio: 1, flexDirection: "row", flexWrap: "wrap", borderWidth: 1, borderColor: "#20505A", backgroundColor: "#071F27", overflow: "hidden" },
  cell: { aspectRatio: 1, alignItems: "center", justifyContent: "center", borderWidth: 0.5, borderColor: "#15404A", backgroundColor: "#0B2932", position: "relative", overflow: "hidden" },
  reefCell: { backgroundColor: "#26383A" },
  hitCell: { backgroundColor: "#572F32" },
  beaconCell: { backgroundColor: "#173D3F" },
  ripple: { position: "absolute", width: "62%", height: "62%", borderRadius: 999, borderWidth: 1, borderColor: "rgba(102,210,199,0.08)" },
  cellGlyph: { color: "#7AA0A4", fontSize: 12, fontWeight: "900" },
  reefGlyph: { color: "#E29472" },
  beaconGlyph: { color: "#F3D374", fontSize: 18 },
  shipGlyph: { color: "#9C9FFF", fontSize: 22 },
  status: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 9, backgroundColor: "#10333C", borderRadius: radii.small, padding: 10, marginTop: 10 },
  statusDanger: { backgroundColor: "#482D32" },
  statusText: { flexGrow: 1, flexShrink: 1, flexBasis: 210, minWidth: 0, color: "#E4F3F1", fontSize: 12, lineHeight: 18, fontWeight: "700" },
  pingReadout: { minWidth: 120, alignItems: "flex-end" },
  pingLabel: { color: "#87AAB0", fontSize: 7, fontWeight: "900" },
  pingValue: { color: "#F3D374", fontSize: 10, fontWeight: "900", marginTop: 2 },
  controls: { backgroundColor: "#102B35", borderRadius: radii.medium, padding: 12, marginTop: 10, borderWidth: 1, borderColor: "#28515A" },
  controlHeading: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 10 },
  controlKicker: { color: "#68CFC6", fontSize: 7, fontWeight: "900", letterSpacing: 0.8 },
  controlTitle: { color: colors.surface, fontSize: 11, fontWeight: "900", marginTop: 2 },
  charge: { color: "#9AB5B9", fontSize: 8, fontWeight: "900" },
  pad: { width: 246, maxWidth: "100%", alignSelf: "center", marginTop: 9, gap: 6 },
  padRow: { flexDirection: "row", gap: 6 },
  padBlank: { flex: 1, minWidth: 0, minHeight: 57, borderWidth: 1.5, borderColor: "transparent" },
  padButton: { flex: 1, minWidth: 0, minHeight: 57, paddingVertical: 7, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: "#174451", borderWidth: 1.5, borderColor: "#3D727B" },
  padArrow: { color: "#A1F1E7", fontSize: 18, fontWeight: "900" },
  padLabel: { color: "#C9DDDF", fontSize: 7, fontWeight: "900", marginTop: 1 },
  disabled: { opacity: 0.34 },
  pressed: { transform: [{ scale: 0.94 }] },
});
