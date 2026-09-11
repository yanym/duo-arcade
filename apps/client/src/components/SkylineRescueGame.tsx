import { memo } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ScaledText";
import { useI18n } from "@/i18n";

import type { RescuePressure, RescueZone, Seat, SkylineRescueViewState } from "@duo/game-core";
import type { RoomPhase } from "@duo/protocol";

import { useSettings } from "@/settings/SettingsContext";
import { colors, createGameStyles, radii, shadows } from "@/theme";

type Props = {
  game: SkylineRescueViewState;
  ownSeat: Seat;
  phase: RoomPhase;
  onAim: (zone: RescueZone) => void;
  onPressure: (pressure: RescuePressure) => void;
};

const zoneNames = ["下层平台", "中层平台", "上层平台"] as const;
const pressureNames = ["柔流", "强流", "脉冲流"] as const;

function outcomeCopy(game: SkylineRescueViewState): string {
  if (game.waveOutcome === "contained") return "冷却命中，热源已经稳定";
  if (game.waveOutcome === "wrong_zone") return "瞄准区域错误，塔体完整度下降";
  if (game.waveOutcome === "pressure_mismatch") return "水压档位不匹配，热源继续扩散";
  if (game.waveOutcome === "dispatch_timeout") return "调度超时，自动防护只保住了部分结构";
  return "交换私密情报，再分别锁定区域与水压";
}

export const SkylineRescueGame = memo(function SkylineRescueGame({
  game,
  ownSeat,
  phase,
  onAim,
  onPressure,
}: Props) {
  const { t } = useI18n();
  const { feedback, settings } = useSettings();
  const isPump = ownSeat === game.pumpSeat;
  const isGuide = !isPump;
  const ended = Boolean(game.result) || phase === "completed";
  const paused = !ended && phase !== "playing";
  const planning = phase === "playing" && game.phase === "planning" && !game.result;
  const canChoose = planning && !game.locked[ownSeat];

  function aim(zone: RescueZone) {
    feedback("scan", "medium");
    onAim(zone);
  }

  function pressure(value: RescuePressure) {
    feedback("tap", "medium");
    onPressure(value);
  }

  return (
    <View style={[styles.shell, settings.highContrast && styles.shellContrast]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>SKYLINE RESPONSE UNIT</Text>
          <Text style={styles.title}>云塔协同救援</Text>
        </View>
        <View style={styles.waveBadge} accessibilityLabel={t(`当前第 ${game.wave} 波，共 ${game.totalWaves} 波`)}>
          <Text style={styles.waveLabel}>热源波次</Text>
          <Text style={styles.waveValue}>{game.wave}/{game.totalWaves}</Text>
        </View>
      </View>

      <View style={styles.resources}>
        <View style={styles.resource}>
          <Text style={styles.resourceLabel}>塔体完整度</Text>
          <View style={styles.segmentRow} accessibilityLabel={t(`塔体完整度 ${game.integrity}/${game.maxIntegrity}`)}>
            {Array.from({ length: game.maxIntegrity }, (_, index) => <View key={index} style={[styles.segment, index < game.integrity && styles.integrityLive]} />)}
          </View>
        </View>
        <View style={styles.resource}>
          <Text style={styles.resourceLabel}>储水量</Text>
          <Text style={styles.resourceValue}>{game.water}<Text style={styles.resourceUnit}> / {game.maxWater}</Text></Text>
        </View>
        <View style={styles.resource}>
          <Text style={styles.resourceLabel}>已稳定</Text>
          <Text style={styles.resourceValue}>{game.containedWaves}<Text style={styles.resourceUnit}> 波</Text></Text>
        </View>
      </View>

      <View style={styles.sceneRow}>
        <View style={styles.tower} accessibilityLabel={t(game.priorityZone === null ? "热源区域对你保密" : `热源位于${zoneNames[game.priorityZone]}`)}>
          <View style={styles.antenna} />
          {[2, 1, 0].map((zone) => {
            const active = game.priorityZone === zone;
            return (
              <View key={zone} style={[styles.floor, active && styles.floorHot]}>
                <Text style={styles.floorLabel}>{zoneNames[zone as RescueZone]}</Text>
                <View style={styles.windows}>
                  <View style={[styles.window, active && styles.windowHot]} />
                  <View style={[styles.window, active && styles.windowHot]} />
                  <View style={[styles.window, active && styles.windowHot]} />
                </View>
                {active && <Text style={styles.heatMark}>≋</Text>}
              </View>
            );
          })}
          <View style={styles.towerBase}><Text style={styles.baseText}>CLOUD DECK 07</Text></View>
        </View>

        <View style={styles.intelColumn}>
          <View style={[styles.intelCard, isGuide && styles.intelCardOwn]}>
            <Text style={styles.intelKicker}>高空扫描频道</Text>
            <Text style={styles.intelValue}>{game.priorityZone === null ? "已加密" : zoneNames[game.priorityZone]}</Text>
            <Text style={styles.intelHint}>{game.priorityZone === null ? "区域只发给引导员" : "把区域名称告诉泵站员"}</Text>
          </View>
          <View style={[styles.intelCard, isPump && styles.intelCardOwn]}>
            <Text style={styles.intelKicker}>泵站压力频道</Text>
            <Text style={styles.intelValue}>{game.requiredPressure === null ? "已加密" : `${game.requiredPressure} 档 · ${pressureNames[game.requiredPressure - 1]}`}</Text>
            <Text style={styles.intelHint}>{game.requiredPressure === null ? "水压只发给泵站员" : "把档位名称告诉引导员"}</Text>
          </View>
        </View>
      </View>

      <View style={styles.controlRow}>
        <View style={[styles.controlPanel, isGuide && styles.controlOwn]}>
          <View style={styles.controlHeader}>
            <View><Text style={styles.controlKicker}>LADDER AIM</Text><Text style={styles.controlTitle}>云梯瞄准</Text></View>
            <Text style={[styles.lockBadge, game.locked[isGuide ? ownSeat : (ownSeat === 0 ? 1 : 0)] && styles.lockBadgeDone]}>
              {game.locked[isGuide ? ownSeat : (ownSeat === 0 ? 1 : 0)] ? "已锁定" : isGuide ? "由你操作" : "搭档操作"}
            </Text>
          </View>
          <View style={styles.choiceGrid}>
            {zoneNames.map((name, zone) => {
              const selected = game.aimChoice === zone;
              return (
                <Pressable
                  accessibilityLabel={t(`瞄准${name}`)}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !isGuide || !canChoose, selected }}
                  disabled={!isGuide || !canChoose}
                  key={name}
                  onPress={() => aim(zone as RescueZone)}
                  style={({ pressed }) => [styles.choice, selected && styles.choiceSelected, (!isGuide || !canChoose) && styles.disabled, pressed && !settings.reducedMotion && styles.pressed]}
                >
                  <Text style={styles.choiceGlyph}>{zone + 1}</Text><Text style={styles.choiceLabel}>{name}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={[styles.controlPanel, isPump && styles.controlOwn]}>
          <View style={styles.controlHeader}>
            <View><Text style={styles.controlKicker}>PUMP PRESSURE</Text><Text style={styles.controlTitle}>泵站水压</Text></View>
            <Text style={[styles.lockBadge, game.locked[isPump ? ownSeat : (ownSeat === 0 ? 1 : 0)] && styles.lockBadgeDone]}>
              {game.locked[isPump ? ownSeat : (ownSeat === 0 ? 1 : 0)] ? "已锁定" : isPump ? "由你操作" : "搭档操作"}
            </Text>
          </View>
          <View style={styles.choiceGrid}>
            {([1, 2, 3] as const).map((value) => {
              const selected = game.pressureChoice === value;
              const unavailable = value > game.water;
              return (
                <Pressable
                  accessibilityLabel={t(`${value} 档水压，${pressureNames[value - 1]}`)}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !isPump || !canChoose || unavailable, selected }}
                  disabled={!isPump || !canChoose || unavailable}
                  key={value}
                  onPress={() => pressure(value)}
                  style={({ pressed }) => [styles.choice, styles.pressureChoice, selected && styles.pressureSelected, (!isPump || !canChoose || unavailable) && styles.disabled, pressed && !settings.reducedMotion && styles.pressed]}
                >
                  <Text style={styles.pressureBars}>{"▮".repeat(value)}</Text><Text style={styles.choiceLabel}>{pressureNames[value - 1]}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      <View accessibilityLiveRegion="polite" style={[styles.status, game.waveOutcome && game.waveOutcome !== "contained" && styles.statusDanger]}>
        <View style={[styles.statusDot, game.waveOutcome === "contained" && styles.statusGood]} />
        <Text style={styles.statusText}>{ended ? "本局云塔救援已结束" : paused ? "救援已暂停，等待连接恢复" : game.phase === "planning" && game.locked[ownSeat] ? "你的方案已密封，等待搭档" : outcomeCopy(game)}</Text>
        <Text style={styles.statusMeta}>已用水 {game.totalWaterUsed} · 调度失误 {game.mistakes}</Text>
      </View>
    </View>
  );
});

const styles = createGameStyles({
  shell: { width: "100%", maxWidth: 960, alignSelf: "center", backgroundColor: "#10203A", borderRadius: radii.large, padding: 18, ...shadows.card },
  shellContrast: { borderWidth: 3, borderColor: colors.surface },
  header: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 14 },
  kicker: { color: "#70DCD0", fontSize: 9, fontWeight: "900", letterSpacing: 1.25 },
  title: { color: colors.surface, fontSize: 21, fontWeight: "900", marginTop: 3 },
  waveBadge: { minWidth: 84, alignItems: "center", backgroundColor: "#203652", borderRadius: radii.small, paddingHorizontal: 12, paddingVertical: 8 },
  waveLabel: { color: "#A9BDD0", fontSize: 8, fontWeight: "900" },
  waveValue: { color: colors.surface, fontSize: 17, fontWeight: "900", marginTop: 1 },
  resources: { flexDirection: "row", gap: 8, marginTop: 12 },
  resource: { flex: 1, minHeight: 48, justifyContent: "center", backgroundColor: "#1A314C", borderRadius: radii.small, paddingHorizontal: 10 },
  resourceLabel: { color: "#A9BDD0", fontSize: 8, fontWeight: "900" },
  resourceValue: { color: "#F1F7FC", fontSize: 15, fontWeight: "900", marginTop: 2 },
  resourceUnit: { color: "#A9BDD0", fontSize: 9 },
  segmentRow: { flexDirection: "row", gap: 4, marginTop: 7 },
  segment: { flex: 1, maxWidth: 22, height: 7, borderRadius: 4, backgroundColor: "#41556A" },
  integrityLive: { backgroundColor: "#66D6C5" },
  sceneRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 11 },
  tower: { flexGrow: 1, flexShrink: 1, flexBasis: 230, minWidth: 0, backgroundColor: "#071526", borderRadius: radii.medium, padding: 12, paddingTop: 19, position: "relative" },
  antenna: { position: "absolute", width: 4, height: 13, borderRadius: 2, backgroundColor: "#5F7A96", top: 6, left: "50%" },
  floor: { minHeight: 45, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#182D47", borderWidth: 1, borderColor: "#2D4965", paddingHorizontal: 10, marginBottom: 4, position: "relative" },
  floorHot: { backgroundColor: "#4A2C32", borderColor: "#E06F5C" },
  floorLabel: { width: 63, color: "#C0CDD9", fontSize: 8, fontWeight: "900" },
  windows: { flex: 1, flexDirection: "row", gap: 5 },
  window: { flex: 1, height: 20, borderRadius: 3, backgroundColor: "#27465E", borderWidth: 1, borderColor: "#3A6079" },
  windowHot: { backgroundColor: "#F29A54", borderColor: "#FFD08A" },
  heatMark: { color: "#FFB15E", fontSize: 17, fontWeight: "900" },
  towerBase: { minHeight: 24, alignItems: "center", justifyContent: "center", backgroundColor: "#23384D", borderBottomLeftRadius: 8, borderBottomRightRadius: 8 },
  baseText: { color: "#98B2C8", fontSize: 7, fontWeight: "900", letterSpacing: 0.8 },
  intelColumn: { flexGrow: 0.85, flexShrink: 1, flexBasis: 220, minWidth: 0, gap: 8 },
  intelCard: { flex: 1, minHeight: 86, justifyContent: "center", backgroundColor: "#182D47", borderWidth: 1.5, borderColor: "#304A65", borderRadius: radii.medium, padding: 13 },
  intelCardOwn: { backgroundColor: "#173C43", borderColor: "#42958C" },
  intelKicker: { color: "#91ADC0", fontSize: 8, fontWeight: "900", letterSpacing: 0.5 },
  intelValue: { color: colors.surface, fontSize: 16, fontWeight: "900", marginTop: 4 },
  intelHint: { color: "#98ADBE", fontSize: 8, marginTop: 4 },
  controlRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 },
  controlPanel: { flexGrow: 1, flexShrink: 1, flexBasis: 260, minWidth: 0, backgroundColor: "#0A192C", borderWidth: 1.5, borderColor: "#263F59", borderRadius: radii.medium, padding: 12 },
  controlOwn: { borderColor: "#6070D7" },
  controlHeader: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 8 },
  controlKicker: { color: "#A6B8CE", fontSize: 7, fontWeight: "900", letterSpacing: 0.6 },
  controlTitle: { color: colors.surface, fontSize: 13, fontWeight: "900", marginTop: 2 },
  lockBadge: { color: "#A9BDD0", backgroundColor: "#1B3044", borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 4, fontSize: 7, fontWeight: "900" },
  lockBadgeDone: { color: "#BDF2E8", backgroundColor: "#1C514E" },
  choiceGrid: { flexDirection: "row", gap: 6, marginTop: 10 },
  choice: { flex: 1, minHeight: 62, alignItems: "center", justifyContent: "center", backgroundColor: "#172B42", borderWidth: 1.5, borderColor: "#334C65", borderRadius: radii.small },
  choiceSelected: { backgroundColor: "#454C9D", borderColor: "#AAB0FF" },
  pressureChoice: { backgroundColor: "#153343", borderColor: "#2F6576" },
  pressureSelected: { backgroundColor: "#176F6A", borderColor: "#80E6D7" },
  choiceGlyph: { color: "#C5CCE9", fontSize: 17, fontWeight: "900" },
  pressureBars: { color: "#79DCCE", fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  choiceLabel: { color: "#C8D3DC", fontSize: 8, fontWeight: "900", marginTop: 4, textAlign: "center" },
  disabled: { opacity: 0.38 },
  pressed: { transform: [{ scale: 0.95 }] },
  status: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, backgroundColor: "#1A314B", borderRadius: radii.small, padding: 10, marginTop: 10 },
  statusDanger: { backgroundColor: "#4B2931" },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#788FA4" },
  statusGood: { backgroundColor: "#66D6C5" },
  statusText: { flexGrow: 1, flexShrink: 1, flexBasis: 180, minWidth: 0, color: "#E1EAF1", fontSize: 12, lineHeight: 18, fontWeight: "700" },
  statusMeta: { color: "#A9BDD0", fontSize: 8, fontWeight: "800" },
});
