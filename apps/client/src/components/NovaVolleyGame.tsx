import { memo, useEffect, useRef } from "react";
import { Pressable, useWindowDimensions, View } from "react-native";
import { Text } from "@/components/ScaledText";

import { useI18n } from "@/i18n";

import type { NovaVolleyOutcome, NovaVolleyState, Seat } from "@duo/game-core";
import type { RoomPhase } from "@duo/protocol";

import { useSettings } from "@/settings/SettingsContext";
import { colors, createGameStyles, radii, shadows } from "@/theme";

type Props = {
  game: NovaVolleyState;
  ownSeat: Seat;
  phase: RoomPhase;
  now: number;
  onMove: (direction: -1 | 1) => void;
  onStrike: (lane: number) => void;
};

const outcomeCopy: Record<NovaVolleyOutcome, string> = {
  misaligned_return: "挡板没有对准来球，回击落空",
  return_timeout: "击球窗口关闭，来球穿过底线",
};

export const NovaVolleyGame = memo(function NovaVolleyGame({
  game,
  ownSeat,
  phase,
  now,
  onMove,
  onStrike,
}: Props) {
  const { t } = useI18n();
  const { feedback, playSound, settings } = useSettings();
  const { width } = useWindowDimensions();
  const compact = width < 380;
  const phone = width < 600;
  const eventRef = useRef("");
  const ended = Boolean(game.result) || phase === "completed";
  const paused = !ended && phase !== "playing";
  const isReceiver = ownSeat === game.receiverSeat;
  const aligned = game.paddleLanes[ownSeat] === game.incomingLane;
  const canMove = phase === "playing" && game.phase !== "point_result" && isReceiver && now < game.turnDeadline && !game.result;
  const canStrike = phase === "playing" && game.phase === "strike_window" && isReceiver && now < game.turnDeadline && !game.result;
  const actionExpired = !ended && !paused && (game.phase === "approach" || game.phase === "strike_window") && now >= game.turnDeadline;
  const seconds = Math.max(0, (game.turnDeadline - now) / 1_000);
  const eventKey = `${game.serveNumber}:${game.rallyCount}:${game.phase}:${game.scores.join("-")}`;

  useEffect(() => {
    if (eventRef.current === eventKey) return;
    eventRef.current = eventKey;
    if (phase === "playing" && !game.result && game.phase === "strike_window") playSound("scan");
    if (phase === "playing" && !game.result && game.phase === "approach" && game.rallyCount > 0 && isReceiver) playSound("hit");
    if (phase === "playing" && !game.result && game.phase === "point_result") playSound(game.pointWinner === ownSeat ? "success" : "failure");
  }, [eventKey, game.phase, game.pointWinner, game.rallyCount, game.result, isReceiver, ownSeat, phase, playSound]);

  function move(direction: -1 | 1) {
    feedback("tap", "light");
    onMove(direction);
  }

  function strike(lane: number) {
    feedback("hit", "heavy");
    onStrike(lane);
  }

  const headline = ended
    ? "本局星弧对攻已结束"
    : paused
      ? "对攻已暂停，等待连接恢复"
      : actionExpired
        ? game.phase === "approach" ? "正在同步击球窗口" : "击球窗口已关闭，正在结算"
      : game.phase === "approach"
    ? isReceiver ? "移动挡板，追上来球轨道" : "等待对手回击"
    : game.phase === "strike_window"
      ? isReceiver ? aligned ? "击球窗开启：选择回球落点" : "先把挡板对准来球" : "对手正在选择回球落点"
      : game.pointWinner === ownSeat ? "你拿下这一分" : "对手拿下这一分";

  return (
    <View style={[styles.shell, compact && styles.shellCompact, settings.highContrast && styles.highContrast]}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>{!compact && <Text style={styles.kicker}>NOVA VOLLEY // ARC COURT</Text>}<Text style={[styles.title, compact && styles.titleCompact]}>星弧对攻</Text></View>
        <View accessibilityLabel={t(`目标 ${game.targetScore} 分`)} style={styles.targetBadge}>
          <Text style={styles.targetLabel}>胜局目标</Text><Text style={styles.targetValue}>先到 {game.targetScore}</Text>
        </View>
      </View>

      <View style={styles.scoreRow}>
        {[0, 1].map((seat) => (
          <View key={seat} style={[styles.scoreCard, seat === 1 && styles.scoreCardCoral, ownSeat === seat && styles.scoreOwn]}>
            <View style={styles.scoreTop}><Text style={styles.playerName}>{seat === ownSeat ? "你" : "对手"} · {seat === 0 ? "靛蓝" : "珊瑚"}</Text><Text style={styles.scoreValue}>{game.scores[seat as Seat]}</Text></View>
            {ended && <Text style={styles.scoreMeta}>成功回击 {game.successfulReturns[seat as Seat]} · 移动 {game.totalMoves[seat as Seat]}</Text>}
          </View>
        ))}
      </View>

      <View style={[styles.status, compact && styles.statusCompact, game.phase === "strike_window" && !paused && !ended && styles.statusLive]}>
        <Text accessibilityLiveRegion={game.phase === "strike_window" && !paused && !ended ? "assertive" : "polite"} style={styles.statusTitle}>{headline}</Text>
        <Text style={styles.statusMeta}>
          {ended
            ? "最终比分与回击记录已向双方同步"
            : paused
              ? "恢复连接后将从当前回合继续"
              : actionExpired
                ? game.phase === "approach" ? "来球已到，等待击球窗口开启" : "双方操作已停止，等待服务器同步本分结果"
              : game.phase === "approach"
            ? `来球 ${game.incomingLane + 1} 号轨道 · ${seconds.toFixed(1)} 秒后进入击球窗`
            : game.phase === "strike_window"
              ? `剩余 ${seconds.toFixed(1)} 秒 · 挡板对准后，以目标轨道按钮完成回击`
              : `${outcomeCopy[game.lastOutcome!]} · ${seconds.toFixed(1)} 秒后重新发球`}
        </Text>
      </View>

      <View style={[styles.court, compact && styles.courtCompact, game.phase === "strike_window" && styles.courtLive]}>
        <View style={[styles.centerLine, { pointerEvents: "none" }]} />
        <View style={[styles.centerCore, { pointerEvents: "none" }]}><Text style={styles.centerText}>{game.rallyCount > 0 ? `×${game.rallyCount}` : "SERVE"}</Text></View>
        <View style={[styles.lanes, compact && styles.lanesCompact]}>
          {Array.from({ length: game.laneCount }, (_, lane) => {
            const hasBall = game.incomingLane === lane && game.phase !== "point_result";
            const bluePaddle = game.paddleLanes[0] === lane;
            const coralPaddle = game.paddleLanes[1] === lane;
            return (
              <View accessibilityLabel={t(`${lane + 1} 号轨道${hasBall ? "，来球轨道" : ""}${bluePaddle ? "，靛蓝挡板" : ""}${coralPaddle ? "，珊瑚挡板" : ""}`)} key={lane} style={[styles.lane, hasBall && styles.incomingLane]}>
                <Text style={styles.laneNumber}>0{lane + 1}</Text>
                {bluePaddle && <View style={[styles.paddle, styles.bluePaddle, game.receiverSeat === 0 && styles.activePaddle]}><Text style={styles.paddleText}>P1</Text></View>}
                {hasBall && <View style={[styles.ball, game.phase === "strike_window" && styles.ballLive, game.receiverSeat === 1 && styles.ballTowardBottom]}><Text style={styles.ballGlyph}>✦</Text></View>}
                {coralPaddle && <View style={[styles.paddle, styles.coralPaddle, game.receiverSeat === 1 && styles.activePaddle]}><Text style={styles.paddleText}>P2</Text></View>}
              </View>
            );
          })}
        </View>
        <View style={styles.courtFooter}>
          <Text style={styles.roleText}>{ended ? "本局已结束" : paused ? "球局已暂停" : actionExpired ? "等待同步" : game.phase === "point_result" ? "下一分即将开始" : isReceiver ? "你正在接球" : "对手正在接球"}</Text>
          <Text style={styles.speedText}>球速 {Math.round(100 * game.baseFlightMs / game.currentFlightMs)}% · 最佳连拍 ×{game.bestRally}</Text>
        </View>
      </View>

      {!ended && (
        <View style={[styles.moveRow, phone && styles.moveRowPhone]}>
          <Pressable accessibilityLabel={t("挡板向左移动一条轨道")} accessibilityRole="button" accessibilityState={{ disabled: !canMove || game.paddleLanes[ownSeat] === 0 }} disabled={!canMove || game.paddleLanes[ownSeat] === 0} onPress={() => move(-1)} style={({ pressed }) => [styles.moveButton, (!canMove || game.paddleLanes[ownSeat] === 0) && styles.disabled, pressed && !settings.reducedMotion && styles.pressed]}>
            <Text style={styles.moveGlyph}>←</Text><Text style={styles.moveLabel}>左移挡板</Text>
          </Pressable>
          <View style={[styles.alignmentCard, game.paddleLanes[ownSeat] === game.incomingLane && styles.alignedCard]}>
            <Text style={styles.alignmentLabel}>你的挡板 / 来球</Text>
            <Text style={styles.alignmentValue}>0{game.paddleLanes[ownSeat] + 1} / 0{game.incomingLane + 1}</Text>
            <Text style={styles.alignmentState}>{paused ? "已暂停" : actionExpired ? "等待结算" : game.phase === "point_result" ? "下一分即将开始" : !isReceiver ? "等待对手回击" : aligned ? "已对准" : "尚未对准"}</Text>
          </View>
          <Pressable accessibilityLabel={t("挡板向右移动一条轨道")} accessibilityRole="button" accessibilityState={{ disabled: !canMove || game.paddleLanes[ownSeat] === game.laneCount - 1 }} disabled={!canMove || game.paddleLanes[ownSeat] === game.laneCount - 1} onPress={() => move(1)} style={({ pressed }) => [styles.moveButton, (!canMove || game.paddleLanes[ownSeat] === game.laneCount - 1) && styles.disabled, pressed && !settings.reducedMotion && styles.pressed]}>
            <Text style={styles.moveGlyph}>→</Text><Text style={styles.moveLabel}>右移挡板</Text>
          </Pressable>
        </View>
      )}

      {!ended && (
        <View style={[styles.strikePanel, compact && styles.strikePanelCompact, canStrike && styles.strikePanelLive]}>
          <Text style={[styles.strikeLabel, phone && styles.strikeLabelPhone]}>{paused || actionExpired || game.phase === "point_result" ? "回击已暂停" : !isReceiver ? "等待对手回击" : game.phase === "approach" ? "对准挡板，等按钮亮起再回击" : aligned ? "选择你要打向对手的轨道" : "尚未对准：现在回击会失分"}</Text>
          <View style={[styles.strikeRow, compact && styles.strikeRowCompact]}>
            {Array.from({ length: game.laneCount }, (_, lane) => (
              <Pressable accessibilityHint={t("挡板必须先与当前来球轨道对齐")} accessibilityLabel={t(`回击到 ${lane + 1} 号轨道`)} accessibilityRole="button" accessibilityState={{ disabled: !canStrike }} disabled={!canStrike} key={lane} onPress={() => strike(lane)} style={({ pressed }) => [styles.strikeButton, !canStrike && styles.disabled, pressed && !settings.reducedMotion && styles.strikePressed]}>
                <Text style={styles.strikeNumber}>0{lane + 1}</Text><Text style={styles.strikeText}>击向</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {game.phase === "point_result" && game.lastOutcome && (
        <View style={[styles.resultCard, game.pointWinner === ownSeat && styles.resultWon]}>
          <Text style={styles.resultGlyph}>{game.pointWinner === ownSeat ? "+1" : "—"}</Text>
          <View style={styles.resultCopy}><Text style={styles.resultTitle}>{game.pointWinner === ownSeat ? "得分" : "失分"}</Text><Text style={styles.resultText}>{outcomeCopy[game.lastOutcome]} · 本分最长连续回击 ×{game.rallyCount}</Text></View>
        </View>
      )}

    </View>
  );
});

const styles = createGameStyles({
  shell: { width: "100%", maxWidth: 940, alignSelf: "center", backgroundColor: "#080E28", borderRadius: radii.large, padding: 18, overflow: "hidden", ...shadows.card },
  shellCompact: { padding: 9 },
  highContrast: { borderWidth: 3, borderColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  headerCopy: { flex: 1, minWidth: 0 },
  kicker: { color: "#70E5D2", fontSize: 8, fontWeight: "900", letterSpacing: 1.05 },
  title: { color: "#FFF8E8", fontSize: 22, fontWeight: "900", marginTop: 3 },
  titleCompact: { fontSize: 18 },
  targetBadge: { alignItems: "center", backgroundColor: "#171F4A", borderRadius: radii.small, borderWidth: 1, borderColor: "#414E93", paddingHorizontal: 12, paddingVertical: 8 },
  targetLabel: { color: "#8D97C5", fontSize: 7, fontWeight: "900" },
  targetValue: { color: "#F4D36E", fontSize: 14, fontWeight: "900", marginTop: 2 },
  scoreRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  scoreCard: { flex: 1, minWidth: 0, backgroundColor: "#171D50", borderRadius: radii.small, borderLeftWidth: 4, borderLeftColor: "#737DFF", padding: 10 },
  scoreCardCoral: { backgroundColor: "#3A1835", borderLeftColor: "#F76F93" },
  scoreOwn: { borderWidth: 1, borderColor: "#E9CE73" },
  scoreTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  playerName: { flex: 1, minWidth: 0, color: "#ECECFF", fontSize: 9, fontWeight: "900" },
  scoreValue: { color: "#FFF0B5", fontSize: 22, fontWeight: "900", fontVariant: ["tabular-nums"] },
  scoreMeta: { color: "#8A91B5", fontSize: 7, fontWeight: "800", marginTop: 3 },
  status: { alignItems: "center", justifyContent: "center", minHeight: 62, paddingVertical: 5, marginTop: 10 },
  statusCompact: { minHeight: 100 },
  statusLive: { backgroundColor: "rgba(240, 92, 133, 0.12)", borderRadius: radii.small },
  statusTitle: { color: "#FFF9EC", fontSize: 16, fontWeight: "900", textAlign: "center" },
  statusMeta: { color: "#9299BC", fontSize: 8, lineHeight: 13, textAlign: "center", marginTop: 3 },
  court: { minHeight: 196, backgroundColor: "#030717", borderRadius: radii.medium, borderWidth: 1, borderColor: "#2A3364", marginTop: 7, padding: 12, overflow: "hidden" },
  courtCompact: { minHeight: 156, padding: 8 },
  courtLive: { borderColor: "#E95E87", shadowColor: "#F85C88", shadowOpacity: 0.5, shadowRadius: 17 },
  centerLine: { position: "absolute", left: 12, right: 12, top: "50%", height: 1, backgroundColor: "#263268" },
  centerCore: { position: "absolute", zIndex: 4, top: "45%", alignSelf: "center", minWidth: 48, height: 26, alignItems: "center", justifyContent: "center", backgroundColor: "#101B48", borderRadius: 13, borderWidth: 1, borderColor: "#40559A" },
  centerText: { color: "#79DACA", fontSize: 6, fontWeight: "900", letterSpacing: 0.7 },
  lanes: { flexDirection: "row", justifyContent: "center", gap: 6, minHeight: 150 },
  lanesCompact: { minHeight: 110, gap: 4 },
  lane: { flex: 1, maxWidth: 150, alignItems: "center", justifyContent: "space-between", backgroundColor: "#0B1234", borderRadius: 11, borderWidth: 1, borderColor: "#202B5A", paddingVertical: 20 },
  incomingLane: { backgroundColor: "#111A42", borderColor: "#5B6BC1" },
  laneNumber: { position: "absolute", top: 5, color: "#7D88B0", fontSize: 7, fontWeight: "900" },
  paddle: { width: "74%", maxWidth: 66, height: 15, alignItems: "center", justifyContent: "center", borderRadius: 8, borderWidth: 2 },
  bluePaddle: { position: "absolute", top: 20, backgroundColor: "#4957D5", borderColor: "#939BFF" },
  coralPaddle: { position: "absolute", bottom: 20, backgroundColor: "#B24367", borderColor: "#FF91AF" },
  activePaddle: { shadowColor: "#FFF1A8", shadowOpacity: 0.8, shadowRadius: 9, elevation: 5 },
  paddleText: { color: "#FFFFFF", fontSize: 5, fontWeight: "900" },
  ball: { position: "absolute", zIndex: 3, top: "38%", width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "#39B7AA", borderWidth: 3, borderColor: "#96F3DF", shadowColor: "#60EBD5", shadowOpacity: 0.65, shadowRadius: 13, elevation: 6 },
  ballTowardBottom: { top: "57%" },
  ballLive: { backgroundColor: "#E85880", borderColor: "#FFD0DA", shadowColor: "#FF6E98" },
  ballGlyph: { color: "#041519", fontSize: 15, fontWeight: "900" },
  courtFooter: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 6, marginTop: 7 },
  roleText: { color: "#DDE2FF", fontSize: 8, fontWeight: "900" },
  speedText: { color: "#6F7BA8", fontSize: 7, fontWeight: "800" },
  moveRow: { flexDirection: "row", alignItems: "stretch", gap: 7, marginTop: 9 },
  moveRowPhone: { minHeight: 100 },
  moveButton: { flex: 1, minWidth: 44, minHeight: 64, alignItems: "center", justifyContent: "center", backgroundColor: "#1B2857", borderRadius: radii.small, borderWidth: 1, borderColor: "#435791" },
  moveGlyph: { color: "#C5CDFF", fontSize: 20, fontWeight: "900" },
  moveLabel: { color: "#E9ECFF", fontSize: 8, fontWeight: "900", marginTop: 2, textAlign: "center" },
  alignmentCard: { flex: 1.2, minHeight: 64, alignItems: "center", justifyContent: "center", backgroundColor: "#241C3F", borderRadius: radii.small, borderWidth: 1, borderColor: "#50406C" },
  alignedCard: { backgroundColor: "#123A38", borderColor: "#4DCEB8" },
  alignmentLabel: { color: "#8A87A4", fontSize: 6, fontWeight: "900", textAlign: "center" },
  alignmentValue: { color: "#F7D678", fontSize: 13, fontWeight: "900", marginTop: 2 },
  alignmentState: { color: "#B7BCD4", fontSize: 7, fontWeight: "900", marginTop: 2, textAlign: "center" },
  strikePanel: { backgroundColor: "#1A1B36", borderRadius: radii.small, borderWidth: 1, borderColor: "#454465", padding: 9, marginTop: 9 },
  strikePanelCompact: { paddingHorizontal: 3 },
  strikePanelLive: { backgroundColor: "#31172B", borderColor: "#D66A91" },
  strikeLabel: { color: "#FFC5D5", fontSize: 8, fontWeight: "900", textAlign: "center", marginBottom: 7 },
  strikeLabelPhone: { minHeight: 42 },
  strikeRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6 },
  strikeRowCompact: { gap: 3 },
  strikeButton: { flex: 1, minWidth: 44, maxWidth: 130, minHeight: 54, alignItems: "center", justifyContent: "center", backgroundColor: "#A93E65", borderRadius: 9, borderWidth: 1, borderColor: "#FA85A7" },
  strikePressed: { transform: [{ scale: 0.91 }], backgroundColor: "#D24A75" },
  strikeNumber: { color: "#FFF1C0", fontSize: 13, fontWeight: "900" },
  strikeText: { color: "#FFD9E4", fontSize: 6, fontWeight: "900", marginTop: 1 },
  resultCard: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#3A182A", borderRadius: radii.small, borderWidth: 1, borderColor: "#A44765", padding: 11, marginTop: 9 },
  resultWon: { backgroundColor: "#123A36", borderColor: "#45BCA9" },
  resultGlyph: { width: 38, color: "#F7D576", fontSize: 18, fontWeight: "900", textAlign: "center" },
  resultCopy: { flex: 1 },
  resultTitle: { color: "#FFF8EA", fontSize: 12, fontWeight: "900" },
  resultText: { color: "#A4A8BD", fontSize: 8, lineHeight: 13, fontWeight: "800", marginTop: 2 },
  disabled: { opacity: 0.55 },
  pressed: { transform: [{ scale: 0.94 }] },
});
