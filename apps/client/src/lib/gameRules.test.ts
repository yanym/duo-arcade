import { describe, expect, it } from "vitest";
import { createGameState, DEFAULT_GAME_OPTIONS, GAME_PACES, GAME_LENGTHS, type GameOptions } from "@duo/game-core";
import { GAMES, GAME_INFO, getConfiguredGameInfo, getRoomOptionsCopy } from "./games";
import { translate } from "../i18n";

describe("configured room instructions", () => {
  for (const pace of GAME_PACES) {
    for (const gameId of ["gomoku", "split_maze"] as const) {
      it(`${gameId} copy matches the authoritative ${pace} duration`, () => {
        const options = { ...DEFAULT_GAME_OPTIONS, pace };
        const now = 1000;
        const state = createGameState(gameId, 0, now, 123, options);
        expect(getConfiguredGameInfo(gameId, options).rules).toContain(`${(state.turnDeadline! - now) / 1000} 秒`);
      });
    }
  }
  for (const length of GAME_LENGTHS) {
    it(`sync challenge copy matches the ${length} round count`, () => {
      const options = { ...DEFAULT_GAME_OPTIONS, length };
      const state = createGameState("sync_tap", 0, 1000, 123, options);
      if (state.kind !== "sync_tap") throw new Error("Unexpected game");
      expect(getConfiguredGameInfo("sync_tap", options).rules).toContain(`共 ${state.totalRounds} 轮`);
    });
  }
  it("does not mutate shared default instructions", () => {
    const original = GAME_INFO.gomoku.rules;
    getConfiguredGameInfo("gomoku", { ...DEFAULT_GAME_OPTIONS, pace: "blitz" });
    expect(GAME_INFO.gomoku.rules).toBe(original);
  });
  for (const difficulty of ["easy", "standard", "hard"] as const) {
    it(`describes ${difficulty} orbital rings accurately`, () => {
      const options = { ...DEFAULT_GAME_OPTIONS, difficulty };
      const state = createGameState("orbital_repair", 0, 1000, 123, options);
      if (state.kind !== "orbital_repair") throw new Error("Unexpected game");
      const info = getConfiguredGameInfo("orbital_repair", options);
      expect(info.tutorialSteps[0]).toContain(state.ringCount === 2 ? "外、中两环" : "外、中、内三环");
    });
    it(`describes ${difficulty} cover scans accurately`, () => {
      const options = { ...DEFAULT_GAME_OPTIONS, difficulty };
      const state = createGameState("cover_hunt", 0, 1000, 123, options);
      if (state.kind !== "cover_hunt") throw new Error("Unexpected game");
      const info = getConfiguredGameInfo("cover_hunt", options);
      expect(info.rules).toContain(`${state.covers} 处掩体`);
      expect(info.rules).toContain(state.scanCharges ? `扫描 ${state.scanCharges} 次` : "没有扫描");
      if (!state.scanCharges) expect(info.tutorialSteps[1]).toContain("没有扫描");
    });
  }

  const optionProfiles: GameOptions[] = [
    { pace: "relaxed", difficulty: "easy", length: "short" },
    DEFAULT_GAME_OPTIONS,
    { pace: "blitz", difficulty: "hard", length: "long" },
  ];
  for (const game of GAMES) {
    optionProfiles.forEach((options, profile) => {
      it(`${game.id} has a complete English room summary for option profile ${profile + 1}`, () => {
        const english = translate(getRoomOptionsCopy(game.id, options), "en");
        expect(english).not.toMatch(/[\u3400-\u9fff]/u);
        expect(english).not.toMatch(/节奏|难度|局/u);
        expect(english).toContain("pace");
      });
    });
  }
});
