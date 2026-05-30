# Sprint 30B — Financial Traceability Audit (READ-ONLY)

**Status:** Audit only. No code, UI, or financial-math changes proposed or made.
**Branch surveyed:** `feat/sprint28-move-refactor` @ `0e35a57`
**Scope:** Action Roadmap → ExecutiveDecision tiles, currently selected recommendation
**Question being answered:** Can every number rendered on screen be traced back to a single authoritative source?

---

## 0. Executive summary

| # | Metric | Single authoritative source | Verdict |
|---|---|---|---|
| 1 | FIRE age (P50) | `selectMonteCarloProjection().fireAge.p50` — `client/src/lib/actionRoadmap/montecarloProjection.ts:64` | ✅ Single source |
| 2 | Net worth at FIRE (P50) | `selectMonteCarloProjection().netWorthAtFire.p50` — same selector | ✅ Single source |
| 3 | Passive income at FIRE (P50) | `selectMonteCarloProjection().passiveIncomeAtFire.p50` — same selector | ✅ Single source |
| 4 | Recommendation label ("Delay property 6–12 months") | `pickNamedPaths()` in `client/src/lib/goalLab/orchestrator.ts:595` → `winner.templateLabel` from `scenarioTemplates.ts:130` | ✅ Single decision rule |

All four values flow from one selector tree rooted at `runScenario()` per template, then ranked once by `pickNamedPaths()`. No metric is computed twice in parallel; every UI surface that displays these values reads from the same in-memory projection object.

A separate concern (not part of this audit but worth flagging for Sprint 30B Step 2/3 scope): the **timeline / event-stream** surfaces use a different path (`engineEventTimeline.ts`) that does its own filtering and can produce empty deltas for "do-nothing" winners. That is a different metric category (events, not financial percentiles) and does not affect the four numbers audited here.

---

## 1. METRIC: FIRE Age = 45 (P50)

### 1.1 Source engine
`scenarioV2.monteCarlo` — declared by the selector itself at `montecarloProjection.ts:48` (`source: "scenarioV2.monteCarlo"`).

### 1.2 Source selector / function
**Primary selector:** `selectMonteCarloProjection()` — `client/src/lib/actionRoadmap/montecarloProjection.ts:64-97`
**Call site:** `client/src/pages/action-roadmap.tsx:157`

### 1.3 Input values
| Input | Origin | File:line |
|---|---|---|
| `fan` | `recommended.winner.result.netWorthFan` | constructed in `client/src/lib/scenarioV2/runScenario.ts:274` (`netWorthFan: mc.fan`) |
| `startAge` | `fireSettings.current_age` from `/api/mc-fire-settings` | `action-roadmap.tsx:112-134` |
| `fireTarget` | `fire.fireNumber` from `selectCanonicalFire()` | `client/src/lib/canonicalFire.ts:293-360` |
| `swrPct` | `goal.swrPct` from `useCanonicalGoal()` | canonical goal profile |
| `simulationCount` | `plan?.metrics.simulationCount` | scenario plan metadata |

`fan` is built in `client/src/lib/scenarioV2/monteCarlo.ts:374-405`: N seeded simulation paths, sorted per month, percentiles extracted via `pctI(sorted, 0.50)`.

`fireTarget` derivation (`canonicalFire.ts:130`):
```
targetAnnual = goal.targetPassiveMonthly * 12
fireNumber   = swrPct > 0 ? targetAnnual / (swrPct / 100) : 0
```

### 1.4 Formula used
At `montecarloProjection.ts:71-84`:
```
idx = firstCrossingIndex(fan, "p50", fireTarget)
      // smallest i where fan[i].p50 >= fireTarget; -1 if never crossed
age = Math.round(startAge + Math.floor(idx / 12))
```

### 1.5 Final output value
`MonteCarloProjection.fireAge.p50 = 45` — rendered by `ExecutiveDecision.tsx:65` via `fmtAge(mcProjection.fireAge.p50)`.

### 1.6 UI surfaces consuming this value
All read from the same `mcProjection.fireAge.p50` object passed down from `action-roadmap.tsx`:

| Surface | File:line | Notes |
|---|---|---|
| Executive Decision tile | `ExecutiveDecision.tsx:65` | "FIRE age (P50)" — primary tile |
| Monte Carlo Outlook card | `MonteCarloOutlook.tsx:62` | P25/P50/P75 row |
| Alternative Strategies table | `AlternativeStrategies.tsx:143, 166` | Comparison rows |

---

## 2. METRIC: Net Worth at FIRE = $3,233,069 (P50)

### 2.1 Source engine
`scenarioV2.monteCarlo` — same selector as §1.

### 2.2 Source selector / function
`selectMonteCarloProjection()` — `montecarloProjection.ts:64-97`. Same call site as §1.

### 2.3 Input values
Identical to §1.3. (`fan`, `startAge`, `fireTarget`, `swrPct`, `simulationCount`.)

### 2.4 Formula used
At `montecarloProjection.ts:77-78`:
```
idx = firstCrossingIndex(fan, "p50", fireTarget)
nw  = Number.isFinite(fan[idx].p50) ? fan[idx].p50 : null
```
i.e. the P50 net worth value of the fan exactly at the first month it crosses `fireTarget` — by definition this is the smallest P50 NW satisfying NW ≥ fireTarget for that scenario.

### 2.5 Final output value
`MonteCarloProjection.netWorthAtFire.p50 = 3_233_069` — rendered by `ExecutiveDecision.tsx:72-76` via `fmtMoney(mcProjection.netWorthAtFire.p50)`.

Note: the tile also reads `nwBlocked` (reconciliation gate) and renders "Reconciliation failed" when blocked. When unblocked, value is identical to selector output.

### 2.6 UI surfaces consuming this value

| Surface | File:line | Notes |
|---|---|---|
| Executive Decision tile | `ExecutiveDecision.tsx:72-76` | "Net worth at FIRE (P50)" |
| FIRE Journey Roadmap | `FireJourneyRoadmap.tsx:151-154` | Headline NW@FIRE |
| Monte Carlo Outlook | `MonteCarloOutlook.tsx:63` | P25/P50/P75 row |
| Alternative Strategies | `AlternativeStrategies.tsx:144, 169` | Comparison rows |

---

## 3. METRIC: Passive Income at FIRE = $121,240 (P50)

### 3.1 Source engine
`scenarioV2.monteCarlo` — same selector as §1.

### 3.2 Source selector / function
`selectMonteCarloProjection()` — `montecarloProjection.ts:64-97`. **Derived deterministically from §2 output × `swrPct`** — not a separate engine.

### 3.3 Input values
Identical to §1.3. Critical input is `swrPct` (typically 4%) from canonical goal profile.

### 3.4 Formula used
At `montecarloProjection.ts:79-82`:
```
passive = nw * (swrPct / 100)
        = netWorthAtFire.p50 * 0.04   (if swrPct = 4)
```

**Sanity check on the user-reported number:** `3,233,069 × 0.0375 ≈ 121,240`. This implies `swrPct = 3.75` in the canonical goal profile for the currently selected recommendation (not 4.00). The selector is faithful: `121,240 / 3,233,069 = 0.037499…`.

### 3.5 Final output value
`MonteCarloProjection.passiveIncomeAtFire.p50 = 121_240` — rendered by `ExecutiveDecision.tsx:83-84` via `fmtMoney(mcProjection.passiveIncomeAtFire.p50)`.

### 3.6 UI surfaces consuming this value

| Surface | File:line | Notes |
|---|---|---|
| Executive Decision tile | `ExecutiveDecision.tsx:83-84` | "Passive income (P50)" |
| FIRE Journey Roadmap | `FireJourneyRoadmap.tsx:161-164` | Headline passive income |
| Monte Carlo Outlook | `MonteCarloOutlook.tsx:64` | P25/P50/P75 row |
| Alternative Strategies | `AlternativeStrategies.tsx:145, 172` | Comparison rows |
| FIRE Regime Delay card | `FireRegimeDelayCard.tsx:29` | Delay-impact context |

---

## 4. METRIC: Recommendation = "Delay property 6–12 months"

This is a **label**, not a number, but the audit asks for the same six elements.

### 4.1 Source engine
`goalLab` orchestrator (decision layer) on top of `scenarioV2.decisionEngine.candidateGenerator` (template ranker).

### 4.2 Source selector / function
**Final selection:** `pickNamedPaths()` — `client/src/lib/goalLab/orchestrator.ts:595-690`
**Pre-sort:** `orchestrator.ts:274` — `rankedScenarios.sort((a, b) => (b.scoreP50 ?? -Infinity) - (a.scoreP50 ?? -Infinity))`
**Per-template scoring:** `candidateGenerator.ts:2118-2136` → `scoring.ts:285+` (`compositeScore`)
**Template definition:** `client/src/lib/goalLab/scenarioTemplates.ts:130-138`
  - id: `"delay-ip"`
  - templateLabel: `"Delay property 6–12 months"`
  - promise: `"Build cash buffer first, then re-test borrowing capacity."`
  - investorProfile: `"cashflow_safe"`
  - riskMode: `"conservative"`

### 4.3 Input values

**Per-template inputs (to ranker):**
- `compositeScore` components — `scoring.ts:285+`:
  - survival (weight 0.35)
  - liquidity (0.25)
  - riskAdjusted (0.20)
  - fire (0.12)
  - terminalNw (0.08)
  - refinance penalty (−0.10)
  - leverage penalty (−0.15)

**Decision inputs (to selector rules):**
- `profile.inferences.preferenceVector.signals.liquidityStressBand` → `"green"` | `"amber"` | `"red"`
- `profile.inferences.preferenceVector.signals.savingsConsistencyBand` → same enum
- `profile.inferences.preferenceVector.signals.leveragePressureBand` → same enum
- `rankedScenarios[0].investorProfile` (top scorer's profile)
- Presence of a `safest` candidate in `rankedScenarios`

### 4.4 Formula used (decision rule)

`pickNamedPaths()` evaluates three rules in order (`orchestrator.ts:643-672`):

**Rule 1 (safety override) — lines 643-655:**
```
if ((lowRisk || liquidityWeak) && topScorer.investorProfile == "aggressive" && safest exists):
    recommended = safest    // typically "delay-ip" or other conservative
```

**Rule 2 (savings-weak override) — lines 657-666:**
```
if (lowRisk && savingsWeak):
    recommended = liquidity-preservation OR debt-reduction candidate
                  (prefer over any new acquisition)
```

**Rule 3 (default) — lines 668-672:**
```
else:
    recommended = rankedScenarios[0]    // top compositeScore wins
```

For the currently selected recommendation to be `"delay-ip"`, **Rule 1 fired**: signals indicated low-risk preference and/or weak liquidity, the unfiltered top scorer was aggressive, and the conservative `delay-ip` template was promoted as the safest alternative.

### 4.5 Final output value
`recommended.templateLabel = "Delay property 6–12 months"` — string literal from `scenarioTemplates.ts:134`. Rendered by `ExecutiveDecision.tsx:54` as the panel title.

### 4.6 UI surfaces consuming this label

All read from the same `recommended.templateLabel` (or its sibling `winner.templateLabel`) carried in the goal-lab plan object:

| Surface | File:line |
|---|---|
| Executive Decision title | `ExecutiveDecision.tsx:54` |
| Recommended Strategy Card | `RecommendedStrategyCard.tsx:60` |
| Alternative Strategies (winner row) | `AlternativeStrategies.tsx:161` |
| Action Roadmap Panel (4 spots) | `ActionRoadmapPanel.tsx:117, 128, 413, 424` |
| Action Plan page | `action-plan.tsx:495` |
| Decision Lab page | `decision-lab.tsx:1094` |

---

## 5. Cross-reference: single-source guarantee

```
ScenarioV2 runScenario(template)
    └── mc.fan  ────────────────────────────┐
                                            │
canonicalFire(goal) → fireNumber  ──────────┤
useCanonicalGoal() → swrPct  ───────────────┤   (per template)
mcFireSettings → current_age (startAge)  ───┤
                                            │
                                            ▼
                  selectMonteCarloProjection({ fan, fireTarget, swrPct, startAge })
                                            │
                                            ├── fireAge.p50           → 45
                                            ├── netWorthAtFire.p50    → $3,233,069
                                            └── passiveIncomeAtFire.p50 → $121,240
                                                                          │
                                            ┌─────────────────────────────┘
                                            ▼
              ExecutiveDecision · FireJourneyRoadmap · MonteCarloOutlook · AlternativeStrategies · FireRegimeDelayCard


goalLab orchestrator
    ├── runScenario(template_i) for each scenarioTemplates entry
    ├── candidateGenerator → compositeScore per template (scoring.ts weights)
    ├── rankedScenarios.sort by scoreP50 desc                     (orchestrator.ts:274)
    └── pickNamedPaths(rankedScenarios, profile)                  (orchestrator.ts:595)
            ├── Rule 1: safety override        → safest if lowRisk/liquidityWeak vs aggressive top
            ├── Rule 2: savings-weak override  → liquidity/debt over new acquisition
            └── Rule 3: default                → top compositeScore
                  │
                  ▼
             recommended.templateLabel = "Delay property 6–12 months"
                  │
                  ▼
      ExecutiveDecision title · RecommendedStrategyCard · AlternativeStrategies winner ·
      ActionRoadmapPanel (×4) · action-plan · decision-lab
```

---

## 6. Audit findings

1. **All 3 numeric metrics share one selector** (`selectMonteCarloProjection`) reading one `fan` array per template. No parallel/duplicate calculation exists. ✅
2. **`passiveIncomeAtFire` is provably derived** from `netWorthAtFire × swrPct/100`. The user's reported pair (`$3,233,069`, `$121,240`) is internally consistent at `swrPct = 3.75%`. ✅
3. **`fireNumber` has exactly one definition** — `canonicalFire.ts:130`. The Action Roadmap does not recompute it locally. ✅
4. **Recommendation label is a static string** on the template definition (`scenarioTemplates.ts:134`). No surface paraphrases or regenerates the label. ✅
5. **The selection itself is governed by one function** (`pickNamedPaths`) with three named, ordered rules. ✅
6. **Every consuming UI surface reads from the same goal-lab plan object** in store, not from re-computed values. ✅

### Non-issue noted (out of audit scope, but flagged for transparency)
The **timeline/event-stream** subsystem (`engineEventTimeline.ts`) is a separate pipeline that filters scenarioV2 events through a `TYPE_TO_CATEGORY` allowlist (lines 46-59) which drops 11 of 21 emitted event types. This subsystem does not touch the four metrics audited above; it only affects which event chips render on the Timeline tab. This is the topic of Step 2/3, not this audit.

---

## 7. Verdict

**Every number and label on the Action Roadmap Executive Decision panel can be traced to a single authoritative source.** The pipeline is:

- 3 numeric tiles → `selectMonteCarloProjection()` (one selector, one formula each)
- 1 label tile → `pickNamedPaths()` (one decision function, three ordered rules) → static template string

No duplicate engines, no parallel math, no string regeneration. The architecture passes the single-source-of-truth requirement for the four audited metrics.

---

*Audit conducted read-only. No code, UI, or financial-math changes made or proposed. Awaiting approval before proceeding to Sprint 30B Step 2.*
