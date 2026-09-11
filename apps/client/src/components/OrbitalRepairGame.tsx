import { memo, useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ScaledText";

import { useI18n } from "@/i18n";

import type {
  OrbitDirection,
  OrbitalRepairViewState,
  OrbitRing,
  Seat,
} from "@duo/game-core";
import type { RoomPhase } from "@duo/protocol";

import { Button } from "@/components/Button";
import { useSettings } from "@/settings/SettingsContext";
import { colors, createGameStyles, radii, shadows } from "@/theme";

type Props = {
  game: OrbitalRepairViewState;
  ownSeat: Seat;
  phase: RoomPhase;
  onRotate: (ring: OrbitRing, direction: OrbitDirection) => void;
  onLaunch: () => void;
};

const RING_NAMES = ["外环", "中环", "内环"] as const;
const RING_SIZES = [244, 166, 92] as const;
const RING_COLORS = ["#8E91FF", "#7FE1CF", "#FF9E88"] as const;

function pointStyle(size: number, slot: number, slotCount: number, pointSize: number) {
  const angle = (slot / slotCount) * Math.PI * 2 - Math.PI / 2;
  const radius = size / 2 - 7;
  return {
    left: size / 2 + Math.cos(angle) * radius - pointSize / 2,
    top: size / 2 + Math.sin(angle) * radius - pointSize / 2,
  };
}

export const OrbitalRepairGame = memo(function OrbitalRepairGame({
  game,
  ownSeat,
  phase,
  onRotate,
  onLaunch,
}: Props) {
  const { t } = useI18n();
  const { feedback, settings } = useSettings();
  const [displaySize, setDisplaySize] = useState(280);
  const isEngineer = ownSeat === game.engineerSeat;
  const canAct = phase === "playing" && game.phase === "aligning" && !game.result;
  const activeRings = Array.from({ length: game.ringCount }, (_, index) => index as OrbitRing);
  const slots = Array.from({ length: game.slotCount }, (_, index) => index);

  function rotate(ring: OrbitRing, direction: OrbitDirection) {
    feedback("place", "light");
    onRotate(ring, direction);
  }

  function launch() {
    feedback("scan", "heavy");
    onLaunch();
  }

  const status = game.result || phase === "completed"
    ? "本局已结束，查看上方结果"
    : phase !== "playing"
      ? "等待连接恢复后继续抢修"
    : game.phase === "stage_result"
    ? "链路稳定，正在切换维修站"
    : game.lastLaunchCorrect === false
      ? `对接失败，过载 ${game.strikes}/${game.maxStrikes}`
      : isEngineer
        ? "听取蓝图刻度并旋转轨道"
        : "读取蓝图，确认后发射脉冲";

  return (
    <View style={[styles.shell, settings.highContrast && styles.highContrast]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>ORBITAL REPAIR</Text>
          <Text style={styles.title}>重启深空中继站</Text>
        </View>
        <View style={styles.metrics}>
          <View style={styles.metric} accessibilityLabel={t(`当前第 ${game.stage} 站，共 ${game.totalStages} 站`)}>
            <Text style={styles.metricLabel}>维修站</Text>
            <Text style={styles.metricValue}>{game.stage}/{game.totalStages}</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>过载</Text>
            <Text style={[styles.metricValue, game.strikes > 0 && styles.danger]}>{game.strikes}/{game.maxStrikes}</Text>
          </View>
        </View>
      </View>

      <View style={styles.roleCard}>
        <View style={styles.roleCopy}>
          <Text style={styles.roleTitle}>{isEngineer ? "你是轨道工程师" : "你是能量发射员"}</Text>
          <Text style={styles.roleHint}>
            {isEngineer
              ? "你能旋转轨道，但看不到珊瑚色目标蓝图。"
              : "你能看到珊瑚色目标，向搭档口述每一环的刻度。"}
          </Text>
        </View>
        <View style={styles.statusBadge}><Text accessibilityLiveRegion="polite" style={styles.statusText}>{status}</Text></View>
      </View>

      <View style={styles.console} onLayout={({ nativeEvent }) => setDisplaySize(Math.min(280, Math.max(1, nativeEvent.layout.width)))}>
        <View accessibilityLabel={t("轨道对接仪")} style={[styles.orbitDisplay, { width: displaySize, height: displaySize }]}>
          {slots.map((slot) => {
            const labelSize = displaySize;
            const position = pointStyle(labelSize, slot, game.slotCount, 24);
            return <View key={`tick-${slot}`} style={[styles.tick, position]}><Text style={styles.tickText}>{slot + 1}</Text></View>;
          })}
          {activeRings.map((ring) => {
            const size = RING_SIZES[ring] * displaySize / 280;
            const current = game.currentSlots[ring]!;
            const target = game.targetSlots?.[ring];
            return (
              <View
                key={ring}
                accessible
                accessibilityLabel={t(`${RING_NAMES[ring]}当前刻度 ${current + 1}${target !== undefined ? `，目标刻度 ${target + 1}` : ""}`)}
                style={[
                  styles.ring,
                  { width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2, borderColor: RING_COLORS[ring] },
                ]}
              >
                {target !== undefined && (
                  <View style={[styles.targetNode, pointStyle(size, target, game.slotCount, 28)]}>
                    <Text style={styles.targetText}>T</Text>
                  </View>
                )}
                <View style={[styles.currentNode, { backgroundColor: RING_COLORS[ring] }, pointStyle(size, current, game.slotCount, 20)]}>
                  <Text style={styles.currentText}>{ring + 1}</Text>
                </View>
              </View>
            );
          })}
          <View style={[styles.core, { left: displaySize / 2 - 24, top: displaySize / 2 - 24 }]}><Text style={styles.coreText}>⚡</Text></View>
        </View>

        <View style={styles.legend}>
          <View style={styles.legendItem}><View style={styles.currentDot} /><Text style={styles.legendText}>当前接点</Text></View>
          <View style={styles.legendItem}><View style={styles.targetDot} /><Text style={styles.legendText}>{game.targetSlots ? "私密目标" : "目标仅发射员可见"}</Text></View>
        </View>

        {isEngineer ? (
          <View style={styles.controls}>
            {activeRings.map((ring) => (
              <View key={ring} style={styles.controlRow}>
                <View style={[styles.ringBadge, { backgroundColor: RING_COLORS[ring] }]}><Text style={styles.ringBadgeText}>{ring + 1}</Text></View>
                <Text style={styles.ringName}>{RING_NAMES[ring]}</Text>
                <Pressable
                  accessibilityLabel={t(`${RING_NAMES[ring]}逆时针`)}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !canAct }}
                  disabled={!canAct}
                  onPress={() => rotate(ring, "counterclockwise")}
                  style={({ pressed }) => [styles.rotateButton, !canAct && styles.disabled, pressed && !settings.reducedMotion && styles.pressed]}
                ><Text style={styles.rotateText}>↶</Text></Pressable>
                <Pressable
                  accessibilityLabel={t(`${RING_NAMES[ring]}顺时针`)}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !canAct }}
                  disabled={!canAct}
                  onPress={() => rotate(ring, "clockwise")}
                  style={({ pressed }) => [styles.rotateButton, !canAct && styles.disabled, pressed && !settings.reducedMotion && styles.pressed]}
                ><Text style={styles.rotateText}>↷</Text></Pressable>
              </View>
            ))}
            <Text style={styles.rotationCount}>本维修站已旋转 {game.stageRotations} 次</Text>
          </View>
        ) : (
          <View style={styles.launchPanel}>
            <Text style={styles.blueprintTitle}>对接蓝图</Text>
            <View style={styles.blueprintRow}>
              {activeRings.map((ring) => (
                <View key={ring} accessible accessibilityLabel={t(`${RING_NAMES[ring]}目标刻度 ${(game.targetSlots?.[ring] ?? 0) + 1}`)} style={styles.blueprintCell}>
                  <Text style={styles.blueprintRing}>{RING_NAMES[ring]}</Text>
                  <Text style={styles.blueprintSlot}>{(game.targetSlots?.[ring] ?? 0) + 1}</Text>
                </View>
              ))}
            </View>
            <Button disabled={!canAct} onPress={launch} style={styles.launchButton}>
              发射能量脉冲
            </Button>
          </View>
        )}
      </View>
    </View>
  );
});

const styles = createGameStyles({
  shell: { width: "100%", maxWidth: 920, alignSelf: "center", backgroundColor: "#111429", borderRadius: radii.large, padding: 18, ...shadows.card },
  highContrast: { borderWidth: 3, borderColor: colors.surface },
  header: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 },
  kicker: { color: "#FF9E88", fontSize: 9, fontWeight: "900", letterSpacing: 1.3 },
  title: { color: colors.surface, fontSize: 21, fontWeight: "900", marginTop: 3 },
  metrics: { flexDirection: "row", gap: 8 },
  metric: { minWidth: 76, borderRadius: radii.small, backgroundColor: "#252A47", paddingHorizontal: 10, paddingVertical: 7 },
  metricLabel: { color: "#8D92B0", fontSize: 8, fontWeight: "900" },
  metricValue: { color: "#D7DAEE", fontSize: 16, fontWeight: "900", marginTop: 1 },
  danger: { color: "#FF9E88" },
  roleCard: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, backgroundColor: "#222742", borderRadius: radii.medium, borderLeftWidth: 4, borderLeftColor: "#FF9E88", padding: 13, marginTop: 13 },
  roleCopy: { flexGrow: 1, flexShrink: 1, flexBasis: 220, minWidth: 0 },
  roleTitle: { color: colors.surface, fontSize: 14, fontWeight: "900" },
  roleHint: { color: "#BEC1D5", fontSize: 10, lineHeight: 15, marginTop: 3 },
  statusBadge: { maxWidth: 220, backgroundColor: "#101326", borderRadius: radii.small, padding: 9 },
  statusText: { color: "#FFD0C5", fontSize: 12, lineHeight: 18, fontWeight: "700", textAlign: "center" },
  console: { width: "100%", alignItems: "center", marginTop: 12 },
  orbitDisplay: { width: 280, height: 280, position: "relative", borderRadius: 140, backgroundColor: "#0A0D1D", overflow: "hidden" },
  tick: { position: "absolute", width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#2B304D", zIndex: 8 },
  tickText: { color: "#D7DAEE", fontSize: 9, fontWeight: "900" },
  ring: { position: "absolute", left: "50%", top: "50%", borderWidth: 2, borderRadius: 999, opacity: 0.98 },
  currentNode: { position: "absolute", width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", zIndex: 4, borderWidth: 2, borderColor: "#0A0D1D" },
  currentText: { color: "#101326", fontSize: 8, fontWeight: "900" },
  targetNode: { position: "absolute", width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#FF8B75", backgroundColor: "rgba(255,139,117,0.18)", zIndex: 3 },
  targetText: { color: "#FFB4A4", fontSize: 9, fontWeight: "900" },
  core: { position: "absolute", left: 116, top: 116, width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: "#32385D", borderWidth: 2, borderColor: "#F3C969", zIndex: 9 },
  coreText: { color: "#FFE58A", fontSize: 20 },
  legend: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 14, marginTop: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  currentDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#7FE1CF" },
  targetDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: "#FF8B75" },
  legendText: { color: "#9EA2BD", fontSize: 9, fontWeight: "800" },
  controls: { width: "100%", maxWidth: 520, gap: 7, marginTop: 13 },
  controlRow: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: "#202541", borderRadius: radii.small, padding: 7 },
  ringBadge: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  ringBadgeText: { color: "#101326", fontSize: 10, fontWeight: "900" },
  ringName: { flex: 1, color: colors.surface, fontSize: 11, fontWeight: "900" },
  rotateButton: { width: 44, minHeight: 44, alignItems: "center", justifyContent: "center", backgroundColor: "#303654", borderRadius: 9, borderWidth: 1, borderColor: "#505777" },
  rotateText: { color: colors.surface, fontSize: 22, fontWeight: "900" },
  rotationCount: { color: "#8D92B0", fontSize: 9, fontWeight: "800", textAlign: "center", marginTop: 2 },
  launchPanel: { width: "100%", maxWidth: 520, alignItems: "stretch", backgroundColor: "#202541", borderRadius: radii.medium, padding: 13, marginTop: 13 },
  blueprintTitle: { color: "#FFAD9B", fontSize: 10, fontWeight: "900", letterSpacing: 0.7, textAlign: "center" },
  blueprintRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  blueprintCell: { flex: 1, alignItems: "center", backgroundColor: "#12162A", borderRadius: radii.small, paddingVertical: 9, borderWidth: 1, borderColor: "#493743" },
  blueprintRing: { color: "#A8ABC1", fontSize: 8, fontWeight: "900" },
  blueprintSlot: { color: "#FF9E88", fontSize: 20, fontWeight: "900", marginTop: 1 },
  launchButton: { marginTop: 10, backgroundColor: "#A84A3D" },
  disabled: { opacity: 0.4 },
  pressed: { transform: [{ scale: 0.96 }] },
});
