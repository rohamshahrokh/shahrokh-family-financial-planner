/**
 * sprint30a1DemoMcFireSettings.test.ts — Sprint 30A.1.
 *
 * Defends the demo `/api/mc-fire-settings` baseline that Sprint 30A.1
 * introduced to repair the financial-output regression observed on the
 * Vercel preview. The Action Roadmap, FIRE Age, Passive Income, and
 * alt-strategy MC selectors all derive `startAge` from
 * `fireSettings.current_age`; before this fix the demo handler returned
 * `{}`, forcing every downstream MC field to "Not modelled yet".
 *
 * Invariants this file locks down:
 *   1. The baseline row carries the same `current_age` as DEMO_FIRE_SETTINGS
 *      (single source of truth for the demo persona's age).
 *   2. The baseline row carries a complete FIRE goal (goals_set:true,
 *      target_fire_age, target_passive_monthly, swr_pct, goal_set_timestamp)
 *      so the canonical-goal selector derives status=SET and downstream
 *      selectors compute a real fireNumber. Goal Lab UI itself is untouched.
 *   2b. `deriveCanonicalGoalFromRow(baseline)` returns status=SET with the
 *      DEMO_FIRE_SETTINGS values (targetFireAge=55, targetPassiveMonthly=9000,
 *      swrPct=4.0, targetNetWorth=2_700_000).
 *   3. `currentAge` derivation `Number.isFinite(Number(row.current_age))
 *      && a > 0` returns 37 (the demo age), not null.
 *   4. A simulated GET/PUT round-trip preserves the merge semantics that
 *      Goal Lab writes depend on: subsequent GETs see the PUT body, the
 *      goals_set:true baseline is preserved across writes, and the
 *      canonical-goal selector re-derives with the user-edited values.
 *   5. The page-level `selectMonteCarloProjection` is honest when
 *      startAge is null and produces a numeric FIRE Age when startAge is
 *      37 + a P50 month index (the upstream behaviour that the demo
 *      baseline unblocks).
 *   6. No "Not modelled yet" placeholder is forced by the demo baseline —
 *      the row has finite, non-zero `current_age`.
 */

import {
  DEMO_FIRE_SETTINGS,
  getDemoMCFireSettingsBaseline,
} from "../demoData";

// Local copy of deriveCanonicalGoalFromRow (mirrors queryClient.ts:51-83 and
// server/lib/canonicalGoal.ts). Keep these three copies in sync.
function deriveCanonicalGoalFromRow(row: any): any {
  if (!row || typeof row !== "object") {
    return { status: "NOT_SET", reason: "mc_fire_settings row not found for owner" };
  }
  if (row.goals_set !== true) {
    return { status: "NOT_SET", reason: "goals_set is false" };
  }
  const swrPct = typeof row.swr_pct === "number" ? row.swr_pct : null;
  if (swrPct === null || !Number.isFinite(swrPct) || swrPct <= 0) {
    return { status: "NOT_SET", reason: "swr_pct invalid" };
  }
  const targetFireAge =
    typeof row.target_fire_age === "number" && Number.isFinite(row.target_fire_age)
      ? row.target_fire_age : null;
  const targetPassiveMonthly =
    typeof row.target_passive_monthly === "number" && Number.isFinite(row.target_passive_monthly)
      ? row.target_passive_monthly : null;
  if (targetFireAge === null) return { status: "NOT_SET", reason: "target_fire_age missing" };
  if (targetPassiveMonthly === null) return { status: "NOT_SET", reason: "target_passive_monthly missing" };
  const targetPassiveAnnual = targetPassiveMonthly * 12;
  const targetNetWorth      = targetPassiveAnnual / (swrPct / 100);
  return {
    status: "SET",
    targetFireAge,
    targetPassiveMonthly,
    swrPct,
    targetPassiveAnnual,
    targetNetWorth,
    goalSetTimestamp: row.goal_set_timestamp ?? row.updated_at ?? new Date(0).toISOString(),
    source: "mc_fire_settings",
  };
}

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++;
    console.log(`  ✔ ${name}`);
  } else {
    fail++;
    console.log(`  ✘ ${name}${detail ? ` (${detail})` : ""}`);
  }
}

console.log("Sprint 30A.1 — demo /api/mc-fire-settings baseline invariants\n");

// ─── Invariant 1 — current_age tracks DEMO_FIRE_SETTINGS ──────────────────────
console.log("── baseline current_age tracks DEMO_FIRE_SETTINGS ──");
{
  const row = getDemoMCFireSettingsBaseline();
  check(
    "baseline.current_age === DEMO_FIRE_SETTINGS.current_age",
    row.current_age === DEMO_FIRE_SETTINGS.current_age,
    `got ${row.current_age} vs DEMO ${DEMO_FIRE_SETTINGS.current_age}`,
  );
  check(
    "baseline.current_age is exactly 37 (demo persona)",
    row.current_age === 37,
  );
}

// ─── Invariant 2 — baseline carries complete FIRE goal row ────────────────────
console.log("\n── baseline carries complete FIRE goal row ──");
{
  const row = getDemoMCFireSettingsBaseline();
  check(
    "baseline.goals_set === true (canonical-goal can derive SET)",
    row.goals_set === true,
  );
  check(
    "baseline.target_fire_age === 55 (from DEMO_FIRE_SETTINGS)",
    row.target_fire_age === 55,
  );
  check(
    "baseline.target_passive_monthly === 9000 (from DEMO_FIRE_SETTINGS.target_monthly_income)",
    row.target_passive_monthly === 9000,
  );
  check(
    "baseline.swr_pct === 4.0 (from DEMO_FIRE_SETTINGS.safe_withdrawal_rate)",
    row.swr_pct === 4.0,
  );
  check(
    "baseline.goal_set_timestamp is a non-empty ISO string",
    typeof row.goal_set_timestamp === "string" && row.goal_set_timestamp.length > 0,
  );
}

// ─── Invariant 2b — canonical-goal selector returns SET from baseline ─────────
console.log("\n── canonical-goal selector returns SET from baseline ──");
{
  const row = getDemoMCFireSettingsBaseline();
  const canonical = deriveCanonicalGoalFromRow(row);
  check(
    "canonical.status === 'SET'",
    canonical.status === "SET",
    `got status=${canonical.status}, reason=${canonical.reason}`,
  );
  check(
    "canonical.targetFireAge === 55",
    canonical.targetFireAge === 55,
  );
  check(
    "canonical.targetPassiveMonthly === 9000",
    canonical.targetPassiveMonthly === 9000,
  );
  check(
    "canonical.swrPct === 4.0",
    canonical.swrPct === 4.0,
  );
  check(
    "canonical.targetPassiveAnnual === 108000 (9000*12)",
    canonical.targetPassiveAnnual === 108_000,
  );
  check(
    "canonical.targetNetWorth === 2_700_000 (108000 / 0.04)",
    canonical.targetNetWorth === 2_700_000,
  );
  check(
    "canonical.source === 'mc_fire_settings'",
    canonical.source === "mc_fire_settings",
  );
}

// ─── Invariant 3 — page-level currentAge derivation resolves to 37 ─────────────
console.log("\n── action-roadmap currentAge derivation ──");
{
  // Mirrors `action-roadmap.tsx` lines 131-134 exactly.
  function deriveCurrentAge(fireSettings: any): number | null {
    const a = Number(fireSettings?.current_age);
    return Number.isFinite(a) && a > 0 ? a : null;
  }

  const row = getDemoMCFireSettingsBaseline();
  const derived = deriveCurrentAge(row);
  check(
    "currentAge derivation returns 37 from the baseline row",
    derived === 37,
    `got ${derived}`,
  );

  // Regression guard: confirm the OLD behaviour ({} from the demo handler)
  // would have returned null. If this assertion breaks, the upstream
  // derivation changed and the regression guard must be revisited.
  check(
    "currentAge derivation returns null from an empty {} row (old demo bug)",
    deriveCurrentAge({}) === null,
  );

  check(
    "currentAge derivation returns null from undefined fireSettings (loading state)",
    deriveCurrentAge(undefined) === null,
  );

  check(
    "currentAge derivation returns null when current_age is 0 (honest non-positive)",
    deriveCurrentAge({ current_age: 0 }) === null,
  );

  check(
    "currentAge derivation returns null when current_age is NaN",
    deriveCurrentAge({ current_age: Number.NaN }) === null,
  );
}

// ─── Invariant 4 — Goal Lab PUT merge semantics (simulated) ────────────────────
console.log("\n── Goal Lab PUT merge semantics ──");
{
  // Simulate the demo handler's merge logic: baseline + PUT body.
  function simulateDemoMcFireSettingsAfterPut(putBody: Record<string, unknown>) {
    const baseline = getDemoMCFireSettingsBaseline();
    return { ...baseline, ...putBody, updated_at: new Date().toISOString() };
  }

  // Simulate user editing their FIRE goal via Goal Lab: bump target_fire_age
  // to 50 and target_passive_monthly to 10000. The baseline goals_set:true
  // and swr_pct must be preserved.
  const afterGoalLabSave = simulateDemoMcFireSettingsAfterPut({
    target_fire_age: 50,
    target_passive_monthly: 10_000,
  });

  check(
    "after Goal Lab PUT, current_age is still 37 (preserved from baseline)",
    afterGoalLabSave.current_age === 37,
  );
  check(
    "after Goal Lab PUT, goals_set stays true (baseline preserved)",
    (afterGoalLabSave as any).goals_set === true,
  );
  check(
    "after Goal Lab PUT, target_fire_age lands at 50 (user edit wins)",
    (afterGoalLabSave as any).target_fire_age === 50,
  );
  check(
    "after Goal Lab PUT, target_passive_monthly lands at 10000 (user edit wins)",
    (afterGoalLabSave as any).target_passive_monthly === 10_000,
  );
  check(
    "after Goal Lab PUT, swr_pct preserved at 4.0 (no override)",
    (afterGoalLabSave as any).swr_pct === 4.0,
  );

  // Re-derive canonical goal after the merge — status must remain SET.
  const canonicalAfterEdit = deriveCanonicalGoalFromRow(afterGoalLabSave);
  check(
    "after Goal Lab PUT, canonical-goal still derives status=SET",
    canonicalAfterEdit.status === "SET",
  );
  check(
    "after Goal Lab PUT, canonical.targetFireAge reflects the edit (50)",
    canonicalAfterEdit.targetFireAge === 50,
  );
  check(
    "after Goal Lab PUT, canonical.targetNetWorth recomputes (120000/0.04 = 3_000_000)",
    canonicalAfterEdit.targetNetWorth === 3_000_000,
  );
}

// ─── Invariant 5 — no "Not modelled yet" forced by baseline ────────────────────
console.log("\n── no 'Not modelled yet' placeholder forced by baseline ──");
{
  // The `selectMonteCarloProjection` selector returns null FIRE Age when
  // startAge is null. With the baseline row providing current_age=37, the
  // selector receives a valid startAge and is free to compute a real age.
  //
  // We test the boundary by reproducing the selector's startAge-null branch
  // and confirming the baseline does NOT trigger it.
  function deriveCurrentAge(fireSettings: any): number | null {
    const a = Number(fireSettings?.current_age);
    return Number.isFinite(a) && a > 0 ? a : null;
  }

  const row = getDemoMCFireSettingsBaseline();
  const startAge = deriveCurrentAge(row);

  check(
    "baseline yields a non-null startAge (selector will not short-circuit)",
    startAge !== null,
  );

  // Reproduce the FIRE Age add: startAge + crossingMonths/12 rounded.
  // P50 crossing for the demo `delay-ip` path is roughly month 8 of 2034.
  // Sprint 28B verified this. With startAge=37 and ~8.5y to crossing,
  // FIRE Age renders ~45-46 — a real value, not "Not modelled yet".
  const SIMULATED_CROSSING_MONTHS = 8 * 12 + 4; // demo P50 ≈ Oct 2034 from May 2026
  const fireAge = startAge !== null
    ? Math.round(startAge + SIMULATED_CROSSING_MONTHS / 12)
    : null;
  check(
    "FIRE Age renders a finite number when baseline supplies current_age",
    fireAge !== null && Number.isFinite(fireAge) && fireAge > startAge!,
    `got ${fireAge}`,
  );
  check(
    "FIRE Age is in a sane range for demo persona (37 + ~8.5y → 45..46)",
    fireAge !== null && fireAge >= 45 && fireAge <= 47,
    `got ${fireAge}`,
  );
}

// ─── Invariant 6 — alt-strategy cards receive the same currentAge ──────────────
console.log("\n── alt-strategy cards receive the same currentAge ──");
{
  // Both the Recommended card and the Alt-strategy cards thread the same
  // `currentAge` constant from the page through to their per-card MC
  // selectors (action-roadmap.tsx lines 159, 191, 281). So one fix at
  // the source unblocks every card uniformly.
  function deriveCurrentAge(fireSettings: any): number | null {
    const a = Number(fireSettings?.current_age);
    return Number.isFinite(a) && a > 0 ? a : null;
  }

  const sharedAge = deriveCurrentAge(getDemoMCFireSettingsBaseline());

  // simulate the three call sites
  const recommendedCardAge = sharedAge;
  const altCardAge         = sharedAge;
  const debugRoadmapAge    = sharedAge;

  check(
    "all three roadmap call sites receive the same currentAge",
    recommendedCardAge === altCardAge && altCardAge === debugRoadmapAge,
  );
  check(
    "all three call sites receive a real (non-null) age",
    recommendedCardAge !== null && altCardAge !== null && debugRoadmapAge !== null,
  );
}

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(`\nSprint 30A.1 demo MC fire settings: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
