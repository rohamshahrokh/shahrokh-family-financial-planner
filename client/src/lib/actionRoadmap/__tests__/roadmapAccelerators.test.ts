/**
 * roadmapAccelerators.test.ts — Sprint 27.
 *
 * Honesty checks for accelerator ranking. The brief requires:
 *   - Only rank an alternate when BOTH it and the recommended have a non-null
 *     `medianNwPath`.
 *   - Never fabricate a delta — must come from real engine output.
 *   - Empty list when no comparable alternate exists.
 *
 * Run: npx tsx client/src/lib/actionRoadmap/__tests__/roadmapAccelerators.test.ts
 */

import type { GoalLabPathPicks, GoalLabRankedScenario } from "../../goalLab/orchestrator";
import { buildAcceleratorRanking } from "../roadmapAccelerators";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: string): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else      { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

function scenario(opts: {
  templateId: string;
  candId: string;
  candLabel: string;
  terminalNw: number | null;
  probability?: number | null;
  alternates?: { id: string; label: string; terminalNw: number | null }[];
}): GoalLabRankedScenario {
  const buildCand = (id: string, label: string, terminalNw: number | null) => ({
    id, label, shortLabel: label,
    events: [],
    result: {
      medianNwPath: terminalNw == null ? [] : [terminalNw * 0.5, terminalNw * 0.75, terminalNw],
    } as never,
    score: {} as never, trace: {} as never,
    headline: "h", rationale: [`why ${id}`], softWarnings: [], isHighRisk: false,
  });
  return {
    templateId: opts.templateId, templateLabel: "", promise: "",
    winner: buildCand(opts.candId, opts.candLabel, opts.terminalNw) as never,
    alternates: (opts.alternates ?? []).map((a) => buildCand(a.id, a.label, a.terminalNw)) as never[],
    probabilityP50: opts.probability ?? null, scoreP50: null,
    raw: {} as never,
  };
}

console.log("\nroadmapAccelerators — honesty + reuse");

// 1. Null picks → empty result, never throws
const r1 = buildAcceleratorRanking(null, null);
check("null picks → empty topAccelerators", r1.topAccelerators.length === 0);
check("null picks → empty underperformers", r1.underperformers.length === 0);
check("null picks → audit recommendedId null", r1.audit.recommendedId === null);

// 2. Recommended exists but path empty → empty result (honesty)
const recEmpty = scenario({ templateId: "etf-acceleration", candId: "etf", candLabel: "ETF", terminalNw: null });
const picksEmpty: GoalLabPathPicks = {
  recommended: recEmpty, safest: null, fastest: null, highestProbability: null,
  bestCashflow: null, bestHybrid: null, recommendedRationale: null,
};
const r2 = buildAcceleratorRanking(picksEmpty, [recEmpty]);
check("recommended path empty → empty result", r2.topAccelerators.length === 0 && r2.underperformers.length === 0);

// 3. Real recommended + 2 alternates with paths → ranked
const rec = scenario({
  templateId: "etf-acceleration", candId: "etf_dca", candLabel: "ETF DCA", terminalNw: 1_800_000,
  alternates: [
    { id: "etf_lump", label: "ETF lump", terminalNw: 2_200_000 },
    { id: "etf_dca12", label: "ETF DCA 12mo", terminalNw: 1_600_000 },
  ],
});
const otherTemplate = scenario({
  templateId: "buy-ip-now", candId: "ip_now", candLabel: "IP now", terminalNw: 2_500_000,
});
const ipNoPath = scenario({ templateId: "delay-ip", candId: "ip_18", candLabel: "IP 18mo", terminalNw: null });
const picks: GoalLabPathPicks = {
  recommended: rec, safest: null, fastest: null, highestProbability: null,
  bestCashflow: null, bestHybrid: null, recommendedRationale: null,
};
const r3 = buildAcceleratorRanking(picks, [rec, otherTemplate, ipNoPath]);
check("top accelerator = highest terminal NW", r3.topAccelerators[0]?.id === "ip_now", `got ${r3.topAccelerators[0]?.id}`);
check("top accelerator delta > 0", r3.topAccelerators[0]?.terminalNwDelta > 0);
check("top accelerator delta = 2.5M - 1.8M", r3.topAccelerators[0]?.terminalNwDelta === 700_000);
check("etf_lump also surfaced as accelerator", r3.topAccelerators.some((a) => a.id === "etf_lump"));
check("etf_dca12 surfaced as underperformer", r3.underperformers.some((u) => u.id === "etf_dca12"));
check("under-performer delta <= 0", r3.underperformers[0]?.terminalNwDelta <= 0);
check("ip_18 with no path → skipped", r3.audit.skippedForMissingPath === 1);
check("audit.recommendedId tracks etf_dca", r3.audit.recommendedId === "etf_dca");

// 4. probability null → field null, never fabricated
check("probability null surfaced as null on accelerator", r3.topAccelerators[0]?.probabilityP50 === null);

// 5. Display template resolved on each accelerator
check("template metadata resolved (ip_now → PROPERTY_PATH)", r3.topAccelerators.find((a) => a.id === "ip_now")?.template.id === "PROPERTY_PATH");

// 6. oneLine = first rationale line (engine, not invented)
check("oneLine pulls from rationale[0]", r3.topAccelerators[0]?.oneLine === "why ip_now");

// 7. Recommended winner itself is NOT listed (deduplication)
check("recommended winner not in accelerator list", !r3.topAccelerators.some((a) => a.id === "etf_dca") && !r3.underperformers.some((u) => u.id === "etf_dca"));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
