# 11 — Roadmap

This is the recommended sequencing of work from this point. Each item lists prerequisites, expected effort, and risk.

## Immediate (do these first, in order)

### R1 — Merge PR #88 (data-layer remediation)
- **Prereq:** User reviews PR #88 and approves
- **Effort:** review only (no new code)
- **Risk:** zero new typecheck errors, 120 tests added; rollback plan in PR body
- **Outcome:** unblocks all UX work

### R2 — Apply schema migration for `goals_set` / `goal_set_timestamp`
- **Prereq:** R1 merged
- **Effort:** one command (`supabase migration up`)
- **Risk:** low — additive columns only, backfill is conservative
- **Verify:** `SELECT goals_set FROM mc_fire_settings;` returns boolean

### R3 — Deploy to Vercel
- **Prereq:** R1 + R2
- **Effort:** automatic on push to main (or manual `vercel deploy --prod`)
- **Verify:** familywealthlab.net Portfolio Lab shows $816,500 Current NW with `● Current Ledger` chip

### R4 — Production reconciliation post-deploy
- **Verify (visual):** every promoted number has a source tag; amber freshness banner; do-nothing chart has 3 real series
- **Verify (functional):** `assertCurrentNwIsLedger` does not fire console.warn
- Update `13-production-state.md` with post-deploy snapshot

### R5 — Re-run Monte Carlo
- **Prereq:** R3 deployed (so freshness banner accurately reflects re-run)
- **Effort:** click "Re-run Monte Carlo" CTA (note KI-17: handler not yet wired — may need manual API call)
- **Verify:** `mc_fire_results.ran_at` ≥ `sf_snapshot.updated_at`; freshness banner disappears or shows fresh

## Short-term (week 1–2 after R1–R5)

### R6 — Address PR #87 (Sprint 13 Reality Check)
- **Prereq:** R1–R5 done; data layer correct
- **Effort:** fix 234px above-fold overflow; re-test scorecard; rebase on latest main
- **Risk:** medium — UX rebuild has interdependencies

### R7 — RLS Security Sprint (PR #89)
- **Prereq:** policy design decision (single-household `USING (true)` vs `auth.uid() IS NOT NULL` vs multi-tenant)
- **Effort:** policy review + Supabase branch test + production apply
- **Risk:** **high** — wrong policies take the app offline. Test in branch first.

### R8 — Close superseded PRs (#11–#51)
- **Prereq:** none
- **Effort:** review each, close as superseded
- **Risk:** zero — they are not merged anyway

## Medium-term (month 1–2)

### R9 — Scenario persistence (option a)
- **Goal:** Write optimizer outputs to `sf_scenario_results` so rankings are durable
- **Prereq:** R1 merged
- **Effort:** medium — new server endpoint + write logic + remove transient flag

### R10 — Real `delay-property` forecast
- **Goal:** Replace `decisionCandidates.ts:472,484` closed-form math with real forecast call
- **Prereq:** R1 merged
- **Effort:** medium

### R11 — Canonical `required_probability_pct`
- **Goal:** Move `REQUIRED_PROB_BAR = 0.7` to user-configurable canonical setting
- **Prereq:** R1 merged
- **Effort:** small — add column to `mc_fire_settings`, expose via canonicalGoal

### R12 — Remove deprecated SWR paths
- **Goal:** Delete (not just `@deprecated`) `sf_app_settings.swr`, `sf_scenarios.swr`, `canonicalFire.ts:78` fallback
- **Prereq:** R1 + R2 deployed; no consumers remain (search for usages)
- **Effort:** small — deletion only

### R13 — Sprint 13 UX rebuild (proper)
- **Goal:** 30-second 6-question primary view per locked decision #9
- **Prereq:** R1–R5 confirmed in production
- **Effort:** large — full sprint
- **Note:** PR #87 covers some of this; may be reusable

### R14 — Fix README
- Update tech stack section to say Supabase (not SQLite)
- Update default snapshot table to current $816,500 figure
- Remove outdated claims

### R15 — Wire `Re-run Monte Carlo` button
- Currently a no-op
- Effort: small — connect to existing MC run endpoint

## Long-term / strategic

### R16 — Multi-account / multi-user
- Currently single-household; no multi-tenancy
- If ever needed: requires owner_id propagation + RLS policies + auth model rethink
- **Not on the current roadmap** — explicitly out of scope

### R17 — Mobile native app
- Currently web-only; mobile-responsive UI exists
- Native app not planned

### R18 — Advisor / read-only sharing
- Allow Fara read-only view; allow external advisor temporary access
- **Not currently planned**

## What NOT to do (per locked decisions)

- ❌ Do NOT start Sprint 14 until R1–R5 done
- ❌ Do NOT create new engines
- ❌ Do NOT redesign additional pages until R1–R5 done
- ❌ Do NOT merge PR #88 without explicit user approval
- ❌ Do NOT auto-apply RLS migration
- ❌ Do NOT touch PR #87 branch (`feat/sprint13-reality-check-v2`)
