/**
 * Sprint 31E — Income save smoke (runs against live Supabase PostgREST).
 *
 * Verifies that the income form payload — including the new classification
 * fields income_type / behaviour / forecast_treatment — is accepted by
 * sf_income via the exact REST path the browser uses.
 *
 * Run with: npx tsx script/test-sprint31e-income-save.ts
 *
 * Exits non-zero if save fails or returned columns don't match.
 */

const SUPABASE_URL = "https://uoraduyyxhtzixcsaidg.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvcmFkdXl5eGh0eml4Y3NhaWRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMjEwMTgsImV4cCI6MjA5MjY5NzAxOH0.qNrqDlG4j0lfGKDsmGyywP8DZeMurB02UWv4bdevW7c";

const HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
} as const;

async function main(): Promise<void> {
  // Mirrors EMPTY_INCOME + applyTypeDefaults("employment_salary") in expenses.tsx
  const payload = {
    date: "2026-05-30",
    amount: 7500,
    source: "Salary",
    income_type: "employment_salary",
    behaviour: "recurring",
    forecast_treatment: "include",
    description: "sprint31e test",
    member: "Roham",
    frequency: "Monthly",
    recurring: true,
    notes: "auto",
  };

  const ins = await fetch(`${SUPABASE_URL}/rest/v1/sf_income`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(payload),
  });
  if (!ins.ok) {
    const text = await ins.text();
    throw new Error(`INSERT failed (${ins.status}): ${text}`);
  }
  const rows = (await ins.json()) as Array<Record<string, unknown>>;
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error(`Expected 1 row back, got ${JSON.stringify(rows)}`);
  }
  const row = rows[0];

  // Hard assertions on the three new columns
  for (const key of ["income_type", "behaviour", "forecast_treatment"] as const) {
    if (row[key] !== (payload as any)[key]) {
      throw new Error(`Column ${key}: expected "${(payload as any)[key]}", got "${row[key]}"`);
    }
  }

  // Cleanup
  const id = row.id;
  const del = await fetch(`${SUPABASE_URL}/rest/v1/sf_income?id=eq.${id}`, {
    method: "DELETE",
    headers: HEADERS,
  });
  if (!del.ok) {
    console.warn(`Cleanup DELETE returned ${del.status}; row id=${id} may need manual cleanup.`);
  }

  console.log("✓ sf_income save OK — income_type/behaviour/forecast_treatment persisted.");
}

main().catch((e) => {
  console.error("✗ sf_income save FAILED:", e?.message ?? e);
  process.exit(1);
});
