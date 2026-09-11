import { useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ScaledText";

import { Brand } from "@/components/Brand";
import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import { useWebDocumentTitle } from "@/hooks/useWebDocumentTitle";
import { clearLocalData } from "@/lib/local-data";
import { useI18n } from "@/i18n";
import { useSettings, type AppSettings } from "@/settings/SettingsContext";
import { colors, radii, shadows } from "@/theme";

type ToggleSettingKey = "music" | "soundEffects" | "haptics" | "reducedMotion" | "highContrast";

const settingsRows: { key: ToggleSettingKey; title: string; detail: string }[] = [
  { key: "music", title: "大厅背景音乐", detail: "播放轻量循环音乐；对局提示音不受影响。" },
  { key: "soundEffects", title: "游戏音效", detail: "按钮、落子、扫描、命中和结算提示。" },
  { key: "haptics", title: "触觉反馈", detail: "在支持的 iPhone 或设备上提供轻触与命中震动。" },
  { key: "reducedMotion", title: "减少动态效果", detail: "关闭呼吸、弹跳等非必要动画，保留状态变化。" },
  { key: "highContrast", title: "增强对比度", detail: "为关键目标、按钮与状态添加更醒目的边界。" },
];

type Choice = { label: string; value: string };

function ChoiceRow({
  detail,
  label,
  onChange,
  options,
  value,
}: {
  detail?: string;
  label: string;
  onChange: (value: string) => void;
  options: Choice[];
  value: string;
}) {
  const { t } = useI18n();
  return (
    <View style={styles.choiceRow}>
      <View style={styles.choiceCopy}>
        <Text style={styles.rowTitle}>{label}</Text>
        {detail && <Text style={styles.detail}>{detail}</Text>}
      </View>
      <View accessibilityLabel={t(label)} accessibilityRole="radiogroup" style={styles.choiceGroup}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              accessibilityLabel={t(option.label)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              aria-checked={selected}
              key={option.value}
              onPress={() => onChange(option.value)}
              style={({ pressed }) => [
                styles.choice,
                selected && styles.choiceSelected,
                pressed && styles.rowPressed,
              ]}
            >
              <Text style={[styles.choiceLabel, selected && styles.choiceLabelSelected]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const { settings, updateSetting, resetSettings, feedback, systemReducedMotion } = useSettings();
  const { t } = useI18n();
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const resetConfirmationRef = useRef<View>(null);
  useWebDocumentTitle(settings.language === "en" ? "Settings · Duo Arcade" : "设置 · Duo Arcade");

  useEffect(() => {
    if (!confirmingReset || Platform.OS !== "web") return;
    const frame = requestAnimationFrame(() => {
      (resetConfirmationRef.current as unknown as { focus?: () => void } | null)?.focus?.();
    });
    return () => cancelAnimationFrame(frame);
  }, [confirmingReset]);

  async function handleReset() {
    setResetting(true);
    setResetError(null);
    try {
      await clearLocalData();
      resetSettings();
      router.replace("/");
    } catch {
      setResetError("暂时无法清除本机数据，请关闭应用后重试。");
      setResetting(false);
    }
  }

  return (
    <Screen>
      <View style={styles.nav}>
        <Brand compact />
        <Button disabled={resetting} onPress={() => router.back()} style={styles.back} variant="ghost">完成</Button>
      </View>
      <View style={styles.header}>
        <Text style={styles.kicker}>偏好设置</Text>
        <Text accessibilityRole="header" style={styles.title}>让游戏听起来、看起来都更适合你。</Text>
        <Text style={styles.subtitle}>这些选项只保存在当前浏览器或设备，不会改动好友的体验。</Text>
      </View>
      <Text style={styles.sectionLabel}>语言</Text>
      <View style={styles.card}>
        <ChoiceRow
          label="界面语言"
          onChange={(language) => {
            updateSetting("language", language === "en" ? "en" : "zh");
            feedback("tap", "light");
          }}
          options={[{ label: "中文", value: "zh" }, { label: "English", value: "en" }]}
          value={settings.language}
        />
      </View>

      <Text style={[styles.sectionLabel, styles.sectionSpacing]}>单人 AI</Text>
      <View style={styles.card}>
        <Text style={styles.cardIntro}>新建 AI 对局时使用这些设置。已进行的房间不会被改变。</Text>
        <ChoiceRow
          detail="控制 AI 偶尔判断失误的概率。"
          label="难度"
          onChange={(difficulty) => {
            updateSetting("ai", { ...settings.ai, difficulty: difficulty as AppSettings["ai"]["difficulty"] });
            feedback("tap", "light");
          }}
          options={[{ label: "轻松", value: "easy" }, { label: "标准", value: "standard" }, { label: "困难", value: "hard" }]}
          value={settings.ai.difficulty}
        />
        <ChoiceRow
          detail="控制 AI 规划深度和风险偏好。"
          label="智力与策略"
          onChange={(intelligence) => {
            updateSetting("ai", { ...settings.ai, intelligence: intelligence as AppSettings["ai"]["intelligence"] });
            feedback("tap", "light");
          }}
          options={[{ label: "休闲", value: "casual" }, { label: "均衡", value: "balanced" }, { label: "战术", value: "strategic" }]}
          value={settings.ai.intelligence}
        />
        <ChoiceRow
          detail="控制 AI 动作前的自然思考时间。"
          label="反应速度"
          onChange={(reactionSpeed) => {
            updateSetting("ai", { ...settings.ai, reactionSpeed: reactionSpeed as AppSettings["ai"]["reactionSpeed"] });
            feedback("tap", "light");
          }}
          options={[{ label: "从容", value: "relaxed" }, { label: "自然", value: "natural" }, { label: "迅速", value: "quick" }]}
          value={settings.ai.reactionSpeed}
        />
      </View>

      <Text style={[styles.sectionLabel, styles.sectionSpacing]}>声音与显示反馈</Text>
      <View style={styles.card}>
        {settingsRows.map((row, index) => {
          const followsSystem = row.key === "reducedMotion" && systemReducedMotion;
          const detail = followsSystem ? "已跟随设备的“减少动态效果”设置。" : row.detail;
          return (
          <Pressable
            accessibilityLabel={`${t(row.title)}. ${t(detail)}`}
            accessibilityRole="switch"
            accessibilityState={{ checked: settings[row.key], disabled: followsSystem }}
            aria-checked={settings[row.key]}
            disabled={followsSystem}
            key={row.key}
            onPress={() => {
              const value = !settings[row.key];
              updateSetting(row.key, value);
              if (row.key !== "soundEffects" || value) feedback("tap", "light");
            }}
            style={({ pressed }) => [styles.row, index > 0 && styles.divider, followsSystem && styles.rowDisabled, pressed && styles.rowPressed]}
          >
            <View style={styles.copy}>
              <Text style={styles.rowTitle}>{row.title}</Text>
              <Text style={styles.detail}>{detail}</Text>
            </View>
            <View
              style={[styles.switchTrack, settings[row.key] && styles.switchTrackOn, settings.highContrast && styles.switchTrackContrast, { pointerEvents: "none" }]}
            >
              <View style={styles.switchThumb} />
            </View>
          </Pressable>
          );
        })}
      </View>
      <View style={styles.note}>
        <Text accessibilityRole="header" aria-level={2} style={styles.noteTitle}>音频说明</Text>
        <Text style={styles.detail}>全部提示音与背景循环均为本项目原创合成素材；浏览器可能要求你先进行一次点击才允许播放声音。</Text>
      </View>
      <View style={styles.privacyCard}>
        <Text accessibilityRole="header" aria-level={2} style={styles.privacyTitle}>隐私与数据</Text>
        <Text style={styles.detail}>了解房间数据的处理方式，或清除这台设备上的身份、房间凭证、偏好与教程记录。</Text>
        <View style={styles.linkRow}>
          <Button onPress={() => router.push("/privacy" as never)} style={styles.linkButton} variant="ghost">隐私说明</Button>
          <Button onPress={() => router.push("/terms" as never)} style={styles.linkButton} variant="ghost">服务条款</Button>
        </View>
        {confirmingReset ? (
          <View accessibilityLabel={t("确认清除本机数据")} accessibilityLiveRegion="polite" ref={resetConfirmationRef} style={styles.resetPanel} tabIndex={-1}>
            <Text accessibilityLiveRegion="assertive" accessibilityRole="alert" style={styles.resetWarning}>清除后会生成新游客身份，已保存的房间无法从本机恢复。正在进行的服务端房间不会立刻结束。</Text>
            <View style={styles.linkRow}>
              <Button loading={resetting} loadingLabel="正在清除" onPress={() => void handleReset()} style={styles.linkButton} variant="danger">确认清除</Button>
              <Button disabled={resetting} onPress={() => setConfirmingReset(false)} style={styles.linkButton} variant="ghost">取消</Button>
            </View>
            {resetError && <Text accessibilityLiveRegion="assertive" accessibilityRole="alert" style={styles.resetWarning}>{resetError}</Text>}
          </View>
        ) : (
          <Button onPress={() => setConfirmingReset(true)} style={styles.resetButton} variant="danger">清除本机数据</Button>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 44 },
  back: { minHeight: 44, paddingHorizontal: 16 },
  header: { maxWidth: 720, marginBottom: 26 },
  kicker: { color: colors.primary, fontSize: 12, fontWeight: "900", letterSpacing: 0.8 },
  title: { color: colors.ink, fontSize: 34, lineHeight: 42, fontWeight: "900", marginTop: 7 },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 23, marginTop: 10 },
  sectionLabel: { color: colors.primary, fontSize: 12, fontWeight: "900", letterSpacing: 0.8, marginBottom: 9, marginLeft: 4 },
  sectionSpacing: { marginTop: 24 },
  card: { backgroundColor: colors.surface, borderRadius: radii.large, paddingHorizontal: 22, ...shadows.card },
  cardIntro: { color: colors.muted, fontSize: 13, lineHeight: 20, paddingTop: 18, paddingBottom: 2 },
  row: { minHeight: 88, flexDirection: "row", alignItems: "center", gap: 20, paddingVertical: 18 },
  rowPressed: { opacity: 0.72 },
  rowDisabled: { opacity: 0.72 },
  divider: { borderTopWidth: 1, borderTopColor: colors.faint },
  copy: { flex: 1 },
  choiceRow: { gap: 12, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: colors.faint },
  choiceCopy: { flex: 1 },
  choiceGroup: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  choice: { minHeight: 44, minWidth: 72, flexGrow: 1, alignItems: "center", justifyContent: "center", borderRadius: radii.pill, borderWidth: 1.5, borderColor: colors.faint, backgroundColor: colors.canvas, paddingHorizontal: 6 },
  choiceSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  choiceLabel: { color: colors.muted, fontSize: 13, fontWeight: "800" },
  choiceLabelSelected: { color: colors.primaryDark },
  rowTitle: { color: colors.ink, fontSize: 16, fontWeight: "900" },
  detail: { color: colors.muted, fontSize: 13, lineHeight: 20, marginTop: 4 },
  switchTrack: { width: 52, height: 32, padding: 3, flexDirection: "row", alignItems: "center", justifyContent: "flex-start", borderRadius: 16, backgroundColor: colors.faint },
  switchTrackOn: { justifyContent: "flex-end", backgroundColor: colors.primary },
  switchTrackContrast: { borderWidth: 2, borderColor: colors.ink, padding: 1 },
  switchThumb: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.surface, ...shadows.card },
  note: { backgroundColor: colors.tealSoft, borderRadius: radii.medium, padding: 17, marginTop: 18 },
  noteTitle: { color: colors.tealInk, fontSize: 13, fontWeight: "900" },
  privacyCard: { backgroundColor: colors.surface, borderRadius: radii.large, padding: 22, marginTop: 18, ...shadows.card },
  privacyTitle: { color: colors.ink, fontSize: 17, fontWeight: "900", marginBottom: 4 },
  linkRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 16 },
  linkButton: { flexGrow: 1, minWidth: 140 },
  resetButton: { marginTop: 12 },
  resetPanel: { borderTopWidth: 1, borderTopColor: colors.faint, marginTop: 16, paddingTop: 16 },
  resetWarning: { color: colors.danger, fontSize: 13, lineHeight: 20, fontWeight: "700" },
});
