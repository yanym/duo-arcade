import { memo, useState } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { EMBER_OPERATIONS, emberDistance, validateEmberPlan, type EmberCrewState, type EmberOperation, type EmberPlan, type Seat } from "@duo/game-core";
import type { RoomPhase } from "@duo/protocol";
import { Text } from "@/components/ScaledText";
import { Button } from "@/components/Button";
import { useI18n } from "@/i18n";
import { useSettings } from "@/settings/SettingsContext";
import { colors, radii } from "@/theme";

type Props = {
  game: EmberCrewState; ownSeat: Seat; phase: RoomPhase; now: number; pending?: boolean;
  playerNames?: [string, string];
  playerConnected?: [boolean, boolean];
  partnerIsAi?: boolean;
  onPlan: (plan: EmberPlan) => void; onCommit: () => void;
};
const operationNames: Record<EmberOperation, string> = {
  move: "规划移动", extinguish: "灭火", refill: "补满水箱", share: "给搭档水", wait: "原地待命",
};
const compactOperationNames: Record<EmberOperation, string> = {
  ...operationNames, refill: "补水", share: "分水", wait: "待命",
};
const coordinates = (cell: number) => `${"ABCDE"[cell % 5]}${Math.floor(cell / 5) + 1}`;

export const EmberCrewGame = memo(function EmberCrewGame({ game, ownSeat, phase, now, pending = false, playerNames, playerConnected, partnerIsAi = false, onPlan, onCommit }: Props) {
  const { t } = useI18n();
  const { settings, feedback } = useSettings();
  const { width, fontScale } = useWindowDimensions();
  const compact = width < 600 && fontScale <= 1.2;
  const [operation, setOperation] = useState<EmberOperation>(() => game.plans[ownSeat]?.operation ?? "move");
  const partner: Seat = ownSeat === 0 ? 1 : 0;
  const ended = Boolean(game.result) || phase === "completed";
  const isPlanning = phase === "playing" && game.phase === "planning" && !ended && now < game.turnDeadline;
  const canPlan = isPlanning && !game.locked[ownSeat] && !pending;
  const ownPlan = game.plans[ownSeat];
  const partnerPlan = game.plans[partner];
  const coordinatedRoute = isPlanning && ownPlan && ownPlan.operation === operation && partnerPlan
    && ownPlan.cell === partnerPlan.cell && game.fire[ownPlan.cell]! > 0
    && ((ownPlan.operation === "move" && partnerPlan.operation === "extinguish")
      || (ownPlan.operation === "extinguish" && partnerPlan.operation === "move"))
    && validateEmberPlan(game, ownSeat, ownPlan) === null && validateEmberPlan(game, partner, partnerPlan) === null;
  const blockedRouteCopy = ownPlan?.operation === "move" && game.fire[ownPlan.cell]! > 0
    ? (!game.locked[partner] || (partnerPlan?.operation === "extinguish" && partnerPlan.cell === ownPlan.cell))
      && validateEmberPlan(game, partner, { operation: "extinguish", cell: ownPlan.cell }) === null
      ? "这条路仍有火；搭档本轮灭火后才能通过。"
      : game.water[ownSeat] > 0
        ? "搭档本轮无法清出这条路。请先灭火，再移动。"
        : "搭档本轮无法清出这条路。请换条路，或先补水。"
    : null;
  const forecastMove = isPlanning && operation === "move" && ownPlan?.operation === "move"
    && game.fire[ownPlan.cell] === 0 && game.forecast.includes(ownPlan.cell)
    && validateEmberPlan(game, ownSeat, ownPlan) === null;
  const forecastSources = forecastMove ? game.fire.flatMap((level, cell) =>
    level > 0 && emberDistance(cell, ownPlan.cell) <= 1 ? [cell] : []) : [];
  // A valid planned extinguish must remove the last local source, not merely
  // one of several fires. Draft revisions immediately update this guidance.
  const forecastPrevented = forecastSources.length === 1 && partnerPlan?.operation === "extinguish"
    && partnerPlan.cell === forecastSources[0] && validateEmberPlan(game, partner, partnerPlan) === null;
  const forecastMoveCopy = forecastSources.length ? forecastPrevented
    ? "按搭档当前的灭火计划，这格本轮不会起火。请一起确认。"
    : "这格预计在移动后起火。请换条路，或先扑灭附近火源。" : null;
  const targeting = operation === "move" || operation === "extinguish";
  const stateCopy = ended ? "救援行动结束" : phase !== "playing" ? playerConnected?.[partner] === false ? "搭档暂时离线，计划已保留" : "救援已暂停，计划已保留"
    : game.phase === "round_result" ? "本轮行动已完成"
      : now >= game.turnDeadline ? "时间已到，正在同步本轮结果"
        : pending ? "正在同步你的计划"
          : game.locked[ownSeat] ? "已确认，等待搭档"
            : game.locked[partner] ? "搭档已确认，轮到你决定"
              : partnerIsAi ? compact ? "确认前，AI 会调整计划。" : "AI 会随你的计划调整，准备好后请确认。"
                : compact ? "一起规划，再分别确认。" : "共同规划，分别确认";
  const planCopy = (seat: Seat) => {
    const plan = game.plans[seat];
    if (ended) return t(plan ? "计划未执行" : "尚未行动");
    return plan ? `${t(operationNames[plan.operation])} · ${coordinates(plan.cell)}` : t("还在规划");
  };
  const chooseOperation = (next: EmberOperation) => {
    setOperation(next);
    if (next !== "move" && next !== "extinguish") onPlan({ operation: next, cell: game.positions[ownSeat] });
  };
  const allFiresOut = !game.fire.some(Boolean);
  const forecast = allFiresOut ? t("火势已全部扑灭") : `${t("本轮火势预告")} · ${game.forecast.map(coordinates).join(" · ")}`;
  return (
    <View style={[styles.shell, compact && styles.compactShell, settings.highContrast && styles.contrast]}>
      <View style={[styles.metrics, compact && styles.compactMetrics]}>
        <View><Text style={styles.caption}>居民撤离</Text><Text style={styles.value}>{game.rescued}/{game.target}</Text></View>
        <View><Text style={styles.caption}>楼体完整度</Text><Text style={[styles.value, game.integrity <= game.maxIntegrity / 3 && styles.danger]}>{game.integrity}/{game.maxIntegrity}</Text></View>
        <View><Text style={styles.caption}>回合</Text><Text style={styles.value}>{game.round}/{game.maxRounds}</Text></View>
      </View>
      <Text accessibilityLiveRegion="polite" style={styles.status}>{stateCopy}</Text>
      <View style={styles.players}>
        {([ownSeat, partner] as Seat[]).map((seat) => (
          <View key={seat} style={[styles.player, compact && styles.compactPlayer, seat === ownSeat ? styles.own : styles.partner]}>
            <Text numberOfLines={compact ? 1 : undefined} style={styles.playerName}>{seat + 1} · {compact && seat === partner && playerNames ? playerNames[seat] : t(seat === ownSeat ? "你" : "搭档")} {playerConnected?.[seat] === false ? t("离线") : ended ? "" : game.locked[seat] ? "✓" : "…"}</Text>
            {!compact && playerNames && <Text numberOfLines={1} style={styles.caption}>{playerNames[seat]}</Text>}
            <Text style={styles.plan}>{game.phase === "round_result" ? t(game.report[seat]) : planCopy(seat)}</Text>
            <Text style={styles.caption}>{t("水量")} {game.water[seat]}/4{game.carrying[seat] ? ` · ${t("正护送居民")}` : ""}</Text>
          </View>
        ))}
      </View>
      <View style={[styles.forecast, compact && styles.compactForecast, allFiresOut && styles.allClear]}><Text style={[styles.forecastText, allFiresOut && styles.allClearText]}>{ended ? t("救援行动结束") : game.phase === "round_result" ? t("本轮行动已完成") : forecast}</Text></View>
      <View style={styles.board}>
        {Array.from({ length: 5 }, (_, row) => (
          <View key={row} style={styles.boardRow}>
            {Array.from({ length: 5 }, (_, col) => {
              const cell = row * 5 + col;
              const wall = game.walls.includes(cell);
              const depot = game.depots.includes(cell);
              const resident = game.civilians.includes(cell);
              const fire = game.fire[cell]!;
              const players = ([0, 1] as Seat[]).filter((seat) => game.positions[seat] === cell);
              const planned = ownPlan?.cell === cell;
              const partnerTarget = game.plans[partner]?.cell === cell;
              const legal = targeting && validateEmberPlan(game, ownSeat, { operation, cell }) === null;
              const dangerNext = !ended && game.phase === "planning" && game.forecast.includes(cell) && game.fire.some(Boolean);
              const contents = [coordinates(cell), wall ? t("墙体") : depot ? t("救援站") : t("通道"),
                resident ? t("居民等待救援") : "", fire ? `${t("火势")} ${fire}` : "",
                ...players.map((seat) => `${t(seat === ownSeat ? "你" : "搭档")} ${seat + 1}`),
                dangerNext ? t("本轮火势预告") : "", planned ? t("你的计划目标") : "", partnerTarget ? t("搭档的计划目标") : ""].filter(Boolean).join(", ");
              return <Pressable key={cell} accessibilityRole="button" accessibilityLabel={contents}
                accessibilityHint={canPlan && legal ? t(operationNames[operation]) : undefined}
                accessibilityState={{ disabled: !canPlan || !legal, selected: planned }}
                disabled={!canPlan || !legal} onPress={() => { feedback("tap", "light"); onPlan({ operation, cell }); }}
                style={({ pressed }) => [styles.cell, wall && styles.wall, depot && styles.depot, fire > 0 && styles.fire,
                  dangerNext && styles.forecastCell, canPlan && legal && styles.legalCell, planned && styles.selectedCell,
                  pressed && styles.pressed]}>
                <Text style={[styles.coordinate, wall && styles.wallText]}>{coordinates(cell)}{dangerNext ? " !" : ""}</Text>
                <Text style={[styles.glyph, wall && styles.wallText]}>{wall ? "▥" : players.length ? players.map((seat) => String(seat + 1)).join("·") : fire ? "🔥" : resident ? "●" : depot ? "⌂" : "·"}</Text>
                {fire > 0 && <Text style={styles.fireMark}>{fire}</Text>}
                {(resident && (players.length > 0 || fire > 0)) && <Text style={styles.residentMark}>●</Text>}
                {partnerTarget && <View style={styles.partnerMark}><Text style={styles.partnerMarkText}>{partner + 1}↗</Text></View>}
              </Pressable>;
            })}
          </View>
        ))}
      </View>
      <Text style={styles.legend}>● 居民 · ⌂ 救援站 · 🔥 火势 · ! 预告</Text>
      <View style={styles.controls}>
        {EMBER_OPERATIONS.map((op) => {
          const direct = op !== "move" && op !== "extinguish";
          const available = direct ? validateEmberPlan(game, ownSeat, { operation: op, cell: game.positions[ownSeat] }) === null
            : Array.from({ length: 25 }, (_, cell) => validateEmberPlan(game, ownSeat, { operation: op, cell })).some((error) => error === null);
          return <Button key={op} style={[styles.operation, compact && (direct ? styles.compactSupportOperation : styles.compactTargetOperation)]}
            accessibilityLabel={operationNames[op]} variant={operation === op ? "primary" : "ghost"}
            selected={operation === op} disabled={!canPlan || !available} onPress={() => chooseOperation(op)}>{compact ? compactOperationNames[op] : operationNames[op]}</Button>;
        })}
      </View>
      {isPlanning && <Text accessibilityLiveRegion={forecastMoveCopy ? "polite" : undefined}
        style={[styles.instruction, forecastMoveCopy && (forecastPrevented ? styles.coordinated : styles.warning)]}>
        {forecastMoveCopy ?? (operation === "move"
          ? compact ? "点相邻格，规划移动。" : "点相邻格规划移动；有火的道路可让搭档在同轮清出。"
          : operation === "extinguish" ? compact ? "点身边火势，消耗 1 格水。" : "点自己或相邻格的火势，消耗一格水将它扑灭。"
            : "计划已选好，确认后等待搭档一起行动。")}
      </Text>}
      {coordinatedRoute ? <Text accessibilityLiveRegion="polite" style={styles.coordinated}>
        {ownPlan.operation === "move" ? "双方确认后，搭档先灭火，你再通过。" : "双方确认后，你先灭火，搭档再通过。"}
      </Text> : isPlanning && operation === "move" && blockedRouteCopy
        && <Text accessibilityLiveRegion="polite" style={styles.warning}>{blockedRouteCopy}</Text>}
      <Button disabled={!canPlan || !ownPlan || ownPlan.operation !== operation} loading={pending} loadingLabel="正在同步你的计划" onPress={onCommit}>
        {ended ? t("救援行动结束") : game.phase === "round_result" ? t("本轮行动已完成") : now >= game.turnDeadline ? t("时间已到，正在同步本轮结果") : game.locked[ownSeat] ? t("已确认，等待搭档") : `${t("确认本轮计划")}${ownPlan && ownPlan.operation === operation ? ` · ${planCopy(ownSeat)}` : ""}`}
      </Button>
      <Text style={styles.footer}>扑灭火源可阻止扩散；刚灭火的格子本轮不会复燃。</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  shell: { backgroundColor: colors.surface, borderRadius: radii.large, padding: 10, gap: 8, borderWidth: 1, borderColor: colors.faint },
  compactShell: { gap: 6 },
  contrast: { borderColor: colors.ink, borderWidth: 2 },
  metrics: { flexDirection: "row", justifyContent: "space-between", backgroundColor: colors.canvas, padding: 8, borderRadius: radii.medium },
  compactMetrics: { paddingVertical: 6 },
  caption: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  value: { color: colors.ink, fontSize: 22, fontWeight: "800" },
  danger: { color: colors.danger },
  status: { color: colors.primaryDark, fontWeight: "800", fontSize: 15 },
  players: { flexDirection: "row", gap: 8 },
  player: { flex: 1, padding: 8, borderRadius: radii.small, gap: 2 },
  compactPlayer: { padding: 6 },
  own: { backgroundColor: colors.primarySoft }, partner: { backgroundColor: colors.tealSoft },
  playerName: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  plan: { color: colors.ink, fontSize: 13, lineHeight: 18 },
  forecast: { backgroundColor: colors.coralSoft, padding: 9, borderRadius: radii.small },
  compactForecast: { paddingVertical: 6 },
  forecastText: { color: colors.coralInk, fontSize: 12, fontWeight: "700" },
  allClear: { backgroundColor: colors.tealSoft },
  allClearText: { color: colors.tealInk },
  board: { gap: 4, width: "100%", maxWidth: 420, alignSelf: "center" },
  boardRow: { flexDirection: "row", gap: 4 },
  cell: { flex: 1, minHeight: 48, aspectRatio: 1, backgroundColor: colors.canvas, borderWidth: 2, borderColor: colors.faint, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  wall: { backgroundColor: colors.ink, borderColor: colors.ink }, wallText: { color: colors.surface },
  depot: { backgroundColor: colors.tealSoft }, fire: { backgroundColor: colors.coralSoft },
  forecastCell: { borderStyle: "dashed", borderColor: colors.coralInk },
  legalCell: { borderColor: colors.primary }, selectedCell: { borderColor: colors.primaryDark, backgroundColor: colors.primarySoft, borderWidth: 3 },
  pressed: { opacity: 0.65 },
  coordinate: { position: "absolute", top: 2, left: 3, fontSize: 9, color: colors.muted, fontWeight: "700" },
  glyph: { color: colors.ink, fontSize: 22, fontWeight: "800" },
  residentMark: { position: "absolute", bottom: 1, left: 3, fontSize: 10, color: colors.ink },
  fireMark: { position: "absolute", top: 1, right: 3, fontSize: 10, color: colors.coralInk, fontWeight: "800" },
  partnerMark: { position: "absolute", right: 1, bottom: 0, backgroundColor: colors.tealSoft, borderRadius: 4 },
  partnerMarkText: { color: colors.tealInk, fontSize: 10, fontWeight: "800" },
  legend: { fontSize: 12, color: colors.muted, textAlign: "center" },
  controls: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  operation: { flexGrow: 1, minHeight: 48, paddingHorizontal: 12 },
  compactTargetOperation: { flexBasis: "45%", paddingHorizontal: 6 },
  compactSupportOperation: { flexBasis: "27%", paddingHorizontal: 6 },
  instruction: { color: colors.ink, fontSize: 13, lineHeight: 19 },
  warning: { color: colors.coralInk, fontSize: 13, lineHeight: 19 },
  coordinated: { color: colors.tealInk, backgroundColor: colors.tealSoft, padding: 9, borderRadius: radii.small, fontSize: 13, lineHeight: 19 },
  footer: { color: colors.muted, fontSize: 12, lineHeight: 18 },
});
