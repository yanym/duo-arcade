import { memo, useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ScaledText";
import { useI18n } from "@/i18n";

import type { DuelMove, QuantumDuelViewState, Seat } from "@duo/game-core";
import type { RoomPhase } from "@duo/protocol";

import { useSettings } from "@/settings/SettingsContext";
import { colors, createGameStyles, radii, shadows } from "@/theme";

type Props = {
  game: QuantumDuelViewState;
  ownSeat: Seat;
  phase: RoomPhase;
  onChoose: (move: DuelMove) => void;
};

const moves: { id: DuelMove; glyph: string; title: string; detail: string; color: string }[] = [
  { id: "strike", glyph: "➤", title: "突击", detail: "克制蓄能", color: "#FF8064" },
  { id: "guard", glyph: "⬡", title: "防御", detail: "反制突击", color: "#79D8C6" },
  { id: "charge", glyph: "ϟ", title: "蓄能", detail: "击穿防御", color: "#A8A5FF" },
];

function moveInfo(move: DuelMove | null) {
  return moves.find((candidate) => candidate.id === move) ?? null;
}

function revealCopy(game: QuantumDuelViewState, ownSeat: Seat): string {
  if (game.result && game.phase !== "round_result") return "本局已结束，查看上方结果";
  if (game.phase !== "round_result") return game.locked[ownSeat] ? "招式已加密，等待对手" : "选择招式后将立即锁定";
  if (game.roundOutcome === "double_timeout") return "双方都未锁定，本轮无分";
  if (game.roundOutcome === "choice_timeout") return game.roundWinner === ownSeat ? "对方超时，你获得本轮" : "你未及时锁定，对方得分";
  if (game.roundWinner === null) return "同招碰撞，本轮平手";
  return game.roundWinner === ownSeat ? "克制成功，你拿下本轮" : "招式被克制，对方拿下本轮";
}

export const QuantumDuelGame = memo(function QuantumDuelGame({ game, ownSeat, phase, onChoose }: Props) {
  const { language, t } = useI18n();
  const { feedback, settings } = useSettings();
  const [availableWidth, setAvailableWidth] = useState(0);
  const compact = availableWidth > 0 && availableWidth < 360;
  const ended = Boolean(game.result) || phase === "completed";
  const paused = !ended && phase !== "playing";
  const canChoose = phase === "playing" && game.phase === "choosing" && !game.locked[ownSeat] && !game.result;
  const opponentSeat: Seat = ownSeat === 0 ? 1 : 0;
  const ownMove = moveInfo(game.choices[ownSeat]);
  const opponentMove = moveInfo(game.choices[opponentSeat]);

  return (
    <View onLayout={(event) => setAvailableWidth(event.nativeEvent.layout.width)} style={[styles.shell, settings.highContrast && styles.highContrast]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>QUANTUM ARENA</Text>
          <Text style={styles.title}>同步锁定 · 同时揭晓</Text>
        </View>
        <View accessibilityLabel={t(`第 ${game.round} 回合，共 ${game.totalRounds} 回合`)} style={styles.roundBadge}>
          <Text style={styles.roundLabel}>回合</Text>
          <Text style={styles.roundValue}>{game.round}/{game.totalRounds}</Text>
        </View>
      </View>

      <View style={[styles.arena, compact && styles.arenaCompact]}>
        <View style={[styles.fighter, styles.fighterOwn]}>
          <View style={[styles.mechHead, ownSeat === 0 ? styles.mechPrimary : styles.mechCoral]}><View style={styles.mechEye} /></View>
          <View style={[styles.mechBody, ownSeat === 0 ? styles.mechPrimary : styles.mechCoral]}><Text style={styles.mechNumber}>{ownSeat + 1}</Text></View>
          <Text style={styles.fighterLabel}>你的机甲</Text>
          <Text style={styles.fighterScore}>{game.scores[ownSeat]}</Text>
          <View style={styles.choiceChip}>
            <Text style={styles.choiceText}>{ownMove ? `${ownMove.glyph} ${ownMove.title}` : game.locked[ownSeat] ? "已锁定" : "待选择"}</Text>
          </View>
        </View>

        <View style={[styles.energyCore, compact && styles.energyCoreCompact]}>
          <Text style={styles.vs}>VS</Text>
          <View style={[styles.coreRing, compact && styles.coreRingCompact]}><View style={[styles.coreInner, compact && styles.coreInnerCompact]} /></View>
        </View>

        <View style={[styles.fighter, styles.fighterOpponent]}>
          <View style={[styles.mechHead, opponentSeat === 0 ? styles.mechPrimary : styles.mechCoral]}><View style={styles.mechEye} /></View>
          <View style={[styles.mechBody, opponentSeat === 0 ? styles.mechPrimary : styles.mechCoral]}><Text style={styles.mechNumber}>{opponentSeat + 1}</Text></View>
          <Text style={styles.fighterLabel}>对手机甲</Text>
          <Text style={styles.fighterScore}>{game.scores[opponentSeat]}</Text>
          <View style={styles.choiceChip}>
            <Text style={styles.choiceText}>{opponentMove ? `${opponentMove.glyph} ${opponentMove.title}` : game.locked[opponentSeat] ? "已锁定 · 招式保密" : "思考中"}</Text>
          </View>
        </View>
      </View>

      <View accessibilityLiveRegion="polite" style={[styles.resultStrip, game.phase === "round_result" && styles.resultStripReveal]}>
        <Text style={styles.resultText}>{ended && !game.result ? "本局已经结束，查看上方结果" : paused ? "量子对决已暂停，等待连接恢复" : revealCopy(game, ownSeat)}</Text>
      </View>

      <View style={styles.moves}>
        {moves.map((move) => {
          const selected = game.choices[ownSeat] === move.id;
          return (
            <Pressable
              accessibilityHint={t(`${move.detail}；确认后本轮不能修改`)}
                accessibilityLabel={`${t(move.title)}${language === "en" ? ". " : "，"}${t(move.detail)}`}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canChoose, selected }}
              disabled={!canChoose}
              key={move.id}
              onPress={() => {
                feedback("hit", "heavy");
                onChoose(move.id);
              }}
              style={({ pressed }) => [
                styles.moveCard,
                compact && styles.moveCardCompact,
                { borderColor: move.color },
                selected && styles.moveSelected,
                !canChoose && !selected && styles.moveDisabled,
                pressed && !settings.reducedMotion && styles.movePressed,
              ]}
            >
              <Text style={[styles.moveGlyph, { color: move.color }]}>{move.glyph}</Text>
              <Text style={styles.moveTitle}>{move.title}</Text>
              <Text style={styles.moveDetail}>{move.detail}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.guide}>
        <Text style={styles.guideText}>突击 ➤ 蓄能　·　蓄能 ϟ 防御　·　防御 ⬡ 突击</Text>
      </View>
    </View>
  );
});

const styles = createGameStyles({
  shell: { width: "100%", maxWidth: 900, alignSelf: "center", backgroundColor: "#17192D", borderRadius: radii.large, padding: 18, ...shadows.card },
  highContrast: { borderWidth: 3, borderColor: colors.surface },
  header: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 14 },
  kicker: { color: "#8EE6D4", fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  title: { color: colors.surface, fontSize: 20, fontWeight: "900", marginTop: 3 },
  roundBadge: { minWidth: 72, backgroundColor: "#292C48", borderRadius: radii.small, alignItems: "center", padding: 9 },
  roundLabel: { color: "#9EA1BA", fontSize: 9, fontWeight: "900" },
  roundValue: { color: colors.surface, fontSize: 18, fontWeight: "900" },
  arena: { minHeight: 232, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, backgroundColor: "#222540", borderRadius: radii.medium, marginTop: 13, padding: 16, overflow: "hidden" },
  arenaCompact: { gap: 6, padding: 10 },
  fighter: { flex: 1, minWidth: 0, alignItems: "center" },
  fighterOwn: { transform: [{ rotate: "-1deg" }] },
  fighterOpponent: { transform: [{ rotate: "1deg" }] },
  mechHead: { width: 72, maxWidth: "100%", height: 49, borderRadius: 18, borderBottomLeftRadius: 9, borderBottomRightRadius: 9, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "rgba(255,255,255,0.35)" },
  mechBody: { width: 100, maxWidth: "100%", height: 69, borderRadius: 22, borderTopLeftRadius: 10, borderTopRightRadius: 10, alignItems: "center", justifyContent: "center", marginTop: 4, borderWidth: 3, borderColor: "rgba(255,255,255,0.22)" },
  mechPrimary: { backgroundColor: colors.primary },
  mechCoral: { backgroundColor: colors.coral },
  mechEye: { width: 38, height: 8, borderRadius: 4, backgroundColor: "#BDF9EA", shadowColor: "#BDF9EA", shadowOpacity: 0.7, shadowRadius: 8 },
  mechNumber: { color: colors.surface, fontSize: 24, fontWeight: "900" },
  fighterLabel: { color: "#AEB1C8", fontSize: 9, fontWeight: "900", marginTop: 7 },
  fighterScore: { color: colors.surface, fontSize: 24, fontWeight: "900" },
  choiceChip: { minHeight: 36, width: "100%", maxWidth: 150, borderRadius: radii.pill, backgroundColor: "#141627", paddingHorizontal: 4, paddingVertical: 4, alignItems: "center", justifyContent: "center", marginTop: 5 },
  choiceText: { color: "#D7D8E5", fontSize: 9, fontWeight: "900", textAlign: "center" },
  energyCore: { width: 70, alignItems: "center" },
  energyCoreCompact: { width: 28 },
  vs: { color: colors.surface, fontSize: 17, fontWeight: "900", marginBottom: 8 },
  coreRing: { width: 58, height: 58, borderRadius: 29, borderWidth: 5, borderColor: "#6E72A2", alignItems: "center", justifyContent: "center" },
  coreInner: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.amber, shadowColor: colors.amber, shadowOpacity: 0.8, shadowRadius: 16 },
  coreRingCompact: { width: 28, height: 28, borderWidth: 3 },
  coreInnerCompact: { width: 14, height: 14 },
  resultStrip: { minHeight: 42, alignItems: "center", justifyContent: "center", backgroundColor: "#292C48", borderRadius: radii.small, marginTop: 10, paddingHorizontal: 12 },
  resultStripReveal: { backgroundColor: "#3D3150" },
  resultText: { color: colors.surface, fontSize: 12, fontWeight: "900", textAlign: "center" },
  moves: { flexDirection: "row", gap: 9, marginTop: 11 },
  moveCard: { flex: 1, minHeight: 112, alignItems: "center", justifyContent: "center", borderRadius: radii.medium, backgroundColor: "#252843", borderWidth: 2, padding: 9 },
  moveCardCompact: { paddingHorizontal: 3 },
  moveSelected: { backgroundColor: "#393D62", borderWidth: 4 },
  moveDisabled: { opacity: 0.48 },
  movePressed: { transform: [{ translateY: 2 }, { scale: 0.98 }] },
  moveGlyph: { fontSize: 32, fontWeight: "900" },
  moveTitle: { color: colors.surface, fontSize: 14, fontWeight: "900", marginTop: 3 },
  moveDetail: { color: "#AEB0C5", fontSize: 9, marginTop: 2 },
  guide: { alignItems: "center", backgroundColor: "#111324", borderRadius: radii.pill, padding: 9, marginTop: 10 },
  guideText: { color: "#BBBCCE", fontSize: 9, fontWeight: "800", textAlign: "center" },
});
