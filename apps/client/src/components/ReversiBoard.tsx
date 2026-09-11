import { memo, useMemo, useState } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { Text } from "@/components/ScaledText";

import { REVERSI_SIZE, getReversiLegalMoves, type ReversiState, type Seat } from "@duo/game-core";
import { useI18n } from "@/i18n";

import type { RoomPhase } from "@duo/protocol";

import { colors, createGameStyles, radii } from "@/theme";
import { useSettings } from "@/settings/SettingsContext";

type Props = {
  game: ReversiState;
  phase: RoomPhase;
  ownSeat: Seat;
  onPlace: (row: number, col: number) => void;
};

export const ReversiBoard = memo(function ReversiBoard({ game, phase, ownSeat, onPlace }: Props) {
  const { t } = useI18n();
  const { feedback, settings } = useSettings();
  const { width, height } = useWindowDimensions();
  const [availableWidth, setAvailableWidth] = useState<number | null>(null);
  const boardSize = Math.floor(Math.min(availableWidth ?? width - 76, width - 40, height * 0.58, 540));
  const boardBorder = settings.highContrast ? 7 : 5;
  const cellSize = (boardSize - 2 * boardBorder) / REVERSI_SIZE;
  const legalMoves = useMemo(
    () => new Set(game.currentSeat === ownSeat ? getReversiLegalMoves(game, ownSeat) : []),
    [game, ownSeat],
  );
  const black = game.board.filter((piece) => piece === 1).length;
  const white = game.board.filter((piece) => piece === 2).length;

  return (
    <View onLayout={(event) => setAvailableWidth(event.nativeEvent.layout.width)}>
      <View style={styles.scoreRow}>
        <View style={styles.score}><View style={[styles.miniDisc, styles.black]} /><Text style={styles.scoreText}>黑 {black}</Text></View>
        <Text style={styles.moveText}>{game.result ? "本局棋盘" : phase !== "playing" ? "等待对局恢复" : game.passedSeat !== null ? "上一方无棋可下，已自动跳过" : game.currentSeat === ownSeat ? "亮点是你可落子的位置" : "等待对方落子"}</Text>
        <View style={styles.score}><View style={[styles.miniDisc, styles.white]} /><Text style={styles.scoreText}>白 {white}</Text></View>
      </View>
      <View testID="reversi-board" style={[styles.board, settings.highContrast && styles.highContrast, { width: boardSize, height: boardSize }]}>
        {game.board.map((piece, index) => {
          const row = Math.floor(index / REVERSI_SIZE);
          const col = index % REVERSI_SIZE;
          const legal = legalMoves.has(index) && phase === "playing" && !game.result;
          return (
            <Pressable
              accessibilityLabel={t(`第 ${row + 1} 行第 ${col + 1} 列，${piece === 1 ? "黑子" : piece === 2 ? "白子" : "空位"}${index === game.lastMove ? "，最近落子" : ""}${legal ? "，可以落子" : ""}`)}
              accessibilityRole="button"
              accessibilityState={{ disabled: !legal }}
              disabled={!legal}
              key={index}
              onPress={() => { feedback("place", "medium"); onPlace(row, col); }}
              style={({ pressed }) => [styles.cell, { width: cellSize, height: cellSize }, pressed && styles.pressed]}
            >
              {legal && <View style={[styles.legalDot, { pointerEvents: "none" }]} />}
              {piece !== 0 && (
                <View
                  style={[
                    styles.disc,
                    { width: cellSize * 0.72, height: cellSize * 0.72, borderRadius: cellSize * 0.36 },
                    piece === 1 ? styles.black : styles.white,
                    index === game.lastMove && styles.lastDisc,
                    { pointerEvents: "none" },
                  ]}
                />
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
});

const styles = createGameStyles({
  scoreRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 12 },
  score: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: colors.canvas, borderRadius: radii.pill, paddingHorizontal: 11, paddingVertical: 7 },
  scoreText: { color: colors.ink, fontWeight: "900", fontSize: 12 },
  moveText: { flex: 1, textAlign: "center", color: colors.muted, fontSize: 11 },
  miniDisc: { width: 16, height: 16, borderRadius: 8 },
  board: { alignSelf: "center", flexDirection: "row", flexWrap: "wrap", backgroundColor: "#147C62", borderRadius: 18, overflow: "hidden", borderWidth: 5, borderColor: "#0C5A47" },
  highContrast: { borderColor: colors.ink, borderWidth: 7 },
  cell: { alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(4,49,38,0.72)" },
  pressed: { backgroundColor: "rgba(255,255,255,0.16)" },
  disc: { shadowColor: "#071D16", shadowOpacity: 0.3, shadowRadius: 3, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  black: { backgroundColor: "#25262E", borderWidth: 1, borderColor: "#101117" },
  white: { backgroundColor: "#FFFDF7", borderWidth: 1, borderColor: "#D8D5CA" },
  lastDisc: { borderWidth: 3, borderColor: colors.amber },
  legalDot: { position: "absolute", width: 10, height: 10, borderRadius: 5, backgroundColor: "rgba(255,255,255,0.58)" },
});
