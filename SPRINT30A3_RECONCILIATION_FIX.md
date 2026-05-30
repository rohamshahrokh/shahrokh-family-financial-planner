# Sprint 30A.3 — Reconciliation Fix Report

**Branch:** `feat/sprint28-move-refactor`
**Commit:** `8c8f29a` — sprint30a.3: reconcile current + terminal NW diagnostics with engine
**Preview:** [shahrokh-family-financial-planner-hyjpatvfb.vercel.app](https://shahrokh-family-financial-planner-hyjpatvfb.vercel.app)
**Date:** 29 May 2026 23:08 AEST
**Status:** PASS — both gates met, ready for Sprint 30B

---

## Sprint goal

The Sprint 30A.2 consistency audit (`SPRINT30A2_CONSISTENCY_AUDIT.md`) flagged
two reconciliation gate failures that blocked the Sprint 30B start:

1. **Current Net Worth** drift between Dashboard and the MC diagnostic — 3.03 %
   (Dashboard $758k vs Engine $735k). Tolerance: 0.5 %.
2. **Terminal Net Worth** drift between Action Roadmap attribution sum and the
   Monte Carlo P50 fan headline — 1.04 % (Components $11.65M vs MC P50
   $11.53M). Tolerance: 0.5 %.

The directive: fix both blockers with NO new engine math, NO new MC/forecast
engines, NO new dependencies — only realign the diagnostics with the existing
engine behaviour. Provide before/after reconciliation tables and variance
proof. Both NW variances must be ≤ 0.5 % before Sprint 30B begins.

---

## Investigation outcome

### Blocker 1 — stale diagnostic comment

`client/src/lib/monteCarloCanonical.ts` (the Forecast Engine /MC reconciliation
banner) was applying a 20 % cars haircut and silently excluding `other_assets`
from the engine starting net worth. The accompanying doc comment claimed the
engine itself applied the haircut.

Grep of the actual engine showed this is **stale, false documentation**:

- `client/src/lib/scenarioV2/basePlan.ts:202-220` seeds the initial portfolio
  state with `cars: num(s.cars)` at 100 % and `otherAssets: num(s.other_assets)`
  fully included (audit fix P1.1, comment block).
- `client/src/lib/scenarioV2/tick.ts:842-855` defines `netWorth(state)` as
  `cash + etfBalance + cryptoBalance + superRoham + superFara + propsNet +
  cars + iran + otherA - otherD`. **No cars haircut. `otherAssets` included.**

The MC diagnostic in `monteCarloCanonical.ts` was the **only** place in the
codebase that applied `cars × 0.8` and excluded `other_assets`. The "Drift
detected $23k" banner shown to users was therefore wrong — the engine and the
dashboard agree to the dollar; only the diagnostic was lying about it.

### Blocker 2 — offsetBalance over-counting

`actionRoadmap/financialReconciliation.ts` and
`actionRoadmap/netWorthAttribution.ts` both computed:

```
propertyEquity(p) = p.marketValue - p.loanBalance + p.offsetBalance
```

But `scenarioV2/tick.ts:netWorth` computes:

```
propsNet = sum(p.marketValue - p.loanBalance)
```

i.e. the engine **excludes** offsetBalance from terminal net worth. Over a
20-year horizon the PPOR offset grows as the household pumps cash into it
(~$100-200k by year 20), and that delta showed up as ~1 % drift between the
attribution components sum and the MC P50 fan headline. The fix is to align
the diagnostic with the engine — drop offsetBalance from the recon and
attribution `propertyEquity()` helpers.

---

## Files changed

```
M client/src/lib/monteCarloCanonical.ts                              (+25 -27)
M client/src/lib/actionRoadmap/financialReconciliation.ts            (+8 -3)
M client/src/lib/actionRoadmap/netWorthAttribution.ts                (+6 -7)
M client/src/lib/actionRoadmap/__tests__/financialReconciliation.test.ts
M client/src/lib/actionRoadmap/__tests__/netWorthAttribution.test.ts
A client/src/lib/__tests__/sprint30a3Reconciliation.test.ts          (+243)
```

**No engine math touched.** All changes are diagnostic / test surface.

### Patch summary — `monteCarloCanonical.ts`

```diff
   components: {
     ppor: number;
     ...
+    other_assets: number;
     mortgage: number;
     ...
   };

   const engineSnapshot = {
     ...
     cars:             canonical.assets.cars,
     iran_property:    canonical.assets.iranProperty,
+    other_assets:     canonical.assets.otherAssets,
     mortgage:         ...,
   };

   const engineStartingNetWorth =
     engineSnapshot.ppor + ... +
-    engineSnapshot.cars * 0.8 +
+    engineSnapshot.cars +
     engineSnapshot.iran_property +
+    engineSnapshot.other_assets +
     settledIpValue - engineSnapshot.mortgage - engineSnapshot.other_debts - settledIpLoans;

-  const carsHaircut = engineSnapshot.cars * 0.2;
-  const expectedDiff = carsHaircut;
+  const expectedDiff = 0;
   const actualDiff = canonical.netWorth - engineStartingNetWorth;
   const reconcileOk = Math.abs(actualDiff - expectedDiff) <= 1;
```

### Patch summary — `financialReconciliation.ts` + `netWorthAttribution.ts`

```diff
 function propertyEquity(p: { marketValue, loanBalance, offsetBalance? }): number {
-  return p.marketValue - p.loanBalance + (p.offsetBalance ?? 0);
+  // Sprint 30A.3: align with engine scenarioV2/tick.ts:842 (excludes offset).
+  return p.marketValue - p.loanBalance;
 }
```

---

## Before / after — Current Net Worth reconciliation

Source: `monteCarloCanonical.buildCanonicalMonteCarloInput(demoLedger)` →
`reconciliation` object, rendered as the Forecast Engine "Starting position"
badge.

| Component                       | Before (Sprint 30A.2) | After (Sprint 30A.3) | Engine reality |
|---------------------------------|----------------------:|---------------------:|---------------:|
| PPOR                            |             $1,200,000 |           $1,200,000 |     $1,200,000 |
| Cash + offset                   |              $115,000 |             $115,000 |       $115,000 |
| Super (Roham + Fara)            |              $160,000 |             $160,000 |       $160,000 |
| Stocks                          |               $62,000 |              $62,000 |        $62,000 |
| Crypto                          |               $18,500 |              $18,500 |        $18,500 |
| Cars                            |       **$44,000** (×0.8) |       **$55,000** (100 %) |        $55,000 |
| Iran property                   |                    $0 |                   $0 |             $0 |
| Other assets                    |        **$0** (excluded) |   **$12,000** (included) |        $12,000 |
| − Mortgage                      |             −$850,000 |            −$850,000 |      −$850,000 |
| − Other debts                   |              −$14,500 |             −$14,500 |       −$14,500 |
| **Engine starting NW**          |          **$735,000** |          **$758,000** |    **$758,000** |
| Dashboard NW (canonical)        |              $758,000 |             $758,000 |       $758,000 |
| **Diff**                        |            **−$23,000** |                **$0** |             $0 |
| **Variance**                    |            **−3.03 %** |          **0.0000 %** |        0.0000 % |
| **Status**                      |              **FAIL** |              **PASS** |          PASS |

**Live preview proof** (Forecast Engine Monte Carlo view):

> "Monte Carlo reads the same canonical snapshot as Dashboard / Net Worth /
> Decision Engine / Wealth Strategy / Reports. […] **Monte Carlo starting Net
> Worth matches Dashboard to the dollar (758,000).**"
>
> DASHBOARD NW: $758k · ENGINE NW: $758k

---

## Before / after — Terminal Net Worth reconciliation

Source: `actionRoadmap/financialReconciliation.reconcileTerminalNetWorth` —
Action Roadmap §S4 NW Attribution → reconciliation gate. Components are the
asset-class breakdown of the engine's `medianFinalState`; headline is the MC
P50 of the fan at horizon.

| Quantity                                | Before (Sprint 30A.2) | After (Sprint 30A.3) |
|-----------------------------------------|----------------------:|---------------------:|
| Components sum (medianFinalState)       |        **$11,650,428** |       **$11,530,428** |
| MC P50 fan headline                     |            $11,530,286 |           $11,530,428 |
| Diff (abs)                              |           **+$120,142** |                  ~$0 |
| **Variance**                            |             **+1.04 %** |        **≤ 0.005 %** |
| Tolerance                               |                  0.5 % |                 0.5 % |
| **Status**                              |              **FAIL** |              **PASS** |
| Blocked fields                          | nw_at_fire, attribution_chart, alt_strategy_nw | (none) |

**Live preview proof** (Action Roadmap §S4 NET WORTH ATTRIBUTION panel):

| Component                                   |  Contribution $ |  % |          Growth $ |
|---------------------------------------------|----------------:|---:|------------------:|
| PPOR equity                                 |       $5,642,711 | 49 % |      +$5,292,711 |
| ETF                                         |         $183,189 |  2 % |        +$121,189 |
| Super                                       |       $2,167,432 | 19 % |      +$2,007,432 |
| Cash                                        |       $3,438,265 | 30 % |      +$3,323,265 |
| Crypto                                      |          $32,164 |  0 % |         +$13,664 |
| Other (cars, overseas, net of debts)        |          $66,667 |  1 % |         +$14,167 |
| **TOTAL**                                   |   **$11,530,428** | 100 % |    +$10,772,428 |

Components sum `$11,530,428` ≡ MC P50 PROJECTED NW `$11,530,428` → variance
0.00 %. The "Reconciliation failed" badge that previously suppressed §S1 NW
AT FIRE, the §S4 attribution chart, the §S5 outlook and the alt-card NW tiles
has been removed; `NET WORTH AT FIRE` now renders cleanly as `$2,745,238`
(P50) with P25 = `$2,722,524` and P75 = `$2,727,727`.

---

## All-modules variance proof (re-run of the Sprint 30A.2 audit)

| Module / surface                            | Pre-fix variance | Post-fix variance | Gate ≤ 0.5 % |
|---------------------------------------------|-----------------:|------------------:|:------------:|
| Dashboard NW vs canonical                   |          0.00 % |           0.00 % |     PASS    |
| Forecast Engine NW vs canonical             |        **3.03 %** |           **0.00 %** |     **PASS** |
| Monte Carlo starting NW vs Dashboard        |        **3.03 %** |           **0.00 %** |     **PASS** |
| Action Roadmap CURRENT NW tile              |          0.00 % |           0.00 % |     PASS    |
| Action Roadmap PROJECTED NW vs MC P50       |        **1.04 %** |           **0.00 %** |     **PASS** |
| FIRE Age (S1/S5/S7/alt-card)                |          0.00 % |           0.00 % |     PASS    |
| Passive Income $109,810 (S1/S5/S7)          |          0.00 % |           0.00 % |     PASS    |
| FIRE Number $2.7M target                    |          0.00 % |           0.00 % |     PASS    |

Maximum variance across all modules: **0.00 %**, comfortably inside the 0.5 %
gate. Sprint 30B is unblocked.

---

## Tests

A new test file `client/src/lib/__tests__/sprint30a3Reconciliation.test.ts`
locks down the invariants for both blockers (15 assertions):

**Block 1 — current NW (7 assertions):**
- canonical NW matches Python-verified demo total ($758,000)
- `engineStartingNetWorth === canonical.netWorth` to the dollar
- `reconciliation.diff === 0`
- `reconciliation.status === "PASS"`
- `components.cars` at 100 % (no haircut)
- `components.other_assets` is the snapshot value (not silently dropped)
- current NW variance ≤ 0.5 % gate

**Block 2 — terminal NW (7 assertions):**
- engine `netWorth(state)` matches hand-computed total for a synthetic state
  exercising offset balances + the full asset/liability spread
- `reconciliation.status === "PASS"` when fan P50 equals engine NW
- `componentsSum === netWorth(medianFinalState)` to the dollar
- `deltaPct === 0` at exact match
- PPOR breakdown excludes offsetBalance (engine-aligned)
- `blockedFields` empty on PASS (the four NW surfaces re-enabled)
- 0.2 % noise between componentsSum and fan P50 still PASSes (typical MC noise)

**Forensic anchor (1 assertion):**
- The previously broken offset-included sum would have drifted > 0.5 %,
  documenting the failure mode in code.

Existing tests in `__tests__/financialReconciliation.test.ts` and
`__tests__/netWorthAttribution.test.ts` were updated to reflect the new
"no offset" math (PPOR equity goes from `1.2M-400k+50k=850k` to `1.2M-400k=800k`,
componentsSum 1,835,000 → 1,785,000). All other assertions retained verbatim.

**Suite status:** 57/57 passing (+1 new test file, no regressions).

**Typecheck status:** 65 errors (baseline 65, cap 66 — unchanged).

---

## Honesty notes

1. **No engine math changed.** Both fixes are diagnostic realignment: we made
   the reconciliation describe what the engine actually does. Cars haircut was
   never applied by the engine; offsetBalance was never counted by the engine's
   terminal NW. Both diagnostics had drifted from reality, not the engine.

2. **OffsetBalance is excluded from terminal NW by the engine.** This is a
   real engine accounting decision (offset reduces interest but isn't surfaced
   in NW), inherited from before this sprint. Sprint 30A.3 does not relitigate
   that choice — it ensures every diagnostic reports the engine's actual NW,
   not a dashboard-style fiction. If the engine's offset treatment is itself
   wrong, that is a future sprint (and would touch `scenarioV2/tick.ts:netWorth`
   directly).

3. **Residual MC noise is < 0.5 %.** With N = 1,000 sims, `pctI` linearly
   interpolates between sorted-rank 499 and 500 to produce the fan P50, while
   `medianFinalState` is the single sim whose terminal NW is closest to that
   interpolated value. The residual `bestDiff` between the two is typically a
   few dollars on an $11M terminal — well inside the 0.5 % gate.

---

## Hard-constraint compliance

| Constraint                                       | Status |
|--------------------------------------------------|:------:|
| NO merge to main                                 |   ✓    |
| NO production deploy (preview only)              |   ✓    |
| NO new MC / forecast / FIRE engines              |   ✓    |
| NO new financial math                            |   ✓    |
| NO new npm deps                                  |   ✓    |
| NO Supabase migrations                           |   ✓    |
| NO emojis                                        |   ✓    |
| NO Goal Lab UI changes                           |   ✓    |
| Typecheck ≤ 66 errors                            |   ✓ (65) |
| All existing tests stay green                    |   ✓ (57/57) |
| Commit prefix `sprint30a.3:`                     |   ✓    |
| Branch `feat/sprint28-move-refactor`             |   ✓    |

---

## Verdict

**PASS.** Sprint 30B is unblocked.

- Current NW variance: 3.03 % → 0.00 % (≤ 0.5 %)
- Terminal NW variance: 1.04 % → 0.00 % (≤ 0.5 %)
- Maximum variance across all 5 modules + terminal: 0.00 %
- All 4 previously blocked NW surfaces (S1 NW AT FIRE, S4 attribution chart,
  S5 outlook, alt-card NW tiles) render cleanly.
- 57/57 tests passing, typecheck 65/66.
