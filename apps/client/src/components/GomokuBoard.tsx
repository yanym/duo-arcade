import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";

import { fromCellIndex, GOMOKU_SIZE, type GomokuState } from "@duo/game-core";
import { useI18n } from "@/i18n";

import type { RoomPhase } from "@duo/protocol";

import { colors, createGameStyles } from "@/theme";
import { useSettings } from "@/settings/SettingsContext";
import { nextGomokuFocusIndex } from "@/lib/gomokuKeyboard";

type GomokuBoardProps = {
  game: GomokuState;
  phase: RoomPhase;
  canPlay: boolean;
  onPlace: (row: number, col: number) => void;
};

function preferredFocusIndex(game: GomokuState): number {
  const center = Math.floor(game.board.length / 2);
  if (game.lastMove === null && game.board[center] === 0) return center;
  if (game.lastMove !== null) {
    const row = Math.floor(game.lastMove / GOMOKU_SIZE);
    const col = game.lastMove % GOMOKU_SIZE;
    for (const [rowOffset, colOffset] of [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [1, -1], [-1, -1], [-1, 1]] as const) {
      const nextRow = row + rowOffset;
      const nextCol = col + colOffset;
      const next = nextRow * GOMOKU_SIZE + nextCol;
      if (nextRow >= 0 && nextRow < GOMOKU_SIZE && nextCol >= 0 && nextCol < GOMOKU_SIZE && game.board[next] === 0) return next;
    }
  }
  return game.board.findIndex((piece) => piece === 0);
}

export const GomokuBoard = memo(function GomokuBoard({ game, phase, canPlay, onPlace }: GomokuBoardProps) {
  const { t } = useI18n();
  const { feedback, settings } = useSettings();
  const { width, height } = useWindowDimensions();
  const boardSize = Math.floor(Math.min(width - 40, height * 0.6, 560));
  const borderWidth = 6;
  const cellSize = (boardSize - borderWidth * 2) / GOMOKU_SIZE;
  const winningCells = useMemo(() => new Set(game.winningLine ?? []), [game.winningLine]);
  const enabled = phase === "playing" && canPlay && !game.result;
  const cellRefs = useRef<({ focus?: () => void } | null)[]>([]);
  const [keyboardIndex, setKeyboardIndex] = useState(() => preferredFocusIndex(game));
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled || game.board[keyboardIndex] === 0) return;
    setKeyboardIndex(preferredFocusIndex(game));
  }, [enabled, game, keyboardIndex]);

  return (
    <View accessibilityLabel={t("15 乘 15 五子棋棋盘；按 Tab 进入棋盘，使用方向键移动，按回车或空格落子")} style={[styles.board, settings.highContrast && styles.highContrast, { width: boardSize, height: boardSize }]}>
      {game.board.map((piece, index) => {
        const { row, col } = fromCellIndex(index);
        const isLast = index === game.lastMove;
        const isWinning = winningCells.has(index);
        const isStar = (row === 3 || row === 7 || row === 11) && (col === 3 || col === 7 || col === 11);
        return (
          <Pressable
            accessibilityHint={t("使用方向键移动到其他空位，按回车或空格落子")}
            accessibilityRole="button"
            accessibilityLabel={t(`第 ${row + 1} 行第 ${col + 1} 列，${piece === 0 ? "空位" : piece === 1 ? "黑子" : "白子"}`)}
            accessibilityState={{ disabled: !enabled || piece !== 0 }}
            disabled={!enabled || piece !== 0}
            key={index}
            onBlur={() => setFocusedIndex((focused) => focused === index ? null : focused)}
            onFocus={() => { setKeyboardIndex(index); setFocusedIndex(index); }}
            onPress={() => { feedback("place", "medium"); onPlace(row, col); }}
            ref={(node) => { cellRefs.current[index] = node as unknown as { focus?: () => void } | null; }}
            style={({ pressed }) => [styles.cell, { width: cellSize, height: cellSize }, focusedIndex === index && styles.focusedCell, pressed && styles.pressedCell]}
            tabIndex={enabled && piece === 0 && index === keyboardIndex ? 0 : -1}
            {...(Platform.OS === "web" ? {
              onKeyDown: (event: { nativeEvent: { key: string }; preventDefault: () => void }) => {
                const next = nextGomokuFocusIndex(game.board, index, event.nativeEvent.key);
                if (next === index) return;
                event.preventDefault();
                setKeyboardIndex(next);
                requestAnimationFrame(() => cellRefs.current[next]?.focus?.());
              },
            } : {})}
          >
            <View
              style={[
                styles.horizontal,
                { left: col === 0 ? cellSize / 2 : 0, right: col === GOMOKU_SIZE - 1 ? cellSize / 2 : 0, pointerEvents: "none" }
              ]}
            />
            <View
              style={[
                styles.vertical,
                { top: row === 0 ? cellSize / 2 : 0, bottom: row === GOMOKU_SIZE - 1 ? cellSize / 2 : 0, pointerEvents: "none" }
              ]}
            />
            {isStar && piece === 0 && <View style={[styles.star, { pointerEvents: "none" }]} />}
            {piece !== 0 && (
              <View
                style={[
                  styles.stone,
                  { width: cellSize * 0.76, height: cellSize * 0.76, borderRadius: cellSize * 0.38 },
                  piece === 1 ? styles.blackStone : styles.whiteStone,
                  isWinning && styles.winningStone,
                  { pointerEvents: "none" },
                ]}
              >
                {isLast && <View style={[styles.lastDot, piece === 1 ? styles.lightDot : styles.darkDot]} />}
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
});

const styles = createGameStyles({
  board: {
    alignSelf: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: colors.board,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 6,
    borderColor: "#D3A759"
  },
  highContrast: { borderColor: colors.ink },
  cell: { alignItems: "center", justifyContent: "center" },
  focusedCell: { backgroundColor: "rgba(255,255,255,0.34)", borderWidth: 2, borderColor: colors.primaryDark },
  pressedCell: { backgroundColor: "rgba(255,255,255,0.22)" },
  horizontal: {
    position: "absolute",
    top: "50%",
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.boardLine,
    opacity: 0.7
  },
  vertical: {
    position: "absolute",
    left: "50%",
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.boardLine,
    opacity: 0.7
  },
  star: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.boardLine },
  stone: {
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#2B2015",
    shadowOpacity: 0.24,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2
  },
  blackStone: { backgroundColor: "#292A31", borderWidth: 1, borderColor: "#111218" },
  whiteStone: { backgroundColor: "#FFFDF8", borderWidth: 1, borderColor: "#D8D2C7" },
  winningStone: { borderWidth: 3, borderColor: colors.coral },
  lastDot: { width: 5, height: 5, borderRadius: 3 },
  lightDot: { backgroundColor: colors.surface },
  darkDot: { backgroundColor: colors.ink }
});
