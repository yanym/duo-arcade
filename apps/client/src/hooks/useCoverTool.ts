import { useState } from "react";

type Tool = "scan" | "shoot";

export function useCoverTool(round: number, scanCharges: number) {
  const [choice, setChoice] = useState<{ round: number; tool: Tool }>(() => ({ round, tool: scanCharges > 0 ? "scan" : "shoot" }));
  // Reset once at a round boundary, never when the last scan is consumed.
  if (choice.round !== round) setChoice({ round, tool: scanCharges > 0 ? "scan" : "shoot" });
  return { tool: choice.tool, chooseTool: (tool: Tool) => setChoice({ round, tool }) };
}
