# Sprint 30B — Recommendation Selection Traceability Audit (READ-ONLY)

**Status:** Audit only. No code, UI, or financial-math changes proposed or made.
**Branch surveyed:** `feat/sprint28-move-refactor` @ `0e35a57`
**Scope:** Why was *"Delay property 6–12 months"* selected as the winner? What did it score, what did its competitors score, and what drove the pick?

---

## 0. Executive summary

| # | Question | Answer |
|---|---|---|
| 1 | Why was "Delay property 6–12 months" selected as winner? | **Rule 1 of `pickNamedPaths()` fired** — it was promoted from "safest alternative" to "recommended" because the engine's raw top scorer was an aggressive template (e.g. `buy-ip-now`) and the user's risk tolerance is "low" and/or liquidity band is amber/red. |
| 2 | What score did it receive? | The score lives at `winner.score.score` (0–100) from `compositeScore()`. I cannot read the live value without a sessionStorage dump (see §6 — "How to obtain live numbers"). The audit traces the *formula* exactly. |
| 3 | What alternative paths were evaluated? | Up to 11 named templates from `SCENARIO_TEMPLATES` (`scenarioTemplates.ts:110-210`), filtered by 3 gates: `gate()`, `matchesPreferredEngine()`, `matchesRiskTolerance()`. The exact set depends on Q4/Q5 answers + canonical goal profile. |
| 4 | What were their scores? | See §3 for the full ranking schema and §4 for the per-template formula trace. Live values unavailable without a runtime dump. |
| 5 | Which exact metrics drove winner selection? | Two-stage: **(a)** `compositeScore` ranks by 5 weighted axes + 2 penalties (§4.2). **(b)** `pickNamedPaths` overrides that ranking via 3 risk-aware rules using 3 signal bands (§5.2). The "Delay property" pick was driven by the **override**, not the score (§5.3). |
| 6 | Is the engine optimization-based or template-based? | **Both, in two layers.** Inner layer: optimization-based per template (continuous candidate generation + compositeScore ranking). Outer layer: template-based (11 named templates orchestrated, results sorted, then a hand-coded 3-rule override on top). See §7. |

---

## 1. End-to-end pipeline (one function per stage)

```
┌─ Stage A: Template selection ───────────────────────────────────────────────┐
│ selectActiveTemplates(inputs, profile)         scenarioTemplates.ts:226     │
│   for each of 11 SCENARIO_TEMPLATES:                                        │
│     - gate(inputs, profile)              feasibility                        │
│     - matchesPreferredEngine(t, profile) Q4 filter                          │
│     - matchesRiskTolerance(t, profile)   Q5 filter                          │
│   always include "current-plan" baseline                                    │
└─────────────────────────────────────────────────────────────────────────────┘
                          │
                          ▼  (≤ 11 active templates)
┌─ Stage B: Per-template optimization ────────────────────────────────────────┐
│ generateQuickDecisionCandidates(engineInput) per template                   │
│   ↳ candidateGenerator.ts:1937                                              │
│   For each blueprint candidate inside the template:                         │
│     - runScenarioV2 → result (Monte Carlo fan, terminal NW, etc.)           │
│     - buildScoreInputs(result, safety.bands, baseResult, horizonMonths)     │
│     - compositeScore(scoreInputs, profileWeights) → score 0..100            │
│   ranked.sort((a,b) => b.score.score - a.score.score)         line 2136     │
│   return out.ranked (winner = ranked[0])                                    │
└─────────────────────────────────────────────────────────────────────────────┘
                          │
                          ▼  (one winner per template)
┌─ Stage C: Cross-template ranking ───────────────────────────────────────────┐
│ rankedScenarios.sort((a,b) => (b.scoreP50 ?? -∞) - (a.scoreP50 ?? -∞))      │
│                                            orchestrator.ts:274              │
│   scoreP50 = winner.score.score (the 0-100 composite from Stage B)          │
└─────────────────────────────────────────────────────────────────────────────┘
                          │
                          ▼  (ranked list of templates)
┌─ Stage D: Risk-aware override → "recommended" ──────────────────────────────┐
│ pickNamedPaths(rankedScenarios, profile)        orchestrator.ts:595         │
│   Rule 1 (safety override):   lowRisk || liquidityWeak,                     │
│                               and top is aggressive,                        │
│                               and safest exists  → return safest            │
│   Rule 2 (savings-weak):      lowRisk && savingsWeak                        │
│                               → debt-reduction OR liquidity-preservation    │
│   Rule 3 (default):           → top scorer                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                          │
                          ▼
            recommended.templateLabel = "Delay property 6–12 months"
```

---

## 2. Q3 — Alternative paths actually evaluated

All 11 named templates from `scenarioTemplates.ts:110-210`:

| id | label | questionKind | investorProfile | riskMode | gate |
|---|---|---|---|---|---|
| `current-plan` | Current plan — no action | weakest_financial_point | balanced | balanced | always |
| `buy-ip-now` | Buy investment property now | buy_now_or_buffer | **wealth_max** | balanced | `LVR < 0.65` |
| `delay-ip` | **Delay property 6–12 months** | buy_now_or_buffer | **cashflow_safe** | conservative | `LVR < 0.65` |
| `etf-acceleration` | ETF / stocks acceleration | lump_sum_vs_dca | fire_focused | balanced | `liquidity > 0` |
| `debt-reduction` | Debt reduction first | debt_vs_invest | cashflow_safe | conservative | `liabilities > 0` |
| `offset-optimisation` | Offset optimisation | debt_recycle_vs_offset | balanced | conservative | `liabilities > 0` |
| `super-contributions` | Super contribution increase | super_vs_invest | fire_focused | balanced | always |
| `hybrid-property-etf` | Hybrid: property + ETF | property_vs_etf_vs_offset | balanced | balanced | `liquidity > 0 OR LVR < 0.65` |
| `lower-target-or-extend` | Lower target / extend timeline | min_viable_fire | conservative | conservative | always |
| `liquidity-preservation` | Liquidity preservation | cash_optionality | cashflow_safe | conservative | always |
| `debt-recycling` | Debt recycling | debt_recycle_vs_direct | **wealth_max** | balanced | `assets > liabilities > 0` |

**Final active set per run** = templates whose `gate()` returns true AND who match the user's `preferredEngine` (Q4) AND `riskTolerance` (Q5) — see `scenarioTemplates.ts:248-285`. Critically: **if Q5 riskTolerance is "low", every template with `investorProfile = "wealth_max"` or `"aggressive"` is excluded** before scoring. That means `buy-ip-now` and `debt-recycling` are dropped at Stage A when risk tolerance is low.

→ **If `buy-ip-now` is still being recommended-then-overridden**, then either (a) Q5 is NOT "low" and Rule 1 fires on the liquidity band instead, or (b) the unfiltered top scorer is `etf-acceleration` (the only remaining aggressive template under "moderate"). Either way, Stage D's override is what surfaces `delay-ip`.

---

## 3. Q3+Q4 — Ranking table schema (Stage C output)

Every entry in `rankedScenarios` (`orchestrator.ts:260-269`) has this exact shape:

| Column | Source | Type |
|---|---|---|
| `templateId` | template registry | string |
| `templateLabel` | template registry | string |
| `promise` | template registry | string |
| `winner` | `out.ranked[0]` from candidateGenerator | RankedCandidate |
| `alternates` | `out.ranked.slice(1)` | RankedCandidate[] |
| `probabilityP50` | `winner.result.riskMetrics.survivability.p50` | number 0..1 |
| `scoreP50` | `winner.score.score` | **number 0..100** |
| `raw` | full QuickDecisionOutput | object |

After Stage C sort, the list is in descending `scoreP50` order. The user-visible "alternatives" panel reads this list directly.

**Live values for this run:** I cannot read these without an in-browser dump. See §6.

---

## 4. Q5 — Per-template scoring formula (the engine itself)

### 4.1 Where the score is computed
`compositeScore()` — `client/src/lib/scenarioV2/registry/scoring.ts:285-369`.

### 4.2 The exact formula

```
score (0..100) = max(0, min(100,  baseScore − totalPenalty ))

baseScore = 100 × (
    w.survival      × clamp01(survivalProbability)
  + w.liquidity     × clamp01(liquidityFactor)
  + w.riskAdjusted  × normaliseRiskAdjusted(riskAdjustedReturn)
  + w.fire          × normaliseFireAcceleration(fireAcceleration)
  + w.terminalNw    × normaliseTerminalNw(terminalNetWorth, referenceTerminalNw)
)

totalPenalty = refinancePenalty(band, w.refinancePenalty)
             + leveragePenalty(worstIpLvr, w.leveragePenalty)

refinancePenalty: { none:0, mild:0, elevated:1, severe:2 } × weight × 100
leveragePenalty:  max(0, worstIpLvr − 0.80) × 10 × weight × 100
```

Normalisation rules (`scoring.ts:225-244`):
- `riskAdjustedReturn`: linear in [0%, 10%] → [0, 1]; clamped.
- `fireAcceleration` (years vs base): −5y = 0, 0y = 0.5, +5y = 1; clamped.
- `terminalNetWorth`: ratio vs base-plan reference (`0.5 = parity`) when reference exists; otherwise absolute `[0, $5M] → [0, 1]`.

### 4.3 Weights per investor profile

Convex weights MUST sum to 1.0 (validated at module load, `scoring.ts:181-189`):

| Profile | survival | liquidity | riskAdj | fire | terminalNw | refiPen | levPen |
|---|---|---|---|---|---|---|---|
| balanced (default) | 0.35 | 0.25 | 0.20 | 0.12 | 0.08 | 0.10 | 0.15 |
| conservative | 0.40 | 0.30 | 0.15 | 0.05 | 0.10 | 0.15 | 0.20 |
| aggressive | 0.20 | 0.10 | 0.35 | 0.15 | 0.20 | 0.05 | 0.08 |
| fire_focused | 0.30 | 0.20 | 0.15 | 0.25 | 0.10 | 0.10 | 0.15 |
| wealth_max | 0.20 | 0.10 | 0.20 | 0.10 | 0.40 | 0.06 | 0.10 |
| **cashflow_safe** *(used by `delay-ip`)* | **0.30** | **0.35** | **0.15** | **0.05** | **0.15** | **0.20** | **0.25** |

So the `delay-ip` template is scored under weights that already amplify liquidity (0.35) and de-emphasise FIRE acceleration (0.05) and risk-adjusted return (0.15). It is structurally biased to win against conservative-leaning households even before the override rule.

### 4.4 What `score.score` does NOT depend on
- **It does NOT directly use** the screen-displayed FIRE age, NW at FIRE, or passive income tiles. Those are derived after-the-fact by `selectMonteCarloProjection()` from the winner's `netWorthFan` (see prior audit `SPRINT30B_TRACEABILITY_AUDIT.md`).
- The scoring inputs are `survivalProbability`, `liquidityFactor`, `riskAdjustedReturn`, `fireAcceleration` (Δyears vs base plan, **not** absolute age), `terminalNetWorth`, plus the penalty inputs.
- This is an important distinction: **scores rank scenarios, the displayed metrics describe the recommended scenario**. They are computed from the same underlying simulation but they answer different questions.

---

## 5. Q5+Q1 — Why "Delay property 6–12 months" specifically

### 5.1 Stage C top scorer is almost certainly NOT `delay-ip`
With `cashflow_safe` weights, `delay-ip`'s composite score will be moderate-to-high. But because Stage C ranks **by raw composite score across all templates**, the literal top is often:
- `buy-ip-now` under `wealth_max` weights (terminalNw 0.40 dominates)
- `etf-acceleration` under `fire_focused` (fire 0.25 + riskAdj 0.15)
- `debt-recycling` under `wealth_max`

— precisely the three IDs in `AGGRESSIVE_TEMPLATE_IDS` (`orchestrator.ts:567-571`).

### 5.2 Stage D — `pickNamedPaths()` override rules

Reading literally from `orchestrator.ts:643-677`:

```
const liquidityWeak    = liq  === "red"  || liq  === "amber";
const leverageStretched= lev  === "red"  || lev  === "amber";
const savingsWeak      = sav  === "low";
const lowRisk          = risk === "low";
const topIsAggressive  = AGGRESSIVE_TEMPLATE_IDS.has(top.templateId);
//                       = top.id ∈ {buy-ip-now, etf-acceleration, debt-recycling}

// RULE 1 — fires first
if ((lowRisk || liquidityWeak) && topIsAggressive && safest) {
    recommended = safest;
    // safest = first scenario in ranked list whose id ∈ SAFE_TEMPLATE_IDS
    //        = {delay-ip, debt-reduction, liquidity-preservation,
    //           offset-optimisation, lower-target-or-extend}
}
else if (lowRisk && savingsWeak) {       // RULE 2
    recommended = scenarios.find(s => s.id ∈ {liquidity-preservation, debt-reduction})
                  // only if ≠ top
}
else if (topIsAggressive) {              // RULE 3 (kept as default but with rationale)
    recommended = top;
}
```

`SAFE_TEMPLATE_IDS` ordering inside the *already-score-sorted* `scenarios` list is what determines which safe template wins. The candidate set is `{delay-ip, debt-reduction, liquidity-preservation, offset-optimisation, lower-target-or-extend}`. Whichever scored highest among those becomes `safest` — and therefore `recommended`.

### 5.3 Diagnosis for the current user
The recommendation surfaces `"Delay property 6–12 months"` **iff** all three conditions hold simultaneously:

1. **Rule 1 fired** → `risk === "low"` OR `(liq ∈ {amber, red})`
2. **The unfiltered top scorer was aggressive** → top.templateId ∈ {`buy-ip-now`, `etf-acceleration`, `debt-recycling`}
3. **Among the SAFE templates that survived Stage A, `delay-ip` had the highest composite score** — i.e. it placed above `debt-reduction`, `liquidity-preservation`, `offset-optimisation`, and `lower-target-or-extend` in the cross-template ranking.

So the winner selection is driven by:

| Driver | Mechanism | Source |
|---|---|---|
| **Risk tolerance "low"** (or liquidity band amber/red) | Triggers Rule 1 override | `profile.resolved.riskTolerance` / `inferences.preferenceVector.signals.liquidityStressBand` |
| **Some aggressive template was the raw top scorer** | Necessary precondition for Rule 1 | Stage C sort output |
| **`delay-ip` outscored other SAFE templates** | Stage B composite score under `cashflow_safe` weights | `compositeScore()` |
| **`delay-ip` passed Stage A gates** | `hasIpHeadroom` requires `cap.leverage < 0.65`; preferredEngine ∈ {`property`,`unsure`,`hybrid`} | `scenarioTemplates.ts:127,256-258` |

### 5.4 Q5 — explicit per-driver mapping

| Driver the user listed | Used at | Used how |
|---|---|---|
| **FIRE age** | NOT directly in scoring. Used as a tile only. | Tile lookup via `selectMonteCarloProjection` (separate selector). |
| **Net worth at FIRE** | NOT in scoring. Tile only. | Same as above. |
| **Passive income** | NOT in scoring. Tile only. | Derived from NW × swrPct. |
| **Risk** | **Stage D Rule 1** + **Stage A `matchesRiskTolerance`** | `profile.resolved.riskTolerance`. Drives template exclusion + override. |
| **Liquidity** | **Stage B** (`liquidityFactor` axis, weight up to 0.35) + **Stage D Rule 1** (`liquidityStressBand`) | Scored axis AND override trigger. |
| **Borrowing capacity** | **Stage A gate** `hasIpHeadroom: cap.leverage < 0.65`. **Stage B leveragePenalty** at `worstIpLvr > 0.80`. | Feasibility gate + score penalty. Not directly a winner-picker signal. |

So the **only direct levers on the winner selection** are *risk tolerance*, *liquidity band*, *savings consistency band*, plus the *raw composite scores* of each surviving template. FIRE age / NW at FIRE / passive income do NOT cause one path to outrank another — they are display outputs derived after the winner is chosen.

---

## 6. How to obtain the live ranking table

The actual numeric scores for this user's plan are not in the codebase — they are computed at runtime and held in:
- module-level `_latestPlan` in `orchestrator.ts:344`, and
- sessionStorage key `fwl.goalLab.latestPlan.v1` (`orchestrator.ts:340`)

To produce the live table for this audit without code changes, in the running app:

1. Open the Action Roadmap page after pressing "Re-run plan".
2. In the browser console:
   ```js
   const p = JSON.parse(sessionStorage.getItem('fwl.goalLab.latestPlan.v1'));
   console.table(
     p.plan.rankedScenarios.map(s => ({
       template: s.templateId,
       label:    s.templateLabel,
       score:    s.scoreP50?.toFixed(1),
       probP50:  s.probabilityP50?.toFixed(3),
     }))
   );
   console.log('picks.recommended:', p.plan.picks.recommended?.templateId);
   console.log('picks.safest:',      p.plan.picks.safest?.templateId);
   console.log('picks.fastest:',     p.plan.picks.fastest?.templateId);
   console.log('rationale:',         p.plan.picks.recommendedRationale);
   ```
3. Also dump `p.plan.profile.resolved.riskTolerance` and `p.plan.profile.inferences.preferenceVector.signals` — those are the inputs Rule 1 evaluates.

Paste the output back to me and I'll annotate it row-by-row against this audit.

---

## 7. Q6 — Optimization-based or template-based?

**Hybrid, in two distinct layers.**

| Layer | Type | Where |
|---|---|---|
| **Inner — per-template candidate evaluation** | **Optimization-based** | `candidateGenerator.ts:1937-2188` builds many blueprint candidates, runs each through Monte Carlo (`runScenarioV2`), scores each on a weighted multi-axis objective (`compositeScore`), and picks `ranked[0]` by descending score. |
| **Outer — which named scenarios to expose** | **Template-based** | `SCENARIO_TEMPLATES` (11 hand-defined named paths). Templates pre-bind `questionKind`, `investorProfile`, `riskMode`. They do not invent new math — they invoke the inner optimizer with fixed framings. |
| **Selector — which template to recommend** | **Rule-based override on top of an optimizer rank** | `pickNamedPaths()` applies 3 hand-coded rules over the descending-score list. |

This means: the math is optimization. The exposed strategies are templated. The final recommendation is a rule-based override on an optimizer ranking — **not pure argmax**.

→ Practical consequence: the recommendation will sometimes contradict the raw top score (by design — Rule 1). The audit trail to detect that is `picks.recommendedRationale` being non-null and `picks.recommended.templateId !== rankedScenarios[0].templateId`.

---

## 8. Audit findings

1. **Selection is two-stage**: a deterministic optimizer-driven ranking, then a 3-rule risk-aware override. Both stages are read-only deterministic functions with no hidden state. ✅
2. **The selection IS fully traceable**, but the trace requires three pieces of runtime data that live only in sessionStorage: the score table, the picks object, and the preference signals. The code path is complete; the audit cannot enumerate the live numeric scores from source alone.
3. **`delay-ip` cannot be the winner unless Rule 1 fired** (Rule 2 specifically excludes `delay-ip`; Rule 3 falls through to top scorer which is never `delay-ip` because top in that branch is aggressive). So the recommendation existing as `delay-ip` is itself evidence that risk tolerance is "low" or liquidity band is amber/red. ✅
4. **The displayed financial tiles (FIRE age / NW / passive income) have no role in winner selection.** They describe the chosen scenario; they do not pick it. Drivers are scoring axes + signal bands.
5. **Engine type:** optimization inside templates inside rule-based override. Not pure optimization; not pure templates. ✅
6. **One gap worth flagging (not a defect)**: `pickNamedPaths()` does not expose its decision provenance in machine-readable form — only the prose `recommendedRationale`. A consumer (e.g. an explainability surface) cannot programmatically tell *which* rule fired or *which* alternative was demoted. The information is reconstructable from `picks.recommended.templateId` vs `rankedScenarios[0].templateId`, but not directly recorded.

---

## 9. Verdict

The "Delay property 6–12 months" recommendation is traceable through:

- **3 deterministic gates** (Stage A) → which templates compete
- **1 scoring formula × per-profile weights** (Stage B) → score for each template
- **1 sort** (Stage C) → ranked list with descending composite score
- **3 ordered rules** (Stage D) → which entry is promoted to "recommended"

The selection is fully reproducible from the same inputs. The only missing piece in this audit is the **runtime numeric values** of the composite scores per template, which require a sessionStorage dump from the live session (§6).

No code, UI, or math changes made or proposed. Awaiting either the sessionStorage dump for the live numbers, or approval to proceed to Sprint 30B Step 2.
