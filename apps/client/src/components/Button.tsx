import type { PropsWithChildren } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Text } from "@/components/ScaledText";

import { colors, radii } from "@/theme";
import { useI18n } from "@/i18n";
import { useSettings } from "@/settings/SettingsContext";

type ButtonProps = PropsWithChildren<{
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  selected?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  loadingLabel?: string;
}>;

export function Button({ children, onPress, variant = "primary", disabled = false, selected, loading = false, style, accessibilityLabel, accessibilityHint, loadingLabel = "请稍候" }: ButtonProps) {
  const { feedback, settings } = useSettings();
  const { t } = useI18n();
  const inferredLabel = typeof children === "string" ? children : undefined;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(loading ? loadingLabel : accessibilityLabel ?? inferredLabel ?? "按钮")}
      accessibilityHint={accessibilityHint ? t(accessibilityHint) : undefined}
      accessibilityState={{ busy: loading, disabled: disabled || loading, selected }}
      aria-busy={loading}
      aria-pressed={selected}
      disabled={disabled || loading}
      onPress={() => {
        feedback("tap", "light");
        onPress();
      }}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        settings.highContrast && styles.highContrast,
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
        pressed && !settings.reducedMotion && styles.pressedMotion,
        style
      ]}
    >
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={variant === "primary" ? colors.surface : colors.primary} size="small" />
          <Text style={[styles.label, variant !== "primary" && styles.darkLabel, variant === "danger" && styles.dangerLabel]}>{loadingLabel}</Text>
        </View>
      ) : (
        <Text style={[styles.label, variant !== "primary" && styles.darkLabel, variant === "danger" && styles.dangerLabel]}>
          {children}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: radii.medium,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 22
  },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.primarySoft },
  ghost: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: colors.faint },
  danger: { backgroundColor: colors.coralSoft },
  highContrast: { borderWidth: 2, borderColor: colors.ink },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.78 },
  pressedMotion: { transform: [{ scale: 0.99 }] },
  loadingRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  label: { color: colors.surface, fontSize: 16, fontWeight: "800" },
  darkLabel: { color: colors.ink },
  dangerLabel: { color: colors.danger }
});
