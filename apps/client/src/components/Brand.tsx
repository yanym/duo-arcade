import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ScaledText";

import { useI18n } from "@/i18n";
import { colors, radii } from "@/theme";

export function Brand({ compact = false, iconOnly = false }: { compact?: boolean; iconOnly?: boolean }) {
  const { t } = useI18n();
  return (
    <View accessibilityLabel={t("Tandem Arcade")} accessible style={styles.row}>
      <View style={[styles.mark, compact && styles.compactMark]}>
        <View style={[styles.dot, styles.dotLeft]} />
        <View style={[styles.dot, styles.dotRight]} />
      </View>
      {!iconOnly && <Text style={[styles.name, compact && styles.compactName]}>Tandem Arcade</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  mark: {
    width: 42,
    height: 32,
    borderRadius: radii.medium,
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    transform: [{ rotate: "-4deg" }]
  },
  compactMark: { width: 36, height: 28 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  dotLeft: { backgroundColor: colors.surface },
  dotRight: { backgroundColor: colors.amber },
  name: { color: colors.ink, fontSize: 24, fontWeight: "900", letterSpacing: -0.5 },
  compactName: { fontSize: 20 }
});
