import { router } from "expo-router";
import { Component, type ErrorInfo, type PropsWithChildren } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ScaledText";

import { colors, radii } from "@/theme";

type State = { error: Error | null };

export class AppErrorBoundary extends Component<PropsWithChildren, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Duo Arcade render failure", { name: error.name, componentStack: info.componentStack });
  }

  private recover = (): void => {
    this.setState({ error: null });
    router.replace("/");
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View accessibilityLiveRegion="assertive" accessibilityRole="alert" style={styles.screen}>
        <View style={styles.card}>
          <Text style={styles.kicker}>Duo Arcade 安全兜底</Text>
          <Text accessibilityRole="header" style={styles.title}>页面暂时没能正常显示</Text>
          <Text style={styles.body}>房间数据仍由服务器保存。返回大厅后可以用原房间码重新进入，不会因为这个页面错误改变胜负。</Text>
          <Pressable accessibilityRole="button" onPress={this.recover} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
            <Text style={styles.buttonText}>返回大厅并重试</Text>
          </Pressable>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: 520, alignItems: "center", justifyContent: "center", backgroundColor: colors.canvas, padding: 24 },
  card: { width: "100%", maxWidth: 520, backgroundColor: colors.surface, borderRadius: radii.large, padding: 28, borderWidth: 1.5, borderColor: colors.faint },
  kicker: { color: colors.coralInk, fontSize: 11, fontWeight: "900", letterSpacing: 0.8 },
  title: { color: colors.ink, fontSize: 25, lineHeight: 32, fontWeight: "900", marginTop: 8 },
  body: { color: colors.muted, fontSize: 14, lineHeight: 22, marginTop: 10 },
  button: { minHeight: 52, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary, borderRadius: radii.medium, marginTop: 22, paddingHorizontal: 18 },
  pressed: { opacity: 0.8 },
  buttonText: { color: colors.surface, fontSize: 15, fontWeight: "900" },
});
