import { memo } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ScaledText";
import { useI18n } from "@/i18n";

import type { EscortLane, Seat, StarwayEscortViewState } from "@duo/game-core";
import type { RoomPhase } from "@duo/protocol";

import { useSettings } from "@/settings/SettingsContext";
import { colors, createGameStyles, radii, shadows } from "@/theme";

type Props = {
  game: StarwayEscortViewState;
  ownSeat: Seat;
  phase: RoomPhase;
  onRoute: (lane: EscortLane) => void;
  onShield: (lane: EscortLane) => void;
};

const lanes: { id: EscortLane; name: string; callout: string }[] = [
  { id: 0, name: "左舷", callout: "左" },
  { id: 1, name: "中轴", callout: "中" },
  { id: 2, name: "右舷", callout: "右" },
];

function outcomeCopy(game: StarwayEscortViewState): string {
  if (game.result && game.phase !== "sector_result") return "本局航行已结束，查看上方结果";
  if (game.phase !== "sector_result") return "双方锁定后同时执行航行方案";
  return {
    energy_collected: "能量收集成功，货舱 +2",
    safe_passage: "安全通过，但错过了能量",
    shield_block: "护盾精准拦截，货舱 +1",
    hull_hit: "护盾未覆盖航线，船体受损",
  }[game.sectorOutcome!];
}

export const StarwayEscortGame = memo(function StarwayEscortGame({ game, ownSeat, phase, onRoute, onShield }: Props) {
  const { t } = useI18n();
  const isPilot = ownSeat === game.pilotSeat;
  const { feedback, settings } = useSettings();
  const ended = Boolean(game.result) || phase === "completed";
  const paused = !ended && phase !== "playing";
  const canChoose = phase === "playing" && game.phase === "planning" && !game.locked[ownSeat] && !game.result;
  const ownChoice = isPilot ? game.routeChoice : game.shieldChoice;
  const partnerSeat: Seat = ownSeat === 0 ? 1 : 0;

  function choose(lane: EscortLane) {
    feedback(isPilot ? "place" : "scan", "medium");
    if (isPilot) onRoute(lane);
    else onShield(lane);
  }

  return (
    <View style={[styles.shell, settings.highContrast && styles.highContrast]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>STARWAY ESCORT</Text>
          <Text style={styles.title}>穿越碎星航道</Text>
        </View>
        <View style={styles.meters}>
          <View style={styles.meter}><Text style={styles.meterLabel}>船体</Text><Text style={styles.meterValue}>{"◆".repeat(game.hull)}{"◇".repeat(game.maxHull - game.hull)}</Text></View>
          <View style={styles.meter}><Text style={styles.meterLabel}>能量</Text><Text style={styles.cargo}>{game.cargo}</Text></View>
        </View>
      </View>

      <View style={styles.roleCard}>
        <View style={styles.roleCopy}>
          <Text style={styles.roleTitle}>{isPilot ? "你是星舰驾驶员" : "你是护盾领航员"}</Text>
          <Text style={styles.roleHint}>{isPilot ? "你只收到能量信号；告诉搭档想走哪条航道。" : "你只收到障碍预警；提醒驾驶员并覆盖关键航道。"}</Text>
        </View>
        <View style={styles.intelBadge}>
          <Text style={styles.intelLabel}>私密情报</Text>
          <Text style={styles.intelValue}>
            {isPilot
              ? `能量：${game.energyLane === null ? "未知" : lanes[game.energyLane]!.name}`
              : `障碍：${game.obstacleLane === null ? "未知" : lanes[game.obstacleLane]!.name}`}
          </Text>
        </View>
      </View>

      <View style={styles.sectorRow}>
        <Text accessibilityLabel={t(`第 ${game.sector} 航段，共 ${game.totalSectors} 段`)} style={styles.sector}>航段 {game.sector}/{game.totalSectors}</Text>
        <Text accessibilityLiveRegion="polite" style={styles.partnerStatus}>{ended ? "本局已结束" : paused ? "等待连接恢复" : game.phase === "sector_result" ? "双方方案已执行" : game.locked[partnerSeat] ? "搭档已锁定" : "搭档规划中"}</Text>
      </View>

      <View style={styles.flightMap}>
        {lanes.map((lane) => {
          const energy = game.energyLane === lane.id;
          const obstacle = game.obstacleLane === lane.id;
          const routed = game.routeChoice === lane.id;
          const shielded = game.shieldChoice === lane.id;
          return (
            <View key={lane.id} style={styles.lane}>
              <View style={styles.laneNameBox}>
                <Text style={styles.laneName}>{lane.name}</Text>
              </View>
              <View style={styles.laneTrack}>
                <View style={styles.starDot} />
                <View style={[styles.starDot, styles.starDotTwo]} />
                {energy && <View style={styles.energy}><Text style={styles.energyText}>✦</Text></View>}
                {obstacle && <View style={styles.obstacle}><Text style={styles.obstacleText}>碎星</Text></View>}
                {routed && <View style={styles.ship}><Text style={styles.shipText}>▶</Text></View>}
                {shielded && <View style={styles.shield}><Text style={styles.shieldText}>⬡</Text></View>}
              </View>
            </View>
          );
        })}
      </View>

      <View accessibilityLiveRegion="polite" style={[styles.outcome, game.sectorOutcome === "hull_hit" && styles.outcomeDanger]}>
        <Text style={styles.outcomeText}>{ended ? "本局护航已结束，查看最终结果" : paused ? "护航已暂停；航段状态已保留" : outcomeCopy(game)}</Text>
      </View>

      <Text style={styles.actionTitle}>{isPilot ? "锁定星舰路线" : "分配护盾航道"}</Text>
      <View style={styles.controls}>
        {lanes.map((lane) => {
          const selected = ownChoice === lane.id;
          return (
            <Pressable
              accessibilityHint={t(isPilot ? "选择星舰将要进入的航道" : "选择护盾将要覆盖的航道")}
              accessibilityLabel={t(`${lane.name}${isPilot ? "路线" : "护盾"}`)}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canChoose, selected }}
              disabled={!canChoose}
              key={lane.id}
              onPress={() => choose(lane.id)}
              style={({ pressed }) => [
                styles.control,
                selected && styles.controlSelected,
                !canChoose && !selected && styles.disabled,
                pressed && !settings.reducedMotion && styles.pressed,
              ]}
            >
              <Text style={styles.controlCallout}>{lane.callout}</Text>
              <Text style={styles.controlName}>{lane.name}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
});

const styles = createGameStyles({
  shell: { width: "100%", maxWidth: 920, alignSelf: "center", backgroundColor: "#14182C", borderRadius: radii.large, padding: 18, ...shadows.card },
  highContrast: { borderWidth: 3, borderColor: colors.surface },
  header: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 14 },
  kicker: { color: "#7FE1CF", fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  title: { color: colors.surface, fontSize: 21, fontWeight: "900", marginTop: 3 },
  meters: { flexDirection: "row", gap: 8 },
  meter: { minWidth: 82, backgroundColor: "#272C49", borderRadius: radii.small, paddingHorizontal: 10, paddingVertical: 8 },
  meterLabel: { color: "#969AB8", fontSize: 8, fontWeight: "900" },
  meterValue: { color: "#7FE1CF", fontSize: 12, fontWeight: "900", letterSpacing: 2, marginTop: 2 },
  cargo: { color: colors.amber, fontSize: 17, fontWeight: "900", marginTop: 1 },
  roleCard: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, backgroundColor: "#252A47", borderRadius: radii.medium, borderLeftWidth: 4, borderLeftColor: colors.teal, padding: 13, marginTop: 13 },
  roleCopy: { flexGrow: 1, flexShrink: 1, flexBasis: 220, minWidth: 0 },
  roleTitle: { color: colors.surface, fontSize: 14, fontWeight: "900" },
  roleHint: { color: "#BEC1D5", fontSize: 10, lineHeight: 15, marginTop: 3 },
  intelBadge: { minWidth: 130, backgroundColor: "#101326", borderRadius: radii.small, padding: 10 },
  intelLabel: { color: "#7B809F", fontSize: 8, fontWeight: "900" },
  intelValue: { color: "#A7F0E2", fontSize: 12, fontWeight: "900", marginTop: 2 },
  sectorRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "space-between", alignItems: "center", marginTop: 13, marginBottom: 7 },
  sector: { color: colors.surface, fontSize: 12, fontWeight: "900" },
  partnerStatus: { color: "#9EA2BD", fontSize: 9, fontWeight: "800" },
  flightMap: { gap: 7 },
  lane: { minHeight: 62, flexDirection: "row", borderRadius: radii.small, overflow: "hidden", backgroundColor: "#202541" },
  laneNameBox: { width: 62, alignItems: "center", justifyContent: "center", backgroundColor: "#2C3151" },
  laneName: { color: "#D5D7E5", fontSize: 10, fontWeight: "900" },
  laneTrack: { flex: 1, position: "relative", justifyContent: "center", borderTopWidth: 1, borderBottomWidth: 1, borderColor: "rgba(145,151,195,0.2)" },
  starDot: { position: "absolute", left: "18%", width: 3, height: 3, borderRadius: 2, backgroundColor: "#6A708E" },
  starDotTwo: { left: "72%", top: 13 },
  energy: { position: "absolute", right: "13%", width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(243,201,105,0.18)", borderWidth: 1, borderColor: colors.amber },
  energyText: { color: colors.amber, fontSize: 19, fontWeight: "900" },
  obstacle: { position: "absolute", left: "47%", width: 54, height: 34, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: "#5B3340", borderWidth: 1, borderColor: colors.coral },
  obstacleText: { color: "#FFB19F", fontSize: 9, fontWeight: "900" },
  ship: { position: "absolute", left: "18%", zIndex: 2 },
  shipText: { color: "#8E91FF", fontSize: 26, fontWeight: "900" },
  shield: { position: "absolute", left: "28%", zIndex: 1 },
  shieldText: { color: "#7FE1CF", fontSize: 28, fontWeight: "900" },
  outcome: { minHeight: 39, alignItems: "center", justifyContent: "center", backgroundColor: "#28304A", borderRadius: radii.small, marginTop: 10, paddingHorizontal: 12 },
  outcomeDanger: { backgroundColor: "#4A2933" },
  outcomeText: { color: colors.surface, fontSize: 11, fontWeight: "900", textAlign: "center" },
  actionTitle: { color: "#B9BCD0", fontSize: 9, fontWeight: "900", letterSpacing: 0.6, textAlign: "center", marginTop: 13 },
  controls: { flexDirection: "row", gap: 9, marginTop: 7 },
  control: { flex: 1, minHeight: 68, alignItems: "center", justifyContent: "center", backgroundColor: "#272C49", borderRadius: radii.medium, borderWidth: 1.5, borderColor: "#414767" },
  controlSelected: { backgroundColor: "#304D54", borderColor: "#7FE1CF", borderWidth: 3 },
  disabled: { opacity: 0.46 },
  pressed: { transform: [{ scale: 0.98 }] },
  controlCallout: { color: "#7FE1CF", fontSize: 20, fontWeight: "900" },
  controlName: { color: colors.surface, fontSize: 10, fontWeight: "900", marginTop: 1 },
});
