import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { colors } from "@/theme";
import { SettingsProvider, useSettings } from "@/settings/SettingsContext";

if (Platform.OS !== "web") {
  void SplashScreen.preventAutoHideAsync().catch(() => undefined);
}

function AppStack() {
  const { ready, settings } = useSettings();
  useEffect(() => {
    if (ready && Platform.OS !== "web") {
      void SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [ready]);
  if (!ready) return null;
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.canvas },
          animation: settings.reducedMotion ? "none" : Platform.OS === "ios" ? "default" : "fade",
          gestureEnabled: true,
        }}
      />
    </>
  );
}

export default function RootLayout() {
  return (
    <AppErrorBoundary>
      <SafeAreaProvider>
        <SettingsProvider>
          <AppStack />
        </SettingsProvider>
      </SafeAreaProvider>
    </AppErrorBoundary>
  );
}
