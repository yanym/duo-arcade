import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Keyboard, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { Text, TextInput } from "@/components/ScaledText";
import { router } from "expo-router";

import { DEFAULT_GAME_OPTIONS, type GameId, type GameOptions } from "@duo/game-core";
import type { RoomMode, RoomView } from "@duo/protocol";

import { Brand } from "@/components/Brand";
import { Button } from "@/components/Button";
import { GameCard } from "@/components/GameCard";
import { GameOptionsPanel } from "@/components/GameOptionsPanel";
import { Screen } from "@/components/Screen";
import { useWebDocumentTitle } from "@/hooks/useWebDocumentTitle";
import { useI18n } from "@/i18n";
import { ApiError, createRoom, getRoom, getServiceHealth, joinRoom } from "@/lib/api";
import { GAME_INFO, GAMES } from "@/lib/games";
import { getIdentity, getRecentRoomCodes, getRoomSession, localizeGeneratedNickname, removeRoomSession, saveIdentity, saveRoomSession, type Identity } from "@/lib/session";
import { useSettings } from "@/settings/SettingsContext";
import { colors, radii, shadows } from "@/theme";

function normalizeCode(value: string): string {
  return value.toUpperCase().replace(/[^2-9A-HJ-NP-Z]/g, "").slice(0, 6);
}

export default function HomeScreen() {
  const { feedback, settings } = useSettings();
  const { t } = useI18n();
  const { fontScale, height, width } = useWindowDimensions();
  const isWide = width >= 840;
  const isCompact = width < 380 || fontScale > 1.2;
  const compactNav = width < 480 || fontScale > 1.2;
  const isShortNarrow = width < 600 && height < 900;
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [nickname, setNickname] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [selectedGame, setSelectedGame] = useState<GameId>("gomoku");
  const [roomMode, setRoomMode] = useState<RoomMode>("duo");
  const [gameOptions, setGameOptions] = useState<GameOptions>(DEFAULT_GAME_OPTIONS);
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recentRoom, setRecentRoom] = useState<{ code: string; room: RoomView | null } | null>(null);
  const [serviceStatus, setServiceStatus] = useState<"checking" | "online" | "offline" | "outdated">("checking");
  const busyRef = useRef(false);
  const screenRef = useRef<ScrollView | null>(null);
  const catalogYRef = useRef(0);
  const aiSettingSummary = [
    t({ easy: "轻松", standard: "标准", hard: "困难" }[settings.ai.difficulty]),
    t({ casual: "休闲", balanced: "均衡", strategic: "战术" }[settings.ai.intelligence]),
    t({ relaxed: "从容", natural: "自然", quick: "迅速" }[settings.ai.reactionSpeed]),
  ].join(" · ");
  useWebDocumentTitle(settings.language === "en"
    ? "Duo Arcade · Two-player and AI games"
    : "Duo Arcade · 好友联机与 AI 小游戏");

  useEffect(() => {
    let cancelled = false;
    void getIdentity().then((value) => {
      if (cancelled) return;
      setIdentity(value);
      setNickname((current) => {
        const generatedChinese = localizeGeneratedNickname(value.nickname, "zh");
        const generatedEnglish = localizeGeneratedNickname(value.nickname, "en");
        const userEdited = current.length > 0 && current !== generatedChinese && current !== generatedEnglish;
        return userEdited ? current : localizeGeneratedNickname(value.nickname, settings.language);
      });
    });
    return () => { cancelled = true; };
  }, [settings.language]);

  useEffect(() => {
    if (!identity) return;
    let cancelled = false;
    void (async () => {
      const codes = await getRecentRoomCodes();
      for (const code of codes) {
        const storedSession = await getRoomSession(code);
        if (!storedSession || storedSession.playerId !== identity.playerId) continue;
        try {
          const room = await getRoom(code);
          if (room.players.some((player) => player?.id === identity.playerId)) {
            if (!cancelled) setRecentRoom({ code, room });
            return;
          }
          await removeRoomSession(code);
        } catch (caught) {
          if (caught instanceof ApiError && caught.code === "room_not_found") {
            await removeRoomSession(code);
            continue;
          }
          if (!cancelled) setRecentRoom({ code, room: null });
          return;
        }
      }
      if (!cancelled) setRecentRoom(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [identity]);

  function checkService() {
    setServiceStatus("checking");
    const controller = new AbortController();
    void getServiceHealth(controller.signal)
      .then((health) => setServiceStatus(health.ok ? "online" : "offline"))
      .catch((caught) => {
        if (!controller.signal.aborted) {
          setServiceStatus(caught instanceof ApiError && caught.code === "protocol_mismatch" ? "outdated" : "offline");
        }
      });
    return controller;
  }

  useEffect(() => {
    const controller = new AbortController();
    void getServiceHealth(controller.signal)
      .then((health) => setServiceStatus(health.ok ? "online" : "offline"))
      .catch((caught) => {
        if (!controller.signal.aborted) {
          setServiceStatus(caught instanceof ApiError && caught.code === "protocol_mismatch" ? "outdated" : "offline");
        }
      });
    return () => controller.abort();
  }, []);

  async function currentIdentity(): Promise<Identity> {
    if (!identity) throw new Error("身份仍在初始化");
    const next = { ...identity, nickname: nickname.trim() };
    await saveIdentity(next);
    setIdentity(next);
    return next;
  }

  async function handleCreate() {
    if (busyRef.current) return;
    busyRef.current = true;
    Keyboard.dismiss();
    setBusy("create");
    setError(null);
    try {
      const response = await createRoom(await currentIdentity(), selectedGame, gameOptions, roomMode, settings.ai);
      await saveRoomSession(response.room.code, response);
      router.push({ pathname: "/room/[code]", params: { code: response.room.code } });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "暂时无法创建房间，请重试。");
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  async function handleJoin() {
    if (roomCode.length !== 6 || busyRef.current) return;
    busyRef.current = true;
    Keyboard.dismiss();
    setBusy("join");
    setError(null);
    try {
      const activeIdentity = await currentIdentity();
      const previous = await getRoomSession(roomCode);
      const response = await joinRoom(roomCode, activeIdentity, previous);
      await saveRoomSession(roomCode, response);
      router.push({ pathname: "/room/[code]", params: { code: roomCode } });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "暂时无法加入房间，请重试。");
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  return (
    <Screen scrollRef={screenRef}>
      <View style={[styles.nav, isCompact && styles.navCompact, isShortNarrow && styles.navShort]}>
        <Brand compact={compactNav} iconOnly={compactNav} />
        <View style={[styles.navActions, compactNav && styles.navActionsCompact]}>
          <Button
            accessibilityLabel="语言、AI、声音与显示设置"
            onPress={() => router.push("/settings" as never)}
            style={[styles.settingsButton, compactNav && styles.settingsButtonCompact]}
            variant="ghost"
          >
            设置
          </Button>
          <Pressable
            accessibilityHint={serviceStatus === "offline" ? t("重新检测联机服务") : serviceStatus === "outdated" ? t("刷新页面以载入兼容版本") : undefined}
            accessibilityLabel={t(serviceStatus === "checking" ? "正在检测联机服务" : serviceStatus === "online" ? "联机服务正常" : serviceStatus === "outdated" ? "应用需要更新，点按刷新" : "联机服务暂不可用，点按重新检测")}
            accessibilityRole={serviceStatus === "offline" || serviceStatus === "outdated" ? "button" : "text"}
            accessibilityState={serviceStatus === "checking" ? { busy: true } : undefined}
            aria-busy={serviceStatus === "checking"}
            disabled={serviceStatus === "checking" || serviceStatus === "online"}
            onPress={() => {
              if (serviceStatus === "outdated" && Platform.OS === "web" && typeof globalThis.location !== "undefined") {
                globalThis.location.reload();
                return;
              }
              checkService();
            }}
            style={({ pressed }) => [styles.onlinePill, compactNav && styles.onlinePillCompact, pressed && styles.onlinePillPressed]}
          >
            <View style={[styles.onlineDot, serviceStatus === "online" && styles.onlineDotLive, (serviceStatus === "offline" || serviceStatus === "outdated") && styles.onlineDotOffline]} />
            <Text style={styles.onlineText}>
              {compactNav
                ? serviceStatus === "checking" ? "检测" : serviceStatus === "online" ? "在线" : serviceStatus === "outdated" ? "更新" : "离线"
                : serviceStatus === "checking" ? "正在检测" : serviceStatus === "online" ? "联机正常" : serviceStatus === "outdated" ? "请刷新更新" : "服务暂不可用"}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={[styles.hero, isWide && styles.heroWide, isShortNarrow && styles.heroShort]}>
        <View style={[styles.heroCopy, isWide && styles.heroCopyWide]}>
          <Text style={[styles.eyebrow, isShortNarrow && styles.eyebrowShort]}>好友联机，也能单人挑战 AI</Text>
          <Text accessibilityRole="header" style={[styles.title, isWide && styles.titleWide, isShortNarrow && styles.titleShort]}>想玩，就马上开一局。</Text>
          <Text style={[styles.subtitle, isShortNarrow && styles.subtitleShort]}>无需注册。邀请朋友跨 Web 与 iPhone 联机，或让 AI 立即入座。</Text>
          {!isShortNarrow && (
            <View style={styles.promiseRow}>
              <Text style={styles.promise}>① 选游戏</Text>
              <Text style={styles.promise}>{roomMode === "ai" ? "② 调整 AI" : "② 发邀请"}</Text>
              <Text style={styles.promise}>{roomMode === "ai" ? "③ 马上开局" : "③ 一起开局"}</Text>
            </View>
          )}
          {recentRoom && (
            <Pressable
              accessibilityHint={t("返回仍保留进度的房间")}
              accessibilityLabel={recentRoom.room
                ? t(`继续${GAME_INFO[recentRoom.room.gameId].title}房间 ${recentRoom.code}`)
                : `${t("继续上次的房间")} ${recentRoom.code}`}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: "/room/[code]", params: { code: recentRoom.code } })}
              style={({ pressed }) => [styles.resumeCard, pressed && styles.resumeCardPressed]}
            >
              <View style={styles.resumeCopy}>
                <Text style={styles.resumeKicker}>上次的房间还在</Text>
                <Text style={styles.resumeTitle}>{recentRoom.room ? GAME_INFO[recentRoom.room.gameId].title : "上次的房间"} · {recentRoom.code}</Text>
                <Text style={styles.resumeMeta}>
                  {!recentRoom.room
                    ? "联网后同步最新进度"
                    : recentRoom.room.phase === "completed"
                      ? `第 ${recentRoom.room.round} 局已结束`
                      : recentRoom.room.phase === "playing" || recentRoom.room.phase === "reconnect_grace"
                        ? `第 ${recentRoom.room.round} 局进行中`
                        : "正在等你们继续"}
                </Text>
              </View>
              <Text style={styles.resumeAction}>继续</Text>
            </Pressable>
          )}
        </View>

        <View style={[styles.actionCard, isWide && styles.actionCardWide, isShortNarrow && styles.actionCardShort]}>
          <Text style={styles.cardLabel}>这局玩</Text>
          <Pressable
            accessibilityHint={t("滚动到游戏大厅选择其他游戏")}
            accessibilityLabel={t(`已选择${GAME_INFO[selectedGame].title}，点按更换`)}
            accessibilityRole="button"
            onPress={() => screenRef.current?.scrollTo({ animated: !settings.reducedMotion, y: Math.max(0, catalogYRef.current - 18) })}
            style={({ pressed }) => [styles.selectedGame, isShortNarrow && styles.selectedGameShort, pressed && styles.selectedGamePressed]}
          >
            <View style={[styles.selectedGameIcon, { backgroundColor: GAME_INFO[selectedGame].accent }]}>
              <Text style={styles.selectedGameIconText}>{GAME_INFO[selectedGame].icon}</Text>
            </View>
            <View style={styles.selectedGameCopy}>
              <Text style={styles.selectedGameTitle}>{GAME_INFO[selectedGame].title}</Text>
              <Text style={styles.selectedGameMeta}>{GAME_INFO[selectedGame].mode} · 可在下方游戏大厅更换</Text>
            </View>
          </Pressable>
          <Text style={styles.cardLabel}>游戏方式</Text>
          <View accessibilityLabel={t("游戏方式")} accessibilityRole="radiogroup" style={styles.modePicker}>
            {([
              { detail: "好友加入后一起开始", label: "双人联机", value: "duo" },
              { detail: "AI 会立即入座", label: "单人 + AI", value: "ai" },
            ] as const).map((mode) => {
              const selected = roomMode === mode.value;
              return (
                <Pressable
                  accessibilityLabel={`${t(mode.label)}. ${t(mode.detail)}`}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  aria-checked={selected}
                  key={mode.value}
                  onPress={() => {
                    feedback("tap", "light");
                    setRoomMode(mode.value);
                    if (error) setError(null);
                  }}
                  style={({ pressed }) => [styles.modeOption, selected && styles.modeOptionSelected, pressed && styles.selectedGamePressed]}
                >
                  <Text style={[styles.modeTitle, selected && styles.modeTitleSelected]}>{mode.label}</Text>
                  <Text style={styles.modeDetail}>{mode.detail}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.cardLabel}>你的游戏名</Text>
          {!identity ? (
            <ActivityIndicator color={colors.primary} style={styles.loader} />
          ) : (
            <TextInput
              accessibilityLabel="你的游戏昵称"
              autoCapitalize="words"
              autoCorrect={false}
              clearButtonMode="while-editing"
              maxLength={24}
              onChangeText={(value) => {
                setNickname(value);
                if (error) setError(null);
              }}
              placeholder="输入昵称"
              placeholderTextColor={colors.muted}
              returnKeyType="done"
              style={styles.input}
              value={nickname}
            />
          )}
          <Button
            disabled={!identity || !nickname.trim() || busy === "join"}
            loading={busy === "create"}
            loadingLabel={roomMode === "ai" ? "正在开始对局" : "正在创建房间"}
            onPress={handleCreate}
          >
            {roomMode === "ai" ? `与 AI 开始${GAME_INFO[selectedGame].title}` : `用${GAME_INFO[selectedGame].title}创建房间`}
          </Button>
          {roomMode === "ai" ? (
            <Pressable
              accessibilityLabel={`${t("AI 对局设置")}: ${aiSettingSummary}. ${t("前往设置调整 AI 难度、策略与反应速度")}`}
              accessibilityRole="button"
              onPress={() => router.push("/settings" as never)}
              style={({ pressed }) => [styles.aiSummary, pressed && styles.selectedGamePressed]}
            >
              <View style={styles.aiSummaryCopy}>
                <Text style={styles.aiSummaryTitle}>AI 对局设置</Text>
                <Text style={styles.aiSummaryDetail}>{aiSettingSummary}</Text>
              </View>
              <Text style={styles.aiSummaryAction}>修改</Text>
            </Pressable>
          ) : (
            <>
              <View style={styles.orRow}>
                <View style={styles.orLine} />
                <Text style={styles.orText}>或加入好友</Text>
                <View style={styles.orLine} />
              </View>

              <View style={styles.joinRow}>
                <TextInput
                  accessibilityLabel="六位房间码"
                  autoCapitalize="characters"
                  autoComplete="one-time-code"
                  autoCorrect={false}
                  enterKeyHint="go"
                  maxLength={6}
                  onChangeText={(value) => {
                    setRoomCode(normalizeCode(value));
                    if (error) setError(null);
                  }}
                  onSubmitEditing={handleJoin}
                  placeholder="6 位房间码"
                  placeholderTextColor={colors.muted}
                  returnKeyType="go"
                  style={[styles.input, styles.codeInput]}
                  value={roomCode}
                />
                <Button
                  disabled={roomCode.length !== 6 || !identity || !nickname.trim() || busy === "create"}
                  loading={busy === "join"}
                  loadingLabel="加入中"
                  onPress={handleJoin}
                  style={styles.joinButton}
                  variant="secondary"
                >
                  加入
                </Button>
              </View>
            </>
          )}
          {error && <Text accessibilityLiveRegion="assertive" accessibilityRole="alert" style={styles.error}>{error}</Text>}
        </View>
      </View>

      <View onLayout={(event) => { catalogYRef.current = event.nativeEvent.layout.y; }} style={styles.sectionHeader}>
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionKicker}>游戏大厅</Text>
          <Text accessibilityRole="header" aria-level={2} style={styles.sectionTitle}>今天想怎么玩？</Text>
        </View>
        <Text style={styles.sectionMeta}>{GAMES.length} 款游戏 · 全部可玩</Text>
      </View>

      <GameOptionsPanel game={GAME_INFO[selectedGame]} onChange={setGameOptions} options={gameOptions} />

      <View accessibilityLabel={t("游戏大厅")} accessibilityRole="radiogroup" style={styles.gameGrid}>
        {GAMES.map((game) => (
          <GameCard
            accent={game.accent}
            description={game.description}
            icon={game.icon}
            key={game.id}
            meta={game.meta}
            onPress={() => {
              setSelectedGame(game.id);
              if (error) setError(null);
            }}
            selected={selectedGame === game.id}
            title={game.title}
          />
        ))}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Duo Arcade 1.0 · 服务端判定每一步，公平地玩</Text>
        <View style={styles.footerLinks}>
          <Pressable accessibilityRole="link" onPress={() => router.push("/privacy" as never)} style={styles.footerPressable}>
            <Text style={styles.footerLink}>隐私说明</Text>
          </Pressable>
          <Text style={styles.footerDot}>·</Text>
          <Pressable accessibilityRole="link" onPress={() => router.push("/terms" as never)} style={styles.footerPressable}>
            <Text style={styles.footerLink}>服务条款</Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 54 },
  navCompact: { marginBottom: 42 },
  navShort: { marginBottom: 24 },
  navActions: { flexDirection: "row", alignItems: "center", gap: 9 },
  navActionsCompact: { gap: 6 },
  settingsButton: { minHeight: 44, paddingHorizontal: 12 },
  settingsButtonCompact: { paddingHorizontal: 10 },
  onlinePill: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.pill },
  onlinePillCompact: { paddingHorizontal: 9 },
  onlinePillPressed: { opacity: 0.72 },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.amber },
  onlineDotLive: { backgroundColor: colors.teal },
  onlineDotOffline: { backgroundColor: colors.coral },
  onlineText: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  hero: { gap: 32, marginBottom: 72 },
  heroWide: { flexDirection: "row", alignItems: "center", gap: 70 },
  heroShort: { gap: 16 },
  heroCopy: {},
  heroCopyWide: { flex: 1.12 },
  eyebrow: { color: colors.primary, fontSize: 14, fontWeight: "900", letterSpacing: 0.4, marginBottom: 14 },
  eyebrowShort: { marginBottom: 8 },
  title: { color: colors.ink, fontSize: 43, lineHeight: 50, fontWeight: "900", letterSpacing: -1.8, maxWidth: 600 },
  titleWide: { fontSize: 54, lineHeight: 62 },
  titleShort: { fontSize: 39, lineHeight: 44 },
  subtitle: { color: colors.muted, fontSize: 17, lineHeight: 28, marginTop: 18, maxWidth: 580 },
  subtitleShort: { fontSize: 16, lineHeight: 24, marginTop: 12 },
  promiseRow: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 24 },
  promise: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  resumeCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14, minHeight: 70, marginTop: 24, paddingHorizontal: 16, paddingVertical: 13, borderRadius: radii.medium, borderWidth: 1.5, borderColor: colors.primary, backgroundColor: colors.primarySoft },
  resumeCardPressed: { opacity: 0.74 },
  resumeCopy: { flex: 1, minWidth: 0 },
  resumeKicker: { color: colors.primaryDark, fontSize: 11, fontWeight: "900" },
  resumeTitle: { color: colors.ink, fontSize: 16, fontWeight: "900", marginTop: 3 },
  resumeMeta: { color: colors.muted, fontSize: 12, fontWeight: "600", marginTop: 2 },
  resumeAction: { color: colors.primaryDark, fontSize: 14, fontWeight: "900" },
  actionCard: { width: "100%", minWidth: 0, backgroundColor: colors.surface, borderRadius: 28, padding: 24, ...shadows.card },
  actionCardWide: { flex: 0.78, width: "auto", minWidth: 300 },
  actionCardShort: { borderRadius: 24, padding: 18 },
  cardLabel: { color: colors.ink, fontSize: 13, fontWeight: "800", marginBottom: 8 },
  selectedGame: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.primarySoft, borderRadius: radii.medium, padding: 12, marginBottom: 18 },
  selectedGameShort: { padding: 10, marginBottom: 14 },
  selectedGamePressed: { opacity: 0.76 },
  selectedGameIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  selectedGameIconText: { fontSize: 23 },
  selectedGameCopy: { flex: 1, minWidth: 0 },
  selectedGameTitle: { color: colors.ink, fontSize: 16, fontWeight: "900" },
  selectedGameMeta: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  modePicker: { flexDirection: "row", gap: 9, marginBottom: 18 },
  modeOption: { flex: 1, minHeight: 66, justifyContent: "center", borderWidth: 1.5, borderColor: colors.faint, borderRadius: radii.medium, backgroundColor: colors.canvas, paddingHorizontal: 12, paddingVertical: 10 },
  modeOptionSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  modeTitle: { color: colors.muted, fontSize: 14, fontWeight: "900" },
  modeTitleSelected: { color: colors.primaryDark },
  modeDetail: { color: colors.muted, fontSize: 10, lineHeight: 14, marginTop: 3 },
  loader: { height: 52 },
  input: { minHeight: 52, borderRadius: radii.medium, borderWidth: 1.5, borderColor: colors.faint, color: colors.ink, backgroundColor: colors.canvas, paddingHorizontal: 16, fontSize: 16, marginBottom: 14 },
  orRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 20 },
  orLine: { height: 1, flex: 1, backgroundColor: colors.faint },
  orText: { color: colors.muted, fontSize: 12 },
  joinRow: { flexDirection: "row", gap: 10, minWidth: 0 },
  codeInput: { flex: 1, minWidth: 0, marginBottom: 0, textAlign: "center", letterSpacing: 2.5, fontWeight: "800" },
  joinButton: { width: 92 },
  aiSummary: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: 12, marginTop: 12, borderRadius: radii.medium, backgroundColor: colors.tealSoft, paddingHorizontal: 14, paddingVertical: 11 },
  aiSummaryCopy: { flex: 1, minWidth: 0 },
  aiSummaryTitle: { color: colors.tealInk, fontSize: 12, fontWeight: "900" },
  aiSummaryDetail: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 2 },
  aiSummaryAction: { color: colors.primaryDark, fontSize: 12, fontWeight: "900" },
  error: { color: colors.danger, fontSize: 13, marginTop: 12 },
  sectionHeader: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 20, marginBottom: 20 },
  sectionHeading: { flexShrink: 1, maxWidth: "100%" },
  sectionKicker: { color: colors.coralInk, fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  sectionTitle: { color: colors.ink, fontSize: 28, fontWeight: "900", marginTop: 5 },
  sectionMeta: { color: colors.muted, fontSize: 13 },
  gameGrid: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  footer: { paddingTop: 48, alignItems: "center", gap: 10 },
  footerText: { color: colors.muted, fontSize: 12 },
  footerLinks: { flexDirection: "row", alignItems: "center", gap: 9 },
  footerPressable: { minHeight: 44, justifyContent: "center", paddingHorizontal: 6 },
  footerLink: { color: colors.primaryDark, fontSize: 12, fontWeight: "800" },
  footerDot: { color: colors.muted, fontSize: 12 },
});
