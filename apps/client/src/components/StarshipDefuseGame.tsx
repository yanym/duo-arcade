import { memo } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ScaledText";
import { useI18n } from "@/i18n";

import type { DefuseSymbol, DefuseViewState, Seat } from "@duo/game-core";
import type { RoomPhase } from "@duo/protocol";

import { useSettings } from "@/settings/SettingsContext";
import { colors, createGameStyles, radii, shadows } from "@/theme";

type Props = {
  game: DefuseViewState;
  ownSeat: Seat;
  phase: RoomPhase;
  onPressSymbol: (symbol: DefuseSymbol) => void;
};

const symbolInfo: Record<DefuseSymbol, { glyph: string; name: string; color: string }> = {
  triangle: { glyph: "△", name: "三角", color: "#FF9A7A" },
  diamond: { glyph: "◇", name: "菱形", color: "#8EE6D4" },
  circle: { glyph: "○", name: "圆环", color: "#FFD86B" },
  square: { glyph: "□", name: "方框", color: "#AAB2FF" },
  wave: { glyph: "⌁", name: "波纹", color: "#F8A8D8" },
  star: { glyph: "✦", name: "星芒", color: "#C8F48A" },
};

export const StarshipDefuseGame = memo(function StarshipDefuseGame({ game, ownSeat, phase, onPressSymbol }: Props) {
  const { t } = useI18n();
  const isOperator = ownSeat === game.operatorSeat;
  const { feedback, settings } = useSettings();
  const ended = Boolean(game.result) || phase === "completed";
  const paused = !ended && phase !== "playing";
  const canOperate = phase === "playing" && isOperator && !game.result;
  const lastCopy = ended
    ? game.result?.kind === "success" ? "全部舱段已稳定，任务完成" : "任务已结束，可以查看结果后再试一次"
    : paused
      ? "拆弹协作已暂停，等待连接恢复"
      : !game.lastInput
    ? "等待第一条指令"
    : game.lastInput.stageComplete
      ? "舱段稳定，下一段交换角色"
      : game.lastInput.correct ? "输入正确，继续下一符号" : "线路冲突，已记录一次错误";

  return (
    <View style={styles.shell}>
      <View style={styles.topRow}>
        <View>
          <Text style={styles.kicker}>ORBITAL MAINTENANCE</Text>
          <Text style={styles.title}>星舰反应堆稳定协议</Text>
        </View>
        <View accessibilityLabel={t(`第 ${game.stage} 个舱段，共 ${game.totalStages} 个`)} style={styles.stageBadge}>
          <Text style={styles.stageLabel}>舱段</Text>
          <Text style={styles.stageValue}>{game.stage}/{game.totalStages}</Text>
        </View>
      </View>

      <View style={styles.roleStrip}>
        <Text style={styles.roleTitle}>{isOperator ? "你是控制台操作员" : "你是维修分析员"}</Text>
        <Text style={styles.roleDetail}>
          {isOperator ? "听取搭档口述，按正确顺序输入；你的屏幕没有答案。" : "按编号口述私密序列；不要让操作员直接看屏幕。"}
        </Text>
      </View>

      <View style={styles.panels}>
        <View style={[styles.panel, styles.manualPanel, settings.highContrast && styles.highContrast]}>
          <Text style={styles.panelLabel}>维修手册 · 私密频道</Text>
          {game.solution ? (
            <>
              <Text style={styles.manualHint}>按编号依次口述，不要省略顺序</Text>
              <View style={styles.sequence}>
                {game.solution.map((symbol, index) => (
                  <View accessibilityLabel={t(`第 ${index + 1} 个符号：${symbolInfo[symbol].name}`)} key={`${symbol}-${index}`} style={styles.sequenceItem}>
                    <Text style={styles.sequenceIndex}>{index + 1}</Text>
                    <Text style={[styles.sequenceGlyph, { color: symbolInfo[symbol].color }]}>{symbolInfo[symbol].glyph}</Text>
                    <Text style={styles.sequenceName}>{symbolInfo[symbol].name}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <View style={styles.redacted}>
              <Text style={styles.redactedIcon}>••••</Text>
              <Text style={styles.redactedTitle}>序列已对操作员隐藏</Text>
              <Text style={styles.redactedText}>请相信搭档口述的编号和符号。</Text>
            </View>
          )}
        </View>

        <View style={[styles.panel, styles.consolePanel, settings.highContrast && styles.highContrast]}>
          <View style={styles.consoleHeader}>
            <View>
              <Text style={styles.consoleLabel}>输入进度</Text>
              <Text style={styles.consoleProgress}>{game.progress}/{game.sequenceLength}</Text>
            </View>
            <View style={styles.strikes}>
              {Array.from({ length: game.maxStrikes }, (_, index) => (
                <View key={index} style={[styles.strike, index < game.strikes && styles.strikeUsed]} />
              ))}
            </View>
          </View>
          <View style={styles.symbolGrid}>
            {game.availableSymbols.map((symbol) => (
              <Pressable
                accessibilityHint={t(canOperate ? "将此符号发送给服务器验证" : "当前只有控制台操作员可以输入")}
                accessibilityLabel={t(`${symbolInfo[symbol].name}符号`)}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canOperate }}
                disabled={!canOperate}
                key={symbol}
                onPress={() => {
                  feedback("place", "medium");
                  onPressSymbol(symbol);
                }}
                style={({ pressed }) => [
                  styles.symbolButton,
                  { borderColor: symbolInfo[symbol].color },
                  !canOperate && styles.disabled,
                  pressed && !settings.reducedMotion && styles.pressed,
                ]}
              >
                <Text style={[styles.symbolGlyph, { color: symbolInfo[symbol].color }]}>{symbolInfo[symbol].glyph}</Text>
                <Text style={styles.symbolName}>{symbolInfo[symbol].name}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      <View accessibilityLiveRegion="polite" style={[styles.status, game.lastInput && !game.lastInput.correct && styles.statusDanger]}>
        <View style={[styles.statusDot, game.lastInput?.correct && styles.statusDotGood, game.lastInput && !game.lastInput.correct && styles.statusDotDanger]} />
        <Text style={styles.statusText}>{lastCopy}</Text>
      </View>
    </View>
  );
});

const styles = createGameStyles({
  shell: { width: "100%", maxWidth: 980, alignSelf: "center", backgroundColor: "#17192D", borderRadius: radii.large, padding: 18, ...shadows.card },
  topRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 13 },
  kicker: { color: "#7FE1CF", fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  title: { color: colors.surface, fontSize: 20, fontWeight: "900", marginTop: 3 },
  stageBadge: { minWidth: 72, backgroundColor: "#292C48", borderRadius: radii.small, padding: 9, alignItems: "center" },
  stageLabel: { color: "#AEB0C9", fontSize: 9, fontWeight: "900" },
  stageValue: { color: colors.surface, fontSize: 18, fontWeight: "900" },
  roleStrip: { backgroundColor: "#262944", borderLeftWidth: 4, borderLeftColor: colors.coral, borderRadius: radii.small, padding: 13, marginBottom: 13 },
  roleTitle: { color: colors.surface, fontSize: 14, fontWeight: "900" },
  roleDetail: { color: "#C7C9DA", fontSize: 11, lineHeight: 17, marginTop: 3 },
  panels: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  panel: { flexGrow: 1, flexShrink: 1, flexBasis: 280, minWidth: 0, borderRadius: radii.medium, padding: 15, borderWidth: 1.5 },
  manualPanel: { backgroundColor: "#22253D", borderColor: "#3D4163" },
  consolePanel: { backgroundColor: "#101225", borderColor: "#343854" },
  highContrast: { borderWidth: 3, borderColor: colors.surface },
  panelLabel: { color: "#8EE6D4", fontSize: 10, fontWeight: "900", letterSpacing: 0.7 },
  manualHint: { color: "#B7B9CD", fontSize: 10, marginTop: 5 },
  sequence: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 14 },
  sequenceItem: { flex: 1, minWidth: 54, minHeight: 98, alignItems: "center", justifyContent: "center", backgroundColor: "#17192D", borderRadius: radii.small, position: "relative" },
  sequenceIndex: { position: "absolute", top: 6, left: 8, color: "#8F93B0", fontSize: 9, fontWeight: "900" },
  sequenceGlyph: { fontSize: 36, fontWeight: "900" },
  sequenceName: { color: "#CFD1E1", fontSize: 9, fontWeight: "800", marginTop: 2 },
  redacted: { minHeight: 126, alignItems: "center", justifyContent: "center" },
  redactedIcon: { color: "#737796", fontSize: 26, letterSpacing: 8, fontWeight: "900" },
  redactedTitle: { color: colors.surface, fontSize: 13, fontWeight: "900", marginTop: 7 },
  redactedText: { color: "#9EA1BC", fontSize: 10, marginTop: 3 },
  consoleHeader: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  consoleLabel: { color: "#8B8EAA", fontSize: 9, fontWeight: "900" },
  consoleProgress: { color: colors.surface, fontSize: 19, fontWeight: "900" },
  strikes: { flexDirection: "row", gap: 6 },
  strike: { width: 18, height: 7, borderRadius: 4, backgroundColor: "#41445E" },
  strikeUsed: { backgroundColor: colors.coral },
  symbolGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  symbolButton: { flexGrow: 1, flexBasis: 78, minHeight: 82, alignItems: "center", justifyContent: "center", backgroundColor: "#252843", borderWidth: 2, borderRadius: radii.small },
  symbolGlyph: { fontSize: 31, fontWeight: "900" },
  symbolName: { color: "#D4D5E2", fontSize: 9, fontWeight: "800", marginTop: 2 },
  disabled: { opacity: 0.45 },
  pressed: { transform: [{ scale: 0.95 }], backgroundColor: "#343858" },
  status: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#252843", borderRadius: radii.pill, paddingHorizontal: 13, paddingVertical: 9, marginTop: 12 },
  statusDanger: { backgroundColor: "#43262E" },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#767A9B" },
  statusDotGood: { backgroundColor: "#7FE1CF" },
  statusDotDanger: { backgroundColor: colors.coral },
  statusText: { flex: 1, color: "#D7D8E6", fontSize: 12, lineHeight: 18, fontWeight: "800" },
});
