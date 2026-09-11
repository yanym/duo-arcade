// @vitest-environment happy-dom
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageContext } from "@/i18n";
import { Text } from "./ScaledText";

vi.mock("react-native", () => vi.importActual<typeof import("react-native")>("react-native-web"));

afterEach(cleanup);

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
