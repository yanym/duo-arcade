import { memo, useEffect, useRef } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ScaledText";
import { useI18n } from "@/i18n";

import {
  requiredMoveForObstacle,
  type NeonDashMove,
  type NeonDashResponse,
  type NeonDashViewState,
  type NeonObstacle,
  type Seat,
} from "@duo/game-core";
import type { RoomPhase } from "@duo/protocol";

import { useSettings } from "@/settings/SettingsContext";
import { colors, createGameStyles, radii, shadows } from "@/theme";

type Props = {
  game: NeonDashViewState;
  ownSeat: Seat;
  phase: RoomPhase;
  now: number;
  onDodge: (move: NeonDashMove) => void;
};

const obstacleInfo: Record<NeonObstacle, { icon: string; name: string; callout: string }> = {
  low_barrier: { icon: "▰", name: "低位能量墙", callout: "障碍从地面升起" },
  high_arch: { icon: "∩", name: "高架扫描门", callout: "扫描拱门压向跑道" },
  right_wall: { icon: "▐", name: "右侧封锁", callout: "右侧通道突然关闭" },
  left_wall: { icon: "▌", name: "左侧封锁", callout: "左侧通道突然关闭" },
  pulse_field: { icon: "◎", name: "脉冲静止场", callout: "移动会触发脉冲冲击" },
};

const moveInfo: Record<NeonDashMove, { icon: string; label: string }> = {
  jump: { icon: "↟", label: "跳跃" },
  slide: { icon: "↡", label: "滑行" },
  dodge_left: { icon: "←", label: "左闪" },
  dodge_right: { icon: "→", label: "右闪" },
  brake: { icon: "■", label: "急停" },
};

function responseCopy(response: NeonDashResponse | null): string {
  if (!response) return "未动作";
  return response.correct ? `${response.reactionMs} ms` : `${moveInfo[response.move].label} · 撞击`;
}

function outcomeCopy(game: NeonDashViewState, ownSeat: Seat): string {
  if (game.roundOutcome === "photo_finish") return "40ms 公平阈值内同拍通过";
  if (game.roundOutcome === "clean_pass") return game.roundWinner === ownSeat ? "你反应更快，拿到加速分" : "对手更快拿到加速分";
  if (game.roundOutcome === "single_clear") return game.roundWinner === ownSeat ? "你正确通过，对手发生撞击" : "对手正确通过，你发生撞击";
  if (game.roundOutcome === "dash_timeout") return "双方都错过了动作窗口";
  return "双方动作都没有避开障碍";
}

export const NeonDashGame = memo(function NeonDashGame({ game, ownSeat, phase, now, onDodge }: Props) {
  const { t } = useI18n();
  const { feedback, playSound, settings } = useSettings();
  const signalRef = useRef("");
  const ended = Boolean(game.result) || phase === "completed";
  const paused = !ended && phase !== "playing";
  const partner: Seat = ownSeat === 0 ? 1 : 0;
  const canDodge = phase === "playing" && game.phase === "reacting" && !game.locked[ownSeat] && now < game.turnDeadline && !game.result;
  const actionExpired = !ended && !paused && game.phase === "reacting" && now >= game.turnDeadline;
  const timeLeft = Math.max(0, (game.turnDeadline - now) / 1_000);
  const signalKey = `${game.round}:${game.phase}`;

  useEffect(() => {
    if (phase !== "playing" || game.result || game.phase !== "reacting" || signalRef.current === signalKey) return;
    signalRef.current = signalKey;
    playSound("scan");
  }, [game.phase, game.result, phase, playSound, signalKey]);

  function dodge(move: NeonDashMove) {
    const correct = game.obstacle !== null && move === requiredMoveForObstacle(game.obstacle);
    feedback(correct ? "hit" : "failure", correct ? "heavy" : "warning");
    onDodge(move);
  }

  const headline = ended
    ? "本局障碍赛已结束"
    : paused
      ? "比赛已暂停，等待连接恢复"
      : actionExpired
        ? "动作窗口已关闭，正在结算"
      : game.phase === "countdown"
    ? "赛道正在重组，保持准备"
    : game.phase === "reacting"
      ? game.locked[ownSeat] ? "动作已封存，继续向前" : obstacleInfo[game.obstacle!].name
      : outcomeCopy(game, ownSeat);

  return (
    <View style={[styles.shell, settings.highContrast && styles.highContrast]}>
      <View style={styles.header}>
        <View style={styles.headerCopy}><Text style={styles.kicker}>NEON RUN // REACTION CIRCUIT</Text><Text style={styles.title}>霓虹障碍赛</Text></View>
        <View accessibilityLabel={t(`第 ${game.round} 段赛道，共 ${game.totalRounds} 段`)} style={styles.roundBadge}><Text style={styles.roundLabel}>赛道段</Text><Text style={styles.roundValue}>{game.round}/{game.totalRounds}</Text></View>
      </View>

      <View style={styles.scoreRow}>
        {([0, 1] as const).map((seat) => (
          <View key={seat} style={[styles.runnerCard, seat === 1 && styles.runnerCardCoral, seat === ownSeat && styles.runnerOwn]}>
            <View style={styles.runnerTop}><Text style={styles.runnerName}>{seat === ownSeat ? "你" : "对手"} · {seat === 0 ? "靛蓝跑者" : "珊瑚跑者"}</Text><Text style={styles.runnerScore}>{game.scores[seat]}</Text></View>
            <View style={styles.runnerBottom}>
              <Text accessibilityLabel={t(`剩余护盾 ${game.lives[seat]}，最多 ${game.maxLives}`)} style={styles.lives}>{Array.from({ length: game.maxLives }, (_, index) => index < game.lives[seat] ? "◆" : "◇").join(" ")}</Text>
              <Text style={styles.combo}>连段 ×{game.combos[seat]} · 最佳 {game.bestCombos[seat]}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={[styles.status, game.phase === "reacting" && !paused && !ended && styles.statusLive]}>
        <Text accessibilityLiveRegion={game.phase === "reacting" && !paused && !ended ? "assertive" : "polite"} style={styles.headline}>{headline}</Text>
        <Text style={styles.subhead}>
          {ended
            ? "双方最终动作与成绩已同步"
            : paused
              ? "恢复连接后将从当前赛道状态继续"
              : actionExpired
                ? "双方操作已停止，等待服务器同步本段结果"
              : game.phase === "countdown"
            ? `随机信号还有 ${timeLeft.toFixed(1)} 秒`
            : game.phase === "reacting"
              ? game.locked[ownSeat]
                ? game.locked[partner] ? "双方已经完成，等待服务器结算" : "对手是否正确与具体动作仍然保密"
                : `${obstacleInfo[game.obstacle!].callout} · 剩余 ${timeLeft.toFixed(1)} 秒`
              : "双方动作、正确性与服务器反应时间现已公开"}
        </Text>
      </View>

      <View style={[styles.track, game.phase === "reacting" && styles.trackLive]}>
        <View style={[styles.horizon, { pointerEvents: "none" }]}><View style={styles.sunCore} /></View>
        <View style={[styles.rail, styles.railLeft, { pointerEvents: "none" }]} />
        <View style={[styles.rail, styles.railRight, { pointerEvents: "none" }]} />
        {game.phase === "countdown" ? (
          <View style={styles.scanPanel}><Text style={styles.scanGlyph}>⌁</Text><Text style={styles.scanTitle}>赛道扫描中</Text><Text style={styles.scanText}>障碍出现前的动作不会被接受</Text></View>
        ) : (
          <View accessibilityLabel={t(`当前障碍：${obstacleInfo[game.obstacle!].name}`)} style={[styles.obstacle, game.obstacle === "pulse_field" && styles.pulseObstacle]}>
            <Text style={styles.obstacleIcon}>{obstacleInfo[game.obstacle!].icon}</Text>
            <Text style={styles.obstacleName}>{obstacleInfo[game.obstacle!].name}</Text>
            <Text style={styles.obstacleCode}>{game.obstacle!.replaceAll("_", " ").toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.runners}>
          <View style={[styles.runnerToken, styles.runnerBlue, game.responses[0]?.correct && styles.runnerClear]}><Text style={styles.runnerGlyph}>A</Text></View>
          <View style={[styles.runnerToken, styles.runnerCoral, game.responses[1]?.correct && styles.runnerClear]}><Text style={styles.runnerGlyph}>B</Text></View>
        </View>
      </View>

      {game.phase === "round_result" ? (
        <View style={styles.resultRow}>
          {([0, 1] as const).map((seat) => (
            <View key={seat} style={[styles.resultCard, seat === ownSeat && styles.resultOwn]}>
              <Text style={styles.resultLabel}>{seat === ownSeat ? "你的动作" : "对手动作"}</Text>
              <Text style={[styles.resultValue, game.responses[seat]?.correct && styles.resultCorrect]}>{responseCopy(game.responses[seat])}</Text>
              <Text style={styles.resultMeta}>{game.responses[seat] ? `${moveInfo[game.responses[seat]!.move].icon} ${moveInfo[game.responses[seat]!.move].label} · ${game.responses[seat]!.correct ? "通过" : "失误"}` : "窗口超时 · 护盾 -1"}</Text>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.actions}>
          {game.availableMoves.map((move) => {
            const selected = game.responses[ownSeat]?.move === move;
            return (
              <Pressable
                accessibilityHint={t("每段赛道只能提交一次，动作会在本轮结算前对对手保密")}
                accessibilityLabel={t(`跑酷动作：${moveInfo[move].label}`)}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canDodge, selected }}
                disabled={!canDodge}
                key={move}
                onPress={() => dodge(move)}
                style={({ pressed }) => [styles.actionButton, selected && styles.actionSelected, !canDodge && !selected && styles.disabled, pressed && !settings.reducedMotion && styles.pressed]}
              >
                <Text style={styles.actionIcon}>{moveInfo[move].icon}</Text><Text style={styles.actionLabel}>{moveInfo[move].label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <View style={styles.privacyBar}><Text style={styles.privacyGlyph}>◇</Text><Text style={styles.privacyText}>正确动作优先；双方都正确时比较服务器计时，反应差在 40ms 内按同拍通过</Text></View>
    </View>
  );
});

const styles = createGameStyles({
  shell: { width: "100%", maxWidth: 940, alignSelf: "center", backgroundColor: "#0B0922", borderRadius: radii.large, padding: 18, overflow: "hidden", ...shadows.card },
  highContrast: { borderWidth: 3, borderColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14 },
  headerCopy: { flex: 1, minWidth: 0 },
  kicker: { color: "#F079C8", fontSize: 9, fontWeight: "900", letterSpacing: 1.1 },
  title: { color: "#FFF6FF", fontSize: 21, fontWeight: "900", marginTop: 3 },
  roundBadge: { minWidth: 84, alignItems: "center", backgroundColor: "#21194A", borderRadius: radii.small, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: "#493985" },
  roundLabel: { color: "#9A85C6", fontSize: 7, fontWeight: "900" },
  roundValue: { color: "#FFF5FF", fontSize: 17, fontWeight: "900", marginTop: 1 },
  scoreRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  runnerCard: { flex: 1, minWidth: 0, backgroundColor: "#171A48", borderRadius: radii.small, padding: 10, borderLeftWidth: 4, borderLeftColor: "#777EFF" },
  runnerCardCoral: { backgroundColor: "#3A1736", borderLeftColor: "#FF769B" },
  runnerOwn: { borderWidth: 2, borderColor: "#F2D36E" },
  runnerTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  runnerName: { flex: 1, minWidth: 0, color: "#EDE9FF", fontSize: 9, fontWeight: "900" },
  runnerScore: { color: "#FFF4C1", fontSize: 19, fontWeight: "900" },
  runnerBottom: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 6, marginTop: 4 },
  lives: { color: "#67DFD2", fontSize: 8, fontWeight: "900" },
  combo: { color: "#968CB5", fontSize: 7, fontWeight: "800" },
  status: { alignItems: "center", marginTop: 13 },
  statusLive: { backgroundColor: "rgba(232, 80, 181, 0.08)", borderRadius: radii.small, paddingVertical: 7 },
  headline: { color: "#FFF7FF", fontSize: 17, fontWeight: "900", textAlign: "center" },
  subhead: { color: "#A49ABF", fontSize: 9, lineHeight: 14, textAlign: "center", marginTop: 3 },
  track: { minHeight: 246, alignItems: "center", justifyContent: "center", marginTop: 10, backgroundColor: "#030515", borderRadius: radii.medium, borderWidth: 1, borderColor: "#252151", overflow: "hidden" },
  trackLive: { borderColor: "#8E397D", backgroundColor: "#07051B" },
  horizon: { position: "absolute", top: 25, width: 104, height: 52, overflow: "hidden", alignItems: "center" },
  sunCore: { width: 84, height: 84, borderRadius: 42, backgroundColor: "#B33C96", borderWidth: 8, borderColor: "#412176" },
  rail: { position: "absolute", bottom: -55, width: 3, height: 330, backgroundColor: "#3E2878", transform: [{ rotate: "24deg" }] },
  railLeft: { left: "24%" },
  railRight: { right: "24%", transform: [{ rotate: "-24deg" }] },
  scanPanel: { alignItems: "center", backgroundColor: "#11112F", borderRadius: 24, paddingHorizontal: 35, paddingVertical: 24, borderWidth: 1, borderColor: "#342C65", zIndex: 2 },
  scanGlyph: { color: "#9676D8", fontSize: 36, fontWeight: "300" },
  scanTitle: { color: "#E4DFFF", fontSize: 12, fontWeight: "900", marginTop: 4 },
  scanText: { color: "#A9B3CE", fontSize: 8, fontWeight: "800", marginTop: 3 },
  obstacle: { minWidth: 190, minHeight: 126, alignItems: "center", justifyContent: "center", backgroundColor: "#52204D", borderRadius: 26, borderWidth: 3, borderColor: "#FF83D1", zIndex: 3, shadowColor: "#FF5FC6", shadowOpacity: 0.65, shadowRadius: 18, elevation: 7 },
  pulseObstacle: { backgroundColor: "#173C4C", borderColor: "#70E2D1", shadowColor: "#57EBD6" },
  obstacleIcon: { color: "#FFF4CC", fontSize: 43, lineHeight: 48, fontWeight: "900" },
  obstacleName: { color: "#FFF7FF", fontSize: 12, fontWeight: "900", marginTop: 3 },
  obstacleCode: { color: "#C790BC", fontSize: 7, fontWeight: "900", letterSpacing: 1, marginTop: 4 },
  runners: { position: "absolute", bottom: 16, flexDirection: "row", gap: 48, zIndex: 4 },
  runnerToken: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  runnerBlue: { backgroundColor: "#3E45B5", borderColor: "#969BFF" },
  runnerCoral: { backgroundColor: "#A53F67", borderColor: "#FF99B8" },
  runnerClear: { borderColor: "#73E7B0", shadowColor: "#68E6A8", shadowOpacity: 0.7, shadowRadius: 10 },
  runnerGlyph: { color: colors.surface, fontSize: 11, fontWeight: "900" },
  actions: { flexDirection: "row", justifyContent: "center", gap: 7, marginTop: 10 },
  actionButton: { flex: 1, minWidth: 44, maxWidth: 150, minHeight: 68, alignItems: "center", justifyContent: "center", backgroundColor: "#211D4A", borderRadius: radii.small, borderWidth: 1, borderColor: "#493B81" },
  actionSelected: { backgroundColor: "#614033", borderColor: "#F2D372", borderWidth: 2 },
  actionIcon: { color: "#C1B4FF", fontSize: 21, fontWeight: "900" },
  actionLabel: { color: "#E7E0F5", fontSize: 8, fontWeight: "900", marginTop: 3 },
  resultRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  resultCard: { flex: 1, alignItems: "center", backgroundColor: "#17152F", borderRadius: radii.small, padding: 10, borderWidth: 1, borderColor: "#342D57" },
  resultOwn: { borderColor: "#7569DB" },
  resultLabel: { color: "#938AAA", fontSize: 8, fontWeight: "900" },
  resultValue: { color: "#FF9FAF", fontSize: 15, fontWeight: "900", marginTop: 3, fontVariant: ["tabular-nums"] },
  resultCorrect: { color: "#6FE2AF" },
  resultMeta: { color: "#8E86A2", fontSize: 8, fontWeight: "800", marginTop: 3 },
  privacyBar: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#15122D", borderRadius: radii.small, padding: 10, marginTop: 9 },
  privacyGlyph: { color: "#EF75C4", fontSize: 14, fontWeight: "900" },
  privacyText: { flex: 1, color: "#968DAA", fontSize: 8, lineHeight: 13, fontWeight: "800" },
  disabled: { opacity: 0.33 },
  pressed: { transform: [{ scale: 0.92 }] },
});
