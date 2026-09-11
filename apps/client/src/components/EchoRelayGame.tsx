import { memo } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ScaledText";

import { useI18n } from "@/i18n";

import type { EchoRelayViewState, EchoTone, Seat } from "@duo/game-core";
import type { RoomPhase } from "@duo/protocol";

import { useSettings, type SoundCue } from "@/settings/SettingsContext";
import { colors, createGameStyles, radii, shadows } from "@/theme";

type Props = {
  game: EchoRelayViewState;
  ownSeat: Seat;
  phase: RoomPhase;
  onPressTone: (tone: EchoTone) => void;
};

const toneInfo: Record<EchoTone, { glyph: string; name: string; hint: string; color: string; cue: SoundCue }> = {
  ember: { glyph: "●", name: "余烬", hint: "低沉长音", color: "#FF856F", cue: "echoEmber" },
  tide: { glyph: "≈", name: "潮汐", hint: "两级上扬", color: "#66D6C3", cue: "echoTide" },
  nova: { glyph: "✦", name: "新星", hint: "明亮短音", color: "#FFD463", cue: "echoNova" },
  bloom: { glyph: "✿", name: "绽放", hint: "三级展开", color: "#D8A5FF", cue: "echoBloom" },
  comet: { glyph: "↘", name: "彗尾", hint: "快速下落", color: "#9CA8FF", cue: "echoComet" },
};

export const EchoRelayGame = memo(function EchoRelayGame({ game, ownSeat, phase, onPressTone }: Props) {
  const { t } = useI18n();
  const { feedback, settings } = useSettings();
  const isDecoder = ownSeat === game.decoderSeat;
  const ended = Boolean(game.result) || phase === "completed";
  const paused = !ended && phase !== "playing";
  const canInput = phase === "playing" && game.phase === "transmitting" && !isDecoder && !game.result;
  const canPreview = phase === "playing" && game.phase === "transmitting" && isDecoder && !game.result;

  function play(tone: EchoTone, weight: "light" | "medium") {
    feedback(toneInfo[tone].cue, weight);
  }

  const status = ended
    ? game.result?.kind === "success" ? "全部回声已经同步" : "本局回声中继已结束"
    : paused
      ? "回声中继已暂停，等待连接恢复"
      : game.phase === "stage_result"
      ? "本段复现成功，准备交换岗位"
      : !game.lastInput
        ? isDecoder ? "按编号试听，再把线索口述给搭档" : "等待搭档口述第一枚脉冲"
        : game.lastInput.correct ? "脉冲吻合，继续下一枚" : "出现干扰：本段需要从第一枚重新输入";

  return (
    <View style={[styles.shell, settings.highContrast && styles.shellContrast]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>STELLAR ECHO LINK</Text>
          <Text style={styles.title}>星语回声中继</Text>
        </View>
        <View accessibilityLabel={t(`第 ${game.stage} 段回声，共 ${game.totalStages} 段`)} style={styles.stageBadge}>
          <Text style={styles.stageLabel}>信号段</Text>
          <Text style={styles.stageValue}>{game.stage}/{game.totalStages}</Text>
        </View>
      </View>

      <View style={styles.roleCard}>
        <View style={[styles.roleMark, isDecoder ? styles.decoderMark : styles.operatorMark]}>
          <Text style={styles.roleGlyph}>{isDecoder ? "译" : "复"}</Text>
        </View>
        <View style={styles.roleCopy}>
          <Text style={styles.roleTitle}>{isDecoder ? "你是回声译码员" : "你是信号复现员"}</Text>
          <Text style={styles.roleHint}>
            {isDecoder
              ? "只有你能看到完整顺序；可反复试听，并用名称、形状或音高口述。"
              : "你的屏幕没有答案；按搭档口述的顺序复现全部脉冲。"}
          </Text>
        </View>
      </View>

      <View style={styles.contentRow}>
        <View style={[styles.channel, settings.highContrast && styles.panelContrast]}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelLabel}>私密接收频道</Text>
            <Text style={styles.accessibilityBadge}>声音 + 图形等价</Text>
          </View>
          {game.sequence ? (
            <View style={styles.sequenceRow}>
              {game.sequence.map((tone, index) => {
                const info = toneInfo[tone];
                const completed = index < game.progress && game.phase === "transmitting";
                return (
                  <Pressable
                    accessibilityHint={t(canPreview ? `播放${info.hint}` : "当前阶段只展示本段答案")}
                    accessibilityLabel={t(`第 ${index + 1} 枚，${info.name}，${info.hint}`)}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !canPreview }}
                    disabled={!canPreview}
                    key={`${tone}-${index}`}
                    onPress={() => play(tone, "light")}
                    style={({ pressed }) => [
                      styles.sequenceCard,
                      { borderColor: info.color },
                      completed && styles.sequenceComplete,
                      pressed && !settings.reducedMotion && styles.pressed,
                    ]}
                  >
                    <Text style={styles.sequenceIndex}>{index + 1}</Text>
                    <Text style={[styles.sequenceGlyph, { color: info.color }]}>{info.glyph}</Text>
                    <Text style={styles.sequenceName}>{info.name}</Text>
                    <Text style={styles.sequenceHint}>{info.hint}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <View style={styles.redacted}>
              <Text style={styles.redactedWave}>╱╲╱╲╱</Text>
              <Text style={styles.redactedTitle}>脉冲序列只发送给译码员</Text>
              <Text style={styles.redactedHint}>听搭档口述名称、位置或音高，不要交换屏幕。</Text>
            </View>
          )}
        </View>

        <View style={[styles.console, settings.highContrast && styles.panelContrast]}>
          <View style={styles.consoleTop}>
            <View>
              <Text style={styles.panelLabel}>复现控制台</Text>
              <Text style={styles.progressText}>{game.progress}/{game.sequenceLength} 已同步</Text>
            </View>
            <View style={styles.strikeRow} accessibilityLabel={t(`干扰 ${game.strikes}/${game.maxStrikes}`)}>
              {Array.from({ length: game.maxStrikes }, (_, index) => (
                <View key={index} style={[styles.strike, index < game.strikes && styles.strikeUsed]} />
              ))}
            </View>
          </View>
          <View style={styles.progressTrack}>
            {Array.from({ length: game.sequenceLength }, (_, index) => (
              <View key={index} style={[styles.progressNode, index < game.progress && styles.progressNodeActive]} />
            ))}
          </View>
          <View style={styles.toneGrid}>
            {game.availableTones.map((tone) => {
              const info = toneInfo[tone];
              return (
                <Pressable
                  accessibilityHint={t(canInput ? "播放并提交这枚脉冲" : "当前只有复现员可以提交")}
                  accessibilityLabel={t(`${info.name}脉冲，${info.hint}`)}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !canInput }}
                  disabled={!canInput}
                  key={tone}
                  onPress={() => {
                    play(tone, "medium");
                    onPressTone(tone);
                  }}
                  style={({ pressed }) => [
                    styles.toneButton,
                    { borderColor: info.color },
                    !canInput && styles.disabled,
                    pressed && !settings.reducedMotion && styles.pressed,
                  ]}
                >
                  <Text style={[styles.toneGlyph, { color: info.color }]}>{info.glyph}</Text>
                  <Text style={styles.toneName}>{info.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      <View accessibilityLiveRegion="polite" style={[styles.status, game.lastInput && !game.lastInput.correct && styles.statusDanger]}>
        <View style={[styles.statusPulse, game.lastInput?.correct && styles.statusGood, game.lastInput && !game.lastInput.correct && styles.statusBad]} />
        <Text style={styles.statusText}>{status}</Text>
        <Text style={styles.statusMeta}>完成 {game.completedStages} 段 · 输入 {game.totalInputs} 次</Text>
      </View>
    </View>
  );
});

const styles = createGameStyles({
  shell: { width: "100%", maxWidth: 980, alignSelf: "center", backgroundColor: "#10192D", borderRadius: radii.large, padding: 18, ...shadows.card },
  shellContrast: { borderWidth: 3, borderColor: colors.surface },
  header: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 14, marginBottom: 12 },
  kicker: { color: "#72E2CF", fontSize: 9, fontWeight: "900", letterSpacing: 1.25 },
  title: { color: colors.surface, fontSize: 21, fontWeight: "900", marginTop: 3 },
  stageBadge: { minWidth: 75, backgroundColor: "#202B45", borderRadius: radii.small, paddingHorizontal: 12, paddingVertical: 8, alignItems: "center" },
  stageLabel: { color: "#8D9AB6", fontSize: 8, fontWeight: "900" },
  stageValue: { color: colors.surface, fontSize: 18, fontWeight: "900", marginTop: 1 },
  roleCard: { flexDirection: "row", gap: 11, alignItems: "center", backgroundColor: "#1B2942", borderRadius: radii.medium, padding: 12, marginBottom: 12 },
  roleMark: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  decoderMark: { backgroundColor: "#127C79" },
  operatorMark: { backgroundColor: "#5A59C8" },
  roleGlyph: { color: colors.surface, fontSize: 15, fontWeight: "900" },
  roleCopy: { flex: 1 },
  roleTitle: { color: colors.surface, fontSize: 14, fontWeight: "900" },
  roleHint: { color: "#B5C0D6", fontSize: 10, lineHeight: 16, marginTop: 3 },
  contentRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  channel: { flexGrow: 1, flexShrink: 1, flexBasis: 280, minWidth: 0, backgroundColor: "#16243B", borderRadius: radii.medium, borderWidth: 1.5, borderColor: "#2A4560", padding: 14 },
  console: { flexGrow: 1, flexShrink: 1, flexBasis: 280, minWidth: 0, backgroundColor: "#0A1122", borderRadius: radii.medium, borderWidth: 1.5, borderColor: "#273652", padding: 14 },
  panelContrast: { borderWidth: 3, borderColor: colors.surface },
  panelHeader: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 },
  panelLabel: { color: "#79DDCE", fontSize: 10, fontWeight: "900", letterSpacing: 0.6 },
  accessibilityBadge: { color: "#C5D0E3", backgroundColor: "#263954", borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 4, fontSize: 8, fontWeight: "800" },
  sequenceRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 12 },
  sequenceCard: { flexGrow: 1, flexBasis: 56, minWidth: 54, minHeight: 112, alignItems: "center", justifyContent: "center", backgroundColor: "#0C1729", borderWidth: 1.5, borderRadius: radii.small, position: "relative" },
  sequenceComplete: { opacity: 0.48 },
  sequenceIndex: { position: "absolute", top: 6, left: 8, color: "#7E8DA7", fontSize: 8, fontWeight: "900" },
  sequenceGlyph: { fontSize: 31, fontWeight: "900" },
  sequenceName: { color: colors.surface, fontSize: 10, fontWeight: "900", marginTop: 2 },
  sequenceHint: { color: "#8896AE", fontSize: 7, fontWeight: "700", marginTop: 2 },
  redacted: { minHeight: 120, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  redactedWave: { color: "#55708D", fontSize: 23, fontWeight: "900", letterSpacing: 4 },
  redactedTitle: { color: colors.surface, fontSize: 12, fontWeight: "900", marginTop: 8, textAlign: "center" },
  redactedHint: { color: "#8F9DB5", fontSize: 9, lineHeight: 14, marginTop: 4, textAlign: "center" },
  consoleTop: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 },
  progressText: { color: colors.surface, fontSize: 17, fontWeight: "900", marginTop: 3 },
  strikeRow: { flexDirection: "row", gap: 5 },
  strike: { width: 17, height: 7, borderRadius: 4, backgroundColor: "#33415A" },
  strikeUsed: { backgroundColor: "#FF7563" },
  progressTrack: { flexDirection: "row", gap: 6, marginVertical: 11 },
  progressNode: { flex: 1, height: 5, borderRadius: 3, backgroundColor: "#26344E" },
  progressNodeActive: { backgroundColor: "#65DAC6" },
  toneGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 7 },
  toneButton: { flexGrow: 1, flexBasis: 76, minHeight: 73, alignItems: "center", justifyContent: "center", backgroundColor: "#18243B", borderWidth: 2, borderRadius: radii.small },
  toneGlyph: { fontSize: 26, fontWeight: "900" },
  toneName: { color: "#D7DDEA", fontSize: 9, fontWeight: "900", marginTop: 2 },
  disabled: { opacity: 0.42 },
  pressed: { transform: [{ scale: 0.95 }], backgroundColor: "#263653" },
  status: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, backgroundColor: "#1A2942", borderRadius: radii.small, padding: 11, marginTop: 12 },
  statusDanger: { backgroundColor: "#432832" },
  statusPulse: { width: 9, height: 9, borderRadius: 5, backgroundColor: "#718099" },
  statusGood: { backgroundColor: "#65DAC6" },
  statusBad: { backgroundColor: "#FF7563" },
  statusText: { flexGrow: 1, flexShrink: 1, flexBasis: 180, minWidth: 0, color: "#E0E5EF", fontSize: 12, lineHeight: 18, fontWeight: "700" },
  statusMeta: { color: "#8D9AB1", fontSize: 8, fontWeight: "800" },
});
