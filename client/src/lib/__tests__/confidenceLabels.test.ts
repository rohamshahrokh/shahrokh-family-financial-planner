/**
 * confidenceLabels.test.ts — Sprint 15 Phase 3.
 *
 * Coverage:
 *   - Each of 5 kinds renders a sensible label
 *   - Band edges: 0, 0.49, 0.5, 0.74, 0.75, 1.0
 *   - Absent inputs: null, undefined, NaN
 *   - Audit chip is always populated
 *   - MC kind includes paths + ranAt when opts provided
 */

import { formatConfidence, bandFor } from "../confidenceLabels";

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    pass++;
    console.log(`  ✔ ${name}`);
  } else {
    fail++;
    console.log(`  ✘ ${name}${detail ? `  — ${detail}` : ""}`);
  }
}

function section(title: string): void {
  console.log(`\n── ${title} ──`);
}

console.log("\nconfidenceLabels.test — formatConfidence + bandFor\n");

// ─── Band edges ────────────────────────────────────────────────────────────
section("bandFor — unified thresholds");
check("0.75 → HIGH", bandFor(0.75) === "HIGH");
check("1.0  → HIGH", bandFor(1.0) === "HIGH");
check("0.74 → MEDIUM", bandFor(0.74) === "MEDIUM", `got ${bandFor(0.74)}`);
check("0.5  → MEDIUM", bandFor(0.5) === "MEDIUM");
check("0.49 → LOW", bandFor(0.49) === "LOW", `got ${bandFor(0.49)}`);
check("0    → LOW", bandFor(0) === "LOW");
check("null → ABSENT", bandFor(null) === "ABSENT");
check("undefined → ABSENT", bandFor(undefined) === "ABSENT");
check("NaN  → ABSENT", bandFor(NaN) === "ABSENT");

// ─── kind: rule ────────────────────────────────────────────────────────────
section("kind=rule — no percent shown");
{
  const r = formatConfidence({ kind: "rule", value: 0.6 });
  check("rule@0.6 label = 'MEDIUM (rule-based)'", r.label === "MEDIUM (rule-based)", r.label);
  check("rule@0.6 band = MEDIUM", r.band === "MEDIUM");
  check("rule label does NOT contain %", !r.label.includes("%"));
  check("rule audit populated", r.audit.length > 0 && r.audit.includes("rule"));
}
{
  const r = formatConfidence({ kind: "rule", value: 0.85 });
  check("rule@0.85 label = 'HIGH (rule-based)'", r.label === "HIGH (rule-based)", r.label);
}

// ─── kind: heuristic ───────────────────────────────────────────────────────
section("kind=heuristic — band only");
{
  const r = formatConfidence({ kind: "heuristic", value: 0.55 });
  check("heuristic@0.55 label = 'MEDIUM'", r.label === "MEDIUM", r.label);
  check("heuristic label has no %", !r.label.includes("%"));
  check("heuristic audit populated", r.audit.includes("heuristic"));
}

// ─── kind: mc ──────────────────────────────────────────────────────────────
section("kind=mc — percent allowed, MC explicit");
{
  const r = formatConfidence({ kind: "mc", value: 0.82 });
  check("mc@0.82 label starts with HIGH", r.label.startsWith("HIGH"), r.label);
  check("mc label contains '82% Monte Carlo'", r.label.includes("82% Monte Carlo"), r.label);
  check("mc audit populated", r.audit.includes("mc"));
}
{
  const r = formatConfidence({
    kind: "mc",
    value: 0.6,
    opts: { paths: 5000, ranAt: "2026-05-26" },
  });
  check("mc with opts label contains paths", r.label.includes("5000 paths"), r.label);
  check("mc with opts label contains ranAt", r.label.includes("ran 2026-05-26"), r.label);
}
{
  const r = formatConfidence({ kind: "mc", value: null });
  check("mc with null → 'Monte Carlo not yet run'", r.label === "Monte Carlo not yet run", r.label);
  check("mc null band ABSENT", r.band === "ABSENT");
}

// ─── kind: composite ───────────────────────────────────────────────────────
section("kind=composite — band only");
{
  const r = formatConfidence({ kind: "composite", value: 0.78 });
  check("composite@0.78 label = 'HIGH'", r.label === "HIGH", r.label);
  check("composite audit populated", r.audit.includes("composite"));
}

// ─── kind: absent ──────────────────────────────────────────────────────────
section("kind=absent — 'Monte Carlo not yet run' regardless of value");
{
  const r = formatConfidence({ kind: "absent" });
  check("absent label = 'Monte Carlo not yet run'", r.label === "Monte Carlo not yet run", r.label);
  check("absent band = ABSENT", r.band === "ABSENT");
  check("absent audit populated", r.audit.includes("absent"));
}
{
  const r = formatConfidence({ kind: "absent", value: 0.5 });
  check(
    "absent with stray value still labels 'Monte Carlo not yet run'",
    r.label === "Monte Carlo not yet run",
    r.label,
  );
}

// ─── Audit chip is ALWAYS populated ────────────────────────────────────────
section("audit chip — populated for every kind+value combination");
{
  const kinds = ["rule", "heuristic", "mc", "composite", "absent"] as const;
  const values: Array<number | null | undefined> = [null, undefined, NaN, 0, 0.49, 0.5, 0.75, 1.0];
  for (const k of kinds) {
    for (const v of values) {
      const r = formatConfidence({ kind: k, value: v });
      if (r.audit.length === 0) {
        check(`audit populated for ${k}/${String(v)}`, false);
      }
    }
  }
  check("audit chip populated for all 5 kinds × 8 values (40 cases)", true);
}

console.log(`\n── Summary ──\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  process.exit(1);
}
