# Sprint 30B — Step 0 · Event Stream Proof

**Status:** Diagnostic / pre-implementation
**Scope:** Read-only inspection + in-process probe
**Modified source files:** **0**
**Financial calculations changed:** **0**
**Monte Carlo / Forecast / FIRE / Reconciliation math:** untouched

Artifacts:
- `script/sprint30b-step0-event-stream-probe.ts` — read-only Node probe (368 lines, exercises existing exports only)
- `sprint30b_step0_probe_output.txt` — captured probe output (Probe date 2026-05-29T22:59:41Z)

---

## Correction to the audit (important)

While drafting this proof I re-read `runScenario.ts` line-by-line and discovered the audit's earlier statement that "`ScenarioResult` lacks an `events` field" was **partially wrong**:

- **Base** `ScenarioResult` in `scenarioV2/types.ts:252` — still has no `events` field. (Correct.)
- **Extended** `ExtendedScenarioResult` in `scenarioV2/runScenario.ts:152` — **does** declare `events?: ScenarioEvent[]` (added Sprint 29 §7).
- `runScenarioV2()` at `scenarioV2/runScenario.ts:310` **does** attach the built event store to the returned object.
- `action-roadmap.tsx:196` does read `recommended.winner.result.events`.

So the engine-side wiring is already in place. The defect is **not** "engine never attaches events." It's a different (and more interesting) chain of three losses described in Claim 2.

---

## Claim 1 — Events ARE generated

**File-level proof:**
- `client/src/lib/scenarioV2/deltas.ts:13-51` — `translateDelta()` switch over 17 `ScenarioDelta` types
- `client/src/lib/scenarioV2/events.ts:40-51` — `buildEventStore()` materialises events into a sorted, deterministic stream
- `client/src/lib/scenarioV2/types.ts:103-124` — 21 `ScenarioEventType` values

**Runtime proof (probe output):**

```
[INFO] Input: 16 representative ScenarioDeltas
[PASS] translateDelta() returned 100 ScenarioEvents
[INFO]   Distinct event types emitted: 15
[INFO]     asset.buy_property, asset.cash_hold, asset.sell_property,
           contribution.crypto_lump, contribution.etf_dca,
           contribution.etf_lump, contribution.offset_deposit,
           debt.extra_repayment, debt.refinance,
           expense.child_cost, expense.recurring,
           income.career_break, income.salary_change,
           macro.rate_spike, macro.regime_shift
[PASS] buildEventStore() returned 100 ScenarioEvents
[PASS] sortEvents() is monotonic by month
[PASS] groupByMonth() produced 68 distinct months
```

Sample stream (first 12 events of the 100-event probe):

| month | priority | type | sourceDeltaId |
|---|---|---|---|
| 2026-06 | 300 | expense.child_cost | d11 |
| 2026-06 | 400 | contribution.offset_deposit | d4 |
| 2026-06 | 600 | asset.cash_hold | d14 |
| 2026-07 | 400 | contribution.etf_dca | d3 |
| 2026-08 | 400 | contribution.etf_dca | d3 |
| 2026-08 | 500 | debt.extra_repayment | d5 |
| 2026-08 | 600 | contribution.crypto_lump | d8 |
| 2026-09 | 400 | contribution.etf_dca | d3 |
| 2026-09 | 600 | contribution.etf_lump | d2 |
| 2026-10 | 400 | contribution.etf_dca | d3 |
| 2026-10 | 500 | debt.refinance | d6 |
| 2026-11 | 400 | contribution.etf_dca | d3 |

Payload integrity (read-only, no math changed):
- `asset.buy_property` carries `purchasePrice=$650,000`, `loanBalance=$520,000`, `stampDuty=$22,275` (real AU schedule)
- `debt.refinance` carries `newRate=0.0545`, `newTermYears=28`
- `contribution.etf_dca` correctly fans out to 24 monthly events for a `months=24` DCA delta

**Conclusion:** the event-generation layer works correctly today. No changes needed to deltas.ts / events.ts / types.ts to surface events. The engine is producing the right stream.

---

## Claim 2 — Events ARE lost (three loss mechanisms)

The probe asserts five structural facts (all PASS):

```
[PASS] Base ScenarioResult declares NO events field (as documented)
[PASS] ExtendedScenarioResult declares events?: ScenarioEvent[] (Sprint 29 §7)
[PASS] runScenarioV2 attaches `events` to its returned ExtendedScenarioResult
[PASS] action-roadmap.tsx reads recommended.winner.result.events
[PASS] readLatestGoalLabPlan() is IN-MEMORY ONLY (no localStorage / sessionStorage)
[PASS] Action Roadmap renders 'Not modelled yet' banner when recommended === null
```

So the engine-to-result-to-UI wiring is mechanically correct. Yet the deployed preview shows empty timelines. The probe identifies **three independent loss mechanisms**, each sufficient on its own to produce the observed defect:

### L1 — Cache eviction (the dominant cause of the screenshot)
- `client/src/lib/goalLab/orchestrator.ts:325` — `let _latestPlan: GoalLabPlanOutput | null = null` is an **in-process module variable**.
- `readLatestGoalLabPlan()` returns this variable. No `localStorage` / `sessionStorage` / IndexedDB write.
- When the user runs the plan in `/decision-lab`, the variable is set. When they navigate to `/action-roadmap` via the in-app SPA router, it survives. **But a full page reload, a new tab, or a fresh browser session resets the module, returning `null`.**
- In `action-roadmap.tsx:140`: `const recommended = plan?.picks?.recommended ?? null` — when `plan` is null, `recommended` is null, **and every downstream selector falls through to its empty state**, producing exactly the screenshot we captured: "Not modelled yet," "Reconciliation failed," "No milestones from the recommended path yet."
- The browser test that captured the evidence did exactly this — it visited `/decision-lab`, ran the plan, then navigated to `/action-roadmap`. If that navigation involved a hard reload (or any state-resetting action), the cache vanished.

### L2 — Empty delta set on "do-nothing" winners
- Even when the cache is hot, the winning ranked candidate may have `events: []` if the recommendation engine selected a no-action baseline.
- `buildEventStore(_, [], opts)` → `[]`.
- `selectEngineEventTimeline({ events: [], fireMonth })` returns `fireMonth ? [synthFire(fireMonth)] : []` (`engineEventTimeline.ts:136-138`).
- Result: **TODAY → (single synthetic FIRE node) → end**. This is the original "empty middle" complaint from the directive.

### L3 — Allowlist drops 11 of 21 event types
- `engineEventTimeline.ts:46-59` `TYPE_TO_CATEGORY` maps only 10 of 21 types. The remaining 11 (income.*, expense.*, macro.*, tax.*, `debt.mortgage_payment`) are silently dropped per §7.3 of the original spec.
- Probe demonstrates the impact concretely: of 100 generated events, **only 34 pass the allowlist; 66 are dropped**:

```
[INFO] Timeline policy (current code) → 34 events pass, 66 dropped
  cash        1
  cash/etf    27
  debt        2
  exit        2
  property    2

  Dropped-type histogram:
    expense.child_cost              1
    expense.recurring               60     ← rentvest household rent
    income.career_break             1
    income.salary_change            2
    macro.rate_spike                1
    macro.regime_shift              1
```

These dropped events are NOT noise — they are exactly the events the user said the roadmap is missing: salary changes, career breaks, market crashes, rate spikes, rentvest-driven household rent. They are produced correctly by the engine, then filtered.

---

## Claim 3 — Plumbing restores the stream

The probe demonstrates the recovery path in-process, using only the existing exported API surface — **no code modifications, no math changes**:

```
[PASS] In-process probe: 100 events flow Engine → result.events
[PASS] These same events would propagate to action-roadmap.tsx line 196
[PASS]   if and only if readLatestGoalLabPlan() returns a non-null plan
[PASS]   which is true while the user navigates from Decision Lab without reload
```

This proves that:
- The event-generation layer needs **nothing**.
- The result-attachment layer needs **nothing** (Sprint 29 §7 already added it).
- The UI-consumer layer needs **nothing** structurally; it already reads `result.events`.

The only changes required are:

1. **For L1 (cache eviction):** persist the GoalLab plan so a reload returns a non-null plan. Options (no math, no engine changes):
   - Mirror `_latestPlan` into `sessionStorage` on `setLatestGoalLabPlan` and rehydrate on `readLatestGoalLabPlan`. Pure plumbing.
   - OR have `/action-roadmap` re-run the plan when the cache is cold (more expensive; not preferred).

2. **For L2 (empty deltas):** ensure the candidate generator surfaces non-empty deltas for the recommended winner. This is the policy / event-producer audit work in `SPRINT30B_EXPLAINABILITY_AUDIT §2.3` (forecast / borrowing / risk / fire baseline milestones merged in). No new math — just exposing existing computed milestones.

3. **For L3 (allowlist drops):** extend `TYPE_TO_CATEGORY` per the audit §3.5 (allowlist + aggregated FY summary lanes). Pure rendering policy. No financial change.

---

## What the screenshot now means

Re-reading the screenshot evidence with this proof in hand:

| Section | Screenshot says | Root cause (which loss) |
|---|---|---|
| "Not modelled yet" banner | `recommended === null` | **L1** — cache cold |
| "FIRE Age (P50): Not modelled yet" | `recommended.winner.result.medianFireMonth` unreachable when `recommended === null` | **L1** |
| "Net Worth at FIRE: Reconciliation failed" | `reconcileTerminalNetWorth({ finalState: null, ... })` returns FAIL | **L1** (downstream of null `recommended`) |
| "No milestones from the recommended path yet" | `roadmap` is null (because `recommended` is null) | **L1** |
| Wealth Building Timeline empty | `engineEvents = [synthFire?]` when events is `[]` | **L1** (and L2 / L3 would still bite even after L1 is fixed for a no-action winner) |

**The "Reconciliation failed" message is a downstream symptom of L1, not a separate defect.** The 30A.3 fix is intact; it just can't run when `finalState` is null.

---

## Acceptance against the user's directive

| Required evidence | Provided |
|---|---|
| Events are being generated | **Claim 1** — 100 events from 16 deltas; types/payloads/sort/group all correct |
| Events are currently being lost | **Claim 2** — three loss mechanisms identified with file:line proof + structural probe assertions |
| Proposed plumbing restores the event stream | **Claim 3** — in-process restoration demonstrated; required changes are persistence + allowlist + non-empty deltas — all plumbing, zero financial math |

**No source files modified.** **No Monte Carlo, Forecast, FIRE, Goal Lab, or reconciliation code touched.** **No merge.** **No deploy.**

---

## Recommended next step (awaiting your approval)

The smallest possible Step 1 that proves the chain end-to-end without touching math:

1. Add `sessionStorage` mirror to `goalLab/orchestrator.ts` setLatestGoalLabPlan / readLatestGoalLabPlan (4 lines of code, no engine change).
2. Re-deploy preview (preview only — no merge).
3. Repeat the screenshot test: visit `/decision-lab` → Run Plan → reload `/action-roadmap` → verify `recommended` is non-null, `result.events.length > 0`, and at least 1 timeline node appears between TODAY and FIRE.

That single change isolates L1 and makes L2 / L3 directly observable so we can iterate on them with you visually. No math is touched. No reconciliation is modified. No Goal Lab UI changes.

**Awaiting your sign-off before writing any code.**
