import { memo } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ScaledText";

import { useI18n } from "@/i18n";

import type { RhythmGravityViewState, Seat } from "@duo/game-core";
import type { RoomPhase } from "@duo/protocol";

import { useSettings } from "@/settings/SettingsContext";
import { colors, createGameStyles, radii, shadows } from "@/theme";

type Props = {
  game: RhythmGravityViewState;
  ownSeat: Seat;
  phase: RoomPhase;
  now: number;
  onTap: () => void;
};

function timingCopy(value: number | null): string {
  if (value === null) return "未击拍";
  if (Math.abs(value) <= 30) return "完美";
  return `${Math.abs(Math.round(value))}ms`;
}

export const RhythmGravityGame = memo(function RhythmGravityGame({ game, ownSeat, phase, now, onTap }: Props) {
  const { t } = useI18n();
  const { feedback, settings } = useSettings();
  const partner: Seat = ownSeat === 0 ? 1 : 0;
  const ended = !!game.result || phase === "completed";
  const paused = !ended && phase !== "playing";
  const waiting = game.phase === "beat" && now < game.beatAt - 180;
  const expired = !ended && !paused && game.phase === "beat" && now >= game.turnDeadline;
  const canTap = phase === "playing" && game.phase === "beat" && !waiting && now < game.turnDeadline && !game.locked[ownSeat] && !game.result;
  const countdown = Math.max(0, (game.beatAt - now) / 1_000);
  const coreLeft = `${((game.pullLimit - game.corePosition) / (game.pullLimit * 2)) * 100}%` as `${number}%`;

  function tap() {
    feedback("tap", "heavy");
    onTap();
  }

  const headline = ended ? "本局已结束，查看上方结果"
    : paused ? "等待连接恢复"
    : game.phase === "round_result"
    ? game.roundWinner === null
      ? "这一拍势均力敌"
      : game.roundWinner === ownSeat ? "精准命中，引力增强" : "对方更准，能量核偏移"
    : expired
      ? "击拍窗口已关闭，正在结算"
    : game.locked[ownSeat]
      ? "击拍已密封，等待对手"
      : waiting ? "稳住呼吸，等待信标" : "就是现在！";

  return (
    <View style={[styles.shell, settings.highContrast && styles.highContrast]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>RHYTHM GRAVITY</Text>
          <Text style={styles.title}>争夺零点能量核</Text>
        </View>
        <View style={styles.roundBadge} accessibilityLabel={t(`当前第 ${game.round} 拍，共 ${game.totalRounds} 拍`)}>
          <Text style={styles.roundLabel}>节拍</Text>
          <Text style={styles.roundValue}>{game.round}/{game.totalRounds}</Text>
        </View>
      </View>

      <Text accessibilityLiveRegion="polite" style={styles.headline}>{headline}</Text>
      <Text style={styles.subhead}>
        {game.phase === "round_result"
          ? "双方时间差已同步公开"
          : expired ? "双方操作已停止，等待服务器同步本拍结果" : game.locked[partner] ? "对手已经击拍，但具体时机仍然保密" : "双方输入由服务器时间统一判定"}
      </Text>

      <View style={styles.arena}>
        <View style={styles.playerRow}>
          <View style={styles.player}><View style={[styles.avatar, styles.avatarPrimary]}><Text style={styles.avatarText}>A</Text></View><Text style={styles.playerName}>靛蓝</Text></View>
          <View style={styles.player}><Text style={styles.playerName}>珊瑚</Text><View style={[styles.avatar, styles.avatarCoral]}><Text style={styles.avatarText}>B</Text></View></View>
        </View>
        <View style={styles.track} accessible accessibilityLabel={t(game.corePosition === 0 ? "能量核位于中央" : `能量核向${(game.corePosition > 0 ? 0 : 1) === ownSeat ? "你" : "对手"}靠近 ${Math.abs(game.corePosition)} 格`)}>
          {Array.from({ length: 7 }, (_, index) => <View key={index} style={[styles.trackNode, index === 0 && styles.nodePrimary, index === 6 && styles.nodeCoral]} />)}
          <View style={styles.trackLine} />
          <View style={[styles.core, { left: coreLeft }]}><Text style={styles.coreText}>◆</Text></View>
        </View>
        <View style={styles.pullLabels}><Text style={styles.pullPrimary}>{ownSeat === 0 ? "你的引力井" : "对手引力井"}</Text><Text style={styles.pullCoral}>{ownSeat === 1 ? "你的引力井" : "对手引力井"}</Text></View>
      </View>

      {game.phase === "round_result" && (
        <View style={styles.results}>
          {[0, 1].map((seat) => (
            <View key={seat} style={[styles.resultCell, seat === ownSeat && styles.resultOwn]}>
              <Text style={styles.resultLabel}>{seat === ownSeat ? "你的误差" : "对手误差"}</Text>
              <Text style={styles.resultValue}>{timingCopy(game.accuracies[seat as Seat])}</Text>
            </View>
          ))}
        </View>
      )}

      <Pressable
        accessibilityHint={t(ended ? "本局已结束" : paused ? "连接恢复后继续" : "在节拍信标亮起时按下")}
        accessibilityLabel={t("引力击拍")}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canTap }}
        disabled={!canTap}
        onPress={tap}
        style={({ pressed }) => [
          styles.tapPad,
          canTap && styles.tapPadLive,
          game.locked[ownSeat] && styles.tapPadLocked,
          pressed && !settings.reducedMotion && styles.tapPadPressed,
        ]}
      >
        <View style={[styles.signalRing, canTap && styles.signalRingLive]}>
          <Text style={[styles.tapMain, canTap && styles.tapMainLive]}>
            {ended ? "已结束" : paused ? "已暂停" : game.phase === "round_result" ? "已揭晓" : expired ? "等待结算" : game.locked[ownSeat] ? "已锁定" : waiting ? countdown.toFixed(1) : "击拍"}
          </Text>
          <Text style={styles.tapHint}>{ended ? "可在上方再来一局" : paused ? "请稍候" : game.phase === "round_result" ? "下一拍即将开始" : expired ? "服务器同步中" : waiting ? "等待信标" : game.locked[ownSeat] ? "时机不会泄露" : "按一次即可"}</Text>
        </View>
      </Pressable>
    </View>
  );
});

const styles = createGameStyles({
  shell: { width: "100%", maxWidth: 920, alignSelf: "center", backgroundColor: "#12152B", borderRadius: radii.large, padding: 18, ...shadows.card },
  highContrast: { borderWidth: 3, borderColor: colors.surface },
  header: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 14 },
  kicker: { color: "#A8AAFF", fontSize: 9, fontWeight: "900", letterSpacing: 1.3 },
  title: { color: colors.surface, fontSize: 21, fontWeight: "900", marginTop: 3 },
  roundBadge: { minWidth: 76, backgroundColor: "#282D4A", borderRadius: radii.small, paddingHorizontal: 12, paddingVertical: 8, alignItems: "center" },
  roundLabel: { color: "#AEB4D2", fontSize: 8, fontWeight: "900" },
  roundValue: { color: colors.surface, fontSize: 16, fontWeight: "900" },
  headline: { color: colors.surface, fontSize: 18, fontWeight: "900", textAlign: "center", marginTop: 14 },
  subhead: { color: "#999EBB", fontSize: 10, lineHeight: 15, textAlign: "center", marginTop: 3 },
  arena: { backgroundColor: "#0A0D1D", borderRadius: radii.medium, padding: 15, marginTop: 12 },
  playerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  player: { flexDirection: "row", alignItems: "center", gap: 7 },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  avatarPrimary: { backgroundColor: "#7276F1" },
  avatarCoral: { backgroundColor: "#F17B63" },
  avatarText: { color: "#101326", fontSize: 10, fontWeight: "900" },
  playerName: { color: "#C8CADE", fontSize: 10, fontWeight: "900" },
  track: { height: 70, position: "relative", flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginHorizontal: 16 },
  trackLine: { position: "absolute", left: 0, right: 0, top: 34, height: 3, backgroundColor: "#343A5D" },
  trackNode: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#59607C", zIndex: 1 },
  nodePrimary: { width: 18, height: 18, borderRadius: 9, backgroundColor: "#777AFF" },
  nodeCoral: { width: 18, height: 18, borderRadius: 9, backgroundColor: "#F17B63" },
  core: { position: "absolute", top: 18, width: 34, height: 34, marginLeft: -17, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "#F3C969", borderWidth: 3, borderColor: "#FFF0B5", zIndex: 4 },
  coreText: { color: "#3D3420", fontSize: 15, fontWeight: "900" },
  pullLabels: { flexDirection: "row", justifyContent: "space-between" },
  pullPrimary: { color: "#9FA2FF", fontSize: 8, fontWeight: "900" },
  pullCoral: { color: "#FF9F8B", fontSize: 8, fontWeight: "900" },
  results: { flexDirection: "row", gap: 9, marginTop: 10 },
  resultCell: { flex: 1, alignItems: "center", backgroundColor: "#242945", borderRadius: radii.small, padding: 9, borderWidth: 1, borderColor: "#3B4161" },
  resultOwn: { borderColor: "#777AFF" },
  resultLabel: { color: "#AEB4D2", fontSize: 8, fontWeight: "900" },
  resultValue: { color: colors.surface, fontSize: 15, fontWeight: "900", marginTop: 2 },
  tapPad: { alignSelf: "center", width: 172, height: 116, borderRadius: 58, alignItems: "center", justifyContent: "center", backgroundColor: "#292E4A", borderWidth: 2, borderColor: "#454B6A", marginTop: 13 },
  tapPadLive: { backgroundColor: "#6053C7", borderColor: "#C5C0FF", ...shadows.card },
  tapPadLocked: { backgroundColor: "#293E48", borderColor: "#65B9AA" },
  tapPadPressed: { transform: [{ scale: 0.95 }] },
  signalRing: { width: 140, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#4A506E" },
  signalRingLive: { borderWidth: 3, borderColor: "#E5E2FF" },
  tapMain: { color: "#A8ACC2", fontSize: 21, fontWeight: "900", fontVariant: ["tabular-nums"] },
  tapMainLive: { color: colors.surface, fontSize: 28 },
  tapHint: { color: "#AEB2C9", fontSize: 8, fontWeight: "800", marginTop: 3 },
});
