import { Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ScaledText";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/Button";
import { useI18n } from "@/i18n";
import { useSettings } from "@/settings/SettingsContext";
import { colors, radii, shadows } from "@/theme";

type Props = {
  visible: boolean;
  title: string;
  detail: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  destructive?: boolean;
  confirming?: boolean;
};

export function ConfirmSheet({
  visible,
  title,
  detail,
  confirmLabel,
  onCancel,
  onConfirm,
  destructive = false,
  confirming = false,
}: Props) {
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const { t } = useI18n();
  return (
    <Modal
      accessibilityLabel={t(title)}
      animationType={settings.reducedMotion ? "none" : Platform.OS === "ios" ? "slide" : "fade"}
      onRequestClose={confirming ? () => undefined : onCancel}
      transparent
      visible={visible}
    >
      <View style={[styles.backdrop, Platform.OS === "web" && styles.backdropWeb]}>
        <View
          accessibilityRole="alert"
          accessibilityViewIsModal
          style={[
            styles.sheet,
            Platform.OS === "web" && styles.sheetWeb,
            settings.highContrast && styles.highContrast,
            { paddingBottom: Math.max(20, insets.bottom + 12) },
          ]}
        >
          <View style={styles.handle} />
          <Text accessibilityRole="header" aria-level={2} style={styles.title}>{title}</Text>
          <Text style={styles.detail}>{detail}</Text>
          <View style={styles.actions}>
            <Button disabled={confirming} onPress={onCancel} style={styles.action} variant="ghost">继续留在这里</Button>
            <Button loading={confirming} loadingLabel="正在结束" onPress={onConfirm} style={styles.action} variant={destructive ? "danger" : "secondary"}>{confirmLabel}</Button>
          </View>
        </View>
        <Pressable
          accessibilityHint={t("返回当前页面")}
          accessibilityLabel={t("取消")}
          accessibilityRole="button"
          disabled={confirming}
          onPress={onCancel}
          style={styles.dismissLayer}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(20,21,31,0.58)" },
  backdropWeb: { alignItems: "center", justifyContent: "center", padding: 20 },
  sheet: {
    zIndex: 1,
    width: "100%",
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 10,
    ...shadows.card,
  },
  dismissLayer: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 0 },
  sheetWeb: { maxWidth: 480, borderRadius: 24, paddingTop: 16 },
  highContrast: { borderWidth: 3, borderColor: colors.ink },
  handle: { alignSelf: "center", width: 38, height: 5, borderRadius: radii.pill, backgroundColor: colors.faint, marginBottom: 16 },
  title: { color: colors.ink, fontSize: 22, lineHeight: 28, fontWeight: "900" },
  detail: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 7 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 20 },
  action: { flexGrow: 1, minWidth: 180 },
});
