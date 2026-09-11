import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ScaledText";

import type { PlayerView } from "@duo/protocol";

import { useI18n } from "@/i18n";
import { colors, radii } from "@/theme";

export function PlayerPill({
  player,
  active,
  isYou,
  actionLabel = "行动",
  aiActing = false,
  showActionLabel = true,
  showReady = true,
}: {
  player: PlayerView | null;
  active: boolean;
  isYou: boolean;
  actionLabel?: string;
  aiActing?: boolean;
  showActionLabel?: boolean;
  showReady?: boolean;
}) {
  const { language, t } = useI18n();
  const connectionCopy = !player
    ? "还没有加入"
    : player.isAi
      ? aiActing ? "正在行动" : player.ready && showReady ? "已准备" : "在线"
      : player.connected ? (player.ready && showReady ? "已准备" : "在线") : "暂时离线";
  const baseName = player?.isAi ? t(player.nickname) : player?.nickname;
  const playerName = player ? baseName : language === "en" ? "Waiting" : t("等待好友");
  const statusCopy = player
    ? [isYou ? t("你") : null, t(player.roleLabel), connectionCopy === "在线" ? null : t(connectionCopy)].filter(Boolean).join(" · ")
    : t(connectionCopy);
  const accessibleCopy = player
    ? [baseName, isYou ? t("你") : null, t(player.roleLabel), t(connectionCopy), active ? `${t("行动")}${language === "en" ? ": " : "："}${t(actionLabel)}` : null].filter(Boolean).join(language === "en" ? ", " : "，")
    : t("等待第二位玩家加入");
  return (
    <View
      accessibilityLabel={accessibleCopy}
      accessibilityLiveRegion="polite"
      accessibilityRole="summary"
      style={[styles.card, active && styles.active]}
    >
      <View style={styles.nameRow}>
        <View style={[styles.piece, !player ? styles.emptyPiece : player.piece === 1 ? styles.blackPiece : styles.whitePiece]} />
        <Text numberOfLines={1} style={styles.name}>
          {playerName}
        </Text>
        {active && showActionLabel && <Text style={styles.turn}>{actionLabel}</Text>}
      </View>
      <View style={styles.statusRow}>
        <View style={[styles.statusDot, !player ? styles.waiting : player.connected ? styles.online : styles.offline, player?.isAi && styles.ai]} />
        <Text numberOfLines={2} style={styles.status}>{statusCopy}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 150,
    padding: 11,
    borderRadius: radii.medium,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.faint
  },
  active: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  piece: { width: 22, height: 22, borderRadius: 11 },
  blackPiece: { backgroundColor: colors.ink },
  whitePiece: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.ink },
  emptyPiece: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: colors.muted, borderStyle: "dashed" },
  name: { flex: 1, minWidth: 0, color: colors.ink, fontSize: 13, fontWeight: "900" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 7 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  online: { backgroundColor: colors.teal },
  offline: { backgroundColor: colors.coral },
  waiting: { backgroundColor: colors.muted },
  ai: { backgroundColor: colors.primary },
  status: { flex: 1, minWidth: 0, color: colors.muted, fontSize: 11, lineHeight: 15 },
  turn: { color: colors.primaryDark, backgroundColor: colors.surface, borderRadius: radii.pill, paddingHorizontal: 7, paddingVertical: 3, fontSize: 10, fontWeight: "900" }
});
