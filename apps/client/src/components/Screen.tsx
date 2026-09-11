import { useLayoutEffect, useRef, type PropsWithChildren, type RefObject } from "react";
import { Platform, ScrollView, StyleSheet, View } from "react-native";
import { usePathname } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors } from "@/theme";

type ScreenProps = PropsWithChildren<{
  scrollRef?: RefObject<ScrollView | null>;
  scrollResetKey?: string | number | null;
}>;

export function Screen({ children, scrollRef, scrollResetKey }: ScreenProps) {
  const internalScrollRef = useRef<ScrollView | null>(null);
  const activeScrollRef = scrollRef ?? internalScrollRef;
  const pathname = usePathname();

  useLayoutEffect(() => {
    const resetScroll = () => {
      activeScrollRef.current?.scrollTo({ animated: false, y: 0 });
      if (Platform.OS === "web" && typeof globalThis.scrollTo === "function") globalThis.scrollTo({ top: 0 });
    };
    resetScroll();
    const frame = requestAnimationFrame(resetScroll);
    const earlyTimer = setTimeout(resetScroll, 80);
    const focusRecoveryTimer = setTimeout(resetScroll, 280);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(earlyTimer);
      clearTimeout(focusRecoveryTimer);
    };
  }, [activeScrollRef, pathname, scrollResetKey]);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom", "left", "right"]}>
      <View style={[styles.decorLayer, { pointerEvents: "none" }]}>
        <View style={styles.decorOne} />
        <View style={styles.decorTwo} />
      </View>
      <ScrollView
        automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
        contentContainerStyle={styles.content}
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        keyboardShouldPersistTaps="handled"
        ref={activeScrollRef}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  decorLayer: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, overflow: "hidden" },
  content: {
    width: "100%",
    maxWidth: 1120,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32
  },
  decorOne: {
    position: "absolute",
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: colors.primarySoft,
    top: -170,
    right: -130
  },
  decorTwo: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: colors.tealSoft,
    bottom: -130,
    left: -100
  }
});
