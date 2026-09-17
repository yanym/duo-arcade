import { memo, useEffect, useRef } from "react";
import { Pressable, useWindowDimensions, View } from "react-native";
import { Text } from "@/components/ScaledText";
import { useI18n } from "@/i18n";

import type {
  Seat,
  SignalBluffOutcome,
  SignalBluffViewState,
  SignalRune,
  SignalVerdict,
} from "@duo/game-core";
import type { RoomPhase } from "@duo/protocol";

import { useSettings } from "@/settings/SettingsContext";
import { createGameStyles, radii, shadows } from "@/theme";

type Props = {
  game: SignalBluffViewState;
  ownSeat: Seat;
  phase: RoomPhase;
  now: number;
  onClaim: (signal: SignalRune) => void;
  onScan: () => void;
  onJudge: (verdict: SignalVerdict) => void;
};

const runeInfo: Record<SignalRune, { glyph: string; name: string; code: string }> = {
  prism: { glyph: "◇", name: "棱镜", code: "PRISM" },
  orbit: { glyph: "◎", name: "星环", code: "ORBIT" },
  wave: { glyph: "≋", name: "潮纹", code: "WAVE" },
  crown: { glyph: "✦", name: "冠星", code: "CROWN" },
  spiral: { glyph: "↻", name: "螺旋", code: "SPIRAL" },
};

const outcomeInfo: Record<SignalBluffOutcome, string> = {
  truth_trusted: "情报属实，审查员判断正确，获得一分",
  truth_challenged: "真实讯号被质疑，发报员反将一军",
  bluff_believed: "伪造讯号成功骗过审查员",
  bluff_exposed: "谎报被当场识破，审查员截获一分",
  claim_timeout: "发报员未按时发送，审查员获得一分",
  judge_timeout: "审查员未按时决断，发报员获得一分",
};

function RuneBadge({ rune, number, muted = false, compact = false }: { rune: SignalRune; number?: number; muted?: boolean; compact?: boolean }) {
  const info = runeInfo[rune];
  return (
    <View style={[styles.runeBadge, compact && styles.runeBadgeCompact, muted && styles.runeBadgeMuted]}>
      <Text style={[styles.runeBadgeGlyph, compact && styles.runeBadgeGlyphCompact]}>{info.glyph}</Text>
      <View style={compact && styles.runeBadgeCopyCompact}><Text style={[styles.runeBadgeName, compact && styles.runeBadgeNameCompact]}>{info.name}</Text><Text style={[styles.runeBadgeCode, compact && styles.runeBadgeCodeCompact]}>{number !== undefined ? `0${number} · ` : ""}{info.code}</Text></View>
    </View>
  );
}

export const SignalBluffGame = memo(function SignalBluffGame({
  game,
  ownSeat,
  phase,
  now,
  onClaim,
  onScan,
  onJudge,
}: Props) {
  const { t } = useI18n();
  const { feedback, playSound, settings } = useSettings();
  const { width } = useWindowDimensions();
  const compact = width < 380;
  const eventRef = useRef("");
  const ended = Boolean(game.result) || phase === "completed";
  const paused = !ended && phase !== "playing";
  const isSender = ownSeat === game.senderSeat;
  const judgeSeat: Seat = game.senderSeat === 0 ? 1 : 0;
  const canClaim = phase === "playing" && game.phase === "claiming" && isSender && now < game.turnDeadline && !game.result;
  const canJudge = phase === "playing" && game.phase === "judging" && !isSender && now < game.turnDeadline && !game.result;
  const canScan = canJudge && !game.scanned && game.scanCharges[ownSeat] > 0;
  const actionExpired = !ended && !paused && (game.phase === "claiming" || game.phase === "judging") && now >= game.turnDeadline;
  const seconds = Math.max(0, Math.ceil((game.turnDeadline - now) / 1_000));
  const eventKey = `${game.round}:${game.phase}:${game.roundOutcome ?? ""}`;

  useEffect(() => {
    if (eventRef.current === eventKey) return;
    eventRef.current = eventKey;
    if (game.phase === "judging" && !isSender) playSound("place");
    if (phase === "playing" && !game.result && game.phase === "round_result") playSound(game.roundWinner === ownSeat ? "success" : "failure");
  }, [eventKey, game.phase, game.result, game.roundWinner, isSender, ownSeat, phase, playSound]);

  function claim(signal: SignalRune) {
    feedback("place", "medium");
    onClaim(signal);
  }

  function scan() {
    feedback("scan", "heavy");
    onScan();
  }

  function judge(verdict: SignalVerdict) {
    feedback(verdict === "challenge" ? "hit" : "place", verdict === "challenge" ? "heavy" : "medium");
    onJudge(verdict);
  }

  const phaseTitle = ended
    ? "本局密报对决已结束"
    : paused
      ? "密报对决已暂停，等待连接恢复"
      : actionExpired
        ? "决策窗口已关闭，正在同步裁决"
      : game.phase === "claiming"
    ? isSender ? "读取真相，选择你要公开宣称的讯号" : "发报员正在编写公开讯号"
    : game.phase === "judging"
      ? isSender ? "讯号已发出，观察对手如何判断" : "相信这份情报，还是当场质疑？"
      : game.roundOutcome ? outcomeInfo[game.roundOutcome] : "本轮信号已经解密";

  return (
    <View style={[styles.shell, settings.highContrast && styles.highContrast]}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          {!compact && <Text style={styles.kicker}>读懂对手，识破谎报</Text>}
          <Text style={styles.title}>星港谍报</Text>
        </View>
        <View style={styles.roundBadge} accessibilityLabel={t(`第 ${game.round} 轮，共 ${game.totalRounds} 轮`)}>
          <Text style={styles.roundLabel}>密报轮次</Text>
          <Text style={styles.roundValue}>{game.round}/{game.totalRounds}</Text>
        </View>
      </View>

      <View style={styles.scoreRow}>
        {([0, 1] as const).map((seat) => (
          <View key={seat} style={[styles.agentCard, seat === 1 && styles.agentCardCoral, seat === ownSeat && styles.agentOwn]}>
            <View style={styles.agentLine}>
              <Text style={styles.agentName}>{seat === ownSeat ? "你" : "对手"} · {seat === game.senderSeat ? "发报员" : "审查员"}</Text>
              <Text style={styles.agentScore}>{game.scores[seat]}</Text>
            </View>
            <Text style={styles.agentMeta}>{seat === judgeSeat ? `剩余扫描 ${game.scanCharges[seat]}` : "持有私密真相"}</Text>
          </View>
        ))}
      </View>

      <View style={styles.status}>
        <Text accessibilityLiveRegion="polite" style={styles.statusTitle}>{phaseTitle}</Text>
        <Text style={styles.statusMeta}>{ended ? "最终比分与最后一轮真相已向双方同步" : paused ? "恢复连接后将从当前密报阶段继续" : actionExpired ? "双方操作已停止，等待服务器公开本轮结果" : game.phase === "round_result" ? "真相、宣称与裁决已向双方公开" : `服务器窗口剩余 ${seconds} 秒 · 本轮结束后交换岗位`}</Text>
      </View>

      <View style={[styles.console, compact && styles.consoleCompact]}>
        <View style={[styles.consoleGrid, { pointerEvents: "none" }]} />
        {game.phase === "claiming" ? (
          isSender && game.truthSignal ? (
            <View accessibilityLabel={t(`仅你可见的真实讯号是${runeInfo[game.truthSignal].name}`)} style={[styles.secretCard, compact && styles.secretCardCompact]}>
              <Text style={styles.secretEyebrow}>{compact ? "仅你可见" : "PRIVATE DOSSIER // 仅你可见"}</Text>
              <Text style={styles.secretGlyph}>{runeInfo[game.truthSignal].glyph}</Text>
              <Text style={styles.secretName}>真实讯号 · {runeInfo[game.truthSignal].name}</Text>
              <Text style={styles.secretHint}>你可以如实发送，也可以宣称任何其他符文</Text>
            </View>
          ) : (
            <View style={styles.lockedCard}>
              <Text style={styles.lockedGlyph}>⌁</Text>
              <Text style={styles.lockedTitle}>等待对手公开宣称</Text>
              <Text style={styles.lockedText}>真实讯号不会发送到你的设备</Text>
            </View>
          )
        ) : game.phase === "judging" ? (
          <View style={styles.claimBoard}>
            <Text style={styles.publicLabel}>PUBLIC CLAIM // 公开宣称</Text>
            {game.claimSignal && <RuneBadge rune={game.claimSignal} number={game.availableSignals.indexOf(game.claimSignal) + 1} />}
            {isSender && game.truthSignal ? (
              <Text style={styles.privateReminder}>你的私密真相：{runeInfo[game.truthSignal].glyph} {runeInfo[game.truthSignal].name}</Text>
            ) : game.scanHint ? (
              <View accessibilityLiveRegion="assertive" style={styles.scanResult}>
                <Text style={styles.scanResultLabel}>你的私密频谱结果</Text>
                <Text style={styles.scanResultValue}>{game.scanHint === "group_a" ? "奇数档" : "偶数档"} · {game.availableSignals.map((_, index) => index + 1).filter((position) => position % 2 === (game.scanHint === "group_a" ? 1 : 0)).join(" / ")}</Text>
                <Text style={styles.scanCandidates}>{game.availableSignals
                  .filter((_, index) => index % 2 === (game.scanHint === "group_a" ? 0 : 1))
                  .map((signal) => `${runeInfo[signal].glyph} ${t(runeInfo[signal].name)}`).join(" / ")}</Text>
              </View>
            ) : (
              <Text style={styles.privateReminder}>{canScan ? "可消耗一次扫描，私下确认真相所在编号组" : "没有额外线索，直接作出判断"}</Text>
            )}
          </View>
        ) : (
          <View style={styles.revealBoard}>
            <View style={styles.revealComparison}>
            <View style={styles.revealItem}>
              <Text style={styles.revealLabel}>公开宣称</Text>
              {game.claimSignal ? <RuneBadge compact rune={game.claimSignal} muted /> : <Text style={styles.timeoutValue}>未发送</Text>}
            </View>
            <Text
              accessibilityLabel={!game.claimSignal ? "未发送宣称" : game.claimSignal === game.truthSignal ? "宣称属实" : "宣称与真相不符"}
              style={styles.revealVs}
            >{!game.claimSignal ? "—" : game.claimSignal === game.truthSignal ? "=" : "≠"}</Text>
            <View style={styles.revealItem}>
              <Text style={styles.revealLabel}>真实讯号</Text>
              {game.truthSignal && <RuneBadge compact rune={game.truthSignal} />}
            </View>
            </View>
            <View style={[styles.verdictChip, game.roundWinner === ownSeat && styles.verdictChipWon]}>
              <Text style={styles.verdictText}>{game.verdict === "trust" ? "审查员选择：相信" : game.verdict === "challenge" ? "审查员选择：质疑" : "服务器超时裁决"}</Text>
            </View>
          </View>
        )}
      </View>

      {game.phase === "claiming" && (
        <View style={styles.runeActions}>
          {game.availableSignals.map((signal, index) => {
            const info = runeInfo[signal];
            return (
              <Pressable
                accessibilityHint={t(isSender ? "将该符文作为公开宣称发送，对手看不到你的真实讯号" : "只有本轮发报员可以发送")}
                accessibilityLabel={t(`宣称${info.name}，编号 ${index + 1}`)}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canClaim }}
                disabled={!canClaim}
                key={signal}
                onPress={() => claim(signal)}
                style={({ pressed }) => [styles.runeButton, !canClaim && styles.disabled, pressed && !settings.reducedMotion && styles.pressed]}
              >
                <Text style={styles.runeIndex}>0{index + 1}</Text>
                <Text style={styles.runeGlyph}>{info.glyph}</Text>
                <Text style={styles.runeName}>{info.name}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {game.phase === "judging" && (
        <View style={styles.judgePanel}>
          {!isSender && (game.scanCharges[ownSeat] > 0 || game.scanned) && (
            <Pressable
              accessibilityHint={t("扫描结果只有你能看到；每局次数有限")}
              accessibilityLabel={t(`频谱扫描，剩余 ${game.scanCharges[ownSeat]} 次`)}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canScan }}
              disabled={!canScan}
              onPress={scan}
              style={({ pressed }) => [styles.scanButton, !canScan && styles.disabled, pressed && !settings.reducedMotion && styles.pressed]}
            >
              <Text style={styles.scanIcon}>⌁</Text><Text style={styles.scanCopy}>{game.scanned ? "扫描已使用" : `私密扫描 · ${game.scanCharges[ownSeat]} 次`}</Text>
            </Pressable>
          )}
          <View style={styles.verdictActions}>
            <Pressable accessibilityLabel={t("相信公开宣称")} accessibilityRole="button" accessibilityState={{ disabled: !canJudge }} disabled={!canJudge} onPress={() => judge("trust")} style={({ pressed }) => [styles.trustButton, !canJudge && styles.disabled, pressed && !settings.reducedMotion && styles.pressed]}>
              <Text style={styles.verdictGlyph}>✓</Text><Text style={styles.verdictLabel}>相信</Text><Text style={styles.verdictHelp}>宣称就是真相</Text>
            </Pressable>
            <Pressable accessibilityLabel={t("质疑公开宣称")} accessibilityRole="button" accessibilityState={{ disabled: !canJudge }} disabled={!canJudge} onPress={() => judge("challenge")} style={({ pressed }) => [styles.challengeButton, !canJudge && styles.disabled, pressed && !settings.reducedMotion && styles.pressed]}>
              <Text style={styles.verdictGlyph}>!</Text><Text style={styles.verdictLabel}>质疑</Text><Text style={styles.verdictHelp}>宣称是一次谎报</Text>
            </Pressable>
          </View>
        </View>
      )}

      {(ended || !isSender) && <View style={styles.privacyBar}><Text style={styles.privacyGlyph}>◈</Text><Text style={styles.privacyText}>{ended
        ? "真相、宣称与裁决已向双方公开"
        : game.scanned && !isSender ? "扫描只缩小范围，仍需判断真假。"
          : game.scanCharges[ownSeat] > 0 ? "你的扫描次数整局有限，留给关键判断。"
          : "没有剩余扫描，请根据公开宣称作出判断。"}</Text></View>}
    </View>
  );
});

const styles = createGameStyles({
  shell: { width: "100%", maxWidth: 940, alignSelf: "center", backgroundColor: "#0D1224", borderRadius: radii.large, padding: 18, overflow: "hidden", ...shadows.card },
  highContrast: { borderWidth: 3, borderColor: "#FFFFFF" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  headerCopy: { flex: 1, minWidth: 0 },
  kicker: { color: "#45D6C1", fontSize: 8, fontWeight: "900", letterSpacing: 1.05 },
  title: { color: "#F7F4FF", fontSize: 22, fontWeight: "900", marginTop: 3 },
  roundBadge: { minWidth: 88, flexShrink: 0, alignItems: "center", backgroundColor: "#171F3C", borderRadius: radii.small, borderWidth: 1, borderColor: "#34446C", paddingHorizontal: 12, paddingVertical: 8 },
  roundLabel: { color: "#7E91B9", fontSize: 7, fontWeight: "900" },
  roundValue: { color: "#F4CF72", fontSize: 17, fontWeight: "900", marginTop: 1 },
  scoreRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  agentCard: { flex: 1, minWidth: 0, backgroundColor: "#17234B", borderRadius: radii.small, borderLeftWidth: 4, borderLeftColor: "#7278FF", padding: 10 },
  agentCardCoral: { backgroundColor: "#351C37", borderLeftColor: "#F4778E" },
  agentOwn: { borderWidth: 2, borderColor: "#EBCB69" },
  agentLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  agentName: { flex: 1, minWidth: 0, color: "#EBE9F7", fontSize: 9, fontWeight: "900" },
  agentScore: { color: "#F7D67D", fontSize: 19, fontWeight: "900" },
  agentMeta: { color: "#8390AD", fontSize: 8, fontWeight: "800", marginTop: 3 },
  status: { alignItems: "center", marginTop: 13, paddingHorizontal: 8 },
  statusTitle: { color: "#FFF9EF", fontSize: 16, fontWeight: "900", textAlign: "center" },
  statusMeta: { color: "#8794AF", fontSize: 9, lineHeight: 14, textAlign: "center", marginTop: 3 },
  console: { minHeight: 232, alignItems: "center", justifyContent: "center", backgroundColor: "#070B17", borderRadius: radii.medium, borderWidth: 1, borderColor: "#263355", marginTop: 11, padding: 17, overflow: "hidden" },
  consoleCompact: { minHeight: 180, padding: 10 },
  consoleGrid: { position: "absolute", width: "100%", height: "100%", opacity: 0.12, borderWidth: 18, borderColor: "#4DE0CD", transform: [{ rotate: "12deg" }] },
  secretCard: { width: "100%", maxWidth: 360, minWidth: 0, alignItems: "center", backgroundColor: "#21194A", borderRadius: 24, borderWidth: 2, borderColor: "#7A78F5", paddingHorizontal: 16, paddingVertical: 18, shadowColor: "#6B67FF", shadowOpacity: 0.4, shadowRadius: 16 },
  secretCardCompact: { paddingVertical: 12 },
  secretEyebrow: { color: "#6FE0CD", fontSize: 7, fontWeight: "900", letterSpacing: 1 },
  secretGlyph: { color: "#F6D06B", fontSize: 52, lineHeight: 60, fontWeight: "900" },
  secretName: { color: "#FFF8ED", fontSize: 14, fontWeight: "900" },
  secretHint: { color: "#9B95BB", fontSize: 8, lineHeight: 13, textAlign: "center", marginTop: 5 },
  lockedCard: { alignItems: "center", padding: 24 },
  lockedGlyph: { color: "#4CCFBE", fontSize: 43 },
  lockedTitle: { color: "#E8EDF9", fontSize: 14, fontWeight: "900", marginTop: 5 },
  lockedText: { color: "#72809B", fontSize: 9, fontWeight: "800", marginTop: 5 },
  claimBoard: { width: "100%", alignItems: "center", gap: 10 },
  publicLabel: { color: "#F27B91", fontSize: 8, fontWeight: "900", letterSpacing: 1.05 },
  runeBadge: { width: "100%", maxWidth: 260, minWidth: 0, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 13, backgroundColor: "#262158", borderRadius: 20, borderWidth: 2, borderColor: "#8B83F7", paddingHorizontal: 22, paddingVertical: 13 },
  runeBadgeCompact: { minWidth: 0, flexDirection: "column", gap: 2, borderRadius: 14, paddingHorizontal: 6, paddingVertical: 8 },
  runeBadgeMuted: { backgroundColor: "#25293A", borderColor: "#5E6982" },
  runeBadgeGlyph: { color: "#F4CF72", fontSize: 36, fontWeight: "900" },
  runeBadgeGlyphCompact: { fontSize: 24 },
  runeBadgeCopyCompact: { alignItems: "center" },
  runeBadgeName: { color: "#FBF8FF", fontSize: 16, fontWeight: "900" },
  runeBadgeNameCompact: { fontSize: 10 },
  runeBadgeCode: { color: "#8B97BA", fontSize: 7, fontWeight: "900", letterSpacing: 1.1, marginTop: 2 },
  runeBadgeCodeCompact: { fontSize: 5, letterSpacing: 0.7 },
  privateReminder: { color: "#8D9AB2", fontSize: 9, fontWeight: "800", textAlign: "center" },
  scanResult: { width: "100%", maxWidth: 320, minWidth: 0, alignItems: "center", backgroundColor: "#113B3A", borderRadius: radii.small, borderWidth: 1, borderColor: "#45CDB8", padding: 9 },
  scanResultLabel: { color: "#6BDFCD", fontSize: 7, fontWeight: "900" },
  scanResultValue: { color: "#E7FFF9", fontSize: 12, fontWeight: "900", marginTop: 3 },
  scanCandidates: { color: "#E7FFF9", fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 6 },
  revealBoard: { width: "100%", alignItems: "center", gap: 10 },
  revealComparison: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  revealItem: { flex: 1, minWidth: 0, maxWidth: 250, alignItems: "center", gap: 5 },
  revealLabel: { color: "#7F8BA4", fontSize: 8, fontWeight: "900" },
  revealVs: { color: "#F47F93", fontSize: 22, fontWeight: "900" },
  verdictChip: { width: "100%", alignItems: "center", backgroundColor: "#331D34", borderRadius: radii.pill, padding: 8, marginTop: 2 },
  verdictChipWon: { backgroundColor: "#123B37" },
  verdictText: { color: "#F4ECF5", fontSize: 9, fontWeight: "900" },
  timeoutValue: { color: "#F08A9D", fontSize: 12, fontWeight: "900", paddingVertical: 15 },
  runeActions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 7, marginTop: 10 },
  runeButton: { flex: 1, minWidth: 44, maxWidth: 145, minHeight: 76, alignItems: "center", justifyContent: "center", backgroundColor: "#1B2341", borderRadius: radii.small, borderWidth: 1, borderColor: "#3B496F" },
  runeIndex: { position: "absolute", top: 6, left: 7, color: "#8794B2", fontSize: 6, fontWeight: "900" },
  runeGlyph: { color: "#D9C2FF", fontSize: 25, fontWeight: "900" },
  runeName: { color: "#EAEAF5", fontSize: 8, fontWeight: "900", marginTop: 3 },
  judgePanel: { marginTop: 10, gap: 8 },
  scanButton: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#123A3A", borderRadius: radii.small, borderWidth: 1, borderColor: "#37B8A7" },
  scanIcon: { color: "#64E0CF", fontSize: 18 },
  scanCopy: { color: "#D9FFF7", fontSize: 9, fontWeight: "900" },
  verdictActions: { flexDirection: "row", gap: 8 },
  trustButton: { flex: 1, minHeight: 69, alignItems: "center", justifyContent: "center", backgroundColor: "#162E44", borderRadius: radii.small, borderWidth: 1, borderColor: "#4D94B6" },
  challengeButton: { flex: 1, minHeight: 69, alignItems: "center", justifyContent: "center", backgroundColor: "#412137", borderRadius: radii.small, borderWidth: 1, borderColor: "#D36480" },
  verdictGlyph: { color: "#F6D475", fontSize: 16, fontWeight: "900" },
  verdictLabel: { color: "#FAF7FF", fontSize: 12, fontWeight: "900", marginTop: 1 },
  verdictHelp: { color: "#8794AA", fontSize: 7, fontWeight: "800", marginTop: 2 },
  privacyBar: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#151C31", borderRadius: radii.small, padding: 10, marginTop: 9 },
  privacyGlyph: { color: "#58D4C2", fontSize: 14, fontWeight: "900" },
  privacyText: { flex: 1, color: "#8994AB", fontSize: 8, lineHeight: 13, fontWeight: "800" },
  disabled: { opacity: 0.31 },
  pressed: { transform: [{ scale: 0.94 }] },
});
