import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import type { GameId } from "@duo/game-core";

const memoryTutorials = new Set<GameId>();

function key(gameId: GameId): string {
  return `duo.tutorial.${gameId}.v1`;
}

export async function hasSeenTutorial(gameId: GameId): Promise<boolean> {
  if (Platform.OS === "web") {
    try {
      return (typeof localStorage !== "undefined" && localStorage.getItem(key(gameId)) === "seen") || memoryTutorials.has(gameId);
    } catch {
      return memoryTutorials.has(gameId);
    }
  }
  try {
    return await SecureStore.getItemAsync(key(gameId)) === "seen";
  } catch {
    return memoryTutorials.has(gameId);
  }
}

export async function markTutorialSeen(gameId: GameId): Promise<void> {
  if (Platform.OS === "web") {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(key(gameId), "seen");
        return;
      }
    } catch {
      // Fall back to memory below.
    }
    memoryTutorials.add(gameId);
    return;
  }
  try {
    await SecureStore.setItemAsync(key(gameId), "seen");
  } catch {
    memoryTutorials.add(gameId);
  }
}
