# Sprint 30A — Lane Coverage Report

Generated from a real `runGoalLabPlan` execution against the demo dataset.

## Recommended path
- templateId: `delay-ip`
- templateLabel: Delay property 6–12 months
- simulationCount: 300
- fireNumber: $2,700,000

## Per-lane breakdown

| Lane | Engine | Derived | Total |
| --- | ---: | ---: | ---: |
| acquisition | 0 | 0 | 0 |
| equity_release | 0 | 0 | 0 |
| debt_reduction | 1 | 0 | 1 |
| borrowing_capacity | 0 | 1 | 1 |
| exit | 0 | 1 | 1 |

### acquisition

- *(no events)*

### equity_release

- *(no events)*

### debt_reduction

- `2026-05` Deposit to offset — **engine**  
  whyItExists: Engine routes cash into offset to compress interest and shorten debt timeline.
  impact: NW Δ — · FIRE Δ months — · PI Δ /mo +$857 · risk lower

### borrowing_capacity

- `2026-06` Re-test borrowing capacity — **derived**  
  whyItExists: After material cash routing into offset, the engine's serviceability ratio may permit a fresh borrowing assessment. Use this checkpoint to re-test capacity with the broker before the next acquisition window.
  formula: Synthesised one month after each offset deposit; flagged when offset balance > 80% of purchase target OR a 5% income change is implied by recent engine state.
  impact: NW Δ — · FIRE Δ months — · PI Δ /mo — · risk lower

### exit

- `2034-10` FIRE crossing — **derived**  
  whyItExists: Median Monte Carlo trajectory first reaches the FIRE target at this month. This marks the end of the accumulation phase and the start of the drawdown phase.
  formula: Month where median NW first ≥ FIRE target × 25 multiplier
  impact: NW Δ — · FIRE Δ months — · PI Δ /mo +$9,151 · risk lower

