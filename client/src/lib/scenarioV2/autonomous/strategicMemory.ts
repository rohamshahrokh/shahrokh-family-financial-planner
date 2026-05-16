/**
 * PART 12 — Strategic Memory.
 *
 * Reads the deterministic strategic-memory input the UI hands in. We do
 * NOT modify the production database here — persistence is the caller's
 * concern (localStorage today, server-side in a future schema-aware
 * release). The autonomous report echoes back the active preferences and
 * surfaces the constraints the engine should respect downstream.
 */

import type { StrategicMemoryInput } from "./types";

export interface StrategicMemoryEcho {
  hasMemory: boolean;
  summary: string[];
  activeConstraints: string[];
}

export function summariseStrategicMemory(memory?: StrategicMemoryInput | null): StrategicMemoryEcho {
  if (!memory || !Object.keys(memory).length) {
    return {
      hasMemory: false,
      summary: ["Strategic memory has not been initialised — the next decision will record your preferences as the baseline."],
      activeConstraints: [],
    };
  }
  const summary: string[] = [];
  if (memory.philosophy) summary.push(`Investment philosophy: ${humanise(memory.philosophy)}.`);
  if (memory.leverageTolerance) summary.push(`Leverage tolerance: ${memory.leverageTolerance}.`);
  if (memory.liquidityPreference) summary.push(`Liquidity preference: ${memory.liquidityPreference}.`);
  if (memory.preferredPaths?.length) summary.push(`Preferred paths recorded: ${memory.preferredPaths.length}.`);
  if (memory.rejectedPaths?.length) summary.push(`Rejected paths recorded: ${memory.rejectedPaths.length}.`);
  if (memory.lastWinnerLabel) summary.push(`Last recommendation: ${memory.lastWinnerLabel}.`);
  if (memory.lastUpdated) summary.push(`Last updated: ${memory.lastUpdated}.`);

  const activeConstraints = [...(memory.constraints ?? [])];
  if (memory.liquidityPreference === "deep") activeConstraints.push("Maintain a deeper-than-default liquidity floor.");
  if (memory.leverageTolerance === "low") activeConstraints.push("Avoid maximum-leverage paths regardless of headline return.");
  if (memory.philosophy === "preserve-first") activeConstraints.push("Preserve capital ahead of accumulation.");
  if (memory.rejectedPaths?.length) activeConstraints.push("Do not re-surface previously-rejected paths without changed reason.");

  return {
    hasMemory: true,
    summary,
    activeConstraints: dedupe(activeConstraints),
  };
}

function humanise(p: NonNullable<StrategicMemoryInput["philosophy"]>): string {
  switch (p) {
    case "preserve-first": return "preservation-first";
    case "balanced-growth": return "balanced growth";
    case "compound-growth": return "compound growth";
    case "aggressive-growth": return "aggressive growth";
    case "income-focused": return "income-focused";
  }
}
function dedupe(arr: string[]): string[] {
  const s = new Set<string>();
  return arr.filter((x) => (s.has(x) ? false : (s.add(x), true)));
}
