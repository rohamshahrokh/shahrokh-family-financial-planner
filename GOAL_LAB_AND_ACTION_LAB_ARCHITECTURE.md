# Goal Lab + Decision Lab — Engine-Integrated Architecture

**Status:** v3 — six locked decisions baked in (2026-05-28). Supersedes v2 and `GOAL_LAB_UX_BRIEF.md`. No code changes proposed yet.
**Scope:** Goal Lab UX wiring + canonical FIRE profile contract + Decision Lab orchestration entry point + engine integration boundary + Action Plan handoff.
**Out of scope:** F3/F4 work; intelligence-layer rewrites; new recommendation engines; new sidebar IA. **We reuse the existing Unified Recommendation Engine, scenarioV2 stack, /decision-lab route, and /action-plan route.**
**Companion docs:** `ENGINE_CONSOLIDATION_PLAN.md`, `GOAL_LAB_UX_BRIEF.md` (UX layer reference only).

---

## 1 · Architectural intent (locked)

Three layers, three existing routes, one canonical profile.

```
┌────────────────────────────────────────────────────────────────────────┐
│  GOAL LAB                      (NEW route /goal-lab, sidebar: PLAN)    │
│  ──────────                                                            │
│  Purpose: define WHO the household is and WHAT they want.              │
│  Responsibility: produce ONE canonical CanonicalGoalProfile object.    │
│  Does NOT: run forecasts, generate scenarios, rank actions, score      │
│            paths, invent recommendations.                              │
│                                                                        │
│        ▲                                                               │
│        │ reads from + writes back to                                   │
│        ▼                                                               │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │  CANONICAL FIRE PROFILE (mc_fire_settings + Goal Lab fields)   │    │
│  │  Single durable source of intent + constraints + preferences.  │    │
│  └────────────────────────────────────────────────────────────────┘    │
│        ▲                                                               │
│        │ consumed by                                                   │
│        ▼                                                               │
│  DECISION LAB                  (EXISTING /decision-lab, sidebar: MOVE) │
│  ────────────                                                          │
│  Purpose: produce ranked next-best-move recommendations.               │
│  Responsibility: orchestrate the EXISTING engines.                     │
│  Does NOT: invent a parallel recommendation system.                    │
│                                                                        │
│  Orchestrator calls:                                                   │
│    scenarioV2.runScenarioV2 + candidateGenerator                       │
│    monteCarloV5 / canonical MC stack                                   │
│    forecastEngine + doNothingForecast                                  │
│    goalSolverPro                                                       │
│    pathSimulationEngine                                                │
│    decisionCandidates + decisionRanking + bestMoveEngineSprint5        │
│    recommendationEngine.computeUnifiedRecommendations  ← the brain     │
│        ▲                                                               │
│        │ user picks a path; operational steps flow to                  │
│        ▼                                                               │
│  ACTION PLAN                   (EXISTING /action-plan, sidebar: MOVE)  │
│  ────────────                                                          │
│  Purpose: operational execution — what to do this week / month.        │
│  Responsibility: render the chosen path as concrete, dated steps.      │
│  Out of scope for THIS brief — wiring designed in a later sprint.      │
└────────────────────────────────────────────────────────────────────────┘
```

**Critical: the Unified Recommendation Engine already exists** at `client/src/lib/recommendationEngine/engine.ts`. It has:
- 8 strategic pillars (`prevent_failure`, `protect_liquidity`, `reduce_high_interest_debt`, `stabilise_leverage`, `decumulate_safely`, `preserve_tax_efficiency`, `maintain_investing_discipline`, `improve_fire_timeline`, `maximise_wealth`).
- Hard vs soft constraint separation (preferences cannot promote past safety).
- Quality scoring, fatigue penalty, calibrated confidence, marginal impact simulation.
- Adapters from BestMove, Risk Radar, FirePath, MC V5, behavioural profile, autonomous OS, scenario tree, household state, scenarioV2 QuickDecision.

**Decision Lab is the UI for this engine, not a new engine. Action Plan is the operational layer for a chosen path, not a second recommender.**

---

## 2 · Goal Lab — six questions (locked wording + locked Q6 hybrid logic)

The user's locked wording (replaces the earlier draft):

| # | Question | Captures |
|---|---|---|
| 1 | **What does financial freedom mean for you?** | Lifestyle definition + passive income target (replaces "FIRE goal" as bare label) |
| 2 | **When do you want to reach it?** | Target FIRE year / age |
| 3 | **How much risk can you emotionally tolerate?** | Risk capacity (emotional, not just numerical) |
| 4 | **What are you already doing well?** | Strengths the household self-identifies (anchoring momentum) |
| 5 | **What constraints cannot break?** | Hard constraints (liquidity floor, max LVR, no-touch assets, family obligations) |
| 6 | **What matters most: speed, safety, flexibility, or lifestyle?** | Preference vector — **hybrid: engine-computed primary + manual override** |

### Why this set is structurally different from a calculator
- Questions 4 and 6 are **behavioural-finance inputs**, not numerical. They feed the soft-rerank layer, not the forecast.
- Question 5 is the **hard-constraint vector** — the only place the user is allowed to set "do not cross" lines.
- Question 1 is **goal definition**, not goal number — the engine derives the FIRE number from the canonical SWR + the lifestyle answer.

### Header positioning (locked — Option A)

- **Title:** `GOAL LAB`
- **Methodology eyebrow:** `Goals-Based Wealth Planning · Behavioural Finance · Monte Carlo Forecasting`
- **Sub-header:** "An institutional-style framework for understanding your path to financial independence."
- **No "FWL Framework™" branding anywhere.** The credibility comes from naming the real disciplines we use — not from inventing a proprietary acronym. Evidence-based and institutional, not self-invented.

### Question 6 — hybrid engine + override (locked)

Q6 is the one card that **does not** start blank. The system pre-computes a `preferenceVector` from the household's actual behaviour and surfaces it as the **primary inferred answer**. The user can confirm or override.

#### Engine-computed signals (the "primary" half of the hybrid)

| Signal | Source | Pushes toward |
|---|---|---|
| **Behavioural blocker** | `behaviouralFinance.detectBlockers()` — loss aversion, status-quo bias, present bias counts | `safety` (if loss-aversion dominant), `lifestyle` (if present-bias dominant) |
| **Liquidity stress** | `canonicalLiquiditySelectors.runwayMonths`, `recommendationEngine.calibratedConfidence` | `safety` (if runway < hard floor) and `flexibility` (if runway thin but not breached) |
| **Leverage pressure** | `canonicalDebtService.dsrBand`, `canonicalFire.lvr` vs `hardConstraints.maxLvr` headroom | `safety` if DSR amber/red; `speed` if comfortable headroom + young horizon |
| **Savings consistency** | Rolling 6/12-month savings rate stability from ledger | `speed` if stable + high; `lifestyle` if volatile or trending down |
| **Inferred volatility tolerance** | Past portfolio-drift behaviour, riskRadar capacity band, behavioural reactions logged in audit trails | `speed` (high) or `safety` (low) |

The inferred weights render as a four-axis radar with a labelled chip ("Inferred from your behaviour"). The user can:
- Tap **`[Looks right]`** to confirm the inferred vector, OR
- Tap **`[Adjust]`** to enter manual override mode (radar becomes editable; auto-normalises to sum 1.0).

Confirmed source on the profile: `'system_inferred_confirmed'` or `'user_overridden'`. Both are valid; both feed the soft rerank layer identically downstream.

**Design intent (locked):** "System understands me, not system trapped me." The default is never blank, never a guess — it is a defensible read of the user's own ledger behaviour, transparently sourced.

### Each card must
1. **Auto-read** existing values from the canonical ledger / `mc_fire_settings`.
2. **Show** a single inferred answer block with a `SourceTag` chip (ledger / Monte Carlo / behavioural-engine / user-set / derived / inferred-from-pattern).
3. **Allow** manual override via `[Edit]` deep-link to the canonical editor — never duplicate-edit in place. (Q6 override is in-place per above.)
4. **Confirm** via `[Looks good]` pill that flips card status to confirmed.
5. **Show** "Goal not set" / "No data yet" CTA when no canonical answer exists — never invent defaults (Sprint 13 P0 locked decision #1). Q6 is the documented exception: its primary value is engine-inferred, not invented.
6. **Be calm, advisory, non-spreadsheet.** Read-first, confirm-second, edit-last.

### Right rail — "Book a call" placeholder (locked)

The right rail of `/goal-lab` includes a passive card slot labelled **"Talk to a planner"** with a disabled-state CTA. **Placeholder only.** No booking widget, no calendar wiring, no advisory infrastructure, no auth flow. The slot reserves visual space and signals future capability — nothing more. To be wired in a later, separately scoped sprint.

---

## 3 · The Canonical Goal Profile (the single output of Goal Lab)

```ts
/**
 * CanonicalGoalProfile — the SINGLE object Goal Lab produces and Decision Lab
 * consumes. Persisted to mc_fire_settings (existing fields) + a new
 * goal_profile_extras JSONB column for the behavioural / preference fields.
 *
 * No engine outside Goal Lab writes to this. Every consumer reads via
 * `useCanonicalGoalProfile()` (extension of the existing useCanonicalGoal()
 * hook).
 */
export interface CanonicalGoalProfile {
  status: 'NOT_SET' | 'PARTIAL' | 'COMPLETE';

  // ── Question 1: What does financial freedom mean for you? ─────────────
  lifestyle: {
    label: 'lean' | 'comfortable' | 'aspirational' | 'custom';
    targetPassiveMonthly: number | null;          // user-set OR derived from lifestyle label
    description?: string;                          // optional free-text
    source: 'user_set' | 'lifestyle_template' | 'expenses_fallback';
  };

  // ── Question 2: When do you want to reach it? ─────────────────────────
  timeline: {
    targetFireAge: number | null;
    targetFireYear: number | null;                 // derived = currentYear + (targetFireAge - currentAge)
    horizonYears: number | null;                   // = targetFireYear - currentYear
    source: 'user_set' | 'derived_from_age';
  };

  // ── Question 3: How much risk can you emotionally tolerate? ───────────
  riskTolerance: {
    band: 'low' | 'medium_low' | 'medium' | 'medium_high' | 'high';
    drawdownToleranceP: number | null;             // 0..1 (e.g. 0.35 means "I could stomach a 35% drawdown")
    incomeLossEnduranceMonths: number | null;
    leverageComfort: 'conservative' | 'moderate' | 'aggressive';
    source: 'user_set' | 'derived_from_risk_radar';
  };

  // ── Question 4: What are you already doing well? ──────────────────────
  strengths: {
    items: Array<
      | 'high_savings_rate'
      | 'low_debt'
      | 'diversified_portfolio'
      | 'strong_emergency_buffer'
      | 'tax_efficient'
      | 'super_optimised'
      | 'low_concentration'
      | 'property_equity'
      | 'income_stability'
      | 'other'
    >;
    customNote?: string;
    source: 'user_acknowledged' | 'system_inferred';
  };

  // ── Question 5: What constraints cannot break? ────────────────────────
  hardConstraints: {
    minLiquidityFloor: number | null;              // $ — never let cash + offset drop below this
    maxLvr: number | null;                         // 0..1 — never exceed
    minEmergencyMonths: number | null;             // 1..24
    untouchableAssets: Array<{ assetId: string; reason: string }>;
    noNewDebt: boolean;
    noPropertyPurchases: boolean;
    noCryptoExposure: boolean;
    customConstraints: Array<{ label: string; rule: string }>;
    source: 'user_set';
  };

  // ── Question 6: What matters most? (hybrid: inferred primary + override)
  preferenceVector: {
    speed: number;        // 0..1 — accelerate FIRE
    safety: number;       // 0..1 — minimise downside
    flexibility: number;  // 0..1 — preserve optionality (liquidity, refinanceability, low lock-in)
    lifestyle: number;    // 0..1 — current quality of life
    // Constraints: must sum to 1.0. UI auto-normalises.
    source: 'system_inferred' | 'system_inferred_confirmed' | 'user_overridden';
    inferenceSignals?: {
      behaviouralBlocker: string | null;
      liquidityStressBand: 'green' | 'amber' | 'red' | null;
      leveragePressureBand: 'green' | 'amber' | 'red' | null;
      savingsConsistencyBand: 'low' | 'medium' | 'high' | null;
      inferredVolatilityTolerance: 'low' | 'medium' | 'high' | null;
    };
  };

  // ── Meta ──────────────────────────────────────────────────────────────
  meta: {
    completionFraction: number;                     // 0..1 across the 6 dimensions
    confirmedDimensions: Array<1 | 2 | 3 | 4 | 5 | 6>;
    lastConfirmedAt: string | null;                 // ISO
    snapshotVersionAtLastConfirm: string | null;    // sf_snapshot.updated_at value
    ledgerInvalidatorsSinceConfirm: Array<
      | 'income_change'
      | 'property_purchase'
      | 'debt_increase'
      | 'major_expense_shift'
      | 'fire_target_change'
      | 'asset_allocation_change'
    >;
    isStale: boolean;                               // true iff any invalidator has fired
    canonicalGoal: CanonicalGoal;                   // the existing `useCanonicalGoal` result, re-exported
  };
}
```

### Persistence layer
- **Existing columns** (`mc_fire_settings`): `target_fire_age`, `target_passive_monthly`, `swr_pct`, `goals_set`, `goal_set_timestamp` — already canonical.
- **New JSONB column** (proposed): `mc_fire_settings.goal_profile_extras` containing strengths, hardConstraints, preferenceVector (incl. inferenceSignals), riskTolerance band & emotional dims, completionFraction, lastConfirmedAt snapshot, confirmedDimensions, ledgerInvalidatorsSinceConfirm.
- **Migration:** additive; idempotent; runs on next deploy via the existing `runFireGoalMigration` boot path (`App.tsx:bootFireGoalMigration`). No new endpoint required; extend the `PUT /api/mc-fire-settings` handler.

### Reader hook
- Extend the existing `useCanonicalGoal()` into `useCanonicalGoalProfile()` returning `CanonicalGoalProfile`. Keep `useCanonicalGoal()` for backwards compatibility (it's used by `goalSolverPro`, dashboard, etc.).

---

## 4 · Card-by-card auto-read + write contract

| # | Card | Auto-read source | Write target |
|---|---|---|---|
| 1 | What does freedom mean? | `mc_fire_settings.target_passive_monthly`; fallback to `selectMonthlyExpensesLedger()` as "expenses_fallback" suggestion | `mc_fire_settings.target_passive_monthly` + `goal_profile_extras.lifestyle.label/description` |
| 2 | When? | `mc_fire_settings.target_fire_age`; derive year from `mc_fire_settings.current_age` | `mc_fire_settings.target_fire_age` |
| 3 | Risk tolerance | Existing `riskEngine.runRiskRadar()` for derived band; `goal_profile_extras.riskTolerance` for user-set | `goal_profile_extras.riskTolerance.*` |
| 4 | Strengths | Heuristic inference from canonical ledger (e.g. savings rate ≥ 25% ⇒ `high_savings_rate`, LVR ≤ 0.5 ⇒ `low_debt`, etc.) | `goal_profile_extras.strengths.items[]` + `customNote` |
| 5 | Hard constraints | Pre-fill from `dashboardDataContract` (current liquidity, current LVR) as defaults; user explicitly raises floors | `goal_profile_extras.hardConstraints.*` |
| 6 | Preferences | **Hybrid: engine inference from five signals (see §2). User confirms or overrides.** Default is never blank. | `goal_profile_extras.preferenceVector.*` (incl. `inferenceSignals` + `source`) |

**Critical rule:** for cards 1–5, auto-read produces a SUGGESTION shown in the card preview. It is NOT confirmed until the user clicks `[Looks good]`. Status flows: `inferred` → `confirmed` → (if ledger invalidator fires) `stale`. Card 6 follows the same pattern but its inferred value is engine-computed (not ledger lookup), and override is in-place rather than via deep-link.

---

## 5 · Decision Lab — the orchestration layer

### What Decision Lab IS
A single entry point that takes a `CanonicalGoalProfile` + the current `DashboardInputs` and runs the existing engines in the correct order, then renders the ranked Recommendation list from the Unified Recommendation Engine.

`/decision-lab` already exists in the sidebar (MOVE section, Layout.tsx:100). We evolve it; we do NOT create `/action-lab`.

### What Decision Lab IS NOT
- A new recommendation algorithm.
- A new MC engine.
- A new scenario generator.
- A page that hardcodes candidate paths.
- A new route. The route is `/decision-lab`. Always.

### Orchestrator signature (proposed)

```ts
/**
 * runDecisionLab — single orchestration entry point.
 *
 * Pure orchestration over EXISTING engines. No new financial math.
 * Lives in: client/src/lib/decisionLab/orchestrator.ts (NEW, ~200 LoC)
 */
export async function runDecisionLab(input: DecisionLabInput): Promise<DecisionLabResult> {
  const { profile, dashboardInputs, maxLvr } = input;

  // 1. Forecast — current path
  const forecast = buildForecast(forecastInputFromCanonical(dashboardInputs));
  const doNothing = buildDoNothingForecast(/* ... */);

  // 2. Monte Carlo — canonical V5 stack
  const mcInput = buildCanonicalMonteCarloInput(dashboardInputs, /* planned events */);
  const monteCarloV5 = runMonteCarloV5(mcInput, /* V4 config */, /* V5 config */);

  // 3. Path simulation — Sprint 9
  const pathSim = runPathSimulation({ /* strategies × MC paths */ });

  // 4. Goal Solver Pro — reverse-engineer required deltas
  const goalSolver = buildGoalSolverPro({
    targets: targetsFromCanonical(profile),
    constraints: constraintsFromCanonical(profile),
    tpo: buildTruePortfolioOptimizer(/* ... */),
    probWealth: /* ... */,
    pathSim,
  });

  // 5. Decision candidates — Sprint 5 + scenarioV2 layer 2
  const sprint5Candidates = generateDecisionCandidates(/* ... */);
  const scenarioV2Candidates = await runScenarioV2QuickDecision({
    question: questionFromPreferenceVector(profile.preferenceVector),
    dashboardInputs,
  });
  writeLatestQuickDecision(scenarioV2Candidates); // populate the existing in-memory cache

  // 6. Unified Recommendation Engine — the strategic brain
  const unified = await computeUnifiedBestMove({
    cfg: { maxLvr: profile.hardConstraints.maxLvr ?? maxLvr },
    monteCarloV5,
  });

  // 7. Re-rank top recommendations by preference vector (soft layer only)
  const reranked = rerankByPreferenceVector(unified.recommendations, profile.preferenceVector);

  // 8. Produce the five canonical surfaces
  return {
    safestPath:    pickByPillar(reranked, ['prevent_failure', 'protect_liquidity']),
    fastestPath:   pickByObjective(reranked, 'fire_speed'),
    highestProb:   pickByObjective(reranked, 'probability'),
    hybridPath:    pickByObjective(reranked, 'hybrid'),
    bestCashflow:  pickByObjective(reranked, 'cashflow'),
    allRanked:     reranked,
    rationale:     buildRationale(reranked, profile),
    sourceTrace:   { forecast, monteCarloV5, pathSim, goalSolver, sprint5Candidates, scenarioV2Candidates, unified },
  };
}
```

### Hard rule — preference vector cannot break safety
Per the Unified Recommendation Engine docstring: "Investor preferences may rerank WITHIN safe candidates only; they cannot promote an item past a higher-tier hard recommendation." Goal Lab's Q6 feeds the soft layer ONLY. Q5 (hard constraints) feeds the hard layer.

### Candidate path families (consumed from existing generators)

The user's listed candidate families map to existing generator outputs:

| User-stated family | Existing engine source |
|---|---|
| Buy IP now | `decisionCandidates.kind = 'proceed-property'` + `scenarioV2.decisionEngine` LVR-leverage axis |
| Delay property purchase | `decisionCandidates.kind = 'delay-property'` |
| ETF-heavy path | `decisionCandidates.kind = 'etf-dca'` + `truePortfolioOptimizer` allocation axis |
| Debt reduction | `decisionCandidates.kind = 'pay-high-interest-debt'` + `bestMoveEngineSprint5` |
| Hybrid strategy | `scenarioV2.decisionEngine.candidateGenerator` Stage-2 combined paths |
| Super contribution | `decisionCandidates.kind = 'increase-super'` |
| Equity recycling | NOT currently generated — flag for future sprint, do NOT invent in Decision Lab |
| Cash buffer preservation | `decisionCandidates.kind = 'build-emergency-buffer'` |

### Evaluation dimensions (already produced by existing engines)

| Dimension | Source engine |
|---|---|
| FIRE probability | `monteCarloV5.prob_ff` |
| Net worth trajectory | `monteCarloV5.fan_data` p10/p50/p90 |
| Passive income | `canonicalFire.monthlyPassiveIncome` projected via forecast |
| Liquidity stress | `recommendationEngine.calibratedConfidence` + canonical liquidity selector |
| Debt stress | `canonicalDebtService.dsrBand` |
| Timeline | `goalSolverPro.feasibility.yearsAheadOrBehind` |
| Downside risk | `monteCarloV4.advancedRiskMetrics` + `monteCarloV5.correlatedShockSummary` |
| Behavioural fit | `recommendationEngine.qualityScore` + Goal Lab preference vector reranker |

**Every output dimension already has a canonical engine source. Decision Lab orchestrates; it never computes.**

---

## 6 · Output surfaces — "Show me the smartest paths"

Decision Lab renders five canonical paths, derived from the same ranked list:

| Card | Selection rule |
|---|---|
| **Safest path** | Highest-ranked recommendation in `prevent_failure` or `protect_liquidity` pillar |
| **Fastest path** | Highest reduction in `goalSolverPro.feasibility.yearsAheadOrBehind` |
| **Highest probability path** | Highest `monteCarloV5.prob_ff` improvement |
| **Best hybrid path** | Highest `recommendationEngine.qualityScore` combined with preference-vector alignment |
| **Best cashflow path** | Highest passive coverage in the 12–36 month window from forecast |

Plus a sixth implicit "Hold current path" baseline using `doNothingForecast`, always visible for comparison (Sprint 13 P0 locked decision #6).

Each path card shows:
- One-line summary (e.g. "Delay IP purchase by 18 months, redirect $42k to ETF DCA").
- Three impact numbers: FIRE-year shift, probability delta, liquidity delta.
- Rationale block sourced from `recommendationEngine.buildExplanation()`.
- `SourceTag` chips per number.
- `[See full forecast]` deep-link.
- **`[Make this my plan]` CTA** — hands the chosen path off to `/action-plan` for operational execution. (Action Plan wiring is out of scope for this brief.)

---

## 7 · Sidebar IA (locked — no destructive changes)

The existing four-group sidebar (TODAY / PLAN / FORECAST / MOVE — Sprint 20 PR-H, Layout.tsx) is preserved. We slot the new entry into PLAN; we evolve the existing entries in MOVE; we demote nothing.

```
TODAY
└── (existing entries, unchanged)

PLAN
├── (existing entries, unchanged)
└── Goal Lab            ← NEW slot, route /goal-lab
    └── Renders the 6-card intake from §2

FORECAST
└── (existing entries, unchanged)

MOVE
├── Decision Lab        ← EXISTING /decision-lab (Layout.tsx:100). We evolve, do not rename.
│   └── Renders the 5-path output from §6, gated on Goal Lab COMPLETE
├── Action Plan         ← EXISTING /action-plan (Layout.tsx:99). Receives the chosen path.
└── (other existing entries, unchanged)

(Advanced surfaces NOT demoted in this sprint:)
- Portfolio Lab          — remains in current sidebar location
- Goal Closure Lab       — remains in current sidebar location
```

**Locked design rules:**
- **No new top-level routes.** Goal Lab is the single new route (`/goal-lab`). Decision Lab and Action Plan already exist.
- **No `/action-lab` route.** That naming was rejected. Reuse `/decision-lab`.
- **No demotions yet.** Portfolio Lab and Goal Closure Lab stay where they are. Goal Lab progressively replaces Goal Closure Lab via better UX, not by deletion. "No destructive IA changes yet."
- **No nested accordions** in the sidebar — IA stays flat at four groups (Sprint 20 PR-H constraint).

### State machine
| State | Goal Lab status | Decision Lab access |
|---|---|---|
| `EMPTY` | 0/6 confirmed | Blocked. CTA: "Complete Goal Lab first" |
| `IN_PROGRESS` | 1–5 confirmed | Blocked. Right-rail shows progress |
| `COMPLETE` | 6/6 confirmed, no ledger invalidators since | Enabled. `[Go to Decision Lab →]` active |
| `STALE` | 6/6 confirmed BUT one or more ledger invalidators have fired since `lastConfirmedAt` | Banner: "Your ledger changed materially — please re-confirm affected cards". Decision Lab still accessible but flagged stale |

### Confirmation TTL — "until ledger changes materially" (locked)

Confirmations do NOT expire on a fixed timer (no 30-day, no 90-day). They expire only when one of the following **ledger invalidators** fires after `lastConfirmedAt`:

| Invalidator | Detection source |
|---|---|
| **Income change** | New paycheck stream / income line in canonical ledger, or > ±10% rolling-3-month income delta |
| **Property purchase** | New row in `properties` table (any asset class), or sale removed |
| **Debt increase** | New debt account, or principal increase > $5k on any existing debt |
| **Major expense shift** | Monthly expense base > ±15% vs the snapshot recorded at `lastConfirmedAt` |
| **FIRE target change** | `mc_fire_settings.target_fire_age` or `target_passive_monthly` changed by any user (including via direct ledger edit) |
| **Asset allocation change** | Portfolio mix drift > 5% absolute on any major asset class, or a new account class added |

Each detected invalidator is appended to `meta.ledgerInvalidatorsSinceConfirm[]`. The card(s) whose underlying data the invalidator affects flip to `stale` and surface a "Re-confirm" pill. Other confirmed cards remain valid.

**Design intent:** stability when the household is stable. Friction only when the underlying truth has actually changed. "System understands me, not system trapped me" applies here too.

---

## 8 · Engine boundary rules (locked)

| Rule | What it means in practice |
|---|---|
| Goal Lab does no math. | The only computation in Goal Lab is the strength-inference heuristics + the Q6 preference-vector inference (both deterministic, well-documented, behind named helpers). No forecasts, no MC, no ranking. |
| Decision Lab does no math. | Decision Lab is purely an orchestrator. It MUST call existing engines. It must not embed a single financial formula. |
| Hard constraints win over preferences. | Q5 routes to the hard-constraint layer of the Unified Recommendation Engine. Q6 routes to the soft rerank layer. |
| One canonical profile. | Every consumer reads `useCanonicalGoalProfile()`. No component re-derives lifestyle, risk band, or preference vector from raw snapshot. |
| Source-tag every number. | Per Sprint 13 P0 locked decision #7. Every recommendation card renders source chips for every quoted figure. |
| Freshness visible. | Stale MC or stale ledger blocks "highest probability" claims and surfaces an amber banner. |
| No fake recommendations. | If a path family cannot be generated by existing engines, it is OMITTED, not faked. Equity recycling is an explicit example today. |
| No advisory infrastructure. | "Talk to a planner" is a placeholder slot, not a feature. |

---

## 9 · Build order (no F3/F4 scope creep)

| Phase | Scope | Risk | Depends on |
|---|---|---|---|
| **P0** | **Type contract: `CanonicalGoalProfile` + `useCanonicalGoalProfile()`** — pure TS, no UI, no DB. | Zero | None |
| **P1** | **Schema migration**: add `goal_profile_extras JSONB` column to `mc_fire_settings`. Extend `PUT /api/mc-fire-settings` to accept it. Extend `GET /api/canonical-goal` to return it. Backwards compatible with existing `goals_set` semantics. | Low | P0 |
| **P2** | **Goal Lab page**: route `/goal-lab`, six cards, right-rail summary + "Talk to a planner" placeholder slot, Option A header. Read-only first cut — `[Edit]` deep-links to existing canonical editors. | Low | P1 |
| **P3** | **Goal Lab inferences**: implement `inferStrengths()`, `inferHardConstraintDefaults()`, and the Q6 hybrid `inferPreferenceVector()` (five signals from §2). Add card-level confirm/edit/looks-good UX, plus Q6 in-place override. | Low | P2 |
| **P4** | **Decision Lab orchestrator**: `client/src/lib/decisionLab/orchestrator.ts` calling existing engines in the order described in §5. Wire `writeLatestQuickDecision` from scenarioV2 output into the existing in-memory cache. | Medium | P3 |
| **P5** | **Decision Lab page evolution**: extend existing `/decision-lab` route to render the five canonical paths from §6, use existing `recommendationEngine.computeUnifiedBestMove` + `buildExplanation`. Gate on Goal Lab status. Add `[Make this my plan]` handoff to `/action-plan`. | Medium | P4 |
| **P6** | **Ledger-invalidator detection + STALE banner**: watcher service computes `ledgerInvalidatorsSinceConfirm[]` from snapshot diffs, banner surfaces, `[Re-confirm]` quick path. | Low | P5 |
| **P7** | **Telemetry + audit traces**: extend `auditMode/engineTraces/decisionTraces.ts` to log the Goal Lab → Decision Lab handoff. Add a trace per recommendation showing the source engine for every quoted number. | Low | P5 |

**Out of every phase:** no F3/F4 rebuilds, no engine consolidation work (that lives in the separate plan), no intelligence-layer changes, no design system rewrite, no Action Plan internals (Action Plan only receives a path; its own wiring is a separate brief), no booking infrastructure.

---

## 10 · Validation gates (per Sprint 13 locked decision #10)

Before any phase ships:

1. `npm run check` — typecheck stays at ≤66 errors (current baseline per `docs/15-ai-handover-guide.md`).
2. `npm run test:monte-carlo-canonical` — 30/32 baseline must hold.
3. `npm run test:sprint-10` — 833/846 baseline must hold.
4. `npm run test:scenario-v2` — must stay green.
5. `npm run test:canonical-recommendation` — must stay green (this protects the Unified Recommendation Engine contract).
6. `npm run build` — Vite production build must succeed.
7. Source-of-truth mapping: every number on Goal Lab + Decision Lab pages must trace to a canonical selector or named engine.
8. Before-after reconciliation: Decision Lab's "Safest path" recommendation must match `computeUnifiedBestMove` top-pillar pick byte-for-byte.
9. Production-readiness: no embedded credentials, no demo data, no NaN, no "Goal not set ≠ defaults" violation (Q6 inference is the documented exception).
10. Rollback plan: every phase ships behind a sidebar feature flag.

---

## 11 · What this document explicitly does NOT propose

- ❌ A new recommendation algorithm — we use `recommendationEngine.computeUnifiedRecommendations` and `computeUnifiedBestMove`, which already exist.
- ❌ A new Monte Carlo engine — we use the V3/V4/V5 canonical stack via `buildCanonicalMonteCarloInput`.
- ❌ A new scenario generator — we use scenarioV2.
- ❌ A new ranking model — we use the 8-pillar priority stack + qualityScore + fatiguePenalty + calibratedConfidence already implemented.
- ❌ A new route called `/action-lab`. Rejected. Use `/decision-lab`.
- ❌ "FWL Framework™" branding. Rejected. Use the real disciplines: Goals-Based Wealth Planning, Behavioural Finance, Monte Carlo Forecasting.
- ❌ Booking / advisory infrastructure. The "Talk to a planner" card is a placeholder slot.
- ❌ A fixed-time TTL (30/60/90 days) for confirmations. Replaced by ledger-invalidator-driven stale detection.
- ❌ Demotions of Portfolio Lab or Goal Closure Lab. They coexist as advanced surfaces; Goal Lab replaces Goal Closure Lab progressively, not destructively.
- ❌ A new candidate generator for "equity recycling" or any other family not currently supported — those are FUTURE sprint work, omitted not faked.
- ❌ F3/F4 work.
- ❌ Intelligence-layer rewrites (autonomous OS, narrative, future worlds, etc.).
- ❌ Engine deletions — those live in `ENGINE_CONSOLIDATION_PLAN.md` and are gated on separate user approval.
- ❌ Any code commits, PRs, or migrations until §14 sign-off is given.

---

## 12 · Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Adding `goal_profile_extras` JSONB column conflicts with PR #88 schema migration | Low | High | Land Goal Lab work AFTER PR #88 deploys. Treat as additive migration on top. |
| Decision Lab orchestrator drifts into "computing on its own" | Medium | High | Strict code review rule: orchestrator may only import from engine modules, never from `finance.ts`, `mathUtils.ts`, or contain numeric literals. Enforced by an ESLint custom rule. |
| Preference vector silently promotes a candidate past a safety pillar | Medium | Catastrophic | Unit-test in `recommendationEngine` already enforces pillar hierarchy; add an additional integration test in Decision Lab orchestrator. |
| Q6 inference signals disagree with the user's lived self-perception | Medium | Medium | Hybrid UX: inferred is the starting point, never the locked answer. `[Adjust]` is always one tap away; `source` field records whichever path the user took. |
| Ledger-invalidator watcher fires too noisily, retraining users to ignore the banner | Medium | High | Per-card stale, not whole-page stale. Only the cards actually affected flash. Thresholds documented in §7 and tunable. |
| Snapshot drifts between Goal Lab confirmation and Decision Lab run | High | Medium | STALE state machine (§7). Decision Lab REFUSES to run if profile.meta.isStale and the user has not re-confirmed. |
| Goal Lab UI feels like a form wizard despite the brief | Medium | High | Design-review gate before P2 ships: one card open at a time, calm motion, no progress steppers, no "Next/Back" buttons — only Edit/Confirm. |
| `writeLatestQuickDecision` race with another caller | Low | Low | The in-memory cache is single-latest; document that Decision Lab writes are authoritative for its session. |
| User changes preference vector AFTER Decision Lab run, expecting instant re-rank | High | Medium | Add `[Rerun with new preferences]` button on Decision Lab, do not auto-rerun. |
| "Talk to a planner" placeholder mistaken for live capability | Low | Medium | Disabled state, "Coming soon" label, no booking widget at all. |

---

## 13 · Closed questions (the six locked decisions, 2026-05-28)

| # | Question (from v2 §13) | Locked answer |
|---|---|---|
| 1 | Header copy — Option A real credibility language, or Option B FWL Framework™? | **Option A.** "GOAL LAB" title + "Goals-Based Wealth Planning · Behavioural Finance · Monte Carlo Forecasting" methodology eyebrow. No "Framework™" anywhere. Evidence-based and institutional, not self-invented. |
| 2 | Question 6 — fully manual, or system-inferred? | **Hybrid.** Engine-computed primary from five signals (behavioural blocker, liquidity stress, leverage pressure, savings consistency, inferred volatility tolerance) + manual override always one tap away. "System understands me, not system trapped me." |
| 3 | New `/action-lab` route or reuse `/decision-lab`? | **Reuse `/decision-lab`.** Evolve in place. No new route. Three layers: Goal Lab → Decision Lab → Action Plan, all on existing or single-new routes. |
| 4 | "Book a call" — full advisory integration or placeholder? | **Placeholder slot only.** Disabled CTA, "Talk to a planner" label, no booking, no auth, no calendar. To be wired in a later, separately scoped sprint. |
| 5 | Confirmation TTL — fixed 30 days or condition-based? | **Until ledger changes materially.** Six invalidators (§7): income change, property purchase, debt increase, major expense shift, FIRE target change, asset allocation change. Per-card stale, not whole-page. |
| 6 | Sidebar IA — demote Portfolio Lab + Goal Closure Lab now? | **No destructive changes.** Goal Lab slots into PLAN. Decision Lab stays in MOVE (existing). Action Plan stays in MOVE (existing). Portfolio Lab and Goal Closure Lab are NOT demoted — progressive replacement via Goal Lab over time. |

### Remaining open items (still need a call)

These are the items the user has not yet locked. None of them block P0–P2 build work.

1. **Question 4 inference depth** — `inferStrengths()` may surface up to 5 system-inferred strengths the user can dismiss, OR strictly user-selected from a fixed list. (Recommendation: allow up to 5 inferred, dismissible, with `source: 'system_inferred' | 'user_acknowledged'` tracked per item.)
2. **Question 6 UI control** — four-axis radar with auto-normalisation, four sliders that must sum to 1.0, or four numeric inputs. (Recommendation: radar with auto-normalisation; matches the "calm, advisory" aesthetic.)
3. **Hard constraint defaults** — `inferHardConstraintDefaults()` pre-populates `minLiquidityFloor` and `maxLvr` from current readings, OR always starts blank to force conscious choice. (Recommendation: pre-populate with a clearly labelled "Suggested from your current position" chip; user explicitly confirms.)
4. **Profile persistence shape** — JSONB column on `mc_fire_settings.goal_profile_extras` (proposed), OR sibling table `mc_fire_goal_profile` keyed by `owner_id`. (Recommendation: JSONB now, sibling table only if querying becomes painful.)
5. **Equity recycling candidate** — leave as honest gap (omitted, not faked), OR schedule a parallel sprint to add the candidate generator. (Recommendation: omit honestly in P0–P7; revisit after P7 ships.)

---

## 14 · Sign-off needed before any code lands

- [ ] Confirm the architecture: Goal Lab = intake; Decision Lab = orchestrator; Action Plan = operational execution; engines = existing.
- [ ] Confirm the `CanonicalGoalProfile` shape (§3), including the Q6 hybrid `inferenceSignals` block.
- [ ] Confirm the auto-read + write contract (§4).
- [ ] Confirm the sidebar IA (§7) — no demotions, no new routes beyond `/goal-lab`.
- [ ] Confirm the ledger-invalidator stale rules (§7).
- [ ] Confirm the build order (§9).
- [ ] Answer the 5 remaining open items (§13).
- [ ] Confirm no F3/F4 work in scope.

Once approved, this scopes into a multi-PR series sitting on top of PR #88. Each phase ships independently behind a flag.

---

## 15 · Product narrative (locked, user-given)

The four-step story that frames the whole system for the household:

> **1. PLAN** — Help me define my future.
> **2. GOAL LAB** — Help me understand what matters.
> **3. DECISION LAB** — Show me the smartest paths.
> **4. ACTION PLAN** — Tell me what to do next.

Mapping to surfaces:

| Narrative step | Surface(s) | Sidebar group |
|---|---|---|
| 1. PLAN — define my future | Existing PLAN-group entries (forecast inputs, FIRE settings, ledger editors) | PLAN |
| 2. GOAL LAB — understand what matters | `/goal-lab` (NEW) | PLAN |
| 3. DECISION LAB — smartest paths | `/decision-lab` (EXISTING) | MOVE |
| 4. ACTION PLAN — what to do next | `/action-plan` (EXISTING) | MOVE |

The architecture is consistent with the narrative end-to-end: every step has a real surface; no step invents new branding; no step duplicates an existing engine; no step adds a route the user wasn't expecting.

---

**End of architecture brief v3.** Six locked decisions baked in. Pairs with `ENGINE_CONSOLIDATION_PLAN.md`. Ready for §14 sign-off.
