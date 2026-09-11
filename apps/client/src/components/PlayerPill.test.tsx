// @vitest-environment happy-dom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PlayerView } from "@duo/protocol";

import { LanguageContext } from "@/i18n";
import { PlayerPill } from "./PlayerPill";

vi.mock("react-native", () => vi.importActual<typeof import("react-native")>("react-native-web"));

const player: PlayerView = {
  connected: true,
  id: "player-one",
  isAi: false,
  nickname: "Alex",
  piece: 1,
  ready: false,
  roleLabel: "黑方",
  seat: 0,
};

afterEach(cleanup);

describe("PlayerPill multiplayer state", () => {
  it("distinguishes an empty seat from a disconnected player for assistive technology", () => {
    const { rerender } = render(
      <LanguageContext.Provider value="en">
        <PlayerPill active={false} isYou={false} player={null} />
      </LanguageContext.Provider>,
    );
    expect(screen.getByLabelText("Waiting for player two")).toBeTruthy();
    expect(screen.getByText("Waiting")).toBeTruthy();
    expect(screen.getByText("Not here yet")).toBeTruthy();

    rerender(
      <LanguageContext.Provider value="en">
        <PlayerPill active={false} isYou player={{ ...player, connected: false }} />
      </LanguageContext.Provider>,
    );
    expect(screen.getByLabelText("Alex, You, Black, Temporarily offline")).toBeTruthy();
    expect(screen.getByText("You · Black · Temporarily offline")).toBeTruthy();
  });

  it("announces an active AI seat as acting", () => {
    render(
      <LanguageContext.Provider value="en">
        <PlayerPill
          actionLabel="落子"
          active
          aiActing
          isYou={false}
          player={{ ...player, id: "ai", isAi: true, nickname: "AI 对手", piece: 2, roleLabel: "白方", seat: 1 }}
          showReady={false}
        />
      </LanguageContext.Provider>,
    );
    expect(screen.getByLabelText("AI Opponent, White, Acting, Action: Move")).toBeTruthy();
    expect(screen.getByText("Acting", { exact: false })).toBeTruthy();
  });

  it("does not call an AI seat acting merely because a cooperative role is actionable", () => {
    render(
      <LanguageContext.Provider value="en">
        <PlayerPill
          active
          isYou={false}
          player={{ ...player, id: "ai", isAi: true, nickname: "AI 搭档", piece: 2, roleLabel: "控制上下", seat: 1 }}
          showReady={false}
        />
      </LanguageContext.Provider>,
    );
    expect(screen.getByLabelText("AI Partner, Vertical controls, Online, Action: Action")).toBeTruthy();
    expect(screen.queryByText("Acting", { exact: false })).toBeNull();
  });

  it("prioritizes the role over redundant online copy in the compact visual status", () => {
    render(
      <LanguageContext.Provider value="en">
        <PlayerPill active={false} isYou player={{ ...player, roleLabel: "控制左右" }} />
      </LanguageContext.Provider>,
    );
    expect(screen.getByLabelText("Alex, You, Horizontal controls, Online")).toBeTruthy();
    expect(screen.getByText("You · Horizontal controls")).toBeTruthy();
  });
});
