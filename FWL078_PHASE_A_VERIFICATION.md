# FWL-078 · Phase A · Verification Report

**Date:** 2026-05-30
**Branch:** `fix/fwl078-phase-a-intent-filter-drop` · commit `9096e0d`
**Household:** shahrokh-family-main

## 1. What was wrong

The Action Roadmap was rendering a recommendation label (e.g. "Buy IP now") whose **winning candidate did the opposite** (`defer_etf_super_50`, an ETF + super lump sum with zero IP-purchase events). The mismatch propagated to every downstream tab (Roadmap, Timeline, Risks, Alternatives, Actions) because all six tabs read the same canonical `picks.recommended` object.

## 2. Root cause (from read-only probe)

Probe: `script/sprint-fwl078-buy-ip-now-probe.ts` → `sprint_fwl078_buy_ip_now_probe.txt`

| Symptom | Detail |
|---|---|
| All 4 IP-purchase blueprints (`ip_now`, `ip_6mo`, `ip_18mo`, `equity_release_ip`) discarded at Stage-2 `safety_ceiling` | `"DSR critical"` — `"Median DSR 131.1% sits in critical band (≥55%)."` |
| Override | `{ possible: false, mechanism: "DSR ≥55% is unserviceable under APRA buffer; not overridable." }` |
| `buy-ip-now` template, no faithful candidate left | Engine fell back to `engineTop` (the highest-scoring ranked candidate, which happened to be `defer_etf_super_50`) |
| Result | `winnerSelectedByIntentFilter = false`; label says "Buy IP now", winner is "defer ETF + super 50/50" |

**Mismatch was NOT a bug in candidate generation, scoring, intent-filter logic, or id matching.** It was a *fallback policy* bug — when intent filters fail to find a faithful winner, the orchestrator should not silently revert to a contradicting winner.

## 3. Fix applied

**File:** `client/src/lib/goalLab/orchestrator.ts` (~lines 290–325)

When a template declares an `intentFilter` but the faithful candidate has been discarded as a non-overridable hard-blocker, we now **drop the entire scenario** rather than fall back to the optimizer top:

```ts
const faithful = out.ranked.find((c) => t.intentFilter!(c.id));
if (faithful) {
  winner = faithful; winnerSelectedByIntentFilter = true;
} else {
  // NEW: if every intent-aligned blueprint was hard-blocked, drop the scenario.
  const intentBlocked = out.discarded.some(
    (d) => t.intentFilter!(d.id)
      && d.severity === "hard_blocker"
      && d.override?.possible !== true,
  );
  if (intentBlocked) { continue; }
  // else: existing engineTop fallback path
}
```

**Why this is correct:** if the household genuinely cannot afford an IP purchase (DSR 131% under APRA buffer), it is misleading to recommend "Buy IP now" — that template should disappear from the ranked list. The recommendation label and winner candidate are now always intent-aligned.

## 4. Regression guard

**File:** `client/src/lib/goalLab/__tests__/orchestratorIntentFilterIntegrity.test.ts`

22 assertions. Verifies:
1. **No surviving ranked scenario has `winnerSelectedByIntentFilter === false`** (would mean a label/winner mismatch leaked through)
2. **No ranked scenario's winner is in its own template's `dropFilter` set** (would mean the winner contradicts the template's negative intent)
3. **For each template that declares an `intentFilter`**, the surviving winner's `id` passes the filter

Runs as part of `npm test` (test #60). All 22 assertions pass.

## 5. Post-fix production smoke — all 6 acceptance metrics

Script: `script/sprint-fwl078-post-fix-smoke.ts` → `sprint_fwl078_post_fix_smoke.txt`

Runs the full engine end-to-end against the real Supabase household and mirrors `/action-roadmap` page wiring exactly (same `buildActionRoadmap` / `selectYearByYearRoadmap` / `selectEngineEventLanes` / `buildNextActions` calls with the same input derivation).

| # | Metric | Value |
|---|---|---|
| 1 | **Recommended template** | `debt-recycling` ("Debt recycling — Convert non-deductible debt to deductible via ETF re-borrow.") |
| 2 | **Winner candidate** | `etf_lump_now` · `winnerSelectedByIntentFilter = true` ✓ |
| 3 | **Winner events** | 1 event — `etf_lump_sum` $50,000 activating 2026-05 |
| 4 | **Roadmap item count** | 2 milestones — (1) ETF lump-sum investment [next, 2026-05], (2) Target FIRE at age 45 [fire, 2035-05] |
| 5 | **Timeline item count** | 7 year-cards (1 embedded milestone in 2026) + 1 Gantt lane (`exit`) |
| 6 | **Actions item count** | 2 — both in next-30-days: (1) Confirm brokerage account is funded, (2) Review target ETF allocation |

**Sanity checks:**
- `buy-ip-now` in ranked? **NO ✓** (correctly dropped — household genuinely cannot afford IP)
- `equity-release-ip` in ranked? **NO ✓** (same DSR constraint)
- All surviving 10 scenarios: `winnerSelectedByIntentFilter === true` ✓

## 6. Before / After

| Aspect | Before fix | After fix |
|---|---|---|
| Ranked scenarios | 12 | 10 |
| Templates present that the household cannot execute | `buy-ip-now`, `equity-release-ip` | none |
| Recommended template winner | misaligned (showed defer-ETF when label said Buy IP) | aligned with template intent |
| Scenarios with `winnerSelectedByIntentFilter=false` | ≥2 (buy-ip-now, equity-release-ip) | 0 |
| Regression guard | none | 22 assertions in `orchestratorIntentFilterIntegrity.test.ts` |

## 7. Test / typecheck state

- `npm run check`: **65 errors** (unchanged from pre-fix baseline, ceiling 66)
- `npm test`: **60 ran · 58 passed · 2 known-failing skipped · 0 failed** (was 57 passed; new integrity test added as #60)

## 8. Deployment

- **Branch pushed:** `fix/fwl078-phase-a-intent-filter-drop` (commit `9096e0d`)
- **PR URL:** https://github.com/rohamshahrokh/shahrokh-family-financial-planner/pull/new/fix/fwl078-phase-a-intent-filter-drop
- **Vercel preview deploy initiated:** https://shahrokh-family-financial-planner-3zc8sjhot.vercel.app
  - Upload completed, build queued on Vercel side (currently `initialReadyState: BUILDING`)
  - Status visible at: https://vercel.com/rohamshahrokhs-projects/shahrokh-family-financial-planner/7CJLmz4DWeZfKfHEqz81xFLiZ9FJ

## 9. Files changed / added

| File | Change |
|---|---|
| `client/src/lib/goalLab/orchestrator.ts` | M — intent-filter drop block at ~lines 290–325 |
| `client/src/lib/goalLab/__tests__/orchestratorIntentFilterIntegrity.test.ts` | A — 22-assertion regression guard |
| `script/sprint-fwl078-buy-ip-now-probe.ts` | A — A1 read-only diagnostic probe |
| `script/sprint-fwl078-post-fix-smoke.ts` | A — A5 end-to-end smoke (6 metrics) |
| `sprint_fwl078_buy_ip_now_probe.txt` | A — captured probe output |
| `sprint_fwl078_post_fix_smoke.txt` | A — captured smoke output |
| `FWL078_PHASE1_AUDIT.md` | A — prior-turn audit deliverable |
| `FWL078_PHASE_A_VERIFICATION.md` | A — this document |

## 10. Constraints honored

- ✓ No new MC / forecast / FIRE engines
- ✓ No new financial math
- ✓ No new npm deps
- ✓ No emojis
- ✓ No Goal Lab UI structural changes (orchestrator-only fix)
- ✓ Typecheck within ceiling (65 ≤ 66)
- ✓ Tests green (60/60 effective; 58 passed + 2 known-failing skipped)
- ✓ Commit prefix `sprint-fwl078:`
- ✓ Preview deploy initiated before any merge to main

## 11. Stop point

**Phase B and Phase C have NOT been started.** Awaiting user verification of Phase A.
