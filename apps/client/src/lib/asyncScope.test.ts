import { describe, expect, it } from "vitest";
import { createAsyncScope } from "./asyncScope";

describe("room async lifecycle", () => {
  it("accepts concurrent work belonging to the current screen", () => {
    const scope = createAsyncScope();
    expect(scope.capture()()).toBe(true);
    expect(scope.capture()()).toBe(true);
  });

  it("ignores a request that finishes after leaving or retrying", async () => {
    const scope = createAsyncScope();
    const isCurrent = scope.capture();
    const pending = Promise.resolve().then(() => isCurrent());
    scope.invalidate();
    expect(await pending).toBe(false);
    expect(scope.capture()()).toBe(true);
  });

  it("never reactivates callbacks from a previous lifecycle", () => {
    const scope = createAsyncScope();
    const first = scope.capture();
    scope.invalidate();
    const second = scope.capture();
    scope.invalidate();
    expect(first()).toBe(false);
    expect(second()).toBe(false);
    expect(scope.capture()()).toBe(true);
  });
});
