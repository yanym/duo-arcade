import { memo, useEffect, useRef } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ScaledText";

import { useI18n } from "@/i18n";

import type { PulseHeatBand, PulsePassViewState, PulsePower, Seat } from "@duo/game-core";
import type { RoomPhase } from "@duo/protocol";

import { useSettings } from "@/settings/SettingsContext";
import { colors, createGameStyles, radii, shadows } from "@/theme";

type Props = {
  game: PulsePassViewState;
  ownSeat: Seat;
  phase: RoomPhase;
  now: number;
  onCharge: (power: PulsePower) => void;
  onVent: () => void;
};

const heatCopy: Record<PulseHeatBand, { title: string; detail: string; glyph: string }> = {
  stable: { title: "稳定", detail: "核心仍有较大余量，但爆点始终保密", glyph: "○" },
  warm: { title: "升温", detail: "风险正在累积，下一次强传可能触发爆裂", glyph: "◉" },
  critical: { title: "临界", detail: "传还是冷却？任何档位都可能成为最后一下", glyph: "✦" },
};

const powerCopy: Record<PulsePower, { title: string; detail: string; glyph: string }> = {
  1: { title: "轻推", detail: "+1 电荷", glyph: "›" },
  2: { title: "强传", detail: "+2 电荷", glyph: "»" },
  3: { title: "过载", detail: "+3 电荷", glyph: "⚡" },
};

export const PulsePassGame = memo(function PulsePassGame({
  game,
  ownSeat,
  phase,
  now,
  onCharge,
  onVent,
}: Props) {
  const { language, t } = useI18n();
  const { feedback, playSound, settings } = useSettings();
  const eventRef = useRef("");
  const ended = Boolean(game.result) || phase === "completed";
  const paused = !ended && phase !== "playing";
  const isHolder = ownSeat === game.holderSeat;
  const canAct = phase === "playing" && game.phase === "handling" && isHolder && now < game.turnDeadline && !game.result;
  const actionExpired = !ended && !paused && game.phase === "handling" && now >= game.turnDeadline;
  const seconds = Math.max(0, (game.turnDeadline - now) / 1_000);
  const eventKey = `${game.round}:${game.phase}:${game.totalPasses}:${game.scores.join("-")}`;
  const heat = heatCopy[game.heatBand];

  useEffect(() => {
    if (eventRef.current === eventKey) return;
    eventRef.current = eventKey;
    if (phase === "playing" && !game.result && game.phase === "handling" && game.totalPasses > 0 && isHolder) playSound(game.heatBand === "critical" ? "scan" : "place");
    if (phase === "playing" && !game.result && game.phase === "round_result") playSound(game.roundWinner === ownSeat ? "success" : "failure");
  }, [eventKey, game.heatBand, game.phase, game.result, game.roundWinner, game.totalPasses, isHolder, ownSeat, phase, playSound]);

  function charge(power: PulsePower) {
    feedback(power === 3 ? "hit" : "place", power === 3 ? "heavy" : "medium");
    onCharge(power);
  }

  function vent() {
    feedback("scan", "heavy");
    onVent();
  }

  const ownRoundWin = game.roundWinner === ownSeat;
  const headline = ended
    ? "本局脉冲传递已结束"
    : paused
      ? "脉冲传递已暂停，等待连接恢复"
      : actionExpired
        ? "传递窗口已关闭，正在结算"
      : game.phase === "round_result"
    ? game.roundOutcome === "holder_timeout"
      ? ownRoundWin ? "对手持有超时，你赢下本轮" : "你未及时传出，对手赢下本轮"
      : ownRoundWin ? "核心在对手手中爆裂，你赢下本轮" : "脉冲核心在你手中爆裂，对手赢下本轮"
    : isHolder ? "核心在你手中：选择充能强度或紧急冷却" : "核心在对手手中，观察热度并准备接传";
  const statusMeta = ended
    ? "最终比分与真实爆点已向双方公开"
    : paused
      ? "恢复连接后将从当前持有状态继续"
      : actionExpired
        ? "双方操作已停止，等待服务器同步本轮结果"
      : game.phase === "handling"
    ? `${seconds.toFixed(1)} 秒内行动 · 精确爆点对双方保密`
    : game.result
      ? "本局结束 · 真实爆点与完整过程已公开"
      : `${seconds.toFixed(1)} 秒后进入下一轮并交换首位持有者`;

  return (
    <View style={[styles.shell, settings.highContrast && styles.highContrast]}>
      <View style={styles.header}>
        <View style={styles.headerCopy}><Text style={styles.kicker}>PULSE PASS // HIDDEN LIMIT</Text><Text style={styles.title}>脉冲烫手</Text></View>
        <View accessibilityLabel={t(`第 ${game.round} 轮，共 ${game.totalRounds} 轮`)} style={styles.roundBadge}>
          <Text style={styles.roundLabel}>风险轮次</Text><Text style={styles.roundValue}>{game.round}/{game.totalRounds}</Text>
        </View>
      </View>

      <View style={styles.scoreRow}>
        {[0, 1].map((seat) => (
          <View key={seat} style={[styles.scoreCard, seat === 1 && styles.scoreCoral, seat === ownSeat && styles.scoreOwn]}>
            <View style={styles.scoreTop}><Text style={styles.scoreName}>{seat === ownSeat ? "你" : "对手"} · {seat === 0 ? "靛蓝" : "珊瑚"}</Text><Text style={styles.scoreValue}>{game.scores[seat as Seat]}</Text></View>
            <Text style={styles.scoreMeta}>冷却 {game.ventCharges[seat as Seat]}/{game.initialVentCharges} · 总注入 {game.totalPower[seat as Seat]}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.status, game.heatBand === "critical" && !paused && !ended && styles.statusCritical]}>
        <Text accessibilityLiveRegion={!paused && (game.heatBand === "critical" || game.phase === "round_result") ? "assertive" : "polite"} style={styles.statusTitle}>{headline}</Text>
        <Text style={styles.statusMeta}>{statusMeta}</Text>
      </View>

      <View style={[styles.reactor, game.heatBand === "critical" && styles.reactorCritical]}>
        <View style={[styles.orbitOuter, { pointerEvents: "none" }]}><View style={styles.orbitInner} /></View>
        <View style={[styles.core, game.heatBand === "warm" && styles.coreWarm, game.heatBand === "critical" && styles.coreCritical]}>
          <Text style={styles.coreGlyph}>{heat.glyph}</Text>
          <Text style={styles.coreValue}>{game.charge}</Text>
          <Text style={styles.coreUnit}>公开电荷</Text>
        </View>
        <View style={styles.heatPanel}>
          <Text style={styles.heatLabel}>传感器状态</Text>
          <Text style={styles.heatValue}>{heat.title}</Text>
          <Text style={styles.heatDetail}>{heat.detail}</Text>
        </View>
        <View style={styles.holderChip}>
          <Text style={styles.holderLabel}>当前持有</Text>
          <Text style={styles.holderValue}>{ended ? "本局结束" : paused ? "当前状态已保留" : actionExpired ? "等待服务器结算" : `${isHolder ? "你" : "对手"} · ${game.passes} 次传递`}</Text>
        </View>
      </View>

      <View accessibilityLabel={t(`公开电荷 ${game.charge}，可能在 ${game.burstMin} 到 ${game.burstMax} 之间爆裂`)} style={styles.gaugePanel}>
        <View style={styles.gaugeHeader}><Text style={styles.gaugeLabel}>公开能级</Text><Text style={styles.gaugeRange}>隐藏爆点范围 {game.burstMin}–{game.burstMax}</Text></View>
        <View style={styles.gauge}>
          {Array.from({ length: game.burstMax }, (_, index) => (
            <View key={index} style={[styles.gaugeCell, index < game.charge && styles.gaugeFilled, index >= game.burstMin - 1 && styles.gaugeDangerZone]} />
          ))}
        </View>
        <Text style={styles.gaugeHint}>斜纹边界表示“可能爆裂区”，不是准确答案</Text>
      </View>

      {game.phase === "handling" ? (
        <>
          <View style={styles.actions}>
            {game.availablePowers.map((power) => (
              <Pressable accessibilityHint={t("充能后立刻把核心传给对手；达到隐藏爆点会在你手中爆裂")} accessibilityLabel={`${t(powerCopy[power].title)}${language === "en" ? ". " : "，"}${t(powerCopy[power].detail)}`} accessibilityRole="button" accessibilityState={{ disabled: !canAct }} disabled={!canAct} key={power} onPress={() => charge(power)} style={({ pressed }) => [styles.powerButton, power === 3 && styles.overloadButton, !canAct && styles.disabled, pressed && !settings.reducedMotion && styles.pressed]}>
                <Text style={styles.powerGlyph}>{powerCopy[power].glyph}</Text><Text style={styles.powerTitle}>{powerCopy[power].title}</Text><Text style={styles.powerDetail}>{powerCopy[power].detail}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable accessibilityHint={t("消耗整局一次冷却，将公开电荷降低 2 并把核心传给对手")} accessibilityLabel={t(`紧急冷却，剩余 ${game.ventCharges[ownSeat]} 次`)} accessibilityRole="button" accessibilityState={{ disabled: !canAct || game.ventCharges[ownSeat] <= 0 }} disabled={!canAct || game.ventCharges[ownSeat] <= 0} onPress={vent} style={({ pressed }) => [styles.ventButton, (!canAct || game.ventCharges[ownSeat] <= 0) && styles.disabled, pressed && !settings.reducedMotion && styles.pressed]}>
            <Text style={styles.ventGlyph}>❄</Text><View style={styles.ventCopy}><Text style={styles.ventTitle}>紧急冷却 · 电荷 −2</Text><Text style={styles.ventDetail}>整局剩余 {game.ventCharges[ownSeat]} 次 · 冷却后也会把核心传给对手</Text></View>
          </Pressable>
        </>
      ) : (
        <View style={[styles.resultCard, game.roundWinner === ownSeat && styles.resultWon]}>
          <Text style={styles.resultGlyph}>{game.roundOutcome === "holder_timeout" ? "⌛" : "✹"}</Text>
          <View style={styles.resultCopy}>
            <Text style={styles.resultTitle}>{game.roundOutcome === "holder_timeout" ? "持有超时" : `爆点揭晓：${game.burstAt}`}</Text>
            <Text style={styles.resultText}>{game.roundOutcome === "holder_timeout" ? "持有者未在倒计时内传出，另一方得分" : `第 ${game.passes} 次传递令公开电荷达到 ${game.charge}，核心在持有者手中爆裂`}</Text>
          </View>
        </View>
      )}

      <View style={styles.privacyBar}><Text style={styles.privacyGlyph}>◇</Text><Text style={styles.privacyText}>精确爆点由服务器按房间种子生成，处理阶段不会发送给任何客户端；本轮结束后才公开复盘。</Text></View>
    </View>
  );
});

const styles = createGameStyles({
  shell: { width: "100%", maxWidth: 940, alignSelf: "center", backgroundColor: "#081B1D", borderRadius: radii.large, padding: 18, overflow: "hidden", ...shadows.card },
  highContrast: { borderWidth: 3, borderColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  headerCopy: { flex: 1, minWidth: 0 },
  kicker: { color: "#66D6C3", fontSize: 8, fontWeight: "900", letterSpacing: 1.05 },
  title: { color: "#FFF9EA", fontSize: 22, fontWeight: "900", marginTop: 3 },
  roundBadge: { alignItems: "center", minWidth: 84, backgroundColor: "#123238", borderRadius: radii.small, borderWidth: 1, borderColor: "#2B6268", paddingHorizontal: 12, paddingVertical: 8 },
  roundLabel: { color: "#7DA4A8", fontSize: 7, fontWeight: "900" },
  roundValue: { color: "#F3D473", fontSize: 17, fontWeight: "900", marginTop: 1 },
  scoreRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  scoreCard: { flex: 1, minWidth: 0, backgroundColor: "#172449", borderRadius: radii.small, borderLeftWidth: 4, borderLeftColor: "#7182F2", padding: 10 },
  scoreCoral: { backgroundColor: "#3A1C2D", borderLeftColor: "#EB6A81" },
  scoreOwn: { borderWidth: 1, borderColor: "#EBD175" },
  scoreTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 7 },
  scoreName: { flex: 1, minWidth: 0, color: "#E9EDF8", fontSize: 9, fontWeight: "900" },
  scoreValue: { color: "#FFF0B4", fontSize: 21, fontWeight: "900" },
  scoreMeta: { color: "#8A94A7", fontSize: 7, fontWeight: "800", marginTop: 3 },
  status: { alignItems: "center", paddingVertical: 6, marginTop: 9 },
  statusCritical: { backgroundColor: "rgba(231, 77, 102, 0.13)", borderRadius: radii.small },
  statusTitle: { color: "#FFF9EC", fontSize: 15, fontWeight: "900", textAlign: "center" },
  statusMeta: { color: "#829DA1", fontSize: 8, fontWeight: "800", marginTop: 3 },
  reactor: { minHeight: 234, alignItems: "center", justifyContent: "center", backgroundColor: "#030E10", borderRadius: radii.medium, borderWidth: 1, borderColor: "#235057", marginTop: 6, padding: 12, overflow: "hidden" },
  reactorCritical: { borderColor: "#C84962", backgroundColor: "#160B10" },
  orbitOuter: { position: "absolute", width: 205, height: 205, borderRadius: 103, borderWidth: 1, borderColor: "#1F4A50", alignItems: "center", justifyContent: "center" },
  orbitInner: { width: 154, height: 154, borderRadius: 77, borderWidth: 1, borderColor: "#24565B" },
  core: { width: 104, height: 104, borderRadius: 52, alignItems: "center", justifyContent: "center", backgroundColor: "#174D49", borderWidth: 3, borderColor: "#6AD8C4", shadowColor: "#5DE0C8", shadowOpacity: 0.46, shadowRadius: 16, elevation: 6 },
  coreWarm: { backgroundColor: "#604822", borderColor: "#F1CF71", shadowColor: "#F2C34E" },
  coreCritical: { backgroundColor: "#722B3D", borderColor: "#FF879C", shadowColor: "#FF5879" },
  coreGlyph: { color: "#FFF0B7", fontSize: 15, fontWeight: "900" },
  coreValue: { color: "#FFFFFF", fontSize: 31, lineHeight: 34, fontWeight: "900", fontVariant: ["tabular-nums"] },
  coreUnit: { color: "#BCD5D1", fontSize: 6, fontWeight: "900" },
  heatPanel: { position: "absolute", left: 12, bottom: 12, maxWidth: 155 },
  heatLabel: { color: "#63868A", fontSize: 6, fontWeight: "900" },
  heatValue: { color: "#FFF0B8", fontSize: 13, fontWeight: "900", marginTop: 2 },
  heatDetail: { color: "#759195", fontSize: 7, lineHeight: 11, fontWeight: "800", marginTop: 2 },
  holderChip: { position: "absolute", right: 12, bottom: 12, alignItems: "flex-end", backgroundColor: "#112D31", borderRadius: 9, paddingHorizontal: 9, paddingVertical: 6 },
  holderLabel: { color: "#78A2A5", fontSize: 6, fontWeight: "900" },
  holderValue: { color: "#E3F6F2", fontSize: 8, fontWeight: "900", marginTop: 2 },
  gaugePanel: { backgroundColor: "#10272C", borderRadius: radii.small, padding: 10, marginTop: 9 },
  gaugeHeader: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8 },
  gaugeLabel: { color: "#D9E7E4", fontSize: 8, fontWeight: "900" },
  gaugeRange: { color: "#8EA5A7", fontSize: 7, fontWeight: "800" },
  gauge: { flexDirection: "row", gap: 3, marginTop: 7 },
  gaugeCell: { flex: 1, height: 10, borderRadius: 3, backgroundColor: "#263D41", borderWidth: 1, borderColor: "#3A5559" },
  gaugeFilled: { backgroundColor: "#66CDB9", borderColor: "#A3EDDE" },
  gaugeDangerZone: { borderBottomWidth: 3, borderBottomColor: "#D86679" },
  gaugeHint: { color: "#78979A", fontSize: 6, fontWeight: "800", marginTop: 5 },
  actions: { flexDirection: "row", justifyContent: "center", gap: 7, marginTop: 9 },
  powerButton: { flex: 1, maxWidth: 180, minHeight: 71, alignItems: "center", justifyContent: "center", backgroundColor: "#183B43", borderRadius: radii.small, borderWidth: 1, borderColor: "#408087" },
  overloadButton: { backgroundColor: "#532336", borderColor: "#CE5D78" },
  powerGlyph: { color: "#F6D673", fontSize: 18, fontWeight: "900" },
  powerTitle: { color: "#FFF9E8", fontSize: 10, fontWeight: "900", marginTop: 1 },
  powerDetail: { color: "#8EB0B1", fontSize: 7, fontWeight: "800", marginTop: 2 },
  ventButton: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#172E52", borderRadius: radii.small, borderWidth: 1, borderColor: "#4A6597", paddingHorizontal: 14, marginTop: 7 },
  ventGlyph: { color: "#9EC8FF", fontSize: 18 },
  ventCopy: { alignItems: "flex-start" },
  ventTitle: { color: "#E8F0FF", fontSize: 9, fontWeight: "900" },
  ventDetail: { color: "#8596B5", fontSize: 7, fontWeight: "800", marginTop: 2 },
  resultCard: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: "#45202D", borderRadius: radii.small, borderWidth: 1, borderColor: "#B34C66", padding: 11, marginTop: 9 },
  resultWon: { backgroundColor: "#143A35", borderColor: "#47B7A4" },
  resultGlyph: { width: 40, color: "#F5D273", fontSize: 23, fontWeight: "900", textAlign: "center" },
  resultCopy: { flex: 1 },
  resultTitle: { color: "#FFF8EA", fontSize: 12, fontWeight: "900" },
  resultText: { color: "#A5A9B2", fontSize: 8, lineHeight: 13, fontWeight: "800", marginTop: 3 },
  privacyBar: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#10272B", borderRadius: radii.small, padding: 10, marginTop: 8 },
  privacyGlyph: { color: "#65D5C1", fontSize: 14, fontWeight: "900" },
  privacyText: { flex: 1, color: "#7F9A9C", fontSize: 8, lineHeight: 13, fontWeight: "800" },
  disabled: { opacity: 0.31 },
  pressed: { transform: [{ scale: 0.93 }] },
});
