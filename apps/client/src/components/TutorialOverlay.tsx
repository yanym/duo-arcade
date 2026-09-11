import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/ScaledText";

import { Button } from "@/components/Button";
import { useI18n } from "@/i18n";
import type { GameInfo } from "@/lib/games";
import { useSettings } from "@/settings/SettingsContext";
import { colors, radii, shadows } from "@/theme";

type Props = {
  game: GameInfo;
  visible: boolean;
  onClose: () => void;
  closeLabel?: string;
};

export function TutorialOverlay({ game, visible, onClose, closeLabel = "知道了，继续游戏" }: Props) {
  const { settings } = useSettings();
  const { language, t } = useI18n();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      accessibilityLabel={t(`${game.title}怎么玩`)}
      animationType={settings.reducedMotion ? "none" : "fade"}
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={[styles.backdrop, { paddingTop: Math.max(20, insets.top + 12), paddingBottom: Math.max(20, insets.bottom + 12) }]}>
        <View
          accessibilityRole="summary"
          accessibilityViewIsModal
          style={[styles.card, settings.highContrast && styles.highContrast]}
        >
          <ScrollView
            bounces={false}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.heading}>
              <View style={styles.icon}><Text style={styles.iconText}>{game.icon}</Text></View>
              <View style={styles.headingCopy}>
                <Text style={styles.kicker}>三步上手 · {game.mode}</Text>
                <Text accessibilityRole="header" aria-level={2} style={styles.title}>
                  {language === "en" ? `How to play ${t(game.title)}` : `${game.title}怎么玩`}
                </Text>
              </View>
            </View>
            <Text style={styles.summary}>{game.rules}</Text>
            <View style={styles.steps}>
              {game.tutorialSteps.map((step, index) => (
                <View key={step} style={styles.step}>
                  <View style={styles.stepNumber}><Text style={styles.stepNumberText}>{index + 1}</Text></View>
                  <Text style={styles.stepText}>{step}</Text>
                </View>
              ))}
            </View>
            <View style={styles.tip}>
              <Text style={styles.tipLabel}>搭档提示</Text>
              <Text style={styles.tipText}>{game.proTip}</Text>
            </View>
            <Button onPress={onClose} style={styles.button}>{closeLabel}</Button>
          </ScrollView>
        </View>
        <Pressable
          accessibilityHint={t("返回当前房间")}
          accessibilityLabel={t("关闭玩法说明")}
          accessibilityRole="button"
          aria-description={t("返回当前房间")}
          onPress={onClose}
          style={styles.dismissLayer}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(20,21,31,0.66)", padding: 20 },
  card: { zIndex: 1, width: "100%", maxWidth: 520, maxHeight: "100%", backgroundColor: colors.surface, borderRadius: 26, overflow: "hidden", ...shadows.card },
  dismissLayer: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 0 },
  content: { padding: 22 },
  highContrast: { borderWidth: 3, borderColor: colors.ink },
  heading: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { width: 54, height: 54, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
  iconText: { color: colors.primary, fontSize: 18, fontWeight: "900" },
  headingCopy: { flex: 1 },
  kicker: { color: colors.coralInk, fontSize: 11, fontWeight: "900", letterSpacing: 0.7 },
  title: { color: colors.ink, fontSize: 24, fontWeight: "900", marginTop: 2 },
  summary: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 14 },
  steps: { gap: 9, marginTop: 16 },
  step: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.canvas, borderRadius: radii.small, padding: 10 },
  stepNumber: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary },
  stepNumberText: { color: colors.surface, fontSize: 11, fontWeight: "900" },
  stepText: { flex: 1, color: colors.ink, fontSize: 13, lineHeight: 19, fontWeight: "700" },
  tip: { backgroundColor: colors.tealSoft, borderRadius: radii.small, borderLeftWidth: 4, borderLeftColor: colors.teal, padding: 11, marginTop: 14 },
  tipLabel: { color: colors.tealInk, fontSize: 11, fontWeight: "900", letterSpacing: 0.6 },
  tipText: { color: colors.ink, fontSize: 12, lineHeight: 18, marginTop: 3 },
  button: { marginTop: 16 },
});
