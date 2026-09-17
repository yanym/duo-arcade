// @vitest-environment happy-dom
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageContext } from "@/i18n";
import { Text, TextInput } from "./ScaledText";

const display = vi.hoisted(() => ({ os: "web", width: 390, height: 844, scale: 3, fontScale: 1 }));
vi.mock("react-native", async () => {
  const native = await vi.importActual<typeof import("react-native")>("react-native-web");
  return { ...native, Platform: { ...native.Platform, get OS() { return display.os; } }, useWindowDimensions: () => display };
});

afterEach(() => {
  cleanup();
  Object.assign(display, { os: "web", width: 390, height: 844, scale: 3, fontScale: 1 });
});

describe("iOS live text scaling", () => {
  it("refreshes native text measurement when the effective Dynamic Type size changes", () => {
    display.os = "ios";
    const view = render(<Text>Relaxed</Text>);
    const initial = view.container.firstElementChild;
    display.fontScale = 1.3;
    view.rerender(<Text>Relaxed</Text>);
    expect(view.container.firstElementChild).not.toBe(initial);
    expect(view.container.textContent).toBe("Relaxed");
  });

  it("does not replace text on ordinary resize or after its scaling cap is reached", () => {
    Object.assign(display, { os: "ios", fontScale: 1.4 });
    const view = render(<Text>Ready</Text>);
    const initial = view.container.firstElementChild;
    Object.assign(display, { width: 844, height: 390, fontScale: 1.8 });
    view.rerender(<Text>Ready</Text>);
    expect(view.container.firstElementChild).toBe(initial);
  });

  it.each(["web", "ios"])("preserves unscaled text and editable input identity on %s", (os) => {
    display.os = os;
    const content = () => <><Text allowFontScaling={false}>01</Text><TextInput value="Happy Fox" onChangeText={() => {}} /></>;
    const view = render(content());
    const initialText = view.container.firstElementChild;
    const initialInput = view.container.querySelector("input");
    display.fontScale = 1.3;
    view.rerender(content());
    expect(view.container.firstElementChild).toBe(initialText);
    expect(view.container.querySelector("input")).toBe(initialInput);
    expect(view.container.querySelector("input")?.value).toBe("Happy Fox");
  });
});

describe("ScaledText localization", () => {
  it("translates JSX fragments split around values", () => {
    const view = render(
      <LanguageContext.Provider value="en">
        <Text>第 {3} 轮</Text>
      </LanguageContext.Provider>,
    );
    expect(view.container.textContent?.trim()).toBe("Round 3");
  });

  it("uses English punctuation and spacing between translated fragments", () => {
    const view = render(
      <LanguageContext.Provider value="en">
        <Text>{"建议你"}：{"向右移动一步"}</Text>
        <Text>{"你的任务："}{"只控制左右"}</Text>
      </LanguageContext.Provider>,
    );
    expect(view.container.textContent).toBe("Your move: Move one step rightYour role: Horizontal control only");
  });

  it("preserves whitespace-only children and Chinese copy", () => {
    const spaces = render(<Text>{"  "}</Text>);
    expect(spaces.container.textContent).toBe("  ");
    cleanup();
    const chinese = render(
      <LanguageContext.Provider value="zh">
        <Text> 你的任务： {3}</Text>
      </LanguageContext.Provider>,
    );
    expect(chinese.container.textContent).toBe(" 你的任务： 3");
  });

  it("localizes accessibility labels", () => {
    const view = render(
      <LanguageContext.Provider value="en">
        <Text accessibilityLabel="房间码不正确">Error</Text>
      </LanguageContext.Provider>,
    );
    expect(view.container.querySelector("[aria-label='Invalid room code']")).toBeTruthy();
  });
});
