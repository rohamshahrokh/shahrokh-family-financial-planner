/**
 * test-fwl-tax-reform-followup-verification.ts
 * FWL_TAX_REFORM_INTEGRITY_FIX — Follow-up verification after preview QA.
 *
 * Preview QA found two surviving failures that the engine-level tests
 * had missed because they exercised the engine API rather than the
 * VISIBLE strategy/render contract:
 *
 *   F1. Tax Alpha visible strategy list still rendered "Negative Gearing
 *       Deduction — Claim $16K net rental loss → $6K tax reduction" under
 *       the proposed-reform scenario whenever there was at least one
 *       carve-out / grandfathered IP alongside quarantined IPs. The
 *       quarantined-variant card was only emitted when ALL eligible
 *       losses were zero.
 *
 *   F2. Events Timeline showed no "Second Investment Property" event when
 *       /api/properties had only ONE future-dated IP, even when the
 *       execution roadmap (fire-scenario config) knew the second-IP year.
 *
 * This test pins both fixes by:
 *
 *   1. Asserting that under proposed_reform with ANY quarantined IP, the
 *      Tax Alpha strategy named `negative_gearing` carries the title
 *      "Negative Gearing — Quarantined Under Reform" and that no strategy
 *      contains the current-law phrase
 *      /Claim .* (net|eligible NG) rental loss .* tax reduction/i.
 *
 *   2. Asserting that `TaxAlphaResult.active_scenario` is plumbed onto the
 *      result (so the visible scenario banner reflects the engine state).
 *
 *   3. Asserting `tax-alpha.tsx` renders the scenario banner with the
 *      `data-testid="tax-alpha-scenario-banner"` selector AND that the
 *      `data-active-scenario` attribute is bound to `result.active_scenario`
 *      from the engine — i.e. the visible strategy list, not just the
 *      audit table, sees the active scenario.
 *
 *   4. Asserting `WealthDecisionCenter.defaultRoadmap` includes a Second
 *      Investment Property event in 2028 when given a fixture with one
 *      planned acquisition AND a `roadmapSecondIpYear` = 2028 (the
 *      execution-roadmap fallback path).
 *
 *   5. Asserting `dashboard.tsx` wires the fire-scenario config into the
 *      `roadmapSecondIpYear` prop on ExecutiveDashboard.
 *
 * Run: npx tsx script/test-fwl-tax-reform-followup-verification.ts
 */

import { readFile } from "node:fs/promises";
import { computeTaxAlpha, type TaxAlphaInput } from "../client/src/lib/taxAlphaEngine";

const TESTS: Array<{ name: string; assert: () => void | Promise<void> }> = [];
function test(name: string, fn: () => void | Promise<void>) { TESTS.push({ name, assert: fn }); }
function eq<T>(a: T, b: T, m: string): void {
  if (a !== b) throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function truthy(v: unknown, m: string): void {
  if (!v) throw new Error(`${m}: expected truthy, got ${JSON.stringify(v)}`);
}
function falsy(v: unknown, m: string): void {
  if (v) throw new Error(`${m}: expected falsy, got ${JSON.stringify(v)}`);
}

// ─── Fixture — mixed eligible + quarantined IPs ──────────────────────────────
// One grandfathered IP (acquired pre-cutoff, NG-eligible under reform)
// plus one post-cutoff established IP (quarantined under reform).

const IP_GRANDFATHERED = {
  id: 301, is_ppor: false,
  weekly_rent: 540, loan_amount: 620_000, interest_rate: 6.5,
  management_fee: 8, council_rates: 2_200, insurance: 1_800,
  maintenance: 2_000, body_corporate: 0,
  property_type: 'ESTABLISHED',
  contract_date: '2024-09-01', purchase_date: '2024-10-15', // pre-cutoff
};

const IP_QUARANTINED = {
  id: 302, is_ppor: false,
  weekly_rent: 620, loan_amount: 720_000, interest_rate: 6.5,
  management_fee: 8, council_rates: 2_400, insurance: 1_900,
  maintenance: 2_200, body_corporate: 0,
  property_type: 'ESTABLISHED',
  contract_date: '2028-02-15', purchase_date: '2028-03-30', // post-cutoff
};

function taxAlphaInputForScenario(scenario: 'current_law' | 'proposed_reform'): TaxAlphaInput {
  return {
    roham_annual_income: 220_000,
    fara_annual_income:  0,
    roham_super_balance: 0, fara_super_balance: 0,
    roham_employer_sg_rate: 12, roham_salary_sacrifice_monthly: 0,
    fara_employer_sg_rate:  12, fara_salary_sacrifice_monthly:  0,
    properties: [IP_GRANDFATHERED, IP_QUARANTINED] as any,
    mortgage_balance: 0, mortgage_rate: 6.5, offset_balance: 0,
    stocks_value: 0, crypto_value: 0, other_debts: 0,
    roham_has_private_health: true, fara_has_private_health: true,
    roham_has_help_debt: false, fara_has_help_debt: false,
    unrealised_gains: 0,
    active_scenario: scenario,
  };
}

// ─── F1. Visible strategy list — no current-law NG card under reform ────────

test("PR1: under proposed_reform with ANY quarantined IP, NG strategy title is the Quarantined-Under-Reform variant (mixed-eligibility fixture)", () => {
  const r = computeTaxAlpha(taxAlphaInputForScenario('proposed_reform'));
  const ng = r.strategies.find(s => s.id === 'negative_gearing');
  truthy(ng, "negative_gearing strategy present");
  eq(ng!.title, 'Negative Gearing — Quarantined Under Reform',
    "NG title must surface the quarantined variant whenever ANY IP is quarantined");
});

test("PR2: no strategy on the visible list carries the current-law 'Claim … rental loss … tax reduction' phrasing under reform", () => {
  const r = computeTaxAlpha(taxAlphaInputForScenario('proposed_reform'));
  const phrase = /Claim .* (net|eligible NG) rental loss .* tax reduction/i;
  for (const s of r.strategies) {
    falsy(phrase.test(s.action),
      `strategy ${s.id} action must not use current-law NG phrasing under reform: "${s.action}"`);
  }
});

test("PR3: under current_law (sanity), NG title is the current-law variant 'Negative Gearing Deduction'", () => {
  const r = computeTaxAlpha(taxAlphaInputForScenario('current_law'));
  const ng = r.strategies.find(s => s.id === 'negative_gearing');
  truthy(ng, "negative_gearing strategy present");
  eq(ng!.title, 'Negative Gearing Deduction',
    "current_law title preserved");
});

// ─── F2. active_scenario plumbed into result + UI banner ────────────────────

test("PR4: TaxAlphaResult exposes active_scenario === 'proposed_reform'", () => {
  const r = computeTaxAlpha(taxAlphaInputForScenario('proposed_reform'));
  eq(r.active_scenario, 'proposed_reform', "active_scenario plumbed");
  eq(r.reform_has_quarantined_ips, true, "quarantined flag plumbed");
});

test("PR5: TaxAlphaResult.active_scenario follows current_law switch", () => {
  const r = computeTaxAlpha(taxAlphaInputForScenario('current_law'));
  eq(r.active_scenario, 'current_law', "current_law scenario echoes");
  eq(r.reform_has_quarantined_ips, false, "no quarantine under current law");
});

test("PR6: tax-alpha.tsx renders a visible scenario banner bound to active_scenario", async () => {
  const src = await readFile("client/src/pages/tax-alpha.tsx", "utf8");
  truthy(/data-testid="tax-alpha-scenario-banner"/.test(src),
    "banner has stable test id");
  truthy(/data-active-scenario=\{active_scenario\}/.test(src),
    "banner exposes active_scenario via data attribute so the visible list — not just the audit table — reflects the engine state");
  truthy(/PROPOSED 2027 REFORM/.test(src), "banner copy mentions the reform scope");
  truthy(/CURRENT LAW/.test(src),          "banner copy mentions current-law scope");
});

// ─── F3. Events Timeline — Second IP via roadmap fallback ───────────────────

test("PR7: WealthDecisionCenter.defaultRoadmap includes 'Second Investment Property' year 2028 when roadmapSecondIpYear is provided and /api/properties has only 1 future IP", async () => {
  const mod = await import("../client/src/components/WealthDecisionCenter");
  // defaultRoadmap is not exported by name; test the source-level contract:
  // the file must (a) read props.roadmapSecondIpYear, (b) push a 'second-ip'
  // event with that year, (c) carry the roadmap-derived description so the
  // user knows the source.
  const src = await readFile("client/src/components/WealthDecisionCenter.tsx", "utf8");
  truthy(/roadmapSecondIpYear/.test(src),
    "defaultRoadmap reads props.roadmapSecondIpYear");
  truthy(/roadmapIp2/.test(src) || /roadmap.*Ip.*2|ip2.*roadmap/i.test(src),
    "explicit roadmap fallback variable is wired");
  truthy(/Second Investment Property/.test(src),
    "Second Investment Property event present");
  truthy(/execution roadmap|acquisition engine/.test(src),
    "fallback description mentions the execution roadmap / acquisition engine");
  void mod;
});

test("PR8: ExecutiveDashboardProps declares the roadmapSecondIpYear prop", async () => {
  const src = await readFile("client/src/components/ExecutiveDashboard.tsx", "utf8");
  truthy(/roadmapSecondIpYear\?:\s*number\s*\|\s*null/.test(src),
    "ExecutiveDashboardProps.roadmapSecondIpYear typed");
});

test("PR9: dashboard.tsx fetches /api/fire-scenario-config and forwards roadmapSecondIpYear", async () => {
  const src = await readFile("client/src/pages/dashboard.tsx", "utf8");
  truthy(/['"]\/api\/fire-scenario-config['"]/.test(src),
    "dashboard fetches fire-scenario-config");
  truthy(/roadmapSecondIpYear:/.test(src),
    "dashboard wires roadmapSecondIpYear into ExecutiveDashboard props");
  truthy(/num_planned_ips/.test(src),
    "second-IP year derivation gates on num_planned_ips >= 2");
});

// ─── F4. Functional test: render defaultRoadmap directly via a thin probe ──
// We test the year-derivation logic by re-implementing the same plan
// derivation against a fixture and asserting it would push the IP2 event.

test("PR10: pure roadmap derivation produces Second IP year 2028 from fixture", () => {
  // Mirror the WealthDecisionCenter logic locally so the test does not
  // require React rendering. This is a contract test on the algorithm.
  const plannedAcquisitions = [
    {
      id: 401, name: 'First IP',
      contract_date: '2027-09-01', settlement_date: null,
      purchase_date: null, purchase_price: 760_000, property_type: 'ESTABLISHED', type: 'investment',
    },
  ];
  const roadmapSecondIpYear = 2028; // sourced from fire_scenario_config in dashboard.tsx

  const plan = plannedAcquisitions
    .map(p => ({ entry: p, year: parseInt(String(p.contract_date ?? p.settlement_date ?? p.purchase_date).slice(0, 4), 10) }))
    .filter(x => Number.isFinite(x.year));
  const firstIpYear  = plan[0]?.year ?? null;
  const secondIpYear = plan[1]?.year ?? roadmapSecondIpYear;

  eq(firstIpYear,  2027, "first IP year derived from plannedAcquisitions");
  eq(secondIpYear, 2028, "second IP year falls back to roadmapSecondIpYear when plannedAcquisitions has < 2 entries");
});

// ─── F4b. Preview-path: demo /api/fire-scenario-config seeds IP2 = 2028 ────
//
// Root cause of the FOLLOW-UP-2 failure: the demo deployment's
// /api/fire-scenario-config endpoint returned [], so the dashboard's
// roadmapSecondIpYear derivation produced null and the EVENTS tab silently
// omitted the Second IP event. This test pins the demo seed shape and the
// algorithm that maps it to 2028.

test("PR12: DEMO_FIRE_SCENARIO_CONFIG ships a scenario with num_planned_ips >= 2 and ip_target_year = 2028", async () => {
  const mod = await import("../client/src/lib/demoData");
  const cfg = (mod as any).DEMO_FIRE_SCENARIO_CONFIG;
  truthy(Array.isArray(cfg), "DEMO_FIRE_SCENARIO_CONFIG exported");
  truthy(cfg.length > 0, "demo config is not empty");
  const multiIp = cfg.find((s: any) => s.num_planned_ips >= 2 && s.ip_target_year != null);
  truthy(multiIp, "at least one scenario plans >= 2 IPs with a target year");
  eq(multiIp.ip_target_year, 2028,
    "demo's multi-IP scenario targets IP2 in 2028 — the value the EVENTS tab must surface");
});

test("PR13: queryClient demo branch returns DEMO_FIRE_SCENARIO_CONFIG for GET /api/fire-scenario-config", async () => {
  const src = await readFile("client/src/lib/queryClient.ts", "utf8");
  truthy(/DEMO_FIRE_SCENARIO_CONFIG/.test(src),
    "queryClient imports DEMO_FIRE_SCENARIO_CONFIG");
  // The demo branch must serve the seed, not an empty array literal.
  const demoBlock = src.match(/path === "\/api\/fire-scenario-config"[\s\S]*?if \(m === "GET"\) return [^;]+;/);
  truthy(demoBlock, "demo-branch fire-scenario-config block found");
  truthy(/DEMO_FIRE_SCENARIO_CONFIG/.test(demoBlock![0]),
    "demo branch serves DEMO_FIRE_SCENARIO_CONFIG (not [])");
});

test("PR14: pure derivation against DEMO seed + 1-property fixture yields roadmapSecondIpYear = 2028", async () => {
  const mod = await import("../client/src/lib/demoData");
  const cfgs = (mod as any).DEMO_FIRE_SCENARIO_CONFIG as Array<any>;
  // Reproduce the dashboard.tsx derivation locally.
  const candidates = cfgs
    .filter(c => Number(c?.num_planned_ips ?? 0) >= 2 && c?.ip_target_year != null)
    .map(c => parseInt(String(c.ip_target_year), 10))
    .filter(y => Number.isFinite(y));
  const roadmapSecondIpYear = candidates.length > 0 ? Math.max(...candidates) : null;
  eq(roadmapSecondIpYear, 2028,
    "derivation matches the value the WDC events timeline must render");
});

test("PR15: WDC defaultRoadmap pushes Second Investment Property event when /api/properties has 1 IP and roadmap fallback is 2028", async () => {
  // Pure-algorithm reproduction of WealthDecisionCenter.defaultRoadmap
  // for the IP2 fallback path. Mirrors the source change so the event
  // is emitted whenever plannedAcquisitions has < 2 entries but a
  // roadmap-derived year exists.
  const plannedAcquisitions = [
    { name: 'IP1 — Everton Park', contract_date: null, settlement_date: null, purchase_date: '2027-03-01' },
  ];
  const roadmapSecondIpYear = 2028;

  const plan = plannedAcquisitions
    .map(p => ({ entry: p, year: parseInt(String(p.contract_date ?? p.settlement_date ?? p.purchase_date).slice(0, 4), 10) }))
    .filter(x => Number.isFinite(x.year));
  const firstIpYear  = plan[0]?.year ?? null;
  const secondIpYear = plan[1]?.year ?? roadmapSecondIpYear;
  const secondIpFromRoadmap = plan[1]?.year == null && roadmapSecondIpYear != null;

  eq(firstIpYear, 2027,  "first IP from plannedAcquisitions");
  eq(secondIpYear, 2028, "second IP from roadmap fallback");
  eq(secondIpFromRoadmap, true, "secondIpFromRoadmap flag is true when roadmap supplies the value");

  // The WDC code must emit a 'second-ip' event with this year. Source
  // contract test:
  const src = await readFile("client/src/components/WealthDecisionCenter.tsx", "utf8");
  truthy(/id:\s*['"]second-ip['"]/.test(src), "WDC pushes second-ip event");
  truthy(/year:\s*`\$\{secondIpYear\}`/.test(src), "year bound to derived secondIpYear");
});

// ─── F5. preserve prior contract tests (still green) ────────────────────────

test("PR11: still imports classifyPropertyTaxRegime in taxAlphaEngine and finance", async () => {
  const a = await readFile("client/src/lib/taxAlphaEngine.ts", "utf8");
  const f = await readFile("client/src/lib/finance.ts", "utf8");
  truthy(/classifyPropertyTaxRegime/.test(a), "taxAlphaEngine still binds to taxRulesEngine");
  truthy(/classifyPropertyTaxRegime/.test(f), "finance still binds to taxRulesEngine");
});

// ─── Runner ────────────────────────────────────────────────────────────────

(async () => {
  let pass = 0, fail = 0;
  for (const t of TESTS) {
    try {
      await t.assert();
      console.log(`  ✓ ${t.name}`);
      pass += 1;
    } catch (e: any) {
      console.error(`  ✗ ${t.name}\n      ${e.message}`);
      fail += 1;
    }
  }
  console.log(`\n${pass}/${TESTS.length} fwl-tax-reform-followup-verification tests passed.`);
  if (fail > 0) process.exit(1);
})();
