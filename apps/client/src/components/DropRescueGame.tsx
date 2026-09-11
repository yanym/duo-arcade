import { memo, useEffect, useRef } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ScaledText";
import { useI18n } from "@/i18n";

import type { DropRescueViewState, Seat } from "@duo/game-core";
import type { RoomPhase } from "@duo/protocol";

import { useSettings } from "@/settings/SettingsContext";
import { colors, createGameStyles, radii, shadows } from "@/theme";

type Props = {
  game: DropRescueViewState;
  ownSeat: Seat;
  phase: RoomPhase;
  now: number;
  onMove: (direction: -1 | 1) => void;
  onBrake: (direction: -1 | 1) => void;
  onLock: () => void;
};

const outcomeCopy = {
  soft_landing: { title: "柔性着陆", detail: "航道与触地速度同时命中，救援队安全抵达", glyph: "◇" },
  off_pad: { title: "偏离着陆台", detail: "速度合格，但侧风把救援舱推离了目标航道", glyph: "↝" },
  hard_landing: { title: "硬着陆", detail: "航道命中，但反推不足或过强，舱体受到冲击", glyph: "⇣" },
  double_fault: { title: "双重偏差", detail: "航道与速度均未命中，救援舱严重受损", glyph: "✕" },
  descent_timeout: { title: "决策超时", detail: "控制未全部锁定，自动着陆未能稳定救援舱", glyph: "⌛" },
} as const;

export const DropRescueGame = memo(function DropRescueGame({
  game,
  ownSeat,
  phase,
  now,
  onMove,
  onBrake,
  onLock,
}: Props) {
  const { language, t } = useI18n();
  const { feedback, settings } = useSettings();
  const eventRef = useRef("");
  const ended = Boolean(game.result) || phase === "completed";
  const paused = !ended && phase !== "playing";
  const isPilot = ownSeat === game.pilotSeat;
  const partner: Seat = ownSeat === 0 ? 1 : 0;
  const canAct = phase === "playing" && game.phase === "descent" && !game.locked[ownSeat] && now < game.turnDeadline && !game.result;
  const actionExpired = !ended && !paused && game.phase === "descent" && now >= game.turnDeadline;
  const seconds = Math.max(0, (game.turnDeadline - now) / 1_000);
  const eventKey = `${game.landing}:${game.phase}:${game.lastOutcome ?? "none"}`;
  const projectedLane = game.wind === null ? null : Math.min(game.laneCount - 1, Math.max(0, game.podLane + game.wind));

  useEffect(() => {
    if (eventRef.current === eventKey) return;
    eventRef.current = eventKey;
    if (phase === "playing" && !game.result && game.phase === "landing_result") {
      const won = game.lastOutcome === "soft_landing";
      feedback(won ? "success" : "failure", won ? "medium" : "heavy");
    }
  }, [eventKey, feedback, game.lastOutcome, game.phase, game.result, phase]);

  function move(direction: -1 | 1) {
    feedback("tap", "medium");
    onMove(direction);
  }

  function brake(direction: -1 | 1) {
    feedback(direction > 0 ? "scan" : "tap", "medium");
    onBrake(direction);
  }

  function lock() {
    feedback("place", "heavy");
    onLock();
  }

  const telemetryRevealed = game.phase === "landing_result";
  const windCopy = game.wind === 0 ? "静稳" : game.wind !== null && game.wind > 0 ? `向右 ${game.wind}` : `向左 ${Math.abs(game.wind ?? 0)}`;
  const telemetryTitle = telemetryRevealed ? "着陆遥测复盘" : isPilot ? "领航私密遥测" : "制动私密遥测";
  const telemetryValue = telemetryRevealed
    ? `着陆台 ${(game.targetLane ?? 0) + 1} · 侧风 ${windCopy} · 入场 ${game.descentSpeed} / 安全 ${game.targetSpeed}`
    : isPilot
      ? game.targetLane === null ? "等待遥测" : `着陆台 ${game.targetLane + 1} · 侧风 ${windCopy}`
      : game.descentSpeed === null ? "等待遥测" : `入场速度 ${game.descentSpeed} · 安全速度 ${game.targetSpeed}`;
  const result = game.lastOutcome ? outcomeCopy[game.lastOutcome] : null;

  return (
    <View style={[styles.shell, settings.highContrast && styles.highContrast]}>
      <View style={styles.header}>
        <View style={styles.headerCopy}><Text style={styles.kicker}>STARFALL // RESCUE DESCENT</Text><Text style={styles.title}>坠星救援</Text></View>
        <View accessibilityLabel={t(`第 ${game.landing} 次着陆，共 ${game.totalLandings} 次`)} style={styles.stageBadge}>
          <Text style={styles.stageLabel}>救援点</Text><Text style={styles.stageValue}>{game.landing}/{game.totalLandings}</Text>
        </View>
      </View>

      <View style={styles.metrics}>
        <View style={styles.metric}><Text style={styles.metricLabel}>舱体</Text><Text style={styles.metricValue}>{Math.max(0, game.hull)}/{game.maxHull}</Text></View>
        <View style={styles.metric}><Text style={styles.metricLabel}>侧推燃料</Text><Text style={styles.metricValue}>{game.propellant}/{game.maxPropellant}</Text></View>
        <View style={styles.metric}><Text style={styles.metricLabel}>柔性着陆</Text><Text style={styles.metricValue}>{game.softLandings}</Text></View>
        <View style={styles.metric}><Text style={styles.metricLabel}>救援分</Text><Text style={styles.metricValue}>{game.score}</Text></View>
      </View>

      <View accessibilityLabel={`${t(telemetryTitle)}${language === "en" ? ": " : "："}${t(telemetryValue)}`} style={[styles.telemetry, isPilot ? styles.telemetryPilot : styles.telemetryBrake]}>
        <View style={styles.telemetryMark}><Text style={styles.telemetryGlyph}>{telemetryRevealed ? "◇" : isPilot ? "↯" : "≋"}</Text></View>
        <View style={styles.telemetryCopy}><Text style={styles.telemetryLabel}>{telemetryTitle} · {telemetryRevealed ? "双方可见" : "仅你可见"}</Text><Text style={styles.telemetryValue}>{telemetryValue}</Text></View>
      </View>

      <View style={styles.sky}>
        <View style={styles.skyHeader}>
          <Text style={styles.skyLabel}>着陆走廊 // 公开控制状态</Text>
          <Text style={styles.timer}>{ended ? "已结束" : paused ? "已暂停" : game.phase === "descent" ? `${seconds.toFixed(1)}s` : "遥测公开"}</Text>
        </View>
        <View style={[styles.descentLines, { pointerEvents: "none" }]}><View style={styles.descentBeam} /><View style={styles.descentBeam} /><View style={styles.descentBeam} /></View>
        <View accessibilityLabel={t(`救援舱当前位于航道 ${game.podLane + 1}`)} style={styles.podRow}>
          {Array.from({ length: game.laneCount }, (_, lane) => (
            <View key={lane} style={styles.podCell}>
              {lane === game.podLane && <View style={styles.pod}><Text style={styles.podGlyph}>◆</Text><View style={styles.podFlame} /></View>}
            </View>
          ))}
        </View>
        <View style={styles.altitude}><View style={[styles.altitudeFill, { width: game.phase === "descent" ? `${Math.min(100, Math.max(12, seconds / (game.descentDurationMs / 1_000) * 100))}%` : "0%" }]} /></View>
        <View accessibilityLabel={t(projectedLane === null ? "着陆预测仅领航员可见" : `预计落在航道 ${projectedLane + 1}`)} style={styles.laneRow}>
          {Array.from({ length: game.laneCount }, (_, lane) => {
            const target = game.targetLane === lane;
            const projected = projectedLane === lane && game.phase === "descent";
            const landed = game.finalLane === lane && game.phase === "landing_result";
            return (
              <View key={lane} style={[styles.lane, target && styles.laneTarget, landed && styles.laneLanded]}>
                <Text style={styles.laneNumber}>{String(lane + 1).padStart(2, "0")}</Text>
                <Text style={[styles.laneGlyph, target && styles.laneGlyphTarget]}>{landed ? "◆" : target ? "◎" : projected ? "⌄" : "·"}</Text>
              </View>
            );
          })}
        </View>
        <View style={styles.brakeReadout}>
          <Text style={styles.brakeLabel}>公开反推档位</Text>
          <View style={styles.brakeBars}>{[1, 2, 3].map((level) => <View key={level} style={[styles.brakeBar, level <= game.brakePower && styles.brakeBarLive]} />)}</View>
          <Text style={styles.brakeValue}>{game.brakePower}/3</Text>
        </View>
      </View>

      {game.phase === "landing_result" && result ? (
        <View accessibilityLiveRegion="assertive" style={[styles.resultCard, game.lastOutcome === "soft_landing" && styles.resultSuccess]}>
          <Text style={styles.resultGlyph}>{result.glyph}</Text>
          <View style={styles.resultCopy}><Text style={styles.resultTitle}>{result.title}</Text><Text style={styles.resultText}>{result.detail} · 实际航道 {(game.finalLane ?? 0) + 1} / 速度 {game.finalSpeed}</Text></View>
        </View>
      ) : (
        <View style={styles.controlPanel}>
          <View style={styles.controlHead}>
            <View style={styles.controlCopy}><Text style={styles.controlKicker}>{isPilot ? "你的控制：横向侧推" : "你的控制：反推制动"}</Text><Text accessibilityLiveRegion="polite" style={styles.controlTitle}>{ended ? "本局救援已结束" : paused ? "救援已暂停，等待连接恢复" : actionExpired ? "决策时间已到，正在同步着陆结果" : game.locked[ownSeat] ? "控制已锁定，等待搭档" : isPilot ? "抵消侧风，对准私密着陆台" : "把入场速度降到私密安全值"}</Text></View>
            <View style={[styles.partnerBadge, game.locked[partner] && styles.partnerReady]}><Text style={styles.partnerText}>{ended ? "本局结束" : paused ? "状态已保留" : actionExpired ? "等待结算" : game.locked[partner] ? "搭档已锁" : "搭档调整中"}</Text></View>
          </View>
          <View style={styles.controlRow}>
            {isPilot ? (
              <>
                <Pressable accessibilityLabel={t("救援舱向左侧推一条航道")} accessibilityRole="button" accessibilityState={{ disabled: !canAct || game.podLane <= 0 || game.propellant <= 0 }} disabled={!canAct || game.podLane <= 0 || game.propellant <= 0} onPress={() => move(-1)} style={({ pressed }) => [styles.adjustButton, (!canAct || game.podLane <= 0 || game.propellant <= 0) && styles.disabled, pressed && !settings.reducedMotion && styles.pressed]}><Text style={styles.adjustGlyph}>←</Text><Text style={styles.adjustLabel}>左侧推</Text></Pressable>
                <View style={styles.currentBox}><Text style={styles.currentLabel}>当前航道</Text><Text style={styles.currentValue}>{game.podLane + 1}</Text></View>
                <Pressable accessibilityLabel={t("救援舱向右侧推一条航道")} accessibilityRole="button" accessibilityState={{ disabled: !canAct || game.podLane >= game.laneCount - 1 || game.propellant <= 0 }} disabled={!canAct || game.podLane >= game.laneCount - 1 || game.propellant <= 0} onPress={() => move(1)} style={({ pressed }) => [styles.adjustButton, (!canAct || game.podLane >= game.laneCount - 1 || game.propellant <= 0) && styles.disabled, pressed && !settings.reducedMotion && styles.pressed]}><Text style={styles.adjustGlyph}>→</Text><Text style={styles.adjustLabel}>右侧推</Text></Pressable>
              </>
            ) : (
              <>
                <Pressable accessibilityLabel={t("降低一级反推")} accessibilityRole="button" accessibilityState={{ disabled: !canAct || game.brakePower <= 0 }} disabled={!canAct || game.brakePower <= 0} onPress={() => brake(-1)} style={({ pressed }) => [styles.adjustButton, (!canAct || game.brakePower <= 0) && styles.disabled, pressed && !settings.reducedMotion && styles.pressed]}><Text style={styles.adjustGlyph}>−</Text><Text style={styles.adjustLabel}>减弱反推</Text></Pressable>
                <View style={styles.currentBox}><Text style={styles.currentLabel}>反推档位</Text><Text style={styles.currentValue}>{game.brakePower}</Text></View>
                <Pressable accessibilityLabel={t("增加一级反推")} accessibilityRole="button" accessibilityState={{ disabled: !canAct || game.brakePower >= 3 }} disabled={!canAct || game.brakePower >= 3} onPress={() => brake(1)} style={({ pressed }) => [styles.adjustButton, (!canAct || game.brakePower >= 3) && styles.disabled, pressed && !settings.reducedMotion && styles.pressed]}><Text style={styles.adjustGlyph}>＋</Text><Text style={styles.adjustLabel}>增强反推</Text></Pressable>
              </>
            )}
          </View>
          <Pressable accessibilityHint={t("锁定后本次着陆不能再修改自己的控制")} accessibilityLabel={t(`锁定${isPilot ? "航向" : "反推"}`)} accessibilityRole="button" accessibilityState={{ disabled: !canAct }} disabled={!canAct} onPress={lock} style={({ pressed }) => [styles.lockButton, !canAct && styles.disabled, pressed && !settings.reducedMotion && styles.pressed]}><Text style={styles.lockGlyph}>⌁</Text><Text style={styles.lockText}>{ended ? "本局已结束" : paused ? "等待连接恢复" : actionExpired ? "等待服务器结算" : game.locked[ownSeat] ? "你的控制已封存" : `锁定${isPilot ? "着陆航向" : "反推档位"}`}</Text></Pressable>
        </View>
      )}

      <View style={styles.roleNote}><Text style={styles.roleGlyph}>◇</Text><Text style={styles.roleText}>目标航道与侧风只发给领航员，速度数据只发给制动员；每次着陆后交换职责并公开复盘。</Text></View>
    </View>
  );
});

const styles = createGameStyles({
  shell: { width: "100%", maxWidth: 940, alignSelf: "center", backgroundColor: "#08131F", borderRadius: radii.large, padding: 18, overflow: "hidden", ...shadows.card },
  highContrast: { borderWidth: 3, borderColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  headerCopy: { flex: 1, minWidth: 0 },
  kicker: { color: "#6EDAC5", fontSize: 8, fontWeight: "900", letterSpacing: 1.15 },
  title: { color: "#FFF8E9", fontSize: 22, fontWeight: "900", marginTop: 3 },
  stageBadge: { alignItems: "center", minWidth: 84, backgroundColor: "#14283B", borderRadius: radii.small, borderWidth: 1, borderColor: "#2B4C64", paddingHorizontal: 12, paddingVertical: 8 },
  stageLabel: { color: "#7895A8", fontSize: 7, fontWeight: "900" },
  stageValue: { color: "#F0D477", fontSize: 17, fontWeight: "900", marginTop: 1 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 11 },
  metric: { flex: 1, minWidth: 56, minHeight: 48, justifyContent: "center", backgroundColor: "#102335", borderRadius: 9, paddingHorizontal: 8 },
  metricLabel: { color: "#708CA0", fontSize: 7, fontWeight: "900" },
  metricValue: { color: "#F2F5F3", fontSize: 14, fontWeight: "900", marginTop: 3 },
  telemetry: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: radii.small, borderWidth: 1, padding: 11, marginTop: 9 },
  telemetryPilot: { backgroundColor: "#17383B", borderColor: "#377B77" },
  telemetryBrake: { backgroundColor: "#2A2449", borderColor: "#5B5793" },
  telemetryMark: { width: 34, height: 34, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 10 },
  telemetryGlyph: { color: "#F6D978", fontSize: 17, fontWeight: "900" },
  telemetryCopy: { flex: 1 },
  telemetryLabel: { color: "#88B1AF", fontSize: 7, fontWeight: "900", letterSpacing: 0.35 },
  telemetryValue: { color: "#FFF8E8", fontSize: 11, fontWeight: "900", marginTop: 3 },
  sky: { minHeight: 250, backgroundColor: "#020912", borderRadius: radii.medium, borderWidth: 1, borderColor: "#18364C", padding: 11, marginTop: 9, overflow: "hidden" },
  skyHeader: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 6 },
  skyLabel: { color: "#718FA3", fontSize: 7, fontWeight: "900", letterSpacing: 0.7 },
  timer: { color: "#F2D372", fontSize: 10, fontWeight: "900", fontVariant: ["tabular-nums"] },
  descentLines: { position: "absolute", left: 28, right: 28, top: 40, height: 105, flexDirection: "row", justifyContent: "space-around", opacity: 0.45 },
  descentBeam: { width: 1, height: "100%", backgroundColor: "#26526A" },
  podRow: { height: 92, flexDirection: "row", alignItems: "center", marginTop: 5 },
  podCell: { flex: 1, alignItems: "center", justifyContent: "center" },
  pod: { width: 35, height: 48, alignItems: "center", justifyContent: "center", backgroundColor: "#5357C9", borderRadius: 14, borderWidth: 2, borderColor: "#9CA1FF", shadowColor: "#777DFF", shadowOpacity: 0.5, shadowRadius: 10 },
  podGlyph: { color: "#FFF8E9", fontSize: 14, fontWeight: "900" },
  podFlame: { position: "absolute", top: -8, width: 11, height: 12, borderRadius: 7, backgroundColor: "#E96B72" },
  altitude: { height: 3, backgroundColor: "#142B3B", borderRadius: 2, marginHorizontal: 4, overflow: "hidden" },
  altitudeFill: { height: "100%", backgroundColor: "#6ACFBD", borderRadius: 2 },
  laneRow: { flexDirection: "row", gap: 3, marginTop: 9 },
  lane: { flex: 1, minHeight: 51, alignItems: "center", justifyContent: "center", backgroundColor: "#0B1B29", borderRadius: 7, borderWidth: 1, borderColor: "#1C3446" },
  laneTarget: { backgroundColor: "#163B37", borderColor: "#5BBBAA" },
  laneLanded: { backgroundColor: "#59313C", borderColor: "#D76B7C" },
  laneNumber: { color: "#A9BED0", fontSize: 6, fontWeight: "900" },
  laneGlyph: { color: "#A9BED0", fontSize: 15, fontWeight: "900", marginTop: 2 },
  laneGlyphTarget: { color: "#A5F1E3" },
  brakeReadout: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 10 },
  brakeLabel: { color: "#668396", fontSize: 7, fontWeight: "900" },
  brakeBars: { flexDirection: "row", gap: 3 },
  brakeBar: { width: 25, height: 6, borderRadius: 3, backgroundColor: "#263C4C" },
  brakeBarLive: { backgroundColor: "#EA7180" },
  brakeValue: { color: "#F8D77A", fontSize: 9, fontWeight: "900" },
  controlPanel: { backgroundColor: "#102437", borderRadius: radii.medium, borderWidth: 1, borderColor: "#29465A", padding: 11, marginTop: 9 },
  controlHead: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 9 },
  controlCopy: { flex: 1, minWidth: 150 },
  controlKicker: { color: "#6FCDBC", fontSize: 7, fontWeight: "900" },
  controlTitle: { color: "#F2F5F3", fontSize: 10, fontWeight: "900", marginTop: 2 },
  partnerBadge: { backgroundColor: "#273B49", borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 5 },
  partnerReady: { backgroundColor: "#185448" },
  partnerText: { color: "#B6CAD1", fontSize: 6, fontWeight: "900" },
  controlRow: { flexDirection: "row", alignItems: "stretch", gap: 7, marginTop: 10 },
  adjustButton: { flex: 1, minHeight: 62, alignItems: "center", justifyContent: "center", backgroundColor: "#173A48", borderRadius: radii.small, borderWidth: 1, borderColor: "#397080" },
  adjustGlyph: { color: "#F4D578", fontSize: 19, fontWeight: "900" },
  adjustLabel: { color: "#DCE9E8", fontSize: 8, fontWeight: "900", marginTop: 2 },
  currentBox: { minWidth: 84, alignItems: "center", justifyContent: "center", backgroundColor: "#081823", borderRadius: radii.small },
  currentLabel: { color: "#7894A5", fontSize: 6, fontWeight: "900" },
  currentValue: { color: "#FFF9E9", fontSize: 22, fontWeight: "900", marginTop: 1 },
  lockButton: { minHeight: 47, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#6A4CC6", borderRadius: radii.small, marginTop: 8 },
  lockGlyph: { color: "#FFF0A9", fontSize: 15, fontWeight: "900" },
  lockText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" },
  resultCard: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#4B2732", borderRadius: radii.small, borderWidth: 1, borderColor: "#B95D70", padding: 12, marginTop: 9 },
  resultSuccess: { backgroundColor: "#173C36", borderColor: "#53B8A7" },
  resultGlyph: { width: 40, color: "#F4D575", fontSize: 24, fontWeight: "900", textAlign: "center" },
  resultCopy: { flex: 1 },
  resultTitle: { color: "#FFF8E9", fontSize: 12, fontWeight: "900" },
  resultText: { color: "#AAB7BA", fontSize: 8, lineHeight: 13, fontWeight: "800", marginTop: 3 },
  roleNote: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#0E2131", borderRadius: radii.small, padding: 9, marginTop: 8 },
  roleGlyph: { color: "#65D2BF", fontSize: 13, fontWeight: "900" },
  roleText: { flex: 1, color: "#718D9D", fontSize: 7, lineHeight: 12, fontWeight: "800" },
  disabled: { opacity: 0.32 },
  pressed: { transform: [{ scale: 0.95 }] },
});
