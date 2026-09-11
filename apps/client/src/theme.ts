import { Platform, StyleSheet } from "react-native";

export const colors = {
  canvas: "#F7F4ED",
  surface: "#FFFFFF",
  ink: "#20212A",
  muted: "#6A6B78",
  faint: "#E8E4DA",
  primary: "#5B5CE2",
  primaryDark: "#4142B8",
  primarySoft: "#ECECFF",
  coral: "#F06449",
  coralInk: "#B73B2B",
  coralSoft: "#FFF0EC",
  teal: "#16A394",
  tealInk: "#0B7468",
  tealSoft: "#E5F7F3",
  amber: "#F3C969",
  board: "#E8BE72",
  boardLine: "#7A572D",
  success: "#14866D",
  danger: "#B73B2B",
  shadow: "#312E4A"
} as const;

export const radii = {
  small: 10,
  medium: 16,
  large: 24,
  pill: 999
} as const;

export const shadows = {
  card: Platform.OS === "web"
    ? { boxShadow: "0 7px 18px rgba(49, 46, 74, 0.08)" }
    : {
        shadowColor: colors.shadow,
        shadowOpacity: 0.08,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 7 },
        elevation: 3
      }
} as const;

/**
 * Game boards pack more telemetry into a phone-sized surface than the rest of
 * the app. Keep their smallest captions at iOS Caption 2 size so decorative
 * labels never become unreadable, while preserving each game's visual system.
 */
export function createGameStyles<T extends StyleSheet.NamedStyles<T>>(styles: T): T {
  const normalized = Object.fromEntries(
    Object.entries(styles as Record<string, object>).map(([name, style]) => {
      const next = { ...style } as Record<string, unknown>;
      if (typeof next.fontSize === "number" && next.fontSize < 11) {
        next.fontSize = 11;
        if (typeof next.lineHeight === "number" && next.lineHeight < 14) next.lineHeight = 14;
      }
      return [name, next];
    }),
  ) as unknown as T;
  return StyleSheet.create(normalized);
}
