import { memo, useState } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import { Text } from "@/components/ScaledText";
import { useI18n } from "@/i18n";

import {
  WALL_BOTTOM,
  WALL_LEFT,
  WALL_RIGHT,
  WALL_TOP,
  type MazeDirection,
  type Seat,
  type SplitMazeState,
} from "@duo/game-core";
import type { RoomPhase } from "@duo/protocol";

import { colors, createGameStyles, radii } from "@/theme";
import { useSettings } from "@/settings/SettingsContext";

type Props = {
  game: SplitMazeState;
  phase: RoomPhase;
  ownSeat: Seat;
  onMove: (direction: MazeDirection) => void;
};

const arrow: Record<MazeDirection, string> = { up: "↑", right: "→", down: "↓", left: "←" };

export const MazeBoard = memo(function MazeBoard({ game, phase, ownSeat, onMove }: Props) {
  const { t } = useI18n();
  const { feedback, settings } = useSettings();
  const { width, height } = useWindowDimensions();
  const [availableWidth, setAvailableWidth] = useState<number | null>(null);
  const boardSize = Math.floor(Math.min(availableWidth ?? width - 76, width - 40, height * 0.52, 510));
  const cellSize = (boardSize - 6) / game.cols;
  const directions: MazeDirection[] = ownSeat === game.verticalSeat ? ["up", "down"] : ["left", "right"];
  const canMove = phase === "playing" && !game.result;

  return (
    <View onLayout={(event) => setAvailableWidth(event.nativeEvent.layout.width)}>
      <View style={styles.legend}>
        <Text style={styles.role}>你的任务：{ownSeat === game.verticalSeat ? "只控制上下" : "只控制左右"}</Text>
        <Text style={styles.stats}>移动 {game.moveCount} · 撞墙 {game.wallHits}</Text>
      </View>
      <View testID="maze-board" style={[styles.board, { width: boardSize, height: boardSize }]}>
        {game.walls.map((walls, index) => (
          <View
            key={index}
            testID={`maze-cell-${index}`}
            style={[
              styles.cell,
              {
                width: cellSize,
                height: cellSize,
                borderTopWidth: walls & WALL_TOP ? 2 : 0,
                borderRightWidth: walls & WALL_RIGHT ? 2 : 0,
                borderBottomWidth: walls & WALL_BOTTOM ? 2 : 0,
                borderLeftWidth: walls & WALL_LEFT ? 2 : 0,
              },
              index === 0 && styles.startCell,
              index === game.exit && styles.exitCell,
            ]}
          >
            {index === 0 && index !== game.position && <Text style={styles.start}>起</Text>}
            {index === game.exit && <Text style={styles.flag}>⚑</Text>}
            {index === game.position && <View style={styles.runner}><Text style={styles.runnerText}>✦</Text></View>}
          </View>
        ))}
      </View>
      <View style={styles.controls}>
        {directions.map((direction) => (
          <Pressable
            accessibilityLabel={t(`向${direction === "up" ? "上" : direction === "down" ? "下" : direction === "left" ? "左" : "右"}移动`)}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canMove }}
            disabled={!canMove}
            key={direction}
            onPress={() => { feedback("place", "light"); onMove(direction); }}
            style={({ pressed }) => [styles.control, settings.highContrast && styles.highContrast, !canMove && styles.disabled, pressed && !settings.reducedMotion && styles.pressed]}
          >
            <Text style={styles.controlArrow}>{arrow[direction]}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
});

const styles = createGameStyles({
  legend: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 },
  role: { color: colors.tealInk, fontWeight: "900", fontSize: 13 },
  stats: { color: colors.muted, fontSize: 11 },
  board: { alignSelf: "center", flexDirection: "row", flexWrap: "wrap", backgroundColor: "#FDFBF5", borderWidth: 3, borderColor: colors.ink, borderRadius: 12, overflow: "hidden" },
  cell: { alignItems: "center", justifyContent: "center", borderColor: colors.ink },
  startCell: { backgroundColor: colors.primarySoft },
  exitCell: { backgroundColor: colors.tealSoft },
  start: { color: colors.primaryDark, fontSize: 9, fontWeight: "900" },
  flag: { color: colors.tealInk, fontSize: 18, fontWeight: "900" },
  runner: { position: "absolute", width: "66%", height: "66%", borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: colors.coral, shadowColor: colors.shadow, shadowOpacity: 0.2, shadowRadius: 4, elevation: 3 },
  runnerText: { color: colors.ink, fontSize: 17, fontWeight: "900" },
  controls: { flexDirection: "row", justifyContent: "center", gap: 14, marginTop: 16 },
  control: { width: 78, height: 58, borderRadius: radii.medium, alignItems: "center", justifyContent: "center", backgroundColor: colors.teal },
  controlArrow: { color: colors.surface, fontSize: 30, fontWeight: "900" },
  highContrast: { borderWidth: 2, borderColor: colors.ink },
  disabled: { opacity: 0.45 },
  pressed: { transform: [{ scale: 0.96 }] },
});
