import { describe, expect, it } from "vitest";
import { coverAction, coverPlacement } from "./coverInteraction";

const hunting = { phase: "hunting" as const, hunterSeat: 0 as const, scanCharges: 0, result: null };
describe("cover interaction safety", () => {
  it("never converts an exhausted scan into a shot", () => {
    expect(coverAction(hunting, 0, "playing", "scan")).toBeNull();
    expect(coverAction(hunting, 0, "playing", "shoot")).toBe("shoot");
  });
  it("allows only the current role's legal action", () => {
    expect(coverAction({ ...hunting, scanCharges: 1 }, 0, "playing", "scan")).toBe("scan");
    expect(coverAction(hunting, 1, "playing", "shoot")).toBeNull();
    expect(coverAction({ ...hunting, phase: "hiding" }, 1, "playing", "scan")).toBe("hide");
    expect(coverAction({ ...hunting, phase: "hiding" }, 0, "playing", "shoot")).toBeNull();
  });
  it("disables interaction during recovery and after the round", () => {
    expect(coverAction(hunting, 0, "reconnect_grace", "shoot")).toBeNull();
    expect(coverAction({ ...hunting, phase: "round_result" }, 0, "playing", "shoot")).toBeNull();
    expect(coverAction(hunting, 0, "completed", "shoot")).toBeNull();
  });
  for (const compact of [false, true]) for (const covers of [4, 5, 6]) {
    it(`keeps ${covers} targets separate in ${compact ? "compact" : "wide"} layout`, () => {
      const rects = Array.from({ length: covers }, (_, index) => coverPlacement(index, covers, compact));
      for (const [index, rect] of rects.entries()) {
        expect(rect.left).toBeGreaterThanOrEqual(0);
        expect(rect.left + rect.width).toBeLessThanOrEqual(100);
        if (compact) expect(rect.width / 100 * 238).toBeGreaterThanOrEqual(44);
        for (const other of rects.slice(index + 1)) {
          const xOverlap = rect.left < other.left + other.width && other.left < rect.left + rect.width;
          const yOverlap = rect.bottom < other.bottom + other.height && other.bottom < rect.bottom + rect.height;
          expect(xOverlap && yOverlap).toBe(false);
        }
      }
    });
  }
});
