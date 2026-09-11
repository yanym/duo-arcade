import { router } from "expo-router";
import { StyleSheet, View, useWindowDimensions } from "react-native";

import { Brand } from "@/components/Brand";
import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/ScaledText";
import { useWebDocumentTitle } from "@/hooks/useWebDocumentTitle";
import { useI18n } from "@/i18n";
import { colors, radii, shadows } from "@/theme";

export default function NotFoundScreen() {
  const { t } = useI18n();
  useWebDocumentTitle(t("页面不存在 · Tandem Arcade"));
  const { fontScale, width } = useWindowDimensions();
  const compact = width < 380 || fontScale > 1.2;

  return (
    <Screen>
      <View style={styles.nav}>
        <Brand compact={compact} />
        <View accessibilityLabel={t("页面不存在")} accessibilityRole="text" style={styles.statusPill}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>找不到页面</Text>
        </View>
      </View>

      <View accessibilityLiveRegion="polite" style={styles.card}>
        <Text style={styles.kicker}>走错桌了</Text>
        <Text accessibilityRole="header" style={styles.title}>这个页面不存在</Text>
        <Text style={styles.body}>链接可能有误，或页面已经移动。返回游戏大厅，就能继续创建或加入房间。</Text>
        <Button accessibilityHint="回到游戏选择与房间入口" onPress={() => router.replace("/")}>返回游戏大厅</Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14, marginBottom: 72 },
  statusPill: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.pill },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.coral },
  statusText: { color: colors.muted, fontSize: 12, fontWeight: "800" },
  card: { width: "100%", maxWidth: 520, alignSelf: "center", backgroundColor: colors.surface, borderRadius: radii.large, padding: 28, ...shadows.card },
  kicker: { color: colors.coralInk, fontSize: 12, fontWeight: "900", letterSpacing: 0.8 },
  title: { color: colors.ink, fontSize: 30, lineHeight: 38, fontWeight: "900", marginTop: 8 },
  body: { color: colors.muted, fontSize: 15, lineHeight: 24, marginTop: 12, marginBottom: 24 },
});
