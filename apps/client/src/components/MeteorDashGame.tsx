import { memo, useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ScaledText";
import { useI18n } from "@/i18n";

import type { MeteorDashViewState, MeteorResponse, Seat } from "@duo/game-core";
import type { RoomPhase } from "@duo/protocol";

import { useSettings } from "@/settings/SettingsContext";
import { colors, createGameStyles, radii, shadows } from "@/theme";

type Props = {
  game: MeteorDashViewState;
  ownSeat: Seat;
  phase: RoomPhase;
  now: number;
  onCatch: (cell: number) => void;
};

function responseCopy(response: MeteorResponse | null): string {
  if (!response) return "未捕捉";
  if (!response.correct) return "误触";
  return `${response.reactionMs} ms`;
}

export const MeteorDashGame = memo(function MeteorDashGame({ game, ownSeat, phase, now, onCatch }: Props) {
  const { t } = useI18n();
  const { feedback, playSound, settings } = useSettings();
  const lastSignalRef = useRef("");
  const [gridWidth, setGridWidth] = useState(480);
  const columns = gridWidth >= 344 ? 4 : game.cellCount === 4 || gridWidth < 160 ? 2 : 3;
  const cellWidth = Math.min(126, Math.max(1, Math.floor((gridWidth - (columns - 1) * 8) / columns)));
  const compact = gridWidth < 344;
  const ended = !!game.result || phase === "completed";
  const paused = !ended && phase !== "playing";
  const canCatch = phase === "playing" && game.phase === "catching" && now < game.turnDeadline && !game.locked[ownSeat] && !game.result;
  const actionExpired = !ended && !paused && game.phase === "catching" && now >= game.turnDeadline;
  const partner: Seat = ownSeat === 0 ? 1 : 0;
  const signalKey = `${game.round}:${game.phase}`;

  useEffect(() => {
    if (phase !== "playing" || game.result || game.phase !== "catching" || lastSignalRef.current === signalKey) return;
    lastSignalRef.current = signalKey;
    playSound("scan");
  }, [game.phase, game.result, phase, playSound, signalKey]);

  function catchCell(cell: number) {
    feedback(cell === game.targetCell ? "hit" : "failure", cell === game.targetCell ? "heavy" : "warning");
    onCatch(cell);
  }

  const headline = ended ? "本局已结束" : paused ? "等待连接恢复" : actionExpired ? "捕捉窗口已关闭，正在结算" : game.phase === "signal"
    ? "流星尚未进入观测区"
    : game.phase === "catching"
      ? game.locked[ownSeat] ? "坐标已封存，等待对手" : "捕捉发光的流星信标！"
      : game.roundWinner === null
        ? game.responses.some(response => response?.correct) ? "毫厘之间，本轮平分秋色" : "本轮双方未命中"
        : game.roundWinner === ownSeat
          ? game.responses[partner]?.correct ? "你抢先锁定了流星" : "你准确命中了流星"
          : game.responses[ownSeat]?.correct ? "对手更快一步" : "对手命中了目标";
  const countdown = Math.max(0, (game.turnDeadline - now) / 1_000);

  return (
    <View style={[styles.shell, settings.highContrast && styles.highContrast]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>METEOR ARRAY // LIVE</Text>
          <Text style={styles.title}>流星捕捉阵列</Text>
        </View>
        <View style={styles.roundBadge} accessibilityLabel={t(`第 ${game.round} 轮，共 ${game.totalRounds} 轮`)}>
          <Text style={styles.roundLabel}>观测轮次</Text>
          <Text style={styles.roundValue}>{game.round}/{game.totalRounds}</Text>
        </View>
      </View>

      <View style={styles.scoreRow}>
        <View style={[styles.scoreCard, ownSeat === 0 && styles.scoreOwn]}>
          <Text style={styles.scoreLabel}>{ownSeat === 0 ? "你 · 靛蓝" : "靛蓝捕手"}</Text>
          <Text style={styles.scorePrimary}>{game.scores[0]}</Text>
        </View>
        <View style={styles.scoreCore} accessibilityLabel={t(`当前比分 ${game.scores[0]} 比 ${game.scores[1]}`)}>
          <Text style={styles.scoreCoreGlyph}>✦</Text>
          <Text style={styles.scoreCoreText}>先取多数</Text>
        </View>
        <View style={[styles.scoreCard, styles.scoreCardCoral, ownSeat === 1 && styles.scoreOwnCoral]}>
          <Text style={styles.scoreLabel}>{ownSeat === 1 ? "你 · 珊瑚" : "珊瑚捕手"}</Text>
          <Text style={styles.scoreCoral}>{game.scores[1]}</Text>
        </View>
      </View>

      <View style={styles.status}>
        <Text accessibilityLiveRegion="polite" style={styles.headline}>{headline}</Text>
        <Text style={styles.subhead}>
          {ended ? "查看上方结果，可与对手再来一局" : paused ? "恢复连接后继续捕捉" : game.phase === "signal"
            ? `阵列正在随机校准 · ${countdown.toFixed(1)} 秒`
            : actionExpired
              ? "双方操作已停止，等待服务器同步本轮结果"
            : game.phase === "catching"
              ? game.locked[partner] ? "对手已经作答，位置与用时仍保密" : "每人仅有一次选择，服务器统一计时"
              : "双方选择与反应时间现已公开"}
        </Text>
      </View>

      <View style={[styles.array, game.phase === "catching" && styles.arrayLive]}>
        <View style={[styles.orbit, { pointerEvents: "none" }]} />
        <View testID="meteor-cells" style={styles.cells} onLayout={({ nativeEvent }) => setGridWidth(Math.max(1, nativeEvent.layout.width))}>
          {Array.from({ length: game.cellCount }, (_, cell) => {
            const isTarget = game.phase !== "signal" && game.targetCell === cell;
            const ownResponse = game.responses[ownSeat];
            const selected = ownResponse?.cell === cell;
            const disabled = !canCatch;
            return (
              <Pressable
                accessibilityHint={canCatch ? t("每轮只能选择一次") : undefined}
                accessibilityLabel={t(`信标 ${cell + 1}${isTarget ? "，流星目标" : "，空信标"}${selected ? "，你的选择" : ""}`)}
                accessibilityRole="button"
                accessibilityState={{ disabled, selected }}
                disabled={disabled}
                key={cell}
                onPress={() => catchCell(cell)}
                style={({ pressed }) => [
                  styles.cell,
                  { width: cellWidth },
                  compact && styles.cellCompact,
                  isTarget && styles.targetCell,
                  selected && styles.selectedCell,
                  disabled && game.phase === "catching" && !selected && styles.cellDisabled,
                  pressed && !settings.reducedMotion && styles.cellPressed,
                ]}
              >
                <View style={[styles.node, compact && styles.nodeCompact, isTarget && styles.targetNode, selected && !isTarget && styles.missNode]}>
                  <Text style={[styles.nodeGlyph, isTarget && styles.targetGlyph]}>{isTarget ? "✦" : "·"}</Text>
                </View>
                <Text style={[styles.cellLabel, isTarget && styles.targetLabel]}>{String(cell + 1).padStart(2, "0")}</Text>
              </Pressable>
            );
          })}
        </View>
        {game.phase === "signal" && (
          <View style={[styles.calibration, { pointerEvents: "none" }]}>
            <Text style={styles.calibrationGlyph}>◎</Text>
            <Text style={styles.calibrationText}>搜索轨迹</Text>
          </View>
        )}
      </View>

      {game.phase === "round_result" ? (
        <View style={styles.resultRow}>
          {([0, 1] as Seat[]).map((seat) => (
            <View key={seat} style={[styles.resultCell, seat === ownSeat && styles.resultOwn]}>
              <Text style={styles.resultLabel}>{seat === ownSeat ? "你的反应" : "对手反应"}</Text>
              <Text style={styles.resultValue}>{responseCopy(game.responses[seat])}</Text>
              <Text style={styles.resultMeta}>
                {game.responses[seat]?.correct ? `信标 ${game.responses[seat]!.cell + 1} · 命中` : game.responses[seat] ? `信标 ${game.responses[seat]!.cell + 1} · 偏离` : "本轮超时"}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.privacyBar}>
          <Text style={styles.privacyMark}>◇</Text>
          <Text style={styles.privacyText}>你的选择即时上锁；对手坐标与反应时间会在本轮结束后一起揭晓</Text>
        </View>
      )}
    </View>
  );
});

const styles = createGameStyles({
  shell: { width: "100%", maxWidth: 920, alignSelf: "center", backgroundColor: "#090E22", borderRadius: radii.large, padding: 18, overflow: "hidden", ...shadows.card },
  highContrast: { borderWidth: 3, borderColor: colors.surface },
  header: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 14 },
  kicker: { color: "#66E4D0", fontSize: 9, fontWeight: "900", letterSpacing: 1.3 },
  title: { color: colors.surface, fontSize: 21, fontWeight: "900", marginTop: 3 },
  roundBadge: { minWidth: 84, alignItems: "center", backgroundColor: "#182341", borderRadius: radii.small, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: "#2D4063" },
  roundLabel: { color: "#7890B5", fontSize: 8, fontWeight: "900" },
  roundValue: { color: "#F1F7FF", fontSize: 17, fontWeight: "900", marginTop: 1 },
  scoreRow: { flexDirection: "row", alignItems: "stretch", gap: 8, marginTop: 12 },
  scoreCard: { flex: 1, minHeight: 58, alignItems: "center", justifyContent: "center", backgroundColor: "#151D43", borderRadius: radii.small, borderWidth: 1.5, borderColor: "#333F78" },
  scoreCardCoral: { backgroundColor: "#351B2C", borderColor: "#6C3547" },
  scoreOwn: { borderColor: "#8D91FF" },
  scoreOwnCoral: { borderColor: "#FF987F" },
  scoreLabel: { color: "#A5B0C9", fontSize: 8, fontWeight: "900" },
  scorePrimary: { color: "#9699FF", fontSize: 23, fontWeight: "900", marginTop: 1 },
  scoreCoral: { color: "#FF927B", fontSize: 23, fontWeight: "900", marginTop: 1 },
  scoreCore: { width: 72, alignItems: "center", justifyContent: "center", backgroundColor: "#122A33", borderRadius: radii.small },
  scoreCoreGlyph: { color: "#F5D36F", fontSize: 17, fontWeight: "900" },
  scoreCoreText: { color: "#789EAA", fontSize: 7, fontWeight: "900", marginTop: 2 },
  status: { minHeight: 80, alignItems: "center", justifyContent: "center", marginTop: 14 },
  headline: { color: "#F5F7FF", fontSize: 17, fontWeight: "900", textAlign: "center" },
  subhead: { color: "#8A9AB8", fontSize: 9, lineHeight: 14, textAlign: "center", marginTop: 3 },
  array: { minHeight: 220, justifyContent: "center", marginTop: 12, padding: 14, backgroundColor: "#030817", borderRadius: radii.medium, borderWidth: 1, borderColor: "#152544", overflow: "hidden" },
  arrayLive: { borderColor: "#337E80", backgroundColor: "#04111D" },
  orbit: { position: "absolute", width: 240, height: 240, borderRadius: 120, borderWidth: 1, borderColor: "#1B3151", left: "50%", top: "50%", marginLeft: -120, marginTop: -120 },
  cells: { width: "100%", flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, zIndex: 2 },
  cell: { height: 86, alignItems: "center", justifyContent: "center", backgroundColor: "#111A31", borderRadius: 18, borderWidth: 1.5, borderColor: "#263757" },
  cellCompact: { height: 72, borderRadius: 13 },
  targetCell: { backgroundColor: "#0E5A58", borderWidth: 3, borderColor: "#9BFFF0", shadowColor: "#62F1DD", shadowOpacity: 0.72, shadowRadius: 15, elevation: 7 },
  selectedCell: { borderColor: "#F5D36F" },
  cellDisabled: { opacity: 0.62 },
  cellPressed: { transform: [{ scale: 0.92 }] },
  node: { width: 43, height: 43, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "#182541", borderWidth: 1, borderColor: "#354868" },
  nodeCompact: { width: 34, height: 34, borderRadius: 17 },
  targetNode: { backgroundColor: "#F5D36F", borderWidth: 3, borderColor: "#FFF3B6" },
  missNode: { backgroundColor: "#6D3142", borderColor: "#FF8D78" },
  nodeGlyph: { color: "#71829E", fontSize: 23, fontWeight: "900", lineHeight: 25 },
  targetGlyph: { color: "#263145", fontSize: 22 },
  cellLabel: { color: "#71819D", fontSize: 8, fontWeight: "900", letterSpacing: 1, marginTop: 5 },
  targetLabel: { color: "#D7FFF8" },
  calibration: { position: "absolute", alignSelf: "center", alignItems: "center", justifyContent: "center", width: 112, height: 112, borderRadius: 56, backgroundColor: "#08152B", borderWidth: 1.5, borderColor: "#284467", zIndex: 4 },
  calibrationGlyph: { color: "#6A84A7", fontSize: 38, fontWeight: "300" },
  calibrationText: { color: "#7C94B5", fontSize: 8, fontWeight: "900", letterSpacing: 1, marginTop: 2 },
  privacyBar: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#121C32", borderRadius: radii.small, padding: 10, marginTop: 10 },
  privacyMark: { color: "#66E4D0", fontSize: 15, fontWeight: "900" },
  privacyText: { flex: 1, color: "#8193B1", fontSize: 8, lineHeight: 13, fontWeight: "800" },
  resultRow: { flexDirection: "row", gap: 9, marginTop: 10 },
  resultCell: { flex: 1, alignItems: "center", backgroundColor: "#151F37", borderRadius: radii.small, padding: 10, borderWidth: 1, borderColor: "#2A3A57" },
  resultOwn: { borderColor: "#7479E8" },
  resultLabel: { color: "#8191AB", fontSize: 8, fontWeight: "900" },
  resultValue: { color: colors.surface, fontSize: 16, fontWeight: "900", marginTop: 3, fontVariant: ["tabular-nums"] },
  resultMeta: { color: "#8395AF", fontSize: 8, fontWeight: "800", marginTop: 2 },
});
