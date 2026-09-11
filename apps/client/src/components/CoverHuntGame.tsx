import { useEffect, useRef, useState } from "react";
import { Image, ImageBackground, Pressable, View } from "react-native";
import { Text } from "@/components/ScaledText";

import { useI18n } from "@/i18n";

import type { CoverHuntViewState, Seat } from "@duo/game-core";
import type { RoomPhase } from "@duo/protocol";

import { Button } from "@/components/Button";
import { coverAction, coverPlacement } from "@/lib/coverInteraction";
import { useCoverTool } from "@/hooks/useCoverTool";
import { useSettings } from "@/settings/SettingsContext";
import { colors, createGameStyles, radii, shadows } from "@/theme";

type Props = {
  game: CoverHuntViewState;
  ownSeat: Seat;
  phase: RoomPhase;
  onHide: (cover: number) => void;
  onScan: (cover: number) => void;
  onShoot: (cover: number) => void;
};

const coverNames = ["晶岩", "补给箱", "光盾", "月面车", "天线", "燃料舱"];
const coverGlyphs = ["◆", "▦", "◒", "▰", "⌁", "◉"];

function outcomeCopy(game: CoverHuntViewState): string | null {
  if (!game.roundOutcome || game.roundWinner === null) return null;
  const winner = game.roundWinner === game.hunterSeat ? "猎手" : "潜行者";
  const detail = {
    hit: "一枪命中",
    miss: "成功躲过",
    hide_timeout: "藏身超时",
    hunt_timeout: "搜索超时",
  }[game.roundOutcome];
  return `${winner}得分 · ${detail}`;
}

export function CoverHuntGame({ game, ownSeat, phase, onHide, onScan, onShoot }: Props) {
  const { t } = useI18n();
  const isHunter = ownSeat === game.hunterSeat;
  const [availableWidth, setAvailableWidth] = useState(0);
  const compact = availableWidth > 0 && availableWidth < 380;
  const { tool, chooseTool } = useCoverTool(game.round, game.scanCharges);
  const previousOutcome = useRef(game.roundOutcome);
  const { feedback, settings } = useSettings();
  const hiderSeat = game.hunterSeat === 0 ? 1 : 0;
  const ended = Boolean(game.result) || phase === "completed";
  const paused = !ended && phase !== "playing";

  const action = coverAction(game, ownSeat, phase, tool);

  useEffect(() => {
    if (phase === "playing" && !game.result && game.roundOutcome && game.roundOutcome !== previousOutcome.current) {
      feedback(game.roundOutcome === "hit" ? "hit" : "place", game.roundOutcome === "hit" ? "heavy" : "medium");
    }
    previousOutcome.current = game.roundOutcome;
  }, [feedback, game.result, game.roundOutcome, phase]);

  function chooseCover(index: number) {
    if (action === "hide") {
      feedback("place", "medium");
      onHide(index);
      return;
    }
    if (action === "scan" || action === "shoot") {
      if (action === "scan") {
        feedback("scan", "medium");
        onScan(index);
      } else {
        feedback("hit", "heavy");
        onShoot(index);
      }
    }
  }

  const instruction = ended
    ? `本局攻防已结束${outcomeCopy(game) ? ` · ${outcomeCopy(game)}` : ""}`
    : paused
      ? "攻防已暂停，等待连接恢复"
    : game.phase === "round_result"
    ? outcomeCopy(game)
    : game.phase === "hiding"
      ? isHunter ? "背过身去：潜行者正在秘密选择掩体" : "点选一个掩体藏好；确认后不能移动"
      : isHunter
        ? tool === "scan" ? game.scanCharges > 0 ? "点一个掩体侦测冷热信号" : "扫描已用完。选择“锁定一枪”后再点掩体。" : "瞄准一个掩体；每轮只有这一枪"
        : "保持隐蔽，猎手看不到你的选择";

  return (
    <View onLayout={(event) => setAvailableWidth(event.nativeEvent.layout.width)} style={styles.shell}>
      <View style={styles.scoreRow}>
        <View style={[styles.roleCard, !isHunter && styles.roleCardActive]}>
          <Text style={styles.roleKicker}>潜行者 · 玩家 {hiderSeat + 1}</Text>
          <Text style={styles.score}>{game.scores[hiderSeat]}</Text>
        </View>
        <View accessibilityLabel={t(`第 ${game.round} 轮攻防，共 ${game.totalRounds} 轮`)} style={styles.roundBadge}>
          <Text style={styles.roundLabel}>攻防轮</Text>
          <Text style={styles.round}>{game.round}/{game.totalRounds}</Text>
        </View>
        <View style={[styles.roleCard, isHunter && styles.roleCardActive]}>
          <Text style={styles.roleKicker}>猎手 · 玩家 {game.hunterSeat + 1}</Text>
          <Text style={styles.score}>{game.scores[game.hunterSeat]}</Text>
        </View>
      </View>

      <View accessibilityLiveRegion="polite" style={styles.instructionCard}>
        <Text style={styles.instruction}>{instruction}</Text>
        <Text style={styles.privateLabel}>{ended ? "最终状态" : paused ? "状态已保留" : isHunter ? "猎手视野" : "潜行者私密视野"}</Text>
      </View>

      {isHunter && game.phase === "hunting" && (
        <View style={styles.tools}>
          <Button
            disabled={ended || paused || game.scanCharges <= 0}
            selected={tool === "scan"}
            onPress={() => chooseTool("scan")}
            style={styles.toolButton}
            variant={tool === "scan" ? "primary" : "ghost"}
          >
            扫描 · {game.scanCharges}
          </Button>
          <Button disabled={ended || paused} selected={tool === "shoot"} onPress={() => chooseTool("shoot")} style={styles.toolButton} variant={tool === "shoot" ? "primary" : "ghost"}>
            锁定一枪
          </Button>
        </View>
      )}

      {game.scanFeedback && (
        <View style={[styles.signal, styles[`${game.scanFeedback.signal}Signal`]]}>
          <Text style={styles.signalText}>
            {coverNames[game.scanFeedback.cover]}：{game.scanFeedback.signal === "hot" ? "炽热，目标就在这里！" : game.scanFeedback.signal === "warm" ? "温热，相邻编号有动静" : "冰冷，不在相邻编号"}
          </Text>
        </View>
      )}

      <ImageBackground
        accessibilityLabel={t("暮色外星前哨站，分布着多个可交互掩体")}
        imageStyle={styles.arenaImage}
        resizeMode="cover"
        source={require("../../assets/game-art/cover-hunt-arena-optimized.jpg")}
        style={[styles.arena, settings.highContrast && styles.arenaHighContrast]}
      >
        <View style={styles.scrim} />
        {Array.from({ length: game.covers }, (_, index) => {
          const showsAlien = game.hiddenSpot === index;
          const wasShot = game.shotSpot === index;
          const canChoose = action !== null;
          const placement = coverPlacement(index, game.covers, compact);
          return (
            <Pressable
              accessibilityHint={canChoose && instruction ? t(instruction) : undefined}
              accessibilityLabel={t(`掩体 ${index + 1}，${coverNames[index]}`)}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canChoose }}
              disabled={!canChoose}
              key={index}
              onPress={() => chooseCover(index)}
              style={({ pressed }) => [
                styles.cover,
                { left: `${placement.left}%`, bottom: `${placement.bottom}%`, width: `${placement.width}%`, height: `${placement.height}%` },
                settings.highContrast && styles.coverHighContrast,
                pressed && !settings.reducedMotion && styles.coverPressed,
              ]}
            >
              {showsAlien && (
                <Image
                  accessibilityLabel={t("藏在这里的外星潜行者")}
                  resizeMode="contain"
                  source={require("../../assets/game-art/cover-hunt-alien-optimized.png")}
                  style={styles.alien}
                />
              )}
              {wasShot && (
                <View style={styles.crosshair}>
                  <View style={styles.crosshairRing} />
                  <View style={styles.crosshairHorizontal} />
                  <View style={styles.crosshairVertical} />
                </View>
              )}
              <View style={[styles.coverBadge, canChoose && styles.coverBadgeActive]}>
                <Text style={styles.coverGlyph}>{coverGlyphs[index]}</Text>
                <Text numberOfLines={1} style={styles.coverName}>{index + 1}·{coverNames[index]}</Text>
              </View>
            </Pressable>
          );
        })}
        <View style={styles.arenaCaption}>
          <Text style={styles.arenaCaptionText}>暮光哨站 · 所有选择均由服务器私密判定</Text>
        </View>
      </ImageBackground>
    </View>
  );
}

const styles = createGameStyles({
  shell: { width: "100%", maxWidth: 980, alignSelf: "center" },
  scoreRow: { flexDirection: "row", alignItems: "stretch", gap: 10, marginBottom: 12 },
  roleCard: { flex: 1, minWidth: 0, backgroundColor: colors.canvas, borderRadius: radii.medium, padding: 13, borderWidth: 1.5, borderColor: colors.faint },
  roleCardActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  roleKicker: { color: colors.muted, fontSize: 10, fontWeight: "900" },
  score: { color: colors.ink, fontSize: 27, fontWeight: "900", marginTop: 2 },
  roundBadge: { minWidth: 72, alignItems: "center", justifyContent: "center", backgroundColor: colors.ink, borderRadius: radii.medium, paddingHorizontal: 12 },
  roundLabel: { color: "#B7B8C6", fontSize: 9, fontWeight: "900" },
  round: { color: colors.surface, fontSize: 18, fontWeight: "900", marginTop: 2 },
  instructionCard: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 9, backgroundColor: "#202238", borderRadius: radii.medium, padding: 14, marginBottom: 10 },
  instruction: { flexGrow: 1, flexShrink: 1, flexBasis: 230, minWidth: 0, color: colors.surface, fontSize: 14, lineHeight: 20, fontWeight: "800" },
  privateLabel: { color: "#7FE1CF", fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
  tools: { flexDirection: "row", gap: 9, marginBottom: 10 },
  toolButton: { flex: 1, minHeight: 44 },
  signal: { borderRadius: radii.small, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 10 },
  coldSignal: { backgroundColor: "#E4F0FF" },
  warmSignal: { backgroundColor: "#FFF4D6" },
  hotSignal: { backgroundColor: colors.coralSoft },
  signalText: { color: colors.ink, textAlign: "center", fontSize: 13, fontWeight: "900" },
  arena: { width: "100%", aspectRatio: 1.48, minHeight: 330, overflow: "hidden", borderRadius: radii.large, position: "relative", ...shadows.card },
  arenaImage: { width: "100%", height: "100%", borderRadius: radii.large },
  arenaHighContrast: { borderWidth: 3, borderColor: colors.ink },
  scrim: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(16,18,46,0.08)" },
  cover: { position: "absolute", bottom: "16%", width: "15%", height: "45%", alignItems: "center", justifyContent: "flex-end" },
  coverHighContrast: { borderWidth: 2, borderColor: colors.surface, borderRadius: radii.small },
  coverPressed: { transform: [{ scale: 0.95 }] },
  alien: { position: "absolute", bottom: 28, width: "92%", height: "92%" },
  coverBadge: { width: "100%", minHeight: 47, backgroundColor: "rgba(25,27,52,0.86)", borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.35)", alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  coverBadgeActive: { borderColor: "#95F1E1", borderWidth: 2, backgroundColor: "rgba(43,47,83,0.94)" },
  coverGlyph: { color: "#95F1E1", fontSize: 18, fontWeight: "900" },
  coverName: { color: colors.surface, fontSize: 9, fontWeight: "900" },
  crosshair: { position: "absolute", zIndex: 4, top: "30%", width: 54, height: 54, alignItems: "center", justifyContent: "center" },
  crosshairRing: { width: 42, height: 42, borderRadius: 21, borderWidth: 3, borderColor: colors.coral },
  crosshairHorizontal: { position: "absolute", width: 54, height: 3, backgroundColor: colors.coral },
  crosshairVertical: { position: "absolute", width: 3, height: 54, backgroundColor: colors.coral },
  arenaCaption: { position: "absolute", left: 12, right: 12, bottom: 9, backgroundColor: "rgba(19,21,48,0.66)", borderRadius: radii.pill, paddingVertical: 6, paddingHorizontal: 12 },
  arenaCaptionText: { color: "#E6E5FF", fontSize: 9, fontWeight: "800", textAlign: "center" },
});
