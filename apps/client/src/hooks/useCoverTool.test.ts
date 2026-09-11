// @vitest-environment happy-dom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useCoverTool } from "./useCoverTool";

afterEach(cleanup);
describe("cover tool selection", () => {
  it("does not automatically select shooting when the final scan is consumed", () => {
    const { result, rerender } = renderHook(({ round, charges }) => useCoverTool(round, charges), { initialProps: { round: 1, charges: 2 } });
    rerender({ round: 1, charges: 0 });
    expect(result.current.tool).toBe("scan");
    act(() => result.current.chooseTool("shoot"));
    expect(result.current.tool).toBe("shoot");
  });
  it("also preserves scanning after advancing to a new round", () => {
    const { result, rerender } = renderHook(({ round, charges }) => useCoverTool(round, charges), { initialProps: { round: 1, charges: 0 } });
    rerender({ round: 2, charges: 2 });
    expect(result.current.tool).toBe("scan");
    rerender({ round: 2, charges: 0 });
    expect(result.current.tool).toBe("scan");
  });
  it("starts in shooting mode when a round has no scans", () => {
    const { result } = renderHook(() => useCoverTool(1, 0));
    expect(result.current.tool).toBe("shoot");
  });
});
