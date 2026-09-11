import { useEffect } from "react";
import { Platform } from "react-native";

export function useWebDocumentTitle(title: string): void {
  useEffect(() => {
    if (Platform.OS === "web" && typeof document !== "undefined") document.title = title;
  }, [title]);
}
