import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { Text } from "@/components/ScaledText";
import { useI18n } from "@/i18n";

import { coverHuntConfig, emberCrewConfig, signalBluffConfig, type GameOptions } from "@duo/game-core";

import type { GameInfo } from "@/lib/games";
import { colors, radii } from "@/theme";

type Props = {
  game: GameInfo;
  options: GameOptions;
  onChange: (options: GameOptions) => void;
};

const rows: {
  key: keyof GameOptions;
  label: string;
  choices: { value: string; label: string }[];
}[] = [
  { key: "pace", label: "节奏", choices: [{ value: "relaxed", label: "悠闲" }, { value: "standard", label: "标准" }, { value: "blitz", label: "闪电" }] },
  { key: "difficulty", label: "难度", choices: [{ value: "easy", label: "轻松" }, { value: "standard", label: "标准" }, { value: "hard", label: "高手" }] },
  { key: "length", label: "局数", choices: [{ value: "short", label: "短局" }, { value: "standard", label: "标准" }, { value: "long", label: "长局" }] },
];

function optionEffect(game: GameInfo, options: GameOptions): string {
  if (game.id === "ember_crew") {
    const config = emberCrewConfig(options);
    return `${config.target} 位居民 · ${config.maxRounds} 轮行动 · ${config.integrity} 点楼体完整度 · 每轮 ${config.roundDurationMs / 1000} 秒规划`;
  }
  if (game.id === "gomoku" || game.id === "reversi") {
    return `每回合 ${options.pace === "relaxed" ? 60 : options.pace === "blitz" ? 15 : 30} 秒`;
  }
  if (game.id === "split_maze") {
    const size = options.difficulty === "easy" ? 7 : options.difficulty === "hard" ? 11 : 9;
    const seconds = options.pace === "relaxed" ? 105 : options.pace === "blitz" ? 55 : 75;
    return `${size}×${size} 迷宫 · ${seconds} 秒限时`;
  }
  if (game.id === "sync_tap") {
    const rounds = options.length === "short" ? 3 : options.length === "long" ? 7 : 5;
    const window = options.difficulty === "easy" ? 10 : options.difficulty === "hard" ? 5 : 8;
    return `${rounds} 轮 · 每轮 ${window} 秒反应窗口`;
  }
  if (game.id === "cover_hunt") {
    const { covers, scanCharges: scans, totalRounds: rounds, huntDurationMs } = coverHuntConfig(options);
    const huntSeconds = huntDurationMs / 1000;
    return `${covers} 处掩体 · ${scans} 次扫描 · ${rounds} 轮 · 搜索 ${huntSeconds} 秒`;
  }
  if (game.id === "quantum_duel") {
    const rounds = options.length === "short" ? 3 : options.length === "long" ? 7 : 5;
    const seconds = options.pace === "relaxed" ? 30 : options.pace === "blitz" ? 12 : 20;
    return `${rounds} 轮制 · 每轮 ${seconds} 秒秘密锁定`;
  }
  if (game.id === "starway_escort") {
    const sectors = options.length === "short" ? 3 : options.length === "long" ? 7 : 5;
    const hull = options.difficulty === "easy" ? 4 : options.difficulty === "hard" ? 2 : 3;
    const seconds = options.pace === "relaxed" ? 45 : options.pace === "blitz" ? 18 : 30;
    return `${sectors} 航段 · ${hull} 点船体 · 每段 ${seconds} 秒规划`;
  }
  if (game.id === "orbital_repair") {
    const stages = options.length === "short" ? 3 : options.length === "long" ? 7 : 5;
    const rings = options.difficulty === "easy" ? 2 : 3;
    const slots = options.difficulty === "hard" ? 6 : 4;
    const strikes = options.difficulty === "easy" ? 3 : options.difficulty === "hard" ? 1 : 2;
    const seconds = options.pace === "relaxed" ? 50 : options.pace === "blitz" ? 22 : 35;
    return `${stages} 站 · ${rings} 环/${slots} 刻度 · ${strikes} 次容错 · 每站 ${seconds} 秒`;
  }
  if (game.id === "rhythm_gravity") {
    const rounds = options.length === "short" ? 3 : options.length === "long" ? 7 : 5;
    const countdown = options.pace === "relaxed" ? 3 : options.pace === "blitz" ? 1.6 : 2.2;
    const window = options.difficulty === "easy" ? 1200 : options.difficulty === "hard" ? 650 : 900;
    return `${rounds} 轮 · ${countdown} 秒预备 · ${window}ms 击拍窗口`;
  }
  if (game.id === "shadow_shuttle") {
    const rounds = options.length === "short" ? 3 : options.length === "long" ? 7 : 5;
    const pods = options.difficulty === "easy" ? 4 : options.difficulty === "hard" ? 6 : 5;
    const swaps = options.difficulty === "easy" ? 4 : options.difficulty === "hard" ? 8 : 6;
    const seconds = options.pace === "relaxed" ? 15 : options.pace === "blitz" ? 7 : 10;
    return `${rounds} 轮 · ${pods} 艘逃逸舱 · ${swaps} 次换位 · ${seconds} 秒决策`;
  }
  if (game.id === "echo_relay") {
    const tones = options.difficulty === "easy" ? 3 : options.difficulty === "hard" ? 5 : 4;
    const strikes = options.difficulty === "easy" ? 3 : options.difficulty === "hard" ? 1 : 2;
    const stages = options.length === "short" ? 3 : options.length === "long" ? 7 : 5;
    const seconds = options.pace === "relaxed" ? 55 : options.pace === "blitz" ? 26 : 38;
    return `${stages} 信号段 · ${tones} 枚脉冲 · ${strikes} 次容错 · 每段 ${seconds} 秒`;
  }
  if (game.id === "core_rally") {
    const lanes = options.difficulty === "easy" ? 3 : options.difficulty === "hard" ? 5 : 4;
    const stability = options.difficulty === "easy" ? 4 : options.difficulty === "hard" ? 2 : 3;
    const window = options.difficulty === "easy" ? 1200 : options.difficulty === "hard" ? 650 : 900;
    const returns = options.length === "short" ? 6 : options.length === "long" ? 14 : 10;
    const flight = options.pace === "relaxed" ? 2.6 : options.pace === "blitz" ? 1.4 : 1.9;
    return `${returns} 次接力 · ${lanes} 条轨道 · ${stability} 点稳定度 · ${flight} 秒来球/${window}ms 窗口`;
  }
  if (game.id === "skyline_rescue") {
    const waves = options.length === "short" ? 4 : options.length === "long" ? 8 : 6;
    const integrity = options.difficulty === "easy" ? 5 : options.difficulty === "hard" ? 3 : 4;
    const water = options.difficulty === "easy" ? 18 : options.difficulty === "hard" ? 12 : 15;
    const seconds = options.pace === "relaxed" ? 45 : options.pace === "blitz" ? 20 : 30;
    return `${waves} 波热源 · ${integrity} 点完整度 · ${water} 单位水量 · 每波 ${seconds} 秒`;
  }
  if (game.id === "meteor_dash") {
    const rounds = options.length === "short" ? 5 : options.length === "long" ? 9 : 7;
    const cells = options.difficulty === "easy" ? 4 : options.difficulty === "hard" ? 8 : 6;
    const window = options.difficulty === "easy" ? 2500 : options.difficulty === "hard" ? 1200 : 1800;
    const countdown = options.pace === "relaxed" ? 2.2 : options.pace === "blitz" ? 1.1 : 1.6;
    return `${rounds} 轮 · ${cells} 枚信标 · ${countdown} 秒预备 · ${window}ms 捕捉窗口`;
  }
  if (game.id === "dual_thrusters") {
    const gates = options.length === "short" ? 5 : options.length === "long" ? 9 : 7;
    const lanes = options.difficulty === "easy" ? 5 : options.difficulty === "hard" ? 9 : 7;
    const hull = options.difficulty === "easy" ? 4 : options.difficulty === "hard" ? 2 : 3;
    const seconds = options.pace === "relaxed" ? 14 : options.pace === "blitz" ? 7 : 10;
    return `${gates} 道航门 · ${lanes} 条轨道 · ${hull} 点船体 · 每段 ${seconds} 秒`;
  }
  if (game.id === "fog_sonar") {
    const zones = options.length === "short" ? 2 : options.length === "long" ? 4 : 3;
    const size = options.difficulty === "easy" ? 5 : options.difficulty === "hard" ? 7 : 6;
    const hull = options.difficulty === "easy" ? 4 : options.difficulty === "hard" ? 2 : 3;
    const pulses = options.difficulty === "easy" ? 5 : options.difficulty === "hard" ? 3 : 4;
    const seconds = options.pace === "relaxed" ? 70 : options.pace === "blitz" ? 35 : 50;
    return `${zones} 片雾区 · ${size}×${size} 海图 · ${hull} 点船体 · ${pulses} 次脉冲 · 每区 ${seconds} 秒`;
  }
  if (game.id === "storm_grid") {
    const waves = options.length === "short" ? 4 : options.length === "long" ? 8 : 6;
    const nodes = options.difficulty === "easy" ? 4 : options.difficulty === "hard" ? 6 : 5;
    const integrity = options.difficulty === "easy" ? 4 : options.difficulty === "hard" ? 2 : 3;
    const window = options.difficulty === "easy" ? 2200 : options.difficulty === "hard" ? 1000 : 1600;
    const charge = options.pace === "relaxed" ? 8 : options.pace === "blitz" ? 4 : 6;
    return `${waves} 波雷暴 · ${nodes} 个节点 · ${integrity} 点完整度 · ${charge} 秒预充/${window}ms 放电窗`;
  }
  if (game.id === "trajectory_intercept") {
    const rounds = options.length === "short" ? 5 : options.length === "long" ? 9 : 7;
    const lanes = options.difficulty === "easy" ? 5 : options.difficulty === "hard" ? 9 : 7;
    const window = options.difficulty === "easy" ? 5 : options.difficulty === "hard" ? 2.8 : 3.8;
    const countdown = options.pace === "relaxed" ? "2.5–3.1" : options.pace === "blitz" ? "1.3–1.9" : "1.9–2.5";
    return `${rounds} 轮 · ${lanes} 条轨道 · ${countdown} 秒随机预备 · ${window} 秒截获窗`;
  }
  if (game.id === "star_trace") {
    const stages = options.length === "short" ? 2 : options.length === "long" ? 4 : 3;
    const size = options.difficulty === "easy" ? 7 : options.difficulty === "hard" ? 11 : 9;
    const stars = options.difficulty === "easy" ? 3 : options.difficulty === "hard" ? 5 : 4;
    const ink = options.difficulty === "easy" ? 12 : options.difficulty === "hard" ? 5 : 8;
    const seconds = options.pace === "relaxed" ? 60 : options.pace === "blitz" ? 32 : 45;
    return `${stages} 张星图 · ${size}×${size} 星域 · 每图 ${stars} 点 · ${ink} 格额外星墨 · 每图 ${seconds} 秒`;
  }
  if (game.id === "magnet_haul") {
    const checkpoints = options.length === "short" ? 4 : options.length === "long" ? 8 : 6;
    const lanes = options.difficulty === "easy" ? 5 : options.difficulty === "hard" ? 9 : 7;
    const tension = options.difficulty === "easy" ? 3 : options.difficulty === "hard" ? 1 : 2;
    const battery = options.difficulty === "easy" ? 20 : options.difficulty === "hard" ? 10 : 14;
    const seconds = options.pace === "relaxed" ? 20 : options.pace === "blitz" ? 10 : 14;
    return `${checkpoints} 道装卸门 · ${lanes} 条高度轨 · 张力上限 ${tension} · 最短路线外加 ${battery} 格电量 · 每门 ${seconds} 秒`;
  }
  if (game.id === "lumen_bridge") {
    const stages = options.length === "short" ? 4 : options.length === "long" ? 8 : 6;
    const lanes = options.difficulty === "easy" ? 5 : options.difficulty === "hard" ? 9 : 7;
    const arc = options.difficulty === "easy" ? 1 : options.difficulty === "hard" ? 3 : 2;
    const stability = options.difficulty === "easy" ? 4 : options.difficulty === "hard" ? 2 : 3;
    const window = options.difficulty === "easy" ? 1600 : options.difficulty === "hard" ? 800 : 1100;
    const seconds = options.pace === "relaxed" ? 24 : options.pace === "blitz" ? 14 : 18;
    return `${stages} 个光桥节点 · ${lanes} 条高度轨 · ±${arc} 档星弧 · ${stability} 点稳定度 · ${window}ms 共振窗 · 每节点 ${seconds} 秒`;
  }
  if (game.id === "neon_dash") {
    const rounds = options.length === "short" ? 5 : options.length === "long" ? 9 : 7;
    const moves = options.difficulty === "easy" ? 2 : options.difficulty === "hard" ? 5 : 4;
    const lives = options.difficulty === "easy" ? 4 : options.difficulty === "hard" ? 2 : 3;
    const window = options.difficulty === "easy" ? 3 : options.difficulty === "hard" ? 1.6 : 2.2;
    const countdown = options.pace === "relaxed" ? "2.2–2.7" : options.pace === "blitz" ? "1.0–1.5" : "1.6–2.1";
    return `${rounds} 段赛道 · ${moves} 种动作 · ${lives} 点护盾 · ${countdown} 秒随机预备 · ${window} 秒反应窗`;
  }
  if (game.id === "signal_bluff") {
    const { totalRounds: rounds, signalCount: runes, scanCharges: scans, claimDurationMs, judgeDurationMs } = signalBluffConfig(options);
    return `${rounds} 轮 · ${runes} 种符文 · 每人整局 ${scans} 次扫描 · 谎报 ${claimDurationMs / 1000} 秒/判断 ${judgeDurationMs / 1000} 秒`;
  }
  if (game.id === "prism_heist") {
    const corridors = options.length === "short" ? 4 : options.length === "long" ? 8 : 6;
    const lanes = options.difficulty === "easy" ? 3 : options.difficulty === "hard" ? 5 : 4;
    const integrity = options.difficulty === "easy" ? 4 : options.difficulty === "hard" ? 2 : 3;
    const window = options.difficulty === "easy" ? 2400 : options.difficulty === "hard" ? 900 : 1500;
    const approach = options.pace === "relaxed" ? 12 : options.pace === "blitz" ? 5 : 8;
    return `${corridors} 段走廊 · ${lanes} 条航道 · ${integrity} 点完整度 · ${approach} 秒侦察/${window}ms 突破窗`;
  }
  if (game.id === "nova_volley") {
    const target = options.length === "short" ? 3 : options.length === "long" ? 7 : 5;
    const lanes = options.difficulty === "easy" ? 3 : options.difficulty === "hard" ? 5 : 4;
    const window = options.difficulty === "easy" ? 1400 : options.difficulty === "hard" ? 600 : 900;
    const flight = options.pace === "relaxed" ? 2.8 : options.pace === "blitz" ? 1.4 : 2;
    return `先到 ${target} 分 · ${lanes} 条球路 · 初速每拍 ${flight} 秒 · ${window}ms 击球窗 · 连拍逐步加速`;
  }
  if (game.id === "pulse_pass") {
    const rounds = options.length === "short" ? 3 : options.length === "long" ? 7 : 5;
    const powers = options.difficulty === "easy" ? "轻推/强传" : "轻推/强传/过载";
    const vents = options.difficulty === "easy" ? 2 : options.difficulty === "hard" ? 0 : 1;
    const range = options.difficulty === "easy" ? "9–11" : options.difficulty === "hard" ? "7–9" : "8–10";
    const seconds = options.pace === "relaxed" ? 20 : options.pace === "blitz" ? 9 : 14;
    return `${rounds} 轮 · 爆点范围 ${range} · ${powers} · 每人 ${vents} 次整局冷却 · 每手 ${seconds} 秒`;
  }
  if (game.id === "drop_rescue") {
    const landings = options.length === "short" ? 4 : options.length === "long" ? 8 : 6;
    const lanes = options.difficulty === "easy" ? 5 : options.difficulty === "hard" ? 9 : 7;
    const hull = options.difficulty === "easy" ? 4 : options.difficulty === "hard" ? 2 : 3;
    const fuel = landings * 2 + (options.difficulty === "easy" ? 8 : options.difficulty === "hard" ? 2 : 4);
    const wind = options.difficulty === "hard" ? "±2" : "±1";
    const seconds = options.pace === "relaxed" ? 24 : options.pace === "blitz" ? 11 : 17;
    return `${landings} 个救援点 · ${lanes} 条航道 · 侧风 ${wind} · ${hull} 点舱体 · ${fuel} 格燃料 · 每次 ${seconds} 秒`;
  }
  const symbols = options.difficulty === "easy" ? 3 : options.difficulty === "hard" ? 5 : 4;
  const strikes = options.difficulty === "easy" ? 3 : options.difficulty === "hard" ? 1 : 2;
  const stages = options.length === "short" ? 3 : options.length === "long" ? 7 : 5;
  const seconds = options.pace === "relaxed" ? 60 : options.pace === "blitz" ? 25 : 40;
  return `${stages} 舱段 · ${symbols} 位序列 · ${strikes} 次容错 · 每段 ${seconds} 秒`;
}

export function GameOptionsPanel({ game, options, onChange }: Props) {
  const { language, t } = useI18n();
  const { width, fontScale } = useWindowDimensions();
  const largeText = fontScale > 1.2;
  const stackedLabels = width < 600 || largeText;
  return (
    <View style={styles.panel}>
      <View style={styles.headingRow}>
        <View>
          <Text style={styles.kicker}>开房设置</Text>
          <Text accessibilityRole="header" aria-level={2} style={styles.title}>{game.title}规则</Text>
        </View>
        <Text style={styles.effect}>{optionEffect(game, options)}</Text>
      </View>
      {rows.filter((row) => game.optionKeys.includes(row.key)).map((row) => (
        <View key={row.key} style={[styles.row, stackedLabels && styles.rowStacked]}>
          <Text style={[styles.label, language === "en" && styles.labelEnglish, stackedLabels && styles.labelStacked]}>{row.label}</Text>
          <View style={[styles.segments, stackedLabels && styles.segmentsFullWidth, largeText && styles.segmentsLargeText]}>
            {row.choices.map((choice) => {
              const selected = options[row.key] === choice.value;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${t(row.label)}${language === "en" ? ": " : "："}${t(choice.label)}`}
                  accessibilityState={{ selected }}
                  aria-pressed={selected}
                  key={choice.value}
                  onPress={() => onChange({ ...options, [row.key]: choice.value })}
                  style={({ pressed }) => [styles.segment, largeText && styles.segmentLargeText, selected && styles.segmentActive, pressed && styles.pressed]}
                >
                  <Text style={[styles.segmentText, selected && styles.segmentTextActive]}>{choice.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: colors.surface, borderRadius: radii.large, borderWidth: 1, borderColor: colors.faint, padding: 18, marginTop: 18 },
  headingRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 10, marginBottom: 14 },
  kicker: { color: colors.tealInk, fontSize: 11, fontWeight: "900", letterSpacing: 0.8 },
  title: { color: colors.ink, fontSize: 18, fontWeight: "900", marginTop: 3 },
  effect: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14, marginTop: 10 },
  rowStacked: { flexDirection: "column", alignItems: "stretch", gap: 8 },
  label: { color: colors.ink, fontSize: 14, fontWeight: "800", width: 40 },
  labelEnglish: { width: 68, fontSize: 12 },
  labelStacked: { width: "auto" },
  segments: { flexGrow: 1, flexShrink: 1, flexBasis: 0, flexDirection: "row", borderRadius: radii.small, backgroundColor: colors.canvas, padding: 3 },
  segmentsFullWidth: { flexGrow: 0, flexShrink: 0, flexBasis: "auto", width: "100%" },
  segmentsLargeText: { flexDirection: "column", gap: 3 },
  segment: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, minHeight: 44, borderRadius: 8, alignItems: "center", justifyContent: "center", paddingHorizontal: 6, paddingVertical: 10 },
  segmentLargeText: { flexGrow: 0, flexShrink: 0, flexBasis: "auto" },
  segmentActive: { backgroundColor: colors.primary },
  segmentText: { color: colors.muted, fontSize: 14, fontWeight: "800", textAlign: "center", maxWidth: "100%" },
  segmentTextActive: { color: colors.surface },
  pressed: { opacity: 0.78 },
});
