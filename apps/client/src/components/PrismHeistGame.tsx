import { memo, useEffect, useRef } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ScaledText";

import { useI18n } from "@/i18n";

import type { PrismHeistOutcome, PrismHeistViewState, Seat } from "@duo/game-core";
import type { RoomPhase } from "@duo/protocol";

import { useSettings } from "@/settings/SettingsContext";
import { createGameStyles, radii, shadows } from "@/theme";

type Props = {
  game: PrismHeistViewState;
  ownSeat: Seat;
  phase: RoomPhase;
  now: number;
  onMove: (direction: -1 | 1) => void;
  onBypass: () => void;
  onDash: () => void;
};

const outcomeCopy: Record<PrismHeistOutcome, { title: string; detail: string }> = {
  clean_breach: { title: "无痕穿越", detail: "旁路与冲刺同步，潜入舱沿安全航道通过" },
  laser_hit: { title: "航道错误", detail: "双人同步成功，但潜入舱撞上了活动光栅" },
  sync_missed: { title: "同步失配", detail: "至少一名队员错过了服务器突破窗口" },
};

export const PrismHeistGame = memo(function PrismHeistGame({
  game,
  ownSeat,
  phase,
  now,
  onMove,
  onBypass,
  onDash,
}: Props) {
  const { t } = useI18n();
  const { feedback, playSound, settings } = useSettings();
  const phaseRef = useRef("");
  const ended = Boolean(game.result) || phase === "completed";
  const paused = !ended && phase !== "playing";
  const isScout = ownSeat === game.scoutSeat;
  const canMove = phase === "playing" && game.phase === "approach" && !isScout && now < game.turnDeadline && !game.result;
  const canBypass = phase === "playing" && game.phase === "breach" && isScout && !game.bypassLocked && now < game.turnDeadline && !game.result;
  const canDash = phase === "playing" && game.phase === "breach" && !isScout && !game.dashLocked && now < game.turnDeadline && !game.result;
  const actionExpired = !ended && !paused && (game.phase === "approach" || game.phase === "breach") && now >= game.turnDeadline;
  const seconds = Math.max(0, (game.turnDeadline - now) / 1_000);
  const eventKey = `${game.corridor}:${game.phase}:${game.lastOutcome ?? ""}`;

  useEffect(() => {
    if (phaseRef.current === eventKey) return;
    phaseRef.current = eventKey;
    if (phase === "playing" && !game.result && game.phase === "breach") playSound("scan");
    if (phase === "playing" && !game.result && game.phase === "corridor_result") playSound(game.lastOutcome === "clean_breach" ? "success" : "failure");
  }, [eventKey, game.lastOutcome, game.phase, game.result, phase, playSound]);

  function move(direction: -1 | 1) {
    feedback("tap", "light");
    onMove(direction);
  }

  function lockBypass() {
    feedback("scan", "heavy");
    onBypass();
  }

  function lockDash() {
    feedback("hit", "heavy");
    onDash();
  }

  const headline = ended
    ? "本局潜入行动已结束"
    : paused
      ? "潜入行动已暂停，等待连接恢复"
      : actionExpired
        ? "行动窗口已关闭，正在同步走廊结果"
      : game.phase === "approach"
    ? isScout ? "读取私密安全航道，口述给驾驶员" : "按侦察员口述，移动潜入舱"
    : game.phase === "breach"
      ? isScout ? game.bypassLocked ? "旁路已锁定，等待冲刺" : "光栅窗口开启：执行系统旁路" : game.dashLocked ? "冲刺已锁定，等待旁路" : "光栅窗口开启：执行冲刺"
      : game.lastOutcome ? outcomeCopy[game.lastOutcome].title : "走廊结算";

  return (
    <View style={[styles.shell, settings.highContrast && styles.highContrast]}>
      <View style={styles.header}>
        <View style={styles.headerCopy}><Text style={styles.kicker}>PRISM HEIST // LASER CORRIDOR</Text><Text style={styles.title}>光栅潜入</Text></View>
        <View accessibilityLabel={t(`第 ${game.corridor} 段走廊，共 ${game.totalCorridors} 段`)} style={styles.corridorBadge}>
          <Text style={styles.badgeLabel}>潜入进度</Text><Text style={styles.badgeValue}>{game.corridor}/{game.totalCorridors}</Text>
        </View>
      </View>

      <View style={styles.metrics}>
        <View style={styles.metric}><Text style={styles.metricLabel}>舱体完整度</Text><Text accessibilityLabel={t(`完整度 ${game.integrity}，最多 ${game.maxIntegrity}`)} style={styles.integrity}>{Array.from({ length: game.maxIntegrity }, (_, index) => index < game.integrity ? "◆" : "◇").join(" ")}</Text></View>
        <View style={styles.metric}><Text style={styles.metricLabel}>无痕穿越</Text><Text style={styles.metricValue}>{game.cleanBreaches}</Text></View>
        <View style={styles.metric}><Text style={styles.metricLabel}>行动分</Text><Text style={styles.metricValue}>{game.score}</Text></View>
      </View>

      <View style={[styles.status, game.phase === "breach" && !paused && !ended && styles.statusLive]}>
        <Text accessibilityLiveRegion={game.phase === "breach" && !paused && !ended ? "assertive" : "polite"} style={styles.statusTitle}>{headline}</Text>
        <Text style={styles.statusMeta}>{ended ? "最终行动结果已向双方同步" : paused ? "恢复连接后将从当前走廊状态继续" : actionExpired ? "双方操作已停止，等待服务器同步结果" : game.phase === "approach" ? `侦察阶段剩余 ${Math.ceil(seconds)} 秒 · 只有侦察员收到安全航道` : game.phase === "breach" ? `同步窗口 ${seconds.toFixed(1)} 秒 · 两个岗位必须各锁定一次` : game.lastOutcome ? outcomeCopy[game.lastOutcome].detail : "准备下一段"}</Text>
      </View>

      <View style={[styles.corridor, game.phase === "breach" && styles.corridorLive]}>
        <View style={[styles.vanishingPoint, { pointerEvents: "none" }]}><View style={styles.vanishingCore} /></View>
        <View style={styles.lanes}>
          {Array.from({ length: game.laneCount }, (_, lane) => {
            const safe = game.safeLane === lane;
            const occupied = game.runnerLane === lane;
            return (
              <View
                accessibilityLabel={t(`航道 ${lane + 1}${occupied ? "，潜入舱当前位置" : ""}${safe ? "，安全航道" : ""}`)}
                key={lane}
                style={[styles.lane, safe && styles.safeLane, game.phase === "breach" && !safe && styles.laserLane]}
              >
                <Text style={styles.laneNumber}>0{lane + 1}</Text>
                {safe && <View style={styles.safeMarker}><Text style={styles.safeGlyph}>⌁</Text><Text style={styles.safeText}>SAFE</Text></View>}
                {occupied && <View style={[styles.pod, game.phase === "breach" && styles.podLive]}><Text style={styles.podTop}>▲</Text><Text style={styles.podLabel}>POD</Text></View>}
                {game.phase === "breach" && !safe && <Text style={[styles.laserGlyph, { pointerEvents: "none" }]}>╳</Text>}
              </View>
            );
          })}
        </View>
        <View style={styles.roleChip}>
          <Text style={styles.roleLabel}>你的岗位</Text>
          <Text style={styles.roleValue}>{ended ? "行动结束 · 查看最终结果" : paused ? "当前岗位已保留 · 等待恢复" : isScout ? "光栅侦察员 · 读取航道 / 执行旁路" : "潜入舱驾驶员 · 移动航道 / 执行冲刺"}</Text>
        </View>
      </View>

      {game.phase === "approach" && (
        <View style={styles.approachActions}>
          <Pressable accessibilityLabel={t("潜入舱向左移动一条航道")} accessibilityRole="button" accessibilityState={{ disabled: !canMove || game.runnerLane === 0 }} disabled={!canMove || game.runnerLane === 0} onPress={() => move(-1)} style={({ pressed }) => [styles.moveButton, (!canMove || game.runnerLane === 0) && styles.disabled, pressed && !settings.reducedMotion && styles.pressed]}>
            <Text style={styles.moveGlyph}>←</Text><Text style={styles.moveLabel}>左移航道</Text>
          </Pressable>
          <View style={styles.orderCard}>
            <Text style={styles.orderLabel}>{ended ? "本局已结束" : paused ? "行动已暂停" : isScout ? "私密侦察结果" : "等待口头指令"}</Text>
            <Text style={styles.orderValue}>{isScout && game.safeLane !== null ? `安全航道 0${game.safeLane + 1}` : `当前航道 0${game.runnerLane + 1}`}</Text>
          </View>
          <Pressable accessibilityLabel={t("潜入舱向右移动一条航道")} accessibilityRole="button" accessibilityState={{ disabled: !canMove || game.runnerLane === game.laneCount - 1 }} disabled={!canMove || game.runnerLane === game.laneCount - 1} onPress={() => move(1)} style={({ pressed }) => [styles.moveButton, (!canMove || game.runnerLane === game.laneCount - 1) && styles.disabled, pressed && !settings.reducedMotion && styles.pressed]}>
            <Text style={styles.moveGlyph}>→</Text><Text style={styles.moveLabel}>右移航道</Text>
          </Pressable>
        </View>
      )}

      {game.phase === "breach" && (
        <View style={styles.breachActions}>
          <Pressable accessibilityHint={t("只有侦察员可用；另一名玩家要在同一服务器窗口冲刺")} accessibilityLabel={t("锁定光栅系统旁路")} accessibilityRole="button" accessibilityState={{ disabled: !canBypass, selected: game.bypassLocked }} disabled={!canBypass} onPress={lockBypass} style={({ pressed }) => [styles.bypassButton, game.bypassLocked && styles.lockedButton, !canBypass && !game.bypassLocked && styles.disabled, pressed && !settings.reducedMotion && styles.pressed]}>
            <Text style={styles.breachGlyph}>⌁</Text><Text style={styles.breachLabel}>{ended ? "本局已结束" : paused ? "等待恢复" : actionExpired ? "等待结算" : game.bypassLocked ? "旁路已锁定" : "执行旁路"}</Text><Text style={styles.breachRole}>侦察员</Text>
          </Pressable>
          <View style={styles.syncCore}><Text style={styles.syncValue}>{ended ? "—" : paused ? "Ⅱ" : seconds.toFixed(1)}</Text><Text style={styles.syncUnit}>{ended ? "END" : paused ? "PAUSE" : "SYNC"}</Text></View>
          <Pressable accessibilityHint={t("只有驾驶员可用；另一名玩家要在同一服务器窗口旁路")} accessibilityLabel={t("锁定潜入舱冲刺")} accessibilityRole="button" accessibilityState={{ disabled: !canDash, selected: game.dashLocked }} disabled={!canDash} onPress={lockDash} style={({ pressed }) => [styles.dashButton, game.dashLocked && styles.lockedButton, !canDash && !game.dashLocked && styles.disabled, pressed && !settings.reducedMotion && styles.pressed]}>
            <Text style={styles.breachGlyph}>»</Text><Text style={styles.breachLabel}>{ended ? "本局已结束" : paused ? "等待恢复" : actionExpired ? "等待结算" : game.dashLocked ? "冲刺已锁定" : "执行冲刺"}</Text><Text style={styles.breachRole}>驾驶员</Text>
          </Pressable>
        </View>
      )}

      {game.phase === "corridor_result" && game.lastOutcome && (
        <View style={[styles.resultCard, game.lastOutcome === "clean_breach" && styles.resultSuccess]}>
          <Text style={styles.resultGlyph}>{game.lastOutcome === "clean_breach" ? "✓" : "!"}</Text>
          <View style={styles.resultCopy}><Text style={styles.resultTitle}>{outcomeCopy[game.lastOutcome].title}</Text><Text style={styles.resultText}>安全航道 0{game.safeLane! + 1} · {outcomeCopy[game.lastOutcome].detail}</Text></View>
        </View>
      )}

      <View style={styles.privacyBar}><Text style={styles.privacyGlyph}>◈</Text><Text style={styles.privacyText}>安全航道只发送给侦察员；驾驶员的舱位公开但无法看到激光答案。突破窗口由服务器开启，旁路与冲刺均不可代按。</Text></View>
    </View>
  );
});

const styles = createGameStyles({
  shell: { width: "100%", maxWidth: 940, alignSelf: "center", backgroundColor: "#071A1E", borderRadius: radii.large, padding: 18, overflow: "hidden", ...shadows.card },
  highContrast: { borderWidth: 3, borderColor: "#FFFFFF" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  headerCopy: { flex: 1, minWidth: 0 },
  kicker: { color: "#6EE7D0", fontSize: 8, fontWeight: "900", letterSpacing: 1.05 },
  title: { color: "#F1FFF9", fontSize: 22, fontWeight: "900", marginTop: 3 },
  corridorBadge: { minWidth: 90, alignItems: "center", backgroundColor: "#102D35", borderRadius: radii.small, borderWidth: 1, borderColor: "#29606A", paddingHorizontal: 12, paddingVertical: 8 },
  badgeLabel: { color: "#B6C8CD", fontSize: 7, fontWeight: "900" },
  badgeValue: { color: "#F3D474", fontSize: 17, fontWeight: "900", marginTop: 1 },
  metrics: { flexDirection: "row", gap: 7, marginTop: 12 },
  metric: { flex: 1, minWidth: 0, minHeight: 54, justifyContent: "center", backgroundColor: "#0D2930", borderRadius: radii.small, padding: 9 },
  metricLabel: { color: "#B6C8CD", fontSize: 7, fontWeight: "900" },
  metricValue: { color: "#ECFFF9", fontSize: 16, fontWeight: "900", marginTop: 3, fontVariant: ["tabular-nums"] },
  integrity: { color: "#69E0CA", fontSize: 10, fontWeight: "900", marginTop: 5 },
  status: { alignItems: "center", paddingHorizontal: 8, marginTop: 13 },
  statusLive: { backgroundColor: "rgba(244, 101, 126, 0.12)", borderRadius: radii.small, paddingVertical: 8 },
  statusTitle: { color: "#F9FFF8", fontSize: 16, fontWeight: "900", textAlign: "center" },
  statusMeta: { color: "#B6C8CD", fontSize: 9, lineHeight: 14, textAlign: "center", marginTop: 3 },
  corridor: { minHeight: 254, justifyContent: "center", backgroundColor: "#031013", borderRadius: radii.medium, borderWidth: 1, borderColor: "#1E4D55", marginTop: 10, padding: 13, overflow: "hidden" },
  corridorLive: { borderColor: "#E36079", shadowColor: "#EF5B77", shadowOpacity: 0.42, shadowRadius: 15 },
  vanishingPoint: { position: "absolute", alignSelf: "center", top: 12, width: 70, height: 70, borderRadius: 35, backgroundColor: "#12373D", alignItems: "center", justifyContent: "center" },
  vanishingCore: { width: 18, height: 18, borderRadius: 9, backgroundColor: "#6EDBC7" },
  lanes: { flexDirection: "row", alignItems: "stretch", justifyContent: "center", gap: 6, minHeight: 177, marginTop: 20 },
  lane: { flex: 1, maxWidth: 150, alignItems: "center", justifyContent: "center", backgroundColor: "#0B2228", borderRadius: 12, borderWidth: 1, borderColor: "#214B53", overflow: "hidden" },
  safeLane: { backgroundColor: "#123C39", borderColor: "#62D9C4", borderWidth: 2 },
  laserLane: { borderColor: "#6D2D3E", backgroundColor: "#25131B" },
  laneNumber: { position: "absolute", top: 7, left: 8, color: "#C0CDD0", fontSize: 7, fontWeight: "900" },
  safeMarker: { position: "absolute", top: 7, right: 7, alignItems: "center" },
  safeGlyph: { color: "#64E1CB", fontSize: 14 },
  safeText: { color: "#73BEAF", fontSize: 5, fontWeight: "900" },
  pod: { width: 42, height: 58, alignItems: "center", justifyContent: "center", backgroundColor: "#555BDD", borderRadius: 17, borderWidth: 2, borderColor: "#A9A8FF", zIndex: 3, shadowColor: "#8789FF", shadowOpacity: 0.55, shadowRadius: 10 },
  podLive: { backgroundColor: "#B54A66", borderColor: "#FF9CAE", shadowColor: "#FF647F" },
  podTop: { color: "#FFF3C2", fontSize: 14, fontWeight: "900" },
  podLabel: { color: "#EEECFF", fontSize: 6, fontWeight: "900", marginTop: 3 },
  laserGlyph: { position: "absolute", color: "#DF4F69", fontSize: 72, fontWeight: "200", opacity: 0.55 },
  roleChip: { maxWidth: "100%", alignSelf: "center", alignItems: "center", backgroundColor: "#102B31", borderRadius: radii.pill, paddingHorizontal: 14, paddingVertical: 6, marginTop: 8 },
  roleLabel: { color: "#B4C8CA", fontSize: 6, fontWeight: "900" },
  roleValue: { color: "#D9F5EE", fontSize: 8, fontWeight: "900", marginTop: 2, textAlign: "center" },
  approachActions: { flexDirection: "row", alignItems: "stretch", justifyContent: "center", gap: 7, marginTop: 10 },
  moveButton: { flex: 1, minHeight: 66, alignItems: "center", justifyContent: "center", backgroundColor: "#182A50", borderRadius: radii.small, borderWidth: 1, borderColor: "#4D639C" },
  moveGlyph: { color: "#C7CAFF", fontSize: 21, fontWeight: "900" },
  moveLabel: { color: "#E7E9FF", fontSize: 8, fontWeight: "900", marginTop: 3 },
  orderCard: { flex: 1.15, minHeight: 66, alignItems: "center", justifyContent: "center", backgroundColor: "#123733", borderRadius: radii.small, borderWidth: 1, borderColor: "#3E857A" },
  orderLabel: { color: "#6CA69E", fontSize: 7, fontWeight: "900" },
  orderValue: { color: "#F1D57D", fontSize: 12, fontWeight: "900", marginTop: 4 },
  breachActions: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  bypassButton: { flex: 1, minHeight: 78, alignItems: "center", justifyContent: "center", backgroundColor: "#123B3C", borderRadius: radii.small, borderWidth: 2, borderColor: "#4ACAB7" },
  dashButton: { flex: 1, minHeight: 78, alignItems: "center", justifyContent: "center", backgroundColor: "#492038", borderRadius: radii.small, borderWidth: 2, borderColor: "#DD6881" },
  lockedButton: { backgroundColor: "#403A24", borderColor: "#EACD70" },
  breachGlyph: { color: "#F6D77B", fontSize: 20, fontWeight: "900" },
  breachLabel: { color: "#FFF9F1", fontSize: 11, fontWeight: "900", marginTop: 2 },
  breachRole: { color: "#B4C8CA", fontSize: 6, fontWeight: "900", marginTop: 2 },
  syncCore: { width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center", backgroundColor: "#351A2A", borderWidth: 2, borderColor: "#E96780" },
  syncValue: { color: "#FFF5D7", fontSize: 14, fontWeight: "900", fontVariant: ["tabular-nums"] },
  syncUnit: { color: "#DB7F91", fontSize: 5, fontWeight: "900" },
  resultCard: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: "#3A1A27", borderRadius: radii.small, borderWidth: 1, borderColor: "#B44D65", padding: 11, marginTop: 10 },
  resultSuccess: { backgroundColor: "#123832", borderColor: "#45BFA9" },
  resultGlyph: { width: 34, height: 34, textAlign: "center", textAlignVertical: "center", color: "#F5D374", fontSize: 19, fontWeight: "900" },
  resultCopy: { flex: 1 },
  resultTitle: { color: "#FAFFF9", fontSize: 12, fontWeight: "900" },
  resultText: { color: "#8EA2A4", fontSize: 8, lineHeight: 13, fontWeight: "800", marginTop: 3 },
  privacyBar: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#0D2A30", borderRadius: radii.small, padding: 10, marginTop: 9 },
  privacyGlyph: { color: "#5CD9C4", fontSize: 14, fontWeight: "900" },
  privacyText: { flex: 1, color: "#B4C8CA", fontSize: 8, lineHeight: 13, fontWeight: "800" },
  disabled: { opacity: 0.31 },
  pressed: { transform: [{ scale: 0.94 }] },
});
