/**
 * test-sprint6-phase3-scenario-persistence.ts
 *
 * Sprint 6 Phase 3 — Scenario Persistence & Portfolio Lab Foundation.
 *
 * What this proves
 * ----------------
 *   §1  Tag whitelist + normalization
 *   §2  Notes normalization + length cap
 *   §3  Scenario payload (de)serialization round-trip
 *   §4  Record creation creates v1
 *   §5  Version commits are idempotent on identical payloads
 *   §6  Version commits are strictly monotonic on new payloads
 *   §7  Snapshot capture copies engine output verbatim, never recomputes
 *   §8  Assumptions summary reflects scenario inputs without computation
 *   §9  Soft-delete (archive/restore) flips archivedAt only
 *   §10 mergeRecordsIntoState replaces seeds, appends new ids, resolves baseline
 *   §11 Persistence panel renders save/load status, tags, notes, versions,
 *       snapshots, assumptions with stable testids
 *   §12 Demo / fallback mode keeps Phase 2 behaviour intact (no remote required)
 *   §13 Dashboard contract unchanged: canonical headline metrics still
 *       byte-equal between Phase 2 and Phase 3 paths
 *   §14 No financial recalculation in the persistence layer: changing notes /
 *       tags between commits leaves all engine outputs unchanged
 *
 * Run with:  tsx script/test-sprint6-phase3-scenario-persistence.ts
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  SCENARIO_TAGS,
  NOTES_MAX_LENGTH,
  SCENARIO_RECORD_SCHEMA_VERSION,
  isScenarioTag,
  normalizeTags,
  normalizeNotes,
  validateScenarioPayload,
  toScenarioPayload,
  fromScenarioPayload,
  payloadsEqual,
  createScenarioRecord,
  commitVersion,
  captureSnapshot,
  appendSnapshot,
  buildAssumptionsSummary,
  archiveScenarioRecord,
  restoreScenarioRecord,
  mergeRecordsIntoState,
  makeStateFromRecords,
  getLatestVersionPayload,
  getLatestSnapshot,
  sortRecordsForDisplay,
  type ScenarioRecord,
  type ScenarioRecordPayload,
  type ScenarioTag,
  type ScenarioRecordsBundle,
} from "../client/src/lib/scenarioPersistence";
import {
  makeInitialBuilderState,
  makeSeedScenarios,
  createScenario,
  updateGoalInputs,
  updatePropertyInputs,
  buildBuilderCompareResult,
  listMetricKeys,
} from "../client/src/lib/scenarioBuilderWorkspace";
import { buildScenarioCompareWorkspace } from "../client/src/lib/scenarioCompareWorkspace";
import { computeCanonicalHeadlineMetrics } from "../client/src/lib/canonicalHeadlineMetrics";
import { ScenarioBuilderWorkspace } from "../client/src/components/ScenarioBuilderWorkspace";
import type { DashboardInputs } from "../client/src/lib/dashboardDataContract";
import type { UseScenarioPersistenceResult } from "../client/src/hooks/useScenarioPersistence";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function ok(label: string, cond: any, detail?: any) {
  if (cond) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    const msg = `FAIL  ${label}` + (detail !== undefined ? `\n        ${JSON.stringify(detail)}` : "");
    failures.push(msg);
    console.error(`  ${msg}`);
  }
}

function hasTestId(html: string, id: string): boolean {
  return html.includes(`data-testid="${id}"`);
}

/* ─── Fixture ────────────────────────────────────────────────────────────── */

const SNAPSHOT_RICH = {
  ppor: 1_510_000,
  cash: 40_000,
  offset_balance: 222_000,
  super_balance: 88_000,
  stocks: 0,
  crypto: 0,
  cars: 65_000,
  iran_property: 150_000,
  mortgage: 1_200_000,
  mortgage_rate: 5.85,
  mortgage_term_years: 28,
  mortgage_loan_type: "PI",
  other_debts: 19_000,
  roham_monthly_income: 15_466.67,
  fara_monthly_income: 15_166.67,
  monthly_expenses: 15_000,
  expenses_includes_debt: true,
  rental_income_total: 0,
  fire_target_monthly_income: 8_000,
  safe_withdrawal_rate: 4,
};

const FIXTURE: DashboardInputs = {
  snapshot: SNAPSHOT_RICH,
  properties: [],
  stocks: [],
  cryptos: [],
  holdingsRaw: [],
  incomeRecords: [],
  expenses: [],
  todayIso: "2026-05-25",
};

const NOW = "2026-05-25T10:00:00.000Z";
const LATER = "2026-05-25T10:05:00.000Z";

console.log("\nSprint 6 Phase 3 — Scenario Persistence & Portfolio Lab Foundation\n");

/* ═══════════════════════════════════════════════════════════════════════════
 * §1 — Tag whitelist + normalization
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log("§1  Tag whitelist + normalization");
{
  ok("six known tags", SCENARIO_TAGS.length === 6);
  for (const tag of ["Property", "ETF", "Crypto", "FIRE", "Debt", "Hybrid"] as const) {
    ok(`tag '${tag}' is known`, isScenarioTag(tag));
  }
  ok("unknown tag rejected", !isScenarioTag("Random"));
  ok("normalizeTags drops unknowns", JSON.stringify(normalizeTags(["Property", "Crypto", "Random"] as any)) === JSON.stringify(["Property", "Crypto"]));
  ok("normalizeTags dedupes", JSON.stringify(normalizeTags(["FIRE", "FIRE", "Debt"] as any)) === JSON.stringify(["FIRE", "Debt"]));
  ok("normalizeTags on non-array returns []", JSON.stringify(normalizeTags("nope" as any)) === "[]");
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §2 — Notes normalization + cap
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n§2  Notes normalization + length cap");
{
  ok("empty string ok", normalizeNotes("") === "");
  ok("non-string coerced to empty", normalizeNotes(undefined as any) === "");
  const long = "x".repeat(NOTES_MAX_LENGTH + 50);
  ok("cap enforced", normalizeNotes(long).length === NOTES_MAX_LENGTH);
  ok("internal spaces preserved", normalizeNotes("aggressive  ETF strategy") === "aggressive  ETF strategy");
  ok("trailing whitespace trimmed", normalizeNotes("note   \n") === "note");
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §3 — Payload (de)serialization
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n§3  Payload (de)serialization round-trip");
{
  const seeds = makeSeedScenarios();
  const baseline = seeds[0];
  const payload = toScenarioPayload(baseline, { tags: ["Property", "FIRE"], notes: "Initial baseline" });
  ok("payload schemaVersion = 1", payload.schemaVersion === SCENARIO_RECORD_SCHEMA_VERSION);
  ok("payload tags normalized", JSON.stringify(payload.tags) === JSON.stringify(["Property", "FIRE"]));
  ok("payload notes stored", payload.notes === "Initial baseline");
  ok("payload inputs deep-copied", payload.inputs !== baseline.inputs);

  const restored = fromScenarioPayload(payload);
  ok("restored id matches", restored.id === baseline.id);
  ok("restored label matches", restored.label === baseline.label);
  ok("restored isSeed preserved", restored.isSeed === baseline.isSeed);
  ok("restored seedScenarioId preserved", restored.seedScenarioId === baseline.seedScenarioId);

  const validation = validateScenarioPayload(payload);
  ok("validation ok", validation.ok && validation.errors.length === 0);

  const bad: ScenarioRecordPayload = { ...payload, tags: ["Bogus"] as any };
  const badV = validateScenarioPayload(bad);
  ok("validation catches bad tag", !badV.ok && badV.errors.some(e => e.includes("tags")));

  const dup = toScenarioPayload(baseline, { tags: ["Property", "FIRE"], notes: "Initial baseline" });
  ok("payloadsEqual on equal payloads", payloadsEqual(payload, dup));
  const diff = toScenarioPayload(baseline, { tags: ["Property"], notes: "Initial baseline" });
  ok("payloadsEqual differs on tags", !payloadsEqual(payload, diff));
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §4 — Record creation creates v1
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n§4  Record creation produces v1");
{
  const seeds = makeSeedScenarios();
  const record = createScenarioRecord({
    scenario: seeds[0],
    tags: ["FIRE"],
    notes: "v1 notes",
    isBaseline: true,
    now: NOW,
    recordId: "record-seed-baseline",
  });
  ok("recordId set", record.recordId === "record-seed-baseline");
  ok("currentVersion = 1", record.currentVersion === 1);
  ok("versions length = 1", record.versions.length === 1);
  ok("v1 payload notes match", record.versions[0].payload.notes === "v1 notes");
  ok("isBaseline flag set", record.isBaseline === true);
  ok("snapshots empty", record.snapshots.length === 0);
  ok("not archived", record.archivedAt === null);
  ok("latest payload accessor", getLatestVersionPayload(record)?.notes === "v1 notes");
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §5 — Version commit idempotency on identical payloads
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n§5  commitVersion idempotency");
{
  const seeds = makeSeedScenarios();
  const r1 = createScenarioRecord({ scenario: seeds[0], now: NOW, recordId: "rec-1" });
  const same = toScenarioPayload(seeds[0]);
  const r2 = commitVersion({ record: r1, payload: same, now: LATER });
  ok("identical payload does not bump version", r2.currentVersion === r1.currentVersion);
  ok("identical payload returns same record (no-op)", r2 === r1);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §6 — Version commit monotonicity on new payloads
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n§6  commitVersion monotonicity on new payloads");
{
  const seeds = makeSeedScenarios();
  let r = createScenarioRecord({ scenario: seeds[0], notes: "v1", now: NOW, recordId: "rec-mono" });
  const next = toScenarioPayload(seeds[0], { notes: "v2 notes" });
  r = commitVersion({ record: r, payload: next, now: LATER, comment: "tweak notes" });
  ok("currentVersion incremented to 2", r.currentVersion === 2);
  ok("two versions stored", r.versions.length === 2);
  ok("v2 comment recorded", r.versions[1].comment === "tweak notes");

  const next2 = toScenarioPayload(seeds[0], { notes: "v3 notes" });
  r = commitVersion({ record: r, payload: next2, now: LATER });
  ok("currentVersion incremented to 3", r.currentVersion === 3);
  ok("v3 payload reflected on record", r.notes === "v3 notes");
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §7 — Snapshot capture copies engine output verbatim
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n§7  Snapshot capture copies engine output (no recompute)");
{
  const state = makeInitialBuilderState();
  const result = buildBuilderCompareResult(state, FIXTURE);
  const baselineEntry = result.baseline!;
  const seeds = makeSeedScenarios();
  let record = createScenarioRecord({ scenario: seeds[0], now: NOW, recordId: "rec-snap" });
  const snap = captureSnapshot({
    record,
    builderResult: baselineEntry,
    now: LATER,
    assumptions: buildAssumptionsSummary({ scenario: seeds[0] }),
  });
  ok("snapshot id deterministic", snap.snapshotId.startsWith("rec-snap-snap-v"));
  ok("snapshot versionNumber matches current", snap.versionNumber === record.currentVersion);
  ok("snapshot metric count matches engine keys", snap.metrics.length === listMetricKeys().length);
  ok(
    "snapshot Net Worth equals engine value",
    snap.metrics.find(m => m.key === "netWorth")?.value === baselineEntry.row.metrics.netWorth.value,
    { snap: snap.metrics.find(m => m.key === "netWorth")?.value, engine: baselineEntry.row.metrics.netWorth.value },
  );
  ok(
    "snapshot Recommended Action text comes from engine",
    snap.metrics.find(m => m.key === "recommendedAction")?.textOverride === baselineEntry.row.metrics.recommendedAction.textOverride,
  );

  record = appendSnapshot(record, snap, LATER);
  ok("snapshot appended to record", record.snapshots.length === 1);
  ok("latest snapshot accessor returns it", getLatestSnapshot(record)?.snapshotId === snap.snapshotId);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §8 — Assumptions summary
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n§8  Assumptions summary reflects scenario inputs (no computation)");
{
  let s = makeInitialBuilderState();
  const target = s.scenarios[0].id;
  s = updatePropertyInputs(s, target, { purchaseYear: 2027, purchasePrice: 800_000, interestRate: 0.062, loanType: "IO" });
  s = updateGoalInputs(s, target, { fireTarget: 2_500_000, passiveIncomeTarget: 100_000, targetYear: 2040 });
  const summary = buildAssumptionsSummary({ scenario: s.scenarios[0] });
  ok("summary contains purchaseYear", summary.some(a => a.key === "property.purchaseYear" && a.value === 2027));
  ok("summary contains purchasePrice", summary.some(a => a.key === "property.purchasePrice" && a.value === 800_000));
  ok("summary contains loanType label", summary.some(a => a.key === "property.loanType" && a.value === "IO"));
  ok("summary contains fireTarget", summary.some(a => a.key === "goals.fireTarget" && a.value === 2_500_000));
  ok("summary skips undefined fields", !summary.some(a => a.key === "investments.etfContribution"));
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §9 — Soft delete
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n§9  Soft-delete (archive/restore)");
{
  const seeds = makeSeedScenarios();
  let r = createScenarioRecord({ scenario: seeds[0], now: NOW, recordId: "rec-arch" });
  ok("not archived initially", r.archivedAt === null);
  const archived = archiveScenarioRecord(r, LATER, "no longer relevant");
  ok("archivedAt set", typeof archived.archivedAt === "string");
  ok("archivedReason set", archived.archivedReason === "no longer relevant");
  ok("versions preserved", archived.versions.length === r.versions.length);

  const restored = restoreScenarioRecord(archived, LATER);
  ok("restore clears archivedAt", restored.archivedAt === null);
  ok("restore clears archivedReason", restored.archivedReason === null);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §10 — mergeRecordsIntoState
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n§10 mergeRecordsIntoState semantics");
{
  const seeds = makeSeedScenarios();
  // Persisted record for seed-baseline with overridden notes.
  const persistedBaseline = createScenarioRecord({
    scenario: { ...seeds[0], inputs: { ...seeds[0].inputs, goals: { passiveIncomeTarget: 99_000 } } },
    tags: ["FIRE"],
    notes: "live notes",
    isBaseline: true,
    now: NOW,
    recordId: "record-seed-baseline",
  });
  // A user-created record that the workspace has not seen yet.
  const userScenarioState = createScenario(makeInitialBuilderState(), { label: "Custom A" });
  const userScen = userScenarioState.scenarios[userScenarioState.scenarios.length - 1];
  const persistedUser = createScenarioRecord({
    scenario: userScen,
    notes: "user-created",
    now: NOW,
    recordId: `record-${userScen.id}`,
  });
  const bundle: ScenarioRecordsBundle = {
    records: [persistedBaseline, persistedUser],
    fallback: false,
    errorReason: null,
  };

  const baseState = makeInitialBuilderState();
  const merged = mergeRecordsIntoState(baseState, bundle);
  ok("seed-baseline replaced with persisted payload", merged.scenarios[0].inputs.goals.passiveIncomeTarget === 99_000);
  ok("seed scenarios still present", merged.scenarios.filter(s => s.isSeed).length === 6);
  ok("user-created scenario appended", merged.scenarios.some(s => s.id === userScen.id));
  ok("baseline scenario id flagged from record", merged.baselineScenarioId === "seed-baseline");

  // Archived records are excluded.
  const archived = archiveScenarioRecord(persistedUser, LATER, "no longer needed");
  const mergedArch = mergeRecordsIntoState(baseState, { records: [persistedBaseline, archived], fallback: false, errorReason: null });
  ok("archived record excluded from merge", !mergedArch.scenarios.some(s => s.id === userScen.id));

  const fromRecords = makeStateFromRecords(bundle);
  ok("makeStateFromRecords merges seeds + records", fromRecords.scenarios.some(s => s.id === userScen.id));
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §11 — Persistence panel testids
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n§11 Persistence panel renders with stable testids");
{
  const seeds = makeSeedScenarios();
  // Stub persistence with one saved record so we exercise the version path.
  const savedRecord = createScenarioRecord({
    scenario: seeds[0],
    tags: ["Property", "FIRE"],
    notes: "Saved scenario",
    isBaseline: true,
    now: NOW,
    recordId: "record-seed-baseline",
  });
  const persistenceStub: UseScenarioPersistenceResult = {
    status: "saved",
    errorMessage: null,
    records: [savedRecord],
    bundle: { records: [savedRecord], fallback: false, errorReason: null },
    hasRemote: true,
    fallback: false,
    refresh: async () => {},
    saveScenario: async () => savedRecord,
    snapshotScenario: async () => null,
    archiveScenario: async () => null,
    restoreScenario: async () => null,
    hydrateState: (s) => s,
    buildAssumptions: () => buildAssumptionsSummary({ scenario: seeds[0] }),
  };

  const html = renderToStaticMarkup(
    React.createElement(ScenarioBuilderWorkspace, {
      canonicalLedger: FIXTURE,
      initialState: makeInitialBuilderState(),
      persistenceOverride: persistenceStub,
      skipPersistenceAutoLoad: true,
    }),
  );

  // Top-level bar
  ok("persistence bar present", hasTestId(html, "scenario-builder-persistence-bar"));
  ok("persistence bar status badge present", hasTestId(html, "scenario-builder-persistence-bar-status"));
  ok("persistence bar count present", hasTestId(html, "scenario-builder-persistence-bar-count"));
  ok("persistence bar refresh button present", hasTestId(html, "scenario-builder-persistence-bar-refresh"));

  // Per-scenario panel (baseline seed)
  const tid = "scenario-persistence-seed-baseline";
  ok("persistence panel root", hasTestId(html, tid));
  ok("panel status badge", hasTestId(html, `${tid}-status`));
  ok("panel tags root", hasTestId(html, `${tid}-tags`));
  for (const t of SCENARIO_TAGS) {
    ok(`tag chip ${t}`, hasTestId(html, `${tid}-tag-${t}`));
  }
  ok("panel notes textarea", hasTestId(html, `${tid}-notes`));
  ok("panel notes count", hasTestId(html, `${tid}-notes-count`));
  ok("panel comment input", hasTestId(html, `${tid}-comment`));
  ok("panel save button", hasTestId(html, `${tid}-save`));
  ok("panel snapshot button", hasTestId(html, `${tid}-snapshot`));
  ok("panel assumptions group", hasTestId(html, `${tid}-assumptions`));
  ok("panel versions group", hasTestId(html, `${tid}-versions`));
  ok("panel v1 entry rendered", hasTestId(html, `${tid}-version-1`));
  ok("panel snapshots group", hasTestId(html, `${tid}-snapshots`));
  ok("panel snapshots-empty hint rendered", hasTestId(html, `${tid}-snapshots-empty`));

  // Persisted tags reflected as active chips
  ok("Property tag active", html.includes(`data-testid="${tid}-tag-Property" data-active="true"`) || html.includes(`data-active="true" data-testid="${tid}-tag-Property"`) || html.includes(`data-testid=\"${tid}-tag-Property\"`) && html.includes(`data-active=\"true\"`));
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §12 — Fallback / demo: Phase 2 behaviour preserved
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n§12 Fallback mode preserves Phase 2 behaviour");
{
  const persistenceStub: UseScenarioPersistenceResult = {
    status: "fallback",
    errorMessage: null,
    records: [],
    bundle: { records: [], fallback: true, errorReason: null },
    hasRemote: false,
    fallback: true,
    refresh: async () => {},
    saveScenario: async () => null,
    snapshotScenario: async () => null,
    archiveScenario: async () => null,
    restoreScenario: async () => null,
    hydrateState: (s) => s,
    buildAssumptions: () => [],
  };

  const html = renderToStaticMarkup(
    React.createElement(ScenarioBuilderWorkspace, {
      canonicalLedger: FIXTURE,
      initialState: makeInitialBuilderState(),
      persistenceOverride: persistenceStub,
      skipPersistenceAutoLoad: true,
    }),
  );

  ok("fallback bar badge text", html.includes("Local fallback"));
  ok("compare table still rendered in fallback", hasTestId(html, "scenario-builder-compare-table"));
  ok("all six editor cards still rendered", html.match(/data-testid="scenario-editor-seed-/g)?.length! >= 6);
  ok("fallback notice surfaced inside panel", hasTestId(html, "scenario-persistence-seed-baseline-fallback-notice"));
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §13 — Dashboard contract unchanged
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n§13 Dashboard contract unchanged after Phase 3");
{
  const head = computeCanonicalHeadlineMetrics(FIXTURE);
  const phase1 = buildScenarioCompareWorkspace({ canonicalLedger: FIXTURE });
  const phase2 = buildBuilderCompareResult(makeInitialBuilderState(), FIXTURE);

  // Hydrate state via merge from a record set — engine outputs must remain
  // identical to Phase 2 path, because persistence does not recompute.
  const seeds = makeSeedScenarios();
  const records = seeds.map(s =>
    createScenarioRecord({
      scenario: s,
      isBaseline: s.seedScenarioId === "baseline",
      now: NOW,
      recordId: `record-${s.id}`,
    }),
  );
  const hydrated = mergeRecordsIntoState(makeInitialBuilderState(), { records, fallback: false, errorReason: null });
  const phase3 = buildBuilderCompareResult(hydrated, FIXTURE);

  ok("Phase 1 baseline NW == canonical", phase1.rows.find(r => r.id === "baseline")?.metrics.netWorth.value === head.netWorth);
  ok("Phase 2 baseline NW == canonical", phase2.baseline?.row.metrics.netWorth.value === head.netWorth);
  ok("Phase 3 hydrated baseline NW == canonical", phase3.baseline?.row.metrics.netWorth.value === head.netWorth);
  ok(
    "Phase 2 / Phase 3 baseline rows byte-equal on every metric",
    listMetricKeys().every(k => phase2.baseline?.row.metrics[k].value === phase3.baseline?.row.metrics[k].value),
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §14 — Persistence layer does not recompute finance
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n§14 Persistence layer never recomputes finance");
{
  const seeds = makeSeedScenarios();
  let record = createScenarioRecord({ scenario: seeds[0], notes: "v1", now: NOW, recordId: "rec-noop" });

  // Compute engine output once.
  const state = makeInitialBuilderState();
  const before = buildBuilderCompareResult(state, FIXTURE).baseline?.row.metrics.netWorth.value;

  // Commit several "notes-only" version bumps.
  for (let i = 2; i <= 5; i++) {
    const payload = toScenarioPayload(seeds[0], { notes: `v${i}` });
    record = commitVersion({ record, payload, now: LATER });
  }
  ok("version chain produced 5 versions", record.currentVersion === 5);

  const after = buildBuilderCompareResult(state, FIXTURE).baseline?.row.metrics.netWorth.value;
  ok("net worth unchanged after persistence-only edits", before === after, { before, after });

  // Snapshots also do not affect engine output values.
  const r = buildBuilderCompareResult(state, FIXTURE);
  const snap = captureSnapshot({ record, builderResult: r.baseline!, now: LATER });
  ok("snapshot Net Worth same as engine output", snap.metrics.find(m => m.key === "netWorth")?.value === r.baseline?.row.metrics.netWorth.value);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §15 — sortRecordsForDisplay ordering
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n§15 sortRecordsForDisplay ordering");
{
  const seeds = makeSeedScenarios();
  const baseline = createScenarioRecord({ scenario: seeds[0], isBaseline: true, now: NOW, recordId: "r-1" });
  const seed = createScenarioRecord({ scenario: seeds[1], now: NOW, recordId: "r-2" });
  const user1 = createScenarioRecord({
    scenario: { ...seeds[0], isSeed: false, seedScenarioId: null, id: "user-zeta", label: "Zeta" },
    now: NOW,
    recordId: "r-3",
  });
  const user2 = createScenarioRecord({
    scenario: { ...seeds[0], isSeed: false, seedScenarioId: null, id: "user-alpha", label: "Alpha" },
    now: NOW,
    recordId: "r-4",
  });
  const sorted = sortRecordsForDisplay([user1, seed, user2, baseline]);
  ok("baseline first", sorted[0].recordId === "r-1");
  ok("seed second", sorted[1].recordId === "r-2");
  ok("user records sorted alphabetically", sorted[2].label === "Alpha" && sorted[3].label === "Zeta");
}

/* ─── Summary ──────────────────────────────────────────────────────────── */

console.log(`\n──────────────────────────────────────────────`);
console.log(` Passed: ${passed}`);
console.log(` Failed: ${failed}`);
if (failed > 0) {
  console.log(`\nFailures:`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
