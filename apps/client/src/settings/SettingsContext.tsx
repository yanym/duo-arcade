import * as Haptics from "expo-haptics";
import * as SecureStore from "expo-secure-store";
import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import { AccessibilityInfo, Platform } from "react-native";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";

import { DEFAULT_AI_OPTIONS, normalizeAiOptions, type AiOptions } from "@duo/game-core";

import { LanguageContext } from "@/i18n";

export type SoundCue =
  | "tap" | "place" | "scan" | "hit" | "success" | "failure"
  | "echoEmber" | "echoTide" | "echoNova" | "echoBloom" | "echoComet";
export type FeedbackWeight = "light" | "medium" | "heavy" | "success" | "warning";

export type AppSettings = {
  language: "zh" | "en";
  ai: AiOptions;
  music: boolean;
  soundEffects: boolean;
  haptics: boolean;
  reducedMotion: boolean;
  highContrast: boolean;
};

const DEFAULT_SETTINGS: AppSettings = {
  language: "zh",
  ai: DEFAULT_AI_OPTIONS,
  music: false,
  soundEffects: true,
  haptics: true,
  reducedMotion: false,
  highContrast: false,
};

const SETTINGS_KEY = "duo.settings.v1";
let memorySettings: string | null = null;
const audioPlayerOptions = { downloadFirst: Platform.OS !== "web" } as const;
const cueSources: Record<SoundCue, number> = {
  tap: require("../../assets/audio/tap.wav"),
  place: require("../../assets/audio/place.wav"),
  scan: require("../../assets/audio/scan.wav"),
  hit: require("../../assets/audio/hit.wav"),
  success: require("../../assets/audio/success.wav"),
  failure: require("../../assets/audio/failure.wav"),
  echoEmber: require("../../assets/audio/echo-ember.wav"),
  echoTide: require("../../assets/audio/echo-tide.wav"),
  echoNova: require("../../assets/audio/echo-nova.wav"),
  echoBloom: require("../../assets/audio/echo-bloom.wav"),
  echoComet: require("../../assets/audio/echo-comet.wav"),
};
const musicSource = require("../../assets/audio/lounge-loop.wav") as number;

function normalizeStoredSettings(raw: string | null): AppSettings {
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      language: parsed.language === "en" ? "en" : "zh",
      ai: normalizeAiOptions(parsed.ai),
      music: parsed.music === true,
      soundEffects: parsed.soundEffects !== false,
      haptics: parsed.haptics !== false,
      reducedMotion: parsed.reducedMotion === true,
      highContrast: parsed.highContrast === true,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function initialSettings(): AppSettings {
  if (Platform.OS !== "web") return DEFAULT_SETTINGS;
  try {
    return normalizeStoredSettings(typeof localStorage === "undefined" ? memorySettings : localStorage.getItem(SETTINGS_KEY));
  } catch {
    return normalizeStoredSettings(memorySettings);
  }
}

function configureMusicPlayer(player: AudioPlayer): void {
  player.loop = true;
  player.volume = 0.18;
}

function configureCuePlayer(player: AudioPlayer, cue: SoundCue): void {
  player.volume = cue === "hit" ? 0.65 : 0.48;
}

async function readSettings(): Promise<AppSettings> {
  let raw: string | null;
  if (Platform.OS === "web") {
    try {
      raw = typeof localStorage === "undefined" ? memorySettings : localStorage.getItem(SETTINGS_KEY);
    } catch {
      raw = memorySettings;
    }
  } else {
    raw = await SecureStore.getItemAsync(SETTINGS_KEY);
  }
  return normalizeStoredSettings(raw);
}

async function persistSettings(settings: AppSettings): Promise<void> {
  const raw = JSON.stringify(settings);
  if (Platform.OS === "web") {
    memorySettings = raw;
    try {
      if (typeof localStorage !== "undefined") localStorage.setItem(SETTINGS_KEY, raw);
    } catch {
      // Keep preferences for this tab when browser storage is restricted.
    }
    return;
  }
  await SecureStore.setItemAsync(SETTINGS_KEY, raw);
}

type SettingsValue = {
  settings: AppSettings;
  ready: boolean;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  resetSettings: () => void;
  playSound: (cue: SoundCue) => void;
  feedback: (cue?: SoundCue, weight?: FeedbackWeight) => void;
  systemReducedMotion: boolean;
};

const SettingsContext = createContext<SettingsValue | null>(null);

export function SettingsProvider({ children }: PropsWithChildren) {
  const [settings, setSettings] = useState<AppSettings>(initialSettings);
  const [systemReducedMotion, setSystemReducedMotion] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(Platform.OS !== "web");
  // Web preferences are read synchronously during initialization. Native preferences
  // stay behind the existing launch screen until SecureStore hydration completes.
  const [ready, setReady] = useState(Platform.OS === "web");
  const cuePlayersRef = useRef(new Map<SoundCue, AudioPlayer>());
  const musicPlayerRef = useRef<AudioPlayer | null>(null);
  const persistenceRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    void readSettings().then((stored) => {
      setSettings(stored);
      setReady(true);
    }).catch(() => setReady(true));
  }, []);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setSystemReducedMotion);
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setSystemReducedMotion);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web" || audioUnlocked) return;
    const unlock = () => setAudioUnlocked(true);
    globalThis.addEventListener("pointerdown", unlock, { once: true });
    globalThis.addEventListener("keydown", unlock, { once: true });
    return () => {
      globalThis.removeEventListener("pointerdown", unlock);
      globalThis.removeEventListener("keydown", unlock);
    };
  }, [audioUnlocked]);

  useEffect(() => {
    if (Platform.OS === "web" && typeof document !== "undefined") {
      document.documentElement.lang = settings.language === "en" ? "en" : "zh-Hans";
    }
  }, [settings.language]);

  useEffect(() => {
    if (!ready) return;
    if (settings.music && audioUnlocked) {
      try {
        const player = musicPlayerRef.current ?? createAudioPlayer(musicSource, audioPlayerOptions);
        if (!musicPlayerRef.current) {
          configureMusicPlayer(player);
          musicPlayerRef.current = player;
        }
        player.play();
      } catch {
        // Audio support must never block navigation or gameplay.
      }
    } else {
      musicPlayerRef.current?.pause();
    }
  }, [audioUnlocked, ready, settings.music]);

  useEffect(() => () => {
    for (const player of cuePlayersRef.current.values()) player.release();
    cuePlayersRef.current.clear();
    musicPlayerRef.current?.release();
    musicPlayerRef.current = null;
  }, []);

  const queuePersistence = useCallback((next: AppSettings) => {
    persistenceRef.current = persistenceRef.current
      .then(() => persistSettings(next))
      .catch(() => undefined);
  }, []);

  const updateSetting = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((current) => {
      const next = { ...current, [key]: value };
      queuePersistence(next);
      return next;
    });
  }, [queuePersistence]);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    queuePersistence(DEFAULT_SETTINGS);
  }, [queuePersistence]);

  const playSound = useCallback((cue: SoundCue) => {
    if (!settings.soundEffects || !audioUnlocked) return;
    try {
      let player = cuePlayersRef.current.get(cue);
      if (!player) {
        player = createAudioPlayer(cueSources[cue], audioPlayerOptions);
        cuePlayersRef.current.set(cue, player);
      }
      configureCuePlayer(player, cue);
      void player.seekTo(0).then(() => player.play()).catch(() => undefined);
    } catch {
      // Keep the action responsive if a browser or device rejects audio setup.
    }
  }, [audioUnlocked, settings.soundEffects]);

  const feedback = useCallback((cue: SoundCue = "tap", weight: FeedbackWeight = "light") => {
    playSound(cue);
    if (!settings.haptics) return;
    if (weight === "success" || weight === "warning") {
      const type = weight === "success"
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Warning;
      void Haptics.notificationAsync(type).catch(() => undefined);
      return;
    }
    const style = {
      light: Haptics.ImpactFeedbackStyle.Light,
      medium: Haptics.ImpactFeedbackStyle.Medium,
      heavy: Haptics.ImpactFeedbackStyle.Heavy,
    }[weight];
    void Haptics.impactAsync(style).catch(() => undefined);
  }, [playSound, settings.haptics]);

  const effectiveSettings = useMemo(
    () => ({ ...settings, reducedMotion: settings.reducedMotion || systemReducedMotion }),
    [settings, systemReducedMotion],
  );
  const value = useMemo(
    () => ({ settings: effectiveSettings, ready, updateSetting, resetSettings, playSound, feedback, systemReducedMotion }),
    [effectiveSettings, feedback, playSound, ready, resetSettings, systemReducedMotion, updateSetting],
  );
  return (
    <LanguageContext.Provider value={effectiveSettings.language}>
      <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
    </LanguageContext.Provider>
  );
}

export function useSettings(): SettingsValue {
  const value = useContext(SettingsContext);
  if (!value) throw new Error("useSettings must be used inside SettingsProvider");
  return value;
}
