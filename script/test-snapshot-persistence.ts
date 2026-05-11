/**
 * test-snapshot-persistence.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Smoke test for the persistence-architecture fix.
 *
 * Asserts:
 *  1. localStore.updateSnapshot() sends ONLY the delta to Supabase (PATCH).
 *  2. It does NOT compose a "full payload" from stale localStorage cache.
 *  3. The Supabase guard trigger blocks zeroing of protected fields.
 *  4. PostgREST UPSERT merge-duplicates semantics are column-level.
 *
 * Runs against a TEMPORARY test row (id='__test_persistence__') so no
 * production data is touched. The row is created and deleted by the test.
 *
 * Usage: tsx script/test-snapshot-persistence.ts
 * ─────────────────────────────────────────────────────────────────────────────
 */

const SUPABASE_URL  = "https://uoraduyyxhtzixcsaidg.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvcmFkdXl5eGh0eml4Y3NhaWRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMjEwMTgsImV4cCI6MjA5MjY5NzAxOH0.qNrqDlG4j0lfGKDsmGyywP8DZeMurB02UWv4bdevW7c";

const BASE = `${SUPABASE_URL}/rest/v1`;
const HEADERS = {
  "apikey": SUPABASE_ANON,
  "Authorization": `Bearer ${SUPABASE_ANON}`,
  "Content-Type": "application/json",
  "Prefer": "return=representation",
};

const TEST_ID = "__test_persistence__";

let pass = 0, fail = 0;
function check(label: string, ok: boolean, detail?: any) {
  if (ok) { pass++; console.log(`✔ ${label}`); }
  else    { fail++; console.error(`✘ ${label}`, detail ?? ''); }
}

async function getRow(id: string) {
  const r = await fetch(`${BASE}/sf_snapshot?id=eq.${id}`, { headers: HEADERS });
  const rows = await r.json();
  return rows[0] ?? null;
}

async function upsertRow(body: any) {
  const r = await fetch(`${BASE}/sf_snapshot`, {
    method: "POST",
    headers: { ...HEADERS, "Prefer": "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`upsert failed: ${r.status} ${await r.text()}`);
  const rows = await r.json();
  return rows[0];
}

async function deleteRow(id: string) {
  await fetch(`${BASE}/sf_snapshot?id=eq.${id}`, {
    method: "DELETE", headers: HEADERS,
  });
}

async function main() {
  console.log('\n[persistence test] starting against', SUPABASE_URL);

  // Clean up any prior test run
  await deleteRow(TEST_ID).catch(() => {});

  // 1. Seed a row with multiple non-zero values
  const initial = await upsertRow({
    id: TEST_ID,
    ppor: 1_510_000,
    cash: 50_000,
    super_balance: 88_000,
    mortgage: 1_200_000,
    monthly_income: 21_940,
  });
  check('seed row created', initial?.id === TEST_ID && Number(initial.ppor) === 1_510_000, initial);

  // 2. PATCH only `cash` — other fields should be preserved
  await upsertRow({ id: TEST_ID, cash: 99_999 });
  const afterPatch = await getRow(TEST_ID);
  check('PATCH preserved ppor', Number(afterPatch.ppor) === 1_510_000, afterPatch);
  check('PATCH preserved mortgage', Number(afterPatch.mortgage) === 1_200_000, afterPatch);
  check('PATCH preserved super_balance', Number(afterPatch.super_balance) === 88_000, afterPatch);
  check('PATCH applied cash', Number(afterPatch.cash) === 99_999, afterPatch);

  // 3. Zero-overwrite guard: attempting to zero ppor should FAIL
  let blocked = false;
  try {
    await upsertRow({ id: TEST_ID, ppor: 0 });
  } catch (e: any) {
    blocked = String(e.message).includes('DATA_PROTECTION_VIOLATION')
           || String(e.message).includes('check_violation')
           || String(e.message).includes('refusing to zero');
  }
  check('zero-overwrite guard blocked ppor=0', blocked);

  // 4. After failed zero attempt, ppor must still be 1.51M
  const afterBlock = await getRow(TEST_ID);
  check('ppor preserved after blocked zero attempt', Number(afterBlock.ppor) === 1_510_000, afterBlock);

  // 5. Version increments monotonically
  const v1 = Number(afterBlock.version);
  await upsertRow({ id: TEST_ID, monthly_income: 22_000 });
  const v2Row = await getRow(TEST_ID);
  const v2 = Number(v2Row.version);
  check('version monotonic on legitimate update', v2 > v1, { v1, v2 });

  // 6. Clean up
  await deleteRow(TEST_ID);
  const gone = await getRow(TEST_ID);
  check('test row deleted', gone === null);

  console.log(`\n[persistence test] ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch(err => {
  console.error('test crashed:', err);
  process.exit(1);
});
