import { useLayoutEffect, useState } from "react";

/** Refresh before paint on start/resume; idle rooms do not keep a timer running. */
export function useNow(active: boolean, intervalMs: number | null, wakeAt?: number): number {
  const [now, setNow] = useState(() => Date.now());
  useLayoutEffect(() => {
    if (!active) return;
    const refresh = () => setNow(Date.now());
    refresh();
    if (intervalMs === null) {
      if (wakeAt === undefined) return;
      const timer = setTimeout(refresh, Math.max(0, wakeAt - Date.now() + 16));
      return () => clearTimeout(timer);
    }
    const timer = setInterval(refresh, intervalMs);
    return () => clearInterval(timer);
  }, [active, intervalMs, wakeAt]);
  return now;
}
