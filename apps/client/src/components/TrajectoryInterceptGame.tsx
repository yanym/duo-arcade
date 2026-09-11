import { memo, useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ScaledText";

import { useI18n } from "@/i18n";

import type { Seat, TrajectoryInterceptViewState } from "@duo/game-core";
import type { RoomPhase } from "@duo/protocol";

import { useSettings } from "@/settings/SettingsContext";
import { colors, createGameStyles, radii, shadows } from "@/theme";

type Props = {
  game: TrajectoryInterceptViewState;
  ownSeat: Seat;
  phase: RoomPhase;
  onMove: (direction: -1 | 1) => void;
  onCapture: () => void;
};

function outcomeCopy(game: TrajectoryInterceptViewState, ownSeat: Seat): string {
  if (game.phase === "signal") return "扫描阵列正在寻找下一条跃迁轨迹";
  if (game.phase === "intercepting") return game.locked[ownSeat] ? "你的截获记录已封存，等待对手" : "目标已出现：移动追踪器并确认截获";
  if (game.roundOutcome === "near_tie") return "双方正确截获，40ms 公平阈值内判为平手";
  if (game.roundOutcome === "intercept_timeout") return "截获窗口关闭，本轮无人得分";
  if (game.roundOutcome === "missed") return "双方均未锁定正确轨道，本轮无人得分";
  return game.roundWinner === ownSeat ? "你更快完成了正确截获" : "对手率先完成了正确截获";
}

export const TrajectoryInterceptGame = memo(function TrajectoryInterceptGame({ game, ownSeat, phase, onMove, onCapture }: Props) {
  const { t } = useI18n();
  const { feedback, settings } = useSettings();
  const ended = !!game.result || phase === "completed";
  const paused = !ended && phase !== "playing";
  const [availableWidth, setAvailableWidth] = useState(940);
  const dense = game.laneCount > 7 && availableWidth < 360;
  const ownCursor = game.cursors[ownSeat];
  const opponent: Seat = ownSeat === 0 ? 1 : 0;
  const canOperate = phase === "playing" && game.phase === "intercepting" && !game.locked[ownSeat] && !game.result;
  const ownResponse = game.responses[ownSeat];

  function move(direction: -1 | 1) {
    feedback("place", "medium");
    onMove(direction);
  }

  function capture() {
    feedback("hit", "heavy");
    onCapture();
  }

  return (
    <View style={[styles.shell, settings.highContrast && styles.highContrast]} onLayout={({ nativeEvent }) => setAvailableWidth(nativeEvent.layout.width)}>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>VECTOR INTERCEPT // DUEL</Text>
          <Text style={styles.title}>轨迹截获阵列</Text>
        </View>
        <View style={styles.roundBadge} accessibilityLabel={t(`第 ${game.round} 轮，共 ${game.totalRounds} 轮`)}>
          <Text style={styles.roundLabel}>ROUND</Text>
          <Text style={styles.roundValue}>{game.round}/{game.totalRounds}</Text>
        </View>
      </View>

      <View style={styles.scoreboard}>
        <View style={[styles.scoreSide, ownSeat === 0 && styles.ownScore]}><Text style={styles.scoreLabel}>{ownSeat === 0 ? "你 · 靛蓝" : "对手 · 靛蓝"}</Text><Text style={styles.scoreValue}>{game.scores[0]}</Text></View>
        <View style={styles.scoreCenter}><Text style={styles.scoreCenterGlyph}>◎</Text><Text style={styles.scoreCenterText}>比分</Text></View>
        <View style={[styles.scoreSide, styles.scoreRight, ownSeat === 1 && styles.ownScore]}><Text style={styles.scoreLabel}>{ownSeat === 1 ? "你 · 珊瑚" : "对手 · 珊瑚"}</Text><Text style={styles.scoreValue}>{game.scores[1]}</Text></View>
      </View>

      <View style={styles.radar}>
        <View style={styles.radarHeading}>
          <Text style={styles.radarLabel}>目标轨道 {game.targetLane === null ? "扫描中" : String(game.targetLane + 1)}</Text>
          <Text style={styles.privacyLabel}>{game.phase === "round_result" ? "双方记录已公开" : "对手位置暂不公开"}</Text>
        </View>
        <View accessibilityLabel={t(game.targetLane === null ? "目标尚未出现" : `目标位于轨道 ${game.targetLane + 1}，你的追踪器位于轨道 ${(ownCursor ?? 0) + 1}`)} style={styles.lanes}>
          {Array.from({ length: game.laneCount }, (_, lane) => {
            const target = lane === game.targetLane;
            const cursor = lane === ownCursor;
            return (
              <View key={lane} style={[styles.lane, dense && styles.laneDense, target && styles.laneTarget]}>
                <Text style={styles.laneNumber}>{lane + 1}</Text>
                <View style={styles.scanLine} />
                {target && <View style={styles.target}><Text style={styles.targetGlyph}>〔◎〕</Text>{!dense && <Text style={styles.targetText}>TARGET</Text>}</View>}
                {cursor && <View style={[styles.cursor, dense && styles.cursorDense, ownSeat === 1 && styles.cursorCoral]}><Text style={styles.cursorGlyph}>⌖</Text>{!dense && <Text style={styles.cursorText}>YOU</Text>}</View>}
              </View>
            );
          })}
        </View>
      </View>

      <View accessibilityLiveRegion="polite" style={[styles.status, game.phase === "intercepting" && styles.statusLive]}>
        <Text style={styles.statusTitle}>{ended ? "本局截获已结束" : paused ? "等待连接恢复" : outcomeCopy(game, ownSeat)}</Text>
        <View style={styles.lockRow}>
          <View style={[styles.lockPill, game.locked[ownSeat] && styles.locked]}><Text style={styles.lockText}>{game.phase === "round_result" ? ownResponse ? "你的记录已揭晓" : "你未提交" : game.locked[ownSeat] ? "你的截获已锁定" : "你尚未截获"}</Text></View>
          <View style={[styles.lockPill, game.locked[opponent] && styles.lockedOpponent]}><Text style={styles.lockText}>{game.phase === "round_result" ? game.responses[opponent] ? "对手记录已揭晓" : "对手未提交" : game.locked[opponent] ? "对手已锁定" : "对手追踪中"}</Text></View>
        </View>
      </View>

      {game.phase === "round_result" && (
        <View style={styles.revealRow}>
          {[0, 1].map((seat) => {
            const response = game.responses[seat as Seat];
            return <View key={seat} style={styles.revealCard}><Text style={styles.revealLabel}>{seat === ownSeat ? "你的记录" : "对手记录"}</Text><Text style={styles.revealValue}>{response ? `轨道 ${response.lane + 1} · ${response.correct ? "命中" : "偏离"}` : "未提交"}</Text><Text style={styles.revealTime}>{response ? `${response.reactionMs}ms` : "—"}</Text></View>;
          })}
        </View>
      )}

      <View style={styles.controls}>
        <View style={styles.controlCopy}><Text style={styles.controlKicker}>PRIVATE TRACKER</Text><Text style={styles.controlTitle}>你的追踪器 · 轨道 {(ownCursor ?? 0) + 1}</Text></View>
        <View style={styles.controlRow}>
          <Pressable accessibilityLabel={t("追踪器移到上一条轨道")} accessibilityRole="button" accessibilityState={{ disabled: !canOperate || ownCursor === 0 }} disabled={!canOperate || ownCursor === 0} onPress={() => move(-1)} style={({ pressed }) => [styles.moveButton, (!canOperate || ownCursor === 0) && styles.disabled, pressed && !settings.reducedMotion && styles.pressed]}><Text style={styles.moveGlyph}>↑</Text><Text style={styles.moveLabel}>上一轨</Text></Pressable>
          <Pressable accessibilityHint={t("每轮只能确认一次，锁定后不能继续移动")} accessibilityLabel={t("确认截获当前轨道")} accessibilityRole="button" accessibilityState={{ disabled: !canOperate }} disabled={!canOperate} onPress={capture} style={({ pressed }) => [styles.captureButton, !canOperate && styles.disabled, pressed && !settings.reducedMotion && styles.pressed]}><Text style={styles.captureGlyph}>⌖</Text><Text style={styles.captureLabel}>{ended ? "已结束" : paused ? "已暂停" : game.phase === "signal" ? "等待信号" : game.phase === "round_result" ? "已揭晓" : ownResponse ? "已经锁定" : "确认截获"}</Text></Pressable>
          <Pressable accessibilityLabel={t("追踪器移到下一条轨道")} accessibilityRole="button" accessibilityState={{ disabled: !canOperate || ownCursor === game.laneCount - 1 }} disabled={!canOperate || ownCursor === game.laneCount - 1} onPress={() => move(1)} style={({ pressed }) => [styles.moveButton, (!canOperate || ownCursor === game.laneCount - 1) && styles.disabled, pressed && !settings.reducedMotion && styles.pressed]}><Text style={styles.moveGlyph}>↓</Text><Text style={styles.moveLabel}>下一轨</Text></Pressable>
        </View>
      </View>
    </View>
  );
});

const styles = createGameStyles({
  shell: { width: "100%", maxWidth: 940, alignSelf: "center", backgroundColor: "#090E24", borderRadius: radii.large, padding: 18, overflow: "hidden", ...shadows.card },
  highContrast: { borderWidth: 3, borderColor: colors.surface },
  header: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 14 },
  kicker: { color: "#858CFF", fontSize: 9, fontWeight: "900", letterSpacing: 1.3 },
  title: { color: colors.surface, fontSize: 21, fontWeight: "900", marginTop: 3 },
  roundBadge: { minWidth: 83, alignItems: "center", backgroundColor: "#1B2347", borderRadius: radii.small, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: "#394587" },
  roundLabel: { color: "#ABB2D6", fontSize: 7, fontWeight: "900" },
  roundValue: { color: "#F2F3FF", fontSize: 17, fontWeight: "900", marginTop: 1 },
  scoreboard: { flexDirection: "row", alignItems: "stretch", marginTop: 12, gap: 7 },
  scoreSide: { flex: 1, backgroundColor: "#202957", borderRadius: radii.small, padding: 8 },
  scoreRight: { backgroundColor: "#512A3A", alignItems: "flex-end" },
  ownScore: { borderWidth: 2, borderColor: "#F1D274" },
  scoreLabel: { color: "#A5ACD1", fontSize: 8, fontWeight: "900" },
  scoreValue: { color: colors.surface, fontSize: 19, fontWeight: "900", marginTop: 2 },
  scoreCenter: { width: 42, alignItems: "center", justifyContent: "center", backgroundColor: "#121833", borderRadius: radii.small },
  scoreCenterGlyph: { color: "#F2CD70", fontSize: 17, fontWeight: "900" },
  scoreCenterText: { color: "#8D94B3", fontSize: 6, fontWeight: "900", marginTop: 1 },
  radar: { backgroundColor: "#030714", borderRadius: radii.medium, padding: 11, marginTop: 10, borderWidth: 1, borderColor: "#1D2850" },
  radarHeading: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8, marginBottom: 8 },
  radarLabel: { color: "#F2D276", fontSize: 9, fontWeight: "900" },
  privacyLabel: { color: "#8790AF", fontSize: 7, fontWeight: "900" },
  lanes: { gap: 4 },
  lane: { height: 38, justifyContent: "center", backgroundColor: "#0C1431", borderRadius: 7, borderWidth: 1, borderColor: "#182552", overflow: "hidden", position: "relative" },
  laneDense: { height: 26 },
  laneTarget: { backgroundColor: "#172447", borderColor: "#766B48" },
  laneNumber: { position: "absolute", left: 7, top: 4, color: "#7D86A8", fontSize: 7, fontWeight: "900" },
  scanLine: { position: "absolute", left: 27, right: 20, height: 1, backgroundColor: "#26396D" },
  target: { position: "absolute", right: "13%", alignItems: "center" },
  targetGlyph: { color: "#F4D374", fontSize: 12, fontWeight: "900" },
  targetText: { color: "#B0A064", fontSize: 5, fontWeight: "900" },
  cursor: { position: "absolute", left: "24%", minWidth: 46, alignItems: "center", justifyContent: "center", backgroundColor: "#4C55C8", borderRadius: 11, borderWidth: 1, borderColor: "#969CFF", paddingVertical: 3 },
  cursorDense: { minWidth: 34, paddingVertical: 2 },
  cursorCoral: { backgroundColor: "#AF4C50", borderColor: "#FF9C9D" },
  cursorGlyph: { color: colors.surface, fontSize: 10, fontWeight: "900" },
  cursorText: { color: "#FFFFFF", fontSize: 5, fontWeight: "900" },
  status: { backgroundColor: "#171D3B", borderRadius: radii.small, padding: 10, marginTop: 10 },
  statusLive: { backgroundColor: "#352D3C", borderWidth: 1, borderColor: "#695260" },
  statusTitle: { color: "#F2EFF7", fontSize: 10, fontWeight: "900", textAlign: "center" },
  lockRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 7, marginTop: 7 },
  lockPill: { backgroundColor: "#272D4A", borderRadius: radii.pill, paddingHorizontal: 9, paddingVertical: 5 },
  locked: { backgroundColor: "#414A99" },
  lockedOpponent: { backgroundColor: "#713D4D" },
  lockText: { color: "#BEC2D4", fontSize: 7, fontWeight: "900" },
  revealRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  revealCard: { flex: 1, backgroundColor: "#1A203D", borderRadius: radii.small, padding: 9 },
  revealLabel: { color: "#767F9F", fontSize: 7, fontWeight: "900" },
  revealValue: { color: "#E8E9F2", fontSize: 9, fontWeight: "900", marginTop: 2 },
  revealTime: { color: "#F1CF74", fontSize: 11, fontWeight: "900", marginTop: 2 },
  controls: { backgroundColor: "#151C3A", borderRadius: radii.medium, padding: 12, marginTop: 10, borderWidth: 1, borderColor: "#303C72" },
  controlCopy: { alignItems: "center" },
  controlKicker: { color: "#7E87E7", fontSize: 7, fontWeight: "900", letterSpacing: 0.8 },
  controlTitle: { color: colors.surface, fontSize: 10, fontWeight: "900", marginTop: 2 },
  controlRow: { flexDirection: "row", gap: 8, marginTop: 9 },
  moveButton: { flex: 1, minHeight: 65, alignItems: "center", justifyContent: "center", backgroundColor: "#28305D", borderRadius: radii.small, borderWidth: 1, borderColor: "#4A568F" },
  moveGlyph: { color: "#ADB3FF", fontSize: 20, fontWeight: "900" },
  moveLabel: { color: "#D8D9E8", fontSize: 8, fontWeight: "900", marginTop: 2 },
  captureButton: { flex: 1.25, minHeight: 65, alignItems: "center", justifyContent: "center", backgroundColor: "#D45D47", borderRadius: radii.small, borderWidth: 2, borderColor: "#FFAB8E" },
  captureGlyph: { color: "#FFF4D8", fontSize: 18, fontWeight: "900" },
  captureLabel: { color: colors.surface, fontSize: 9, fontWeight: "900", marginTop: 1 },
  disabled: { opacity: 0.33 },
  pressed: { transform: [{ scale: 0.95 }] },
});
