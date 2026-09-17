import { describe, expect, it } from "vitest";
import { createGameState, DEFAULT_GAME_OPTIONS, GAME_PACES, GAME_LENGTHS, type GameOptions } from "@duo/game-core";
import { GAMES, GAME_INFO, getConfiguredGameInfo, getRoomOptionsCopy } from "./games";
import { translate } from "../i18n";

describe("configured room instructions", () => {
  it("describes random meteor placement without claiming a random countdown", () => {
    const info = getConfiguredGameInfo("meteor_dash", DEFAULT_GAME_OPTIONS);
    const english = translate(info.rules, "en");
    expect(info.rules).toContain("随机信标");
    expect(info.rules).not.toContain("随机倒计时");
    expect(english).toContain("a random beacon");
    expect(english).toContain("all rounds are played");
  });
  for (const pace of GAME_PACES) {
    it(`Gomoku ${pace} rules are fully translated with the selected duration`, () => {
      const english = translate(getConfiguredGameInfo("gomoku", { ...DEFAULT_GAME_OPTIONS, pace }).rules, "en");
      expect(english).not.toMatch(/[\u3400-\u9fff]/u);
      expect(english).toContain(pace === "relaxed" ? "60" : pace === "blitz" ? "15" : "30");
      expect(english).toContain("five");
    });
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
    it(`only teaches available ${difficulty} Pulse Pass actions and match-long resources`, () => {
      const options = { ...DEFAULT_GAME_OPTIONS, difficulty };
      const state = createGameState("pulse_pass", 0, 1000, 123, options);
      if (state.kind !== "pulse_pass") throw new Error("Unexpected game");
      const info = getConfiguredGameInfo("pulse_pass", options);
      const english = translate(info.rules, "en");
      expect(english).toContain(state.availablePowers.map((power) => `+${power}`).join(", "));
      expect(english).toContain("scores for your opponent");
      if (state.initialVentCharges === 0) {
        expect(english).toContain("No vents at this difficulty");
        expect(translate(info.tutorialSteps[2]!, "en")).toBe("No vents at this difficulty");
        expect(translate(info.proTip, "en")).not.toMatch(/vent/i);
      } else {
        expect(english).toContain(`Each player has ${state.initialVentCharges} vent`);
        expect(english).toContain("for the whole match");
        expect(english).toContain("lowers charge by 2");
      }
      if (difficulty === "easy") expect([english, ...info.tutorialSteps.map((step) => translate(step, "en"))].join(" ")).not.toMatch(/Overload|overload|\+3/);
    });
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
      expect(state.scanCharges).toBeGreaterThan(0);
      expect(info.rules).toContain(`扫描 ${state.scanCharges} 次`);
      expect(info.tutorialSteps[1]).toContain(`扫描 ${state.scanCharges} 次`);
      expect(translate(info.rules, "en")).toContain(`${state.covers} cover spots`);
      expect(translate(info.rules, "en")).toContain(`${state.scanCharges} scan${state.scanCharges === 1 ? "" : "s"}`);
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
      it(`${game.id} translates configured rules and tutorial for option profile ${profile + 1}`, () => {
        const info = getConfiguredGameInfo(game.id, options);
        for (const copy of [info.rules, ...info.tutorialSteps, info.proTip]) {
          expect(translate(copy, "en"), copy).not.toMatch(/[\u3400-\u9fff]/u);
        }
      });
    });
  }
});
