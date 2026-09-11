// @vitest-environment happy-dom
import React, { type ReactElement } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_GAME_OPTIONS,
  GAME_IDS,
  createGameState,
  getGameView,
  type GameId,
  type Seat,
} from "@duo/game-core";

import { LanguageContext, translate } from "@/i18n";
import { GAMES } from "@/lib/games";
import { CoreRallyGame } from "./CoreRallyGame";
import { CoverHuntGame } from "./CoverHuntGame";
import { DropRescueGame } from "./DropRescueGame";
import { DualThrustersGame } from "./DualThrustersGame";
import { EchoRelayGame } from "./EchoRelayGame";
import { FogSonarGame } from "./FogSonarGame";
import { GameOptionsPanel } from "./GameOptionsPanel";
import { GomokuBoard } from "./GomokuBoard";
import { LumenBridgeGame } from "./LumenBridgeGame";
import { MagnetHaulGame } from "./MagnetHaulGame";
import { MazeBoard } from "./MazeBoard";
import { MeteorDashGame } from "./MeteorDashGame";
import { NeonDashGame } from "./NeonDashGame";
import { NovaVolleyGame } from "./NovaVolleyGame";
import { OrbitalRepairGame } from "./OrbitalRepairGame";
import { PrismHeistGame } from "./PrismHeistGame";
import { PulsePassGame } from "./PulsePassGame";
import { QuantumDuelGame } from "./QuantumDuelGame";
import { ReversiBoard } from "./ReversiBoard";
import { RhythmGravityGame } from "./RhythmGravityGame";
import { ShadowShuttleGame } from "./ShadowShuttleGame";
import { SignalBluffGame } from "./SignalBluffGame";
import { SkylineRescueGame } from "./SkylineRescueGame";
import { StarTraceGame } from "./StarTraceGame";
import { StarshipDefuseGame } from "./StarshipDefuseGame";
import { StarwayEscortGame } from "./StarwayEscortGame";
import { StormGridGame } from "./StormGridGame";
import { SyncTapGame } from "./SyncTapGame";
import { TrajectoryInterceptGame } from "./TrajectoryInterceptGame";
import { TutorialOverlay } from "./TutorialOverlay";

vi.mock("react-native", () => vi.importActual<typeof import("react-native")>("react-native-web"));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }) }));
vi.mock("@/settings/SettingsContext", () => ({
  useSettings: () => ({
    feedback: vi.fn(),
    playSound: vi.fn(),
    settings: { highContrast: false, reducedMotion: true },
  }),
}));

const assetRequire = require as unknown as {
  extensions: Record<string, (module: { exports: unknown }, filename: string) => void>;
};
const loadAsset = (module: { exports: unknown }, filename: string) => { module.exports = filename; };
assetRequire.extensions[".jpg"] = loadAsset;
assetRequire.extensions[".png"] = loadAsset;

const noop = () => undefined;
const NOW = 1_001;

function chineseFragments(container: HTMLElement): string[] {
  const fragments = new Set<string>();
  for (const element of [container, ...container.querySelectorAll("*")]) {
    for (const node of element.childNodes) {
      if (node.nodeType !== 3) continue;
      const value = node.textContent?.trim();
      if (value && /[一-龥]/.test(value)) fragments.add(value);
    }
  }
  for (const element of container.querySelectorAll("[aria-label]")) {
    const value = element.getAttribute("aria-label")?.trim();
    if (value && /[一-龥]/.test(value)) fragments.add(`aria-label: ${value}`);
  }
  return [...fragments];
}

function fusedEnglishFragments(container: HTMLElement): string[] {
  const fragments = new Set<string>();
  for (const element of [container, ...container.querySelectorAll("*")]) {
    for (const node of element.childNodes) {
      if (node.nodeType !== 3) continue;
      const value = node.textContent?.trim();
      if (value && /[a-z][A-Z]/.test(value.replaceAll("iPhone", "iphone"))) fragments.add(value);
    }
  }
  return [...fragments];
}

function fullWidthPunctuationFragments(container: HTMLElement): string[] {
  const fragments = new Set<string>();
  for (const element of [container, ...container.querySelectorAll("*")]) {
    for (const node of element.childNodes) {
      if (node.nodeType !== 3) continue;
      const value = node.textContent?.trim();
      if (value && /[，。：；！？、]/u.test(value)) fragments.add(value);
    }
  }
  for (const element of container.querySelectorAll("[aria-label]")) {
    const value = element.getAttribute("aria-label")?.trim();
    if (value && /[，。：；！？、]/u.test(value)) fragments.add(`aria-label: ${value}`);
  }
  return [...fragments];
}

function unnamedInteractiveElements(container: HTMLElement): string[] {
  return [...container.querySelectorAll("button, input, select, textarea, [role='button'], [role='radio'], [role='switch']")]
    .filter((element) => {
      const name = element.getAttribute("aria-label")
        ?? element.getAttribute("title")
        ?? element.getAttribute("placeholder")
        ?? element.textContent;
      return !name?.trim();
    })
    .map((element) => element.outerHTML.slice(0, 180));
}

function gameElement(gameId: GameId, ownSeat: Seat): ReactElement {
  const state = createGameState(gameId, 0, 1_000, 42, DEFAULT_GAME_OPTIONS);
  const game = getGameView(state, ownSeat);
  switch (game.kind) {
    case "gomoku": return <GomokuBoard canPlay={game.currentSeat === ownSeat} game={game} onPlace={noop} phase="playing" />;
    case "reversi": return <ReversiBoard game={game} onPlace={noop} ownSeat={ownSeat} phase="playing" />;
    case "split_maze": return <MazeBoard game={game} onMove={noop} ownSeat={ownSeat} phase="playing" />;
    case "sync_tap": return <SyncTapGame game={game} now={NOW} onTap={noop} ownSeat={ownSeat} phase="playing" />;
    case "cover_hunt": return <CoverHuntGame game={game} onHide={noop} onScan={noop} onShoot={noop} ownSeat={ownSeat} phase="playing" />;
    case "starship_defuse": return <StarshipDefuseGame game={game} onPressSymbol={noop} ownSeat={ownSeat} phase="playing" />;
    case "quantum_duel": return <QuantumDuelGame game={game} onChoose={noop} ownSeat={ownSeat} phase="playing" />;
    case "starway_escort": return <StarwayEscortGame game={game} onRoute={noop} onShield={noop} ownSeat={ownSeat} phase="playing" />;
    case "orbital_repair": return <OrbitalRepairGame game={game} onLaunch={noop} onRotate={noop} ownSeat={ownSeat} phase="playing" />;
    case "rhythm_gravity": return <RhythmGravityGame game={game} now={NOW} onTap={noop} ownSeat={ownSeat} phase="playing" />;
    case "shadow_shuttle": return <ShadowShuttleGame game={game} onGuess={noop} onMark={noop} ownSeat={ownSeat} phase="playing" />;
    case "echo_relay": return <EchoRelayGame game={game} onPressTone={noop} ownSeat={ownSeat} phase="playing" />;
    case "core_rally": return <CoreRallyGame game={game} now={NOW} onMove={noop} onReturn={noop} ownSeat={ownSeat} phase="playing" />;
    case "skyline_rescue": return <SkylineRescueGame game={game} onAim={noop} onPressure={noop} ownSeat={ownSeat} phase="playing" />;
    case "meteor_dash": return <MeteorDashGame game={game} now={NOW} onCatch={noop} ownSeat={ownSeat} phase="playing" />;
    case "dual_thrusters": return <DualThrustersGame game={game} onChoosePower={noop} ownSeat={ownSeat} phase="playing" />;
    case "fog_sonar": return <FogSonarGame game={game} onPing={noop} onSteer={noop} ownSeat={ownSeat} phase="playing" />;
    case "storm_grid": return <StormGridGame game={game} onDischarge={noop} onShift={noop} onToggle={noop} ownSeat={ownSeat} phase="playing" />;
    case "trajectory_intercept": return <TrajectoryInterceptGame game={game} onCapture={noop} onMove={noop} ownSeat={ownSeat} phase="playing" />;
    case "star_trace": return <StarTraceGame game={game} onMove={noop} ownSeat={ownSeat} phase="playing" />;
    case "magnet_haul": return <MagnetHaulGame game={game} onMove={noop} ownSeat={ownSeat} phase="playing" />;
    case "lumen_bridge": return <LumenBridgeGame game={game} now={NOW} onAdjust={noop} onLock={noop} ownSeat={ownSeat} phase="playing" />;
    case "neon_dash": return <NeonDashGame game={game} now={NOW} onDodge={noop} ownSeat={ownSeat} phase="playing" />;
    case "signal_bluff": return <SignalBluffGame game={game} now={NOW} onClaim={noop} onJudge={noop} onScan={noop} ownSeat={ownSeat} phase="playing" />;
    case "prism_heist": return <PrismHeistGame game={game} now={NOW} onBypass={noop} onDash={noop} onMove={noop} ownSeat={ownSeat} phase="playing" />;
    case "nova_volley": return <NovaVolleyGame game={game} now={NOW} onMove={noop} onStrike={noop} ownSeat={ownSeat} phase="playing" />;
    case "pulse_pass": return <PulsePassGame game={game} now={NOW} onCharge={noop} onVent={noop} ownSeat={ownSeat} phase="playing" />;
    case "drop_rescue": return <DropRescueGame game={game} now={NOW} onBrake={noop} onLock={noop} onMove={noop} ownSeat={ownSeat} phase="playing" />;
  }
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("all-game English rendering", () => {
  const scenarios = GAME_IDS.flatMap((gameId) => ([0, 1] as Seat[]).map((seat) => [gameId, seat] as const));

  it.each(scenarios)("renders %s seat %s without Chinese UI or labels", (gameId, ownSeat) => {
    const view = render(
      <LanguageContext.Provider value="en">
        {gameElement(gameId, ownSeat)}
      </LanguageContext.Provider>,
    );
    const untranslated = chineseFragments(view.container);
    if (untranslated.length > 0) console.error(`UNTRANSLATED ${gameId} ${ownSeat} ${JSON.stringify(untranslated)}`);
    expect(untranslated, `${gameId} seat ${ownSeat} untranslated copy`).toEqual([]);
    expect(fusedEnglishFragments(view.container), `${gameId} seat ${ownSeat} fused English copy`).toEqual([]);
    expect(fullWidthPunctuationFragments(view.container), `${gameId} seat ${ownSeat} full-width punctuation`).toEqual([]);
    expect(unnamedInteractiveElements(view.container), `${gameId} seat ${ownSeat} unnamed controls`).toEqual([]);
  });

  it.each(GAMES)("renders $id room options without Chinese UI or labels", (game) => {
    const profiles = [
      { pace: "relaxed", difficulty: "easy", length: "short" },
      DEFAULT_GAME_OPTIONS,
      { pace: "blitz", difficulty: "hard", length: "long" },
    ] as const;
    for (const options of profiles) {
      const view = render(
        <LanguageContext.Provider value="en">
          <GameOptionsPanel game={game} onChange={noop} options={options} />
        </LanguageContext.Provider>,
      );
      const untranslated = chineseFragments(view.container);
      if (untranslated.length > 0) console.error(`UNTRANSLATED OPTIONS ${game.id} ${options.difficulty} ${JSON.stringify(untranslated)}`);
      expect(untranslated, `${game.id} ${options.difficulty} room options untranslated copy`).toEqual([]);
      expect(fusedEnglishFragments(view.container), `${game.id} ${options.difficulty} room options fused English copy`).toEqual([]);
      expect(fullWidthPunctuationFragments(view.container), `${game.id} ${options.difficulty} room options full-width punctuation`).toEqual([]);
      expect(unnamedInteractiveElements(view.container), `${game.id} ${options.difficulty} room options unnamed controls`).toEqual([]);
      view.unmount();
    }
  });

  it.each(GAMES)("renders $id tutorial with a natural English heading", (game) => {
    const view = render(
      <LanguageContext.Provider value="en">
        <TutorialOverlay game={game} onClose={noop} visible />
      </LanguageContext.Provider>,
    );
    expect(view.getByRole("heading", { name: `How to play ${translate(game.title, "en")}` })).toBeTruthy();
    expect(view.getByRole("heading").textContent).toMatch(/^How to play .+/);
    expect(view.getByRole("heading").textContent).not.toMatch(/^[^\s]+How to play/);
    expect(chineseFragments(view.container)).toEqual([]);
    expect(fusedEnglishFragments(view.container)).toEqual([]);
    expect(fullWidthPunctuationFragments(view.container)).toEqual([]);
    expect(unnamedInteractiveElements(view.container), `${game.id} tutorial unnamed controls`).toEqual([]);
  });
});
