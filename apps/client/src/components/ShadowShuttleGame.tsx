import { memo, useEffect, useRef, useState } from "react";
import { Animated, Pressable, View } from "react-native";
import { Text } from "@/components/ScaledText";

import { useI18n } from "@/i18n";

import type { Seat, ShadowShuttleViewState } from "@duo/game-core";
import type { RoomPhase } from "@duo/protocol";

import { useSettings } from "@/settings/SettingsContext";
import { colors, createGameStyles, radii, shadows } from "@/theme";

type Props = {
  game: ShadowShuttleViewState;
  ownSeat: Seat;
  phase: RoomPhase;
  onMark: (pod: number) => void;
  onGuess: (slot: number) => void;
};

const TRACK_WIDTH = 300;
const POD_SIZE = 44;

export function shadowTrackLayout(width: number, podCount: number) {
  const trackWidth = Math.max(1, Math.min(TRACK_WIDTH, width));
  const podSize = Math.max(1, Math.min(POD_SIZE, (trackWidth - (podCount - 1) * 6) / podCount));
  return { compact: trackWidth < podCount * (POD_SIZE + 4), podSize, stepWidth: (trackWidth - podSize) / (podCount - 1) };
}

function phaseText(game: ShadowShuttleViewState, isInfiltrator: boolean): string {
  if (game.phase === "marking") return isInfiltrator ? "秘密选择一艘逃逸舱" : "等待幻影引航员选择目标";
  if (game.phase === "memorizing") return "记住发光目标，标记即将关闭";
  if (game.phase === "shuffling") return `追踪换位 ${game.shuffleStep}/${game.shufflePlan.length}`;
  if (game.phase === "guessing") return isInfiltrator ? "保持镇定，等待追踪者判断" : "目标藏在哪个位置？";
  if (game.roundOutcome === "mark_timeout") return "幻影选舱超时，追踪者得分";
  if (game.roundOutcome === "guess_timeout") return "追踪判断超时，幻影得分";
  return game.roundOutcome === "found" ? "追踪成功，目标被锁定" : "幻影逃逸，目标已经揭晓";
}

export const ShadowShuttleGame = memo(function ShadowShuttleGame({
  game,
  ownSeat,
  phase,
  onMark,
  onGuess,
}: Props) {
  const { t } = useI18n();
  const { feedback, settings } = useSettings();
  const isInfiltrator = ownSeat === game.infiltratorSeat;
  const [trackWidth, setTrackWidth] = useState(TRACK_WIDTH);
  const { compact, podSize, stepWidth } = shadowTrackLayout(trackWidth, game.podCount);
  const positions = useRef(Array.from({ length: 6 }, (_, index) => new Animated.Value(index * 50)));

  useEffect(() => {
    game.permutation.forEach((pod, slot) => {
      Animated.timing(positions.current[pod]!, {
        toValue: slot * stepWidth,
        duration: settings.reducedMotion ? 0 : Math.max(120, game.swapDurationMs - 80),
        useNativeDriver: true,
      }).start();
    });
  }, [game.permutation, game.swapDurationMs, settings.reducedMotion, stepWidth]);

  function act(pod: number) {
    feedback(game.phase === "guessing" ? "scan" : "place", "medium");
    if (game.phase === "marking") onMark(game.permutation.indexOf(pod));
    else if (game.phase === "guessing") onGuess(game.permutation.indexOf(pod));
  }

  const canMark = phase === "playing" && game.phase === "marking" && isInfiltrator && !game.result;
  const canGuess = phase === "playing" && game.phase === "guessing" && !isInfiltrator && !game.result;
  const showTarget = game.targetPod !== null && (game.phase === "memorizing" || game.phase === "round_result");
  const lastSwap = game.shuffleStep > 0 && (game.phase === "shuffling" || game.phase === "guessing") ? game.shufflePlan[game.shuffleStep - 1] : null;

  return (
    <View style={[styles.shell, settings.highContrast && styles.highContrast]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>SHADOW SHUTTLE</Text>
          <Text style={styles.title}>追踪幻影逃逸舱</Text>
        </View>
        <View style={styles.scoreBoard} accessibilityLabel={t(`当前第 ${game.round} 轮，共 ${game.totalRounds} 轮；你 ${game.scores[ownSeat]} 分，对手 ${game.scores[ownSeat === 0 ? 1 : 0]} 分`)}>
          <Text style={styles.scorePrimary}>{game.scores[ownSeat]}</Text>
          <Text style={styles.scoreDivider}>第 {game.round}/{game.totalRounds} 轮</Text>
          <Text style={styles.scoreCoral}>{game.scores[ownSeat === 0 ? 1 : 0]}</Text>
        </View>
      </View>

      <View style={styles.roleCard}>
        <View style={[styles.roleIcon, isInfiltrator ? styles.roleIconCoral : styles.roleIconPrimary]}>
          <Text style={styles.roleIconText}>{isInfiltrator ? "幻" : "追"}</Text>
        </View>
        <View style={styles.roleCopy}>
          <Text style={styles.roleTitle}>{isInfiltrator ? "你是幻影引航员" : "你是追踪观察员"}</Text>
          <Text style={styles.roleHint}>
            {isInfiltrator ? "选一艘作为目标，让连续换位甩开对手。" : "记住发光目标；标记消失后靠眼睛跟住它。"}
          </Text>
        </View>
      </View>

      <View style={styles.statusBox}>
        <Text accessibilityLiveRegion="polite" style={styles.statusText}>{game.result || phase === "completed" ? "本局已结束" : phase !== "playing" ? "等待连接恢复" : phaseText(game, isInfiltrator)}</Text>
        {settings.reducedMotion && lastSwap && <Text accessibilityLiveRegion="polite" style={styles.swapHint}>第 {lastSwap[0] + 1}、{lastSwap[1] + 1} 位置刚刚交换</Text>}
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${game.phase === "shuffling" ? (game.shuffleStep / game.shufflePlan.length) * 100 : game.phase === "guessing" || game.phase === "round_result" ? 100 : 0}%` as `${number}%` }]} />
        </View>
      </View>

      <View testID="shadow-hangar" style={styles.hangar} onLayout={({ nativeEvent }) => setTrackWidth(Math.max(1, nativeEvent.layout.width))}>
        <View style={styles.trackLine} />
        {Array.from({ length: game.podCount }, (_, pod) => {
          const slot = game.permutation.indexOf(pod);
          const target = showTarget && game.targetPod === pod;
          const guessed = game.phase === "round_result" && game.guessSlot === slot;
          const enabled = canMark || canGuess;
          return (
            <Animated.View key={pod} style={[styles.podPosition, { width: podSize, transform: [{ translateX: positions.current[pod]! }] }]}>
              <Pressable
                accessibilityLabel={t(`${game.phase === "guessing" ? `检查第 ${slot + 1} 位置` : `选择第 ${slot + 1} 艘逃逸舱`}${target ? "，发光目标" : ""}`)}
                accessibilityRole={compact ? "image" : "button"}
                accessibilityState={compact ? undefined : { disabled: !enabled }}
                disabled={!enabled || compact}
                onPress={() => act(pod)}
                style={({ pressed }) => [
                  styles.pod,
                  { width: podSize },
                  target && styles.podTarget,
                  guessed && styles.podGuessed,
                  pressed && !settings.reducedMotion && styles.pressed,
                ]}
              >
                <Text style={styles.podWindow}>{target ? "◉" : "•"}</Text>
                <View style={styles.podWing} />
              </Pressable>
            </Animated.View>
          );
        })}
        <View style={styles.slotLabels}>
          {Array.from({ length: game.podCount }, (_, slot) => <Text key={slot} style={[styles.slotLabel, { left: slot * stepWidth + podSize / 2 - 9 }]}>{slot + 1}</Text>)}
        </View>
      </View>

      {compact && (canMark || canGuess) && (
        <View testID="shadow-position-controls" style={styles.positionControls}>
          {Array.from({ length: game.podCount }, (_, slot) => (
            <Pressable key={slot} accessibilityRole="button" accessibilityLabel={t(canGuess ? `检查第 ${slot + 1} 位置` : `选择第 ${slot + 1} 艘逃逸舱`)} onPress={() => act(game.permutation[slot]!)} style={({ pressed }) => [styles.positionButton, pressed && styles.positionPressed]}>
              <Text style={styles.positionText}>{slot + 1} 号</Text>
            </Pressable>
          ))}
        </View>
      )}

      <View style={styles.legend}>
        <View style={styles.legendItem}><View style={styles.legendTarget} /><Text style={styles.legendText}>记忆阶段目标</Text></View>
        <View style={styles.legendItem}><View style={styles.legendGuess} /><Text style={styles.legendText}>追踪者的判断</Text></View>
      </View>

      {game.phase === "round_result" && (
        <View style={[styles.result, game.roundOutcome === "found" ? styles.resultFound : styles.resultEscaped]}>
          <Text style={styles.resultText}>
            {game.roundOutcome === "found"
              ? `命中第 ${game.permutation.indexOf(game.targetPod!) + 1} 位置，追踪者得分`
              : game.roundOutcome === "guess_timeout"
                ? "追踪者未及时判断，幻影得分"
                : game.roundOutcome === "mark_timeout"
                  ? "幻影未及时选舱，追踪者得分"
                  : `目标实际在第 ${game.permutation.indexOf(game.targetPod!) + 1} 位置，幻影得分`}
          </Text>
        </View>
      )}

      {(canMark || canGuess) && (
        <Text style={styles.actionHint}>{compact ? "按编号选择上方对应位置" : canMark ? "点击任意逃逸舱秘密标记" : "点击你认为正确的最终位置"}</Text>
      )}
    </View>
  );
});

const styles = createGameStyles({
  shell: { width: "100%", maxWidth: 920, alignSelf: "center", backgroundColor: "#12152A", borderRadius: radii.large, padding: 18, overflow: "hidden", ...shadows.card },
  highContrast: { borderWidth: 3, borderColor: colors.surface },
  header: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 },
  kicker: { color: "#FF9E88", fontSize: 9, fontWeight: "900", letterSpacing: 1.3 },
  title: { color: colors.surface, fontSize: 21, fontWeight: "900", marginTop: 3 },
  scoreBoard: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#272C48", borderRadius: radii.pill, paddingHorizontal: 13, paddingVertical: 7 },
  scorePrimary: { color: "#A9ABFF", fontSize: 17, fontWeight: "900" },
  scoreCoral: { color: "#FF9E88", fontSize: 17, fontWeight: "900" },
  scoreDivider: { color: "#969AB5", fontSize: 8, fontWeight: "900" },
  roleCard: { flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: "#232842", borderRadius: radii.medium, padding: 12, marginTop: 12 },
  roleIcon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  roleIconCoral: { backgroundColor: "#BD594A" },
  roleIconPrimary: { backgroundColor: "#595DD0" },
  roleIconText: { color: colors.surface, fontSize: 14, fontWeight: "900" },
  roleCopy: { flex: 1 },
  roleTitle: { color: colors.surface, fontSize: 13, fontWeight: "900" },
  roleHint: { color: "#ADB1C8", fontSize: 9, lineHeight: 14, marginTop: 2 },
  statusBox: { alignItems: "center", marginTop: 13 },
  statusText: { color: colors.surface, fontSize: 14, fontWeight: "900" },
  progressTrack: { width: 210, maxWidth: "100%", height: 4, borderRadius: 2, overflow: "hidden", backgroundColor: "#343957", marginTop: 7 },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: "#FF8F78" },
  hangar: { width: "100%", maxWidth: TRACK_WIDTH, height: 126, alignSelf: "center", position: "relative", backgroundColor: "#090C1B", borderRadius: radii.medium, marginTop: 12, overflow: "hidden" },
  trackLine: { position: "absolute", top: 57, left: 20, right: 20, height: 3, backgroundColor: "#353A55" },
  podPosition: { position: "absolute", top: 34, left: 0, width: POD_SIZE, height: 54 },
  pod: { width: POD_SIZE, height: 48, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "#373D5B", borderWidth: 2, borderColor: "#5E6480" },
  podTarget: { backgroundColor: "#6C3C3E", borderColor: "#FF9E88", borderWidth: 4, ...shadows.card },
  podGuessed: { borderColor: "#F3C969", borderWidth: 4 },
  podWindow: { color: "#BFC3D9", fontSize: 18, fontWeight: "900" },
  podWing: { position: "absolute", bottom: -5, width: 26, height: 7, borderRadius: 4, backgroundColor: "#6D738F" },
  slotLabels: { position: "absolute", left: 0, right: 0, bottom: 9, height: 16 },
  slotLabel: { position: "absolute", width: 18, color: "#ADB1C8", fontSize: 11, fontWeight: "900", textAlign: "center" },
  positionControls: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  positionButton: { flexGrow: 1, flexBasis: "28%", minHeight: 44, alignItems: "center", justifyContent: "center", backgroundColor: "#373D5B", borderRadius: 10, borderWidth: 1, borderColor: "#747B9A" },
  positionPressed: { backgroundColor: "#555D80" },
  positionText: { color: colors.surface, fontSize: 14, fontWeight: "800" },
  swapHint: { color: "#C7CAE0", fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 4 },
  legend: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 16, marginTop: 9 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendTarget: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: "#FF9E88" },
  legendGuess: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: "#F3C969" },
  legendText: { color: "#9499B4", fontSize: 8, fontWeight: "800" },
  result: { borderRadius: radii.small, padding: 10, marginTop: 11 },
  resultFound: { backgroundColor: "#24433F" },
  resultEscaped: { backgroundColor: "#4B3038" },
  resultText: { color: colors.surface, fontSize: 10, fontWeight: "900", textAlign: "center" },
  actionHint: { color: "#D4D6E5", fontSize: 10, fontWeight: "900", textAlign: "center", marginTop: 11 },
  pressed: { transform: [{ scale: 0.91 }] },
});
