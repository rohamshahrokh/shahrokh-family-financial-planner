/**
 * Quick Decision PDF audit harness.
 *
 * Re-runs the deploy_capital + balanced decision flow and generates a
 * Quick Decision PDF report from the resulting QuickDecisionOutput.
 * Writes audit/decision-sample.pdf.
 *
 * html2canvas (browser-only) is only invoked when chartEls is provided —
 * we deliberately omit chartEls so jsPDF runs purely server-side.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import Module from "node:module";

// ── jsPDF CJS/ESM interop shim ───────────────────────────────────────────────
// The source uses `import jsPDF from "jspdf"`. Under tsx the default export
// resolves to the namespace object, not the constructor. We patch require()
// so `require("jspdf")` returns a CJS module whose default is the real class.
const require_ = Module.createRequire(import.meta.url);
const _jspdf = require_("jspdf");
const _jsPDFCtor = _jspdf.jsPDF ?? _jspdf.default ?? _jspdf;
const _origRequire = Module.prototype.require as any;
Module.prototype.require = function patched(this: any, id: string) {
  if (id === "jspdf") {
    return { __esModule: true, default: _jsPDFCtor, jsPDF: _jsPDFCtor };
  }
  return _origRequire.apply(this, arguments as any);
} as any;

import {
  generateQuickDecisionCandidates,
  type QuickDecisionInput,
  type RiskControlMode,
} from "./client/src/lib/scenarioV2/decisionEngine/candidateGenerator";
import { generateQuickDecisionPdf } from "./client/src/lib/scenarioV2/quickDecisionPdf";
import { PROFILE_REGISTRY } from "./client/src/lib/scenarioV2/registry/scoring";
import type { DashboardInputs } from "./client/src/lib/dashboardDataContract";

const RAW = "/home/user/workspace/audit/raw_data";
const OUT_PDF = "/home/user/workspace/audit/decision-sample.pdf";

const j = (p: string) => JSON.parse(fs.readFileSync(path.join(RAW, p), "utf8"));

const snapshot   = j("sf_snapshot_full.json")[0];
const properties = j("sf_properties.json").map((p: any) => ({
  ...p,
  settlement_date: p.settlement_date ?? p.purchase_date ?? null,
}));
const stocks         = j("sf_stocks.json");
const cryptos        = j("sf_crypto.json");
const incomeRecords  = j("sf_income.json");
const expenses       = j("sf_expenses.json");
const tax            = j("sf_tax_profile.json")[0];

const dashboardInputs: DashboardInputs = {
  snapshot,
  properties,
  stocks,
  cryptos,
  holdingsRaw: [],
  incomeRecords,
  expenses,
  todayIso: "2026-05-11",
};

const taxContext = {
  annualGrossIncome:
    Number(tax?.roham_salary ?? snapshot.roham_super_salary ?? 0) +
    Number(tax?.fara_salary  ?? snapshot.fara_super_salary  ?? 0),
  hasHelpDebt: Boolean(tax?.roham_has_help_debt || tax?.fara_has_help_debt),
  hasPrivateHospitalCover: Boolean(tax?.roham_has_private_health || tax?.fara_has_private_health),
};

const household = { dependants: 2, incomeVolatility: 0.15 };
const riskMode: RiskControlMode = "balanced";

(async () => {
  console.log("Generating deploy_capital / balanced decision...");
  const input: QuickDecisionInput = {
    dashboardInputs,
    question: { kind: "deploy_capital", capital: 100_000 },
    horizonYears: 15,
    simulationCount: 200,
    household,
    taxContext,
    riskMode,
  };

  const out = await generateQuickDecisionCandidates(input);
  console.log(`  ranked=${out.ranked.length} discarded=${out.discarded.length} highRisk=${out.highRiskPaths.length}`);

  // Use the engine-derived profile from the output (matches what the app does).
  const profileId = out.investorProfile ?? "balanced";
  const profile = PROFILE_REGISTRY[profileId as keyof typeof PROFILE_REGISTRY] ?? PROFILE_REGISTRY.balanced;

  console.log(`Rendering PDF for profile "${profile.label}"...`);
  const doc = await generateQuickDecisionPdf({
    householdName: "Shahrokh Family",
    output: out,
    profile,
    generatedAt: new Date("2026-05-11T17:42:00+10:00").toISOString(),
    hideValues: false,
    // chartEls omitted — server-side, html2canvas unavailable
  });

  const buf = Buffer.from(doc.output("arraybuffer"));
  fs.writeFileSync(OUT_PDF, buf);
  console.log(`Wrote ${OUT_PDF} (${(buf.length / 1024).toFixed(1)} KB)`);
})().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
