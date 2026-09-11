import { memo } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ScaledText";
import { useI18n } from "@/i18n";

import type { Seat, SyncTapState } from "@duo/game-core";
import type { RoomPhase } from "@duo/protocol";

import { colors, createGameStyles } from "@/theme";
import { useSettings } from "@/settings/SettingsContext";

type Props = {
  game: SyncTapState;
  phase: RoomPhase;
  ownSeat: Seat;
  now: number;
  onTap: () => void;
};

export const SyncTapGame = memo(function SyncTapGame({ game, phase, ownSeat, now, onTap }: Props) {
  const { t } = useI18n();
  const { feedback, settings } = useSettings();
  const countdownMs = Math.max(0, game.goAt - now);
  const waiting = countdownMs > 0;
  const tapped = game.taps[ownSeat] !== null;
  const ended = phase === "completed" || Boolean(game.result);
  const paused = !ended && phase !== "playing";
  const expired = !ended && !paused && now >= game.turnDeadline;
  const canTap = phase === "playing" && !waiting && !expired && !tapped && !game.result;
  const label = ended ? "已结束" : paused ? "已暂停" : expired ? "等待结算" : waiting ? String(Math.max(1, Math.ceil(countdownMs / 1_000))) : tapped ? "已按下" : "现在按！";
  const accessibilityLabel = ended ? "本局已结束" : paused ? "连接恢复后继续击拍" : waiting
    ? `准备倒计时，还剩 ${label} 秒`
    : expired
      ? "击拍窗口已关闭，正在等待服务器结算"
    : tapped
      ? "已按下，等待搭档"
      : "现在按，每轮只能按一次";

  return (
    <View testID="sync-tap-game" style={styles.wrap}>
      <View style={styles.roundRow}>
        <Text style={styles.round}>第 {game.round} / {game.totalRounds} 轮</Text>
        <Text style={styles.hint}>{game.lastDeltaMs === null ? "倒计时后凭感觉按下" : `上轮相差 ${game.lastDeltaMs} ms`}</Text>
      </View>
      <Pressable
        accessibilityLabel={t(accessibilityLabel)}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canTap }}
        disabled={!canTap}
        onPress={() => { feedback("hit", "heavy"); onTap(); }}
        style={({ pressed }) => [
          styles.target,
          settings.highContrast && styles.highContrast,
          waiting && styles.waiting,
          tapped && styles.tapped,
          !canTap && !waiting && !tapped && styles.disabled,
          pressed && !settings.reducedMotion && styles.pressed,
        ]}
      >
        <View style={styles.targetInner}>
          <Text style={[styles.targetLabel, waiting && !ended && !paused && styles.countdown]}>{label}</Text>
          <Text style={styles.targetSub}>{ended ? "查看本局默契分" : paused ? "等待恢复连接" : expired ? "服务器正在同步结果" : waiting ? "准备……" : tapped ? "等待搭档" : "每轮只能按一次"}</Text>
        </View>
      </Pressable>
      <View testID="sync-tap-scores" style={styles.scoreTrack}>
        {Array.from({ length: game.totalRounds }, (_, index) => (
          <View accessibilityLabel={t(`第 ${index + 1} 轮${game.roundScores[index] !== undefined ? `，${game.roundScores[index]} 分` : "，尚未完成"}`)} key={index} style={[styles.scoreChip, game.roundScores[index] !== undefined && styles.scoreChipDone]}>
            <Text style={[styles.scoreChipText, game.roundScores[index] !== undefined && styles.scoreChipTextDone]}>
              {game.roundScores[index] ?? index + 1}
            </Text>
          </View>
        ))}
      </View>
      <Text style={styles.privacy}>两人的按下时间只由服务器比较，按钮不会显示对方何时已按。</Text>
    </View>
  );
});

const styles = createGameStyles({
  wrap: { alignItems: "center", paddingVertical: 10 },
  roundRow: { width: "100%", maxWidth: 520, flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 20 },
  round: { color: colors.ink, fontWeight: "900", fontSize: 16 },
  hint: { color: colors.muted, fontSize: 12 },
  target: { width: 260, maxWidth: "100%", aspectRatio: 1, borderRadius: 130, alignItems: "center", justifyContent: "center", backgroundColor: colors.coral, borderWidth: 12, borderColor: colors.coralSoft, shadowColor: colors.coral, shadowOpacity: 0.25, shadowRadius: 28, shadowOffset: { width: 0, height: 10 }, elevation: 5 },
  targetInner: { width: "84%", aspectRatio: 1, borderRadius: 99, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "rgba(255,255,255,0.42)" },
  waiting: { backgroundColor: colors.primary, borderColor: colors.primarySoft },
  tapped: { backgroundColor: colors.teal, borderColor: colors.tealSoft },
  disabled: { opacity: 0.5 },
  pressed: { transform: [{ scale: 0.96 }] },
  highContrast: { borderColor: colors.ink, borderWidth: 14 },
  targetLabel: { color: colors.surface, fontSize: 30, fontWeight: "900" },
  countdown: { fontSize: 70 },
  targetSub: { color: "rgba(255,255,255,0.84)", fontSize: 12, fontWeight: "700", marginTop: 7 },
  scoreTrack: { maxWidth: "100%", flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 9, marginTop: 24 },
  scoreChip: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: colors.canvas, borderWidth: 1.5, borderColor: colors.faint },
  scoreChipDone: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  scoreChipText: { color: colors.muted, fontWeight: "800" },
  scoreChipTextDone: { color: colors.primaryDark },
  privacy: { color: colors.muted, fontSize: 11, lineHeight: 17, textAlign: "center", maxWidth: 430, marginTop: 16 },
});
