import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ScaledText";

import { useI18n } from "@/i18n";
import { colors, radii, shadows } from "@/theme";
import { useSettings } from "@/settings/SettingsContext";

type GameCardProps = {
  icon: string;
  title: string;
  description: string;
  meta: string;
  selected?: boolean;
  onPress: () => void;
  accent?: "primary" | "coral" | "teal";
};

export function GameCard({
  icon,
  title,
  description,
  meta,
  selected = false,
  onPress,
  accent = "primary"
}: GameCardProps) {
  const { feedback, settings } = useSettings();
  const { language, t } = useI18n();
  return (
    <Pressable
      accessibilityHint={t(description)}
      accessibilityLabel={`${t(title)}${language === "en" ? ". " : "，"}${t(meta)}`}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      aria-checked={selected}
      onPress={() => { feedback("tap", "light"); onPress(); }}
      style={({ pressed }) => [styles.card, selected && styles.active, settings.highContrast && styles.highContrast, pressed && !settings.reducedMotion && styles.pressed]}
    >
      <View style={[styles.icon, styles[`${accent}Icon`]]}>
        <Text style={styles.iconText}>{icon}</Text>
      </View>
      <View>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{title}</Text>
          {selected && <Text style={[styles.badge, styles.liveBadge]}>已选择</Text>}
        </View>
        <Text style={styles.description}>{description}</Text>
        <Text style={styles.meta}>{meta}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 230,
    minHeight: 180,
    padding: 18,
    borderRadius: radii.large,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: "transparent",
    ...shadows.card
  },
  active: { borderColor: colors.primary },
  highContrast: { borderColor: colors.ink, borderWidth: 2 },
  pressed: { transform: [{ translateY: 2 }] },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20
  },
  primaryIcon: { backgroundColor: colors.primarySoft },
  coralIcon: { backgroundColor: colors.coralSoft },
  tealIcon: { backgroundColor: colors.tealSoft },
  iconText: { fontSize: 21, fontWeight: "800" },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  title: { flex: 1, minWidth: 0, color: colors.ink, fontSize: 19, fontWeight: "900" },
  badge: { flexShrink: 0, overflow: "hidden", paddingHorizontal: 9, paddingVertical: 4, borderRadius: radii.pill, fontSize: 11, fontWeight: "800" },
  liveBadge: { color: colors.primaryDark, backgroundColor: colors.primarySoft },
  description: { color: colors.muted, marginTop: 8, fontSize: 14, lineHeight: 20 },
  meta: { color: colors.ink, marginTop: 12, fontSize: 12, fontWeight: "700" }
});
