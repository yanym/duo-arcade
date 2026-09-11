import { StyleSheet } from "react-native";
import { describe, expect, it, vi } from "vitest";

import { createGameStyles } from "./theme";

vi.mock("react-native", () => vi.importActual<typeof import("react-native")>("react-native-web"));

describe("game typography safeguards", () => {
  it("raises dense game captions to the minimum readable size", () => {
    const styles = createGameStyles({
      caption: { color: "#FFFFFF", fontSize: 7, lineHeight: 10 },
      label: { color: "#FFFFFF", fontSize: 13, lineHeight: 18 },
    });

    expect(StyleSheet.flatten(styles.caption)).toMatchObject({ fontSize: 11, lineHeight: 14 });
    expect(StyleSheet.flatten(styles.label)).toMatchObject({ fontSize: 13, lineHeight: 18 });
  });

  it("does not invent line height when a caption did not specify one", () => {
    const styles = createGameStyles({ caption: { fontSize: 9 } });

    expect(StyleSheet.flatten(styles.caption)).toEqual({ fontSize: 11 });
  });
});
