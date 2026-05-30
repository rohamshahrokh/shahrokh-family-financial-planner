# Sprint 30A — Dependency Chain Report

Generated from a real `runGoalLabPlan` execution against the demo dataset.

## Recommended path
- templateId: `delay-ip`
- laneEvents: 3
- edges produced: 3

## Edges

| from | to | source | rationale |
| --- | --- | --- | --- |
| `debt_reduction` Deposit to offset (`2026-05`) | `borrowing_capacity` Re-test borrowing capacity (`2026-06`) | **engine** | Engine linked these milestones via sourceDeltaId=defer_50_50_etf_off_offset. |
| `debt_reduction` Deposit to offset (`2026-05`) | `exit` FIRE crossing (`2034-10`) | **heuristic** | Exit (FIRE crossing) is the terminal milestone; every prior milestone leads to it. |
| `borrowing_capacity` Re-test borrowing capacity (`2026-06`) | `exit` FIRE crossing (`2034-10`) | **heuristic** | Exit (FIRE crossing) is the terminal milestone; every prior milestone leads to it. |

## Notes

- Engine edges are produced when two lane events share a `sourceDeltaId`.
- Heuristic edges follow five cross-lane rules:
  - debt_reduction → borrowing_capacity within 6 months
  - borrowing_capacity → acquisition within 12 months
  - acquisition → debt_reduction within 24 months
  - debt_reduction → equity_release within 36 months
  - any milestone → exit (terminal, always last)
