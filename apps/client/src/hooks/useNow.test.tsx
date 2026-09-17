// @vitest-environment happy-dom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useNow } from "./useNow";

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("room clock activation", () => {
  it("does not add a phantom second when an interval-driven turn or reconnect deadline changes", () => {
    vi.useFakeTimers(); vi.setSystemTime(1000);
    const hook = renderHook(({ deadline }) => useNow(true, 500, deadline), { initialProps: { deadline: 21_000 } });
    vi.setSystemTime(1250);
    hook.rerender({ deadline: 21_250 });
    expect(Math.ceil((21_250 - hook.result.current) / 1000)).toBe(20);
    expect(vi.getTimerCount()).toBe(1);
    vi.setSystemTime(1400);
    hook.rerender({ deadline: 61_400 });
    expect(Math.ceil((61_400 - hook.result.current) / 1000)).toBe(60);
    expect(vi.getTimerCount()).toBe(1);
    act(() => vi.advanceTimersByTime(500));
    expect(hook.result.current).toBe(1900);
    hook.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("refreshes before the first frame after a long lobby wait and on resume", () => {
    vi.useFakeTimers(); vi.setSystemTime(1000);
    const hook = renderHook(({ active }) => useNow(active, 100), { initialProps: { active: false } });
    vi.setSystemTime(61_000);
    hook.rerender({ active: true });
    expect(hook.result.current).toBe(61_000);
    hook.rerender({ active: false });
    expect(vi.getTimerCount()).toBe(0);
    vi.setSystemTime(91_000);
    hook.rerender({ active: true });
    expect(hook.result.current).toBe(91_000);
    act(() => vi.advanceTimersByTime(100));
    expect(hook.result.current).toBe(91_100);
  });

  it("refreshes a new slow-game deadline without adding a polling interval", () => {
    vi.useFakeTimers(); vi.setSystemTime(1000);
    const hook = renderHook(({ deadline }) => useNow(true, null, deadline), { initialProps: { deadline: 5000 } });
    vi.setSystemTime(4000);
    hook.rerender({ deadline: 9000 });
    expect(hook.result.current).toBe(4000);
    expect(vi.getTimerCount()).toBe(1);
    act(() => vi.advanceTimersByTime(5016));
    expect(hook.result.current).toBe(9016);
    expect(vi.getTimerCount()).toBe(0);
  });
});
