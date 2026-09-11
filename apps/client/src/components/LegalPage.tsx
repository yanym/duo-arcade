import type { ReactNode } from "react";
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ScaledText";

import { Brand } from "@/components/Brand";
import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import { useWebDocumentTitle } from "@/hooks/useWebDocumentTitle";
import { useI18n } from "@/i18n";
import { colors, radii, shadows } from "@/theme";

export type LegalSection = {
  title: string;
  body: ReactNode;
};

export function LegalPage({ title, summary, sections }: {
  title: string;
  summary: string;
  sections: LegalSection[];
}) {
  const { language, t } = useI18n();
  useWebDocumentTitle(language === "en" ? `${t(title)} · Tandem Arcade` : `${title} · Tandem Arcade`);
  return (
    <Screen>
      <View style={styles.nav}>
        <Brand compact />
        <Button onPress={() => router.back()} style={styles.back} variant="ghost">返回</Button>
      </View>
      <View style={styles.header}>
        <Text style={styles.kicker}>公开测试版 · 2026 年 9 月 8 日生效</Text>
        <Text accessibilityRole="header" style={styles.title}>{title}</Text>
        <Text style={styles.summary}>{summary}</Text>
      </View>
      <View style={styles.card}>
        {sections.map((section, index) => (
          <View key={section.title} style={[styles.section, index > 0 && styles.divider]}>
            <Text accessibilityRole="header" aria-level={2} style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.body}>{section.body}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.releaseNote}>
        当前版本不提供付费服务。正式商业发行前，运营主体、联系渠道与适用地区会在本页及应用商店页面补全并再次征得同意。
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 44 },
  back: { minHeight: 44, paddingHorizontal: 16 },
  header: { maxWidth: 760, marginBottom: 24 },
  kicker: { color: colors.primary, fontSize: 12, fontWeight: "900", letterSpacing: 0.7 },
  title: { color: colors.ink, fontSize: 38, lineHeight: 46, fontWeight: "900", marginTop: 8 },
  summary: { color: colors.muted, fontSize: 16, lineHeight: 25, marginTop: 12 },
  card: { backgroundColor: colors.surface, borderRadius: radii.large, paddingHorizontal: 24, ...shadows.card },
  section: { paddingVertical: 22 },
  divider: { borderTopWidth: 1, borderTopColor: colors.faint },
  sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: "900", marginBottom: 8 },
  body: { color: colors.muted, fontSize: 14, lineHeight: 23 },
  releaseNote: { color: colors.muted, fontSize: 12, lineHeight: 19, marginTop: 18, marginHorizontal: 6 },
});
