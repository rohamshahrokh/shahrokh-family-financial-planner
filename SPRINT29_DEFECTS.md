# Sprint 29 Defects — Browser Verification Findings

Preview URL: https://shahrokh-family-financial-planner-cevl14b18.vercel.app
Commit: d7eb3ab on feat/sprint28-move-refactor
Verification: desktop 1440x900, mobile 390x844 (iPhone 14), demo profile

---

## P0 — Engine / Reconciliation (per contract, these are intended behaviours)

### D1. Reconciliation FAIL fires correctly (CONTRACT-COMPLIANT)
- Components sum $11,650,428 vs MC P50 headline $11,530,286
- Delta +$120,141 = 1.04 % (tolerance 0.5 %)
- S1 NW@FIRE tile → "Reconciliation failed"
- S4 NW Attribution → blocked card with full numeric breakdown
- S5 MC NW@FIRE → blocked
- Mobile Risks tab → same banner reproduced
- Status: WORKING AS DESIGNED. Resolution requires engine work to unify
  `medianFinalState` and fan P50 (out of scope for this sprint).

---

## P1/P5 — Monte Carlo & Engine Events (LEGITIMATE ENGINE BEHAVIOUR)

### D2. MC variance plausible — no warning fired
- TerminalNW CV 18 %, passive CV 18 % (both above warning threshold)
- FireAge degenerate but P25(45) ≠ P75(44) → variance diagnostic stayed silent
- Status: WORKING AS DESIGNED.

### D3. Zero engine events on demo path
- Demo's `delay-ip` strategy emits no `contribution.*` / `asset.*` / `debt.*` events
  beyond the milestones already covered
- Desktop Gantt shows empty rows with "Engine event timeline" footer
- Mobile vertical fallback shows category list with "—" for empty categories,
  populated rows for Debt (Deposit to offset account) and ETF (lump-sum)
- Status: WORKING AS DESIGNED. Engine event surfacing depends on engine emissions.

---

## P2/P3 — Roadmap purity (CONTRACT-COMPLIANT)

### D4. Zero-delta milestone correctly filtered
- 2nd 2026-05 milestone (ETF lump-sum) shared month with deposit milestone →
  NW delta vs prior = 0 → filter removed it
- FIRE marker preserved
- Status: WORKING AS DESIGNED.

### D5. NW Δ display = "+$0" on visible milestone
- The remaining "Deposit to offset account" milestone renders NW Δ "+$0"
  because the engine output's medianFinalState delta against starting point
  rounds to zero at this granularity
- Visible on both desktop S2 and mobile Roadmap tab
- Possible defect: should milestone with zero NW Δ be hidden by the same filter?
  Contract: "If all deltas are zero: do not render milestone." Here NW Δ is zero
  but RISK Δ = "lower" — filter currently passes if ANY delta is non-zero.
- Severity: minor (consistent with stated 4-delta semantics, but visually odd)

---

## P4 — Engine Events Timeline

### D6. Gantt empty-state surfaces correctly on desktop
- Desktop S3 Gantt: 7 category lanes (Property/Debt/Cash/ETF/Super/Exit/FIRE)
- All lanes empty in demo run; footer reads "Engine event timeline"
- Mobile vertical fallback works
- Severity: see D3 root cause

---

## P9 — Mobile Tabs (DEFECTS)

### D7. CRITICAL — Mobile TabsList grid collapses to 1 column
- Class on TabsList: `grid h-auto w-full grid-cols-3 gap-1`
- Computed style: `gridTemplateColumns: "326px"` (single column)
- All 6 tabs stack vertically as 6 rows × 1 col, taking ~196 px of vertical
  space at top of every tab view
- Root cause: shadcn `<TabsList>` base style sets `grid-cols-2` and the
  cn() merge with `grid-cols-3` from action-roadmap.tsx does not resolve
  to 3 columns (likely the base utility wins in Tailwind merge order or
  the base component sets an inline style)
- Expected: 3 cols × 2 rows (or 2 × 3) to fit on mobile without scrolling
- Files: `client/src/pages/action-roadmap.tsx` (tabs definition), shadcn
  `tabs.tsx` (base TabsList class)
- Severity: P0 — directly contradicts P9 acceptance ("Mobile must not
  require scrolling through 15 report sections"). Currently mobile users
  scroll past 196 px of vertical tab buttons before each tab's content.

---

## P0/P5/P7 — Cascading "Not modelled yet" (DEFECTS)

### D8. MAJOR — Reconciliation block cascades beyond contract scope
- Contract: gate blocks S1 NW@FIRE tile + S4 chart + S5 NW@FIRE row;
  FIRE Age and Passive Income continue to render
- Actual on preview:
  - S1: FIRE Age (P50) → "Not modelled yet"  ← should render P50 FIRE age
  - S1: Passive Income (P50) → "Not modelled yet"  ← should render P50 PI
  - S5 MC Outlook: FIRE Age and Passive Income cards → "Not modelled yet"
    with P25/P75 also "Not modelled yet"  ← MC FIRE-age and PI percentiles
    should still render even when NW row is blocked
- S7 Alternative Strategies: both alt cards show "FIRE AGE / NW@FIRE /
  PASSIVE INCOME = Not modelled yet" — likely same over-cascading guard
- Severity: P0 — violates explicit user instruction: "S5 FIRE age +
  Passive income continue to render (not the contested quantity)"

### D9. MAJOR — Confidence chip shows "Low" with empty supporting numbers
- S1 Confidence card: chip = "Low", source = "Goal Lab confidence"
- No numeric backing; chip is the only signal
- The Goal Lab plan ran `unreachable_plan_review` (recommendation id),
  consistent with Low confidence, but the chip with no underlying numbers
  reads as a stale/empty placeholder
- Severity: minor (semantically correct, visually weak)

### D10. MAJOR — S6 Risks all show 0.0 % (suspicious)
- Default / insolvency: 0.0 %
- Liquidity stress: 0.0 %
- Negative equity: 0.0 %
- Refinance pressure: 0.0 %
- Forced asset sales: 0.0 %
- Then 4 risks marked "Not modelled" (Rate shock, Income reduction,
  Property under-performance, ETF under-performance)
- Either MC engine is not surfacing risk counts for the demo path (likely)
  or the wiring strips them. Given D8 over-cascading, suspect the same
  null-guard is short-circuiting risk counts to 0 when reconciliation fails.
- Severity: investigate before merge

---

## P8 — Next Actions

### D11. Next Actions buckets mostly empty
- next_30_days: 1 item ("Review milestone: Deposit to offset account · Due 2026-05")
- next_90_days: "Nothing scheduled"
- next_12_months: "Nothing scheduled"
- Likely consistent with the single visible milestone post-purity filter
- Severity: minor — expected given current engine output

---

## P7 — Alternative Strategies

### D12. Alternative strategies rationale missing
- Recommended path card: "Delay property 6–12 months" → metrics "Not modelled yet"
- Best hybrid: "Hybrid: property + ETF" → "Supporting Action" tag, metrics
  "Not modelled yet"
- No `lossReason` rationale text visible
- Contract: "Alternative Strategies lossReason rationale block"
- Likely cascading from same null-guard as D8 — alternative result objects
  also blocked by reconciliation propagating across all strategies
- Severity: P1 — primary deliverable of P7

---

## Summary

- 3 contract-compliant findings (D1/D4/D6) — engine-level work needed, not bugs
- 3 legitimate engine behaviour findings (D2/D3/D5) — surface working correctly
- **4 real defects** in Sprint 29 implementation:
  - D7 (P0): mobile tab grid collapses to 1 col
  - D8 (P0): reconciliation block cascades to FIRE Age + Passive Income
  - D10 (P1): all risks 0.0 % — investigate cascading
  - D12 (P1): alternative strategies rationale + metrics missing
- 2 minor visual notes (D9 confidence chip, D11 next actions sparsity)

**Recommendation: do NOT merge. D7, D8, D10, D12 must be fixed and re-verified
before the preview is approved.**
