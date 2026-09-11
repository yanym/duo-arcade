// @vitest-environment happy-dom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConfirmSheet } from "./ConfirmSheet";

vi.mock("react-native", () => vi.importActual<typeof import("react-native")>("react-native-web"));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
vi.mock("@/settings/SettingsContext", () => ({
  useSettings: () => ({
    feedback: vi.fn(),
    settings: { highContrast: false, reducedMotion: true },
  }),
}));

afterEach(cleanup);

describe("ConfirmSheet", () => {
  it("allows either choice before submission", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmSheet
        confirmLabel="确认认输"
        detail="本局会立即结束"
        onCancel={onCancel}
        onConfirm={onConfirm}
        title="确定认输吗？"
        visible
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "继续留在这里" }));
    fireEvent.click(screen.getByRole("button", { name: "确认认输" }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("blocks duplicate confirmation and cancellation while the server finishes", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmSheet
        confirmLabel="确认认输"
        confirming
        detail="本局会立即结束"
        onCancel={onCancel}
        onConfirm={onConfirm}
        title="确定认输吗？"
        visible
      />,
    );

    const cancel = screen.getByRole("button", { name: "继续留在这里" });
    const confirm = screen.getByRole("button", { name: "正在结束" });
    expect((cancel as HTMLButtonElement).disabled).toBe(true);
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    expect(confirm.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(cancel);
    fireEvent.click(confirm);
    expect(onCancel).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
