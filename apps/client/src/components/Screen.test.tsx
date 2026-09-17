// @vitest-environment happy-dom
import React, { forwardRef, useImperativeHandle } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Screen } from "./Screen";

const { scrollTo } = vi.hoisted(() => ({ scrollTo: vi.fn() }));
vi.mock("react-native", async () => ({
  ...await vi.importActual<typeof import("react-native")>("react-native-web"),
  ScrollView: forwardRef(function MockScrollView({ children }: React.PropsWithChildren, ref) {
    useImperativeHandle(ref, () => ({ scrollTo }));
    return <div>{children}</div>;
  }),
}));
vi.mock("expo-router", () => ({ usePathname: () => "/room/ABCDEF" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: ({ children }: React.PropsWithChildren) => <div>{children}</div> }));
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal("scrollTo", vi.fn()); scrollTo.mockClear(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("screen reset destination", () => {
  it("keeps delayed focus recovery at the gameplay destination, not the page header", () => {
    const view = render(<Screen scrollResetKey="playing" scrollResetOffset={260}>Game</Screen>);
    act(() => vi.advanceTimersByTime(300));
    expect(scrollTo.mock.calls.length).toBeGreaterThan(1);
    expect(scrollTo.mock.calls.every(([options]) => options.y === 260 && !options.animated)).toBe(true);
    scrollTo.mockClear();
    view.rerender(<Screen scrollResetKey="playing" scrollResetOffset={260}>Next segment</Screen>);
    expect(scrollTo).not.toHaveBeenCalled();
    view.rerender(<Screen scrollResetKey="reconnect_grace">Connection recovery</Screen>);
    expect(scrollTo).toHaveBeenLastCalledWith({ animated: false, y: 0 });
  });
});
