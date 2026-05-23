/**
 * incomeClassificationTraces.ts — Income engine audit trace.
 *
 * Surfaces the recurring vs one-off classification for every sf_income
 * record, the recurring monthly figure consumed by every downstream engine,
 * the one-off events deliberately excluded, and the engine-input fanout
 * (Forecast, Monte Carlo, serviceability). This is a PURE READ trace — it
 * never mutates engine inputs.
 *
 * #FWL_Income_Engine_Refactor
 */

import type { CalculationTrace, TraceIncludedExcluded } from "../calculationTrace";
import type {
  AggregatedIncome,
  ClassifiedIncomeRecord,
} from "../../incomeClassificationEngine";
import {
  INCOME_TYPE_LABELS,
  INCOME_BEHAVIOUR_LABELS,
  FORECAST_TREATMENT_LABELS,
} from "../../incomeClassificationEngine";

export const INCOME_ENGINE_TRACE_ID = "dashboard:income-engine";

/**
 * Modules whose canonical income input flows from the classifier — surfaced
 * verbatim in the audit trace so the user can see exactly which downstream
 * engines respond to a record's classification.
 */
export const INCOME_ENGINE_APPLIED_MODULES = [
  'Forecast Engine (forecastEngine / forecastEngineRegimeAware)',
  'Monte Carlo (monteCarloCanonical · V4 · V5)',
  'Deposit Power (depositPower)',
  'Affordability / Serviceability (propertyBuyEngine · cashEngine)',
  'Dashboard Monthly Income KPI (selectMonthlyIncome)',
  'Tax Alpha Engine (taxAlphaEngine)',
];

const fmt$ = (n: number) =>
  n < 0
    ? `-$${Math.abs(Math.round(n)).toLocaleString()}`
    : `$${Math.round(n).toLocaleString()}`;

const ts = () => new Date().toISOString();

function describeRecord(r: ClassifiedIncomeRecord): TraceIncludedExcluded {
  const typeLabel = INCOME_TYPE_LABELS[r.incomeType] ?? r.incomeType;
  const behaviourLabel = INCOME_BEHAVIOUR_LABELS[r.behaviour] ?? r.behaviour;
  const treatmentLabel = FORECAST_TREATMENT_LABELS[r.forecastTreatment] ?? r.forecastTreatment;
  const dateBit = r.date ? ` · ${r.date}` : "";
  const freqBit = r.frequency ? ` · ${r.frequency}` : "";
  // Pack type / behaviour / treatment into the reason so the trace panel
  // exposes the canonical classification fields alongside the engine label.
  const reason =
    `type=${typeLabel}; behaviour=${behaviourLabel}; treatment=${treatmentLabel}` +
    (r.classificationReason ? ` · ${r.classificationReason}` : "");
  return {
    label: `${typeLabel} — ${r.member}${dateBit}${freqBit}`,
    value: fmt$(r.amount),
    reason,
  };
}

/** Count records by canonical income type — used for the source-summary row. */
function countByType(records: ClassifiedIncomeRecord[]): string {
  if (records.length === 0) return "(none)";
  const counts = new Map<string, { count: number; total: number }>();
  for (const r of records) {
    const key = INCOME_TYPE_LABELS[r.incomeType] ?? r.incomeType;
    const slot = counts.get(key) ?? { count: 0, total: 0 };
    slot.count += 1;
    slot.total += r.amount;
    counts.set(key, slot);
  }
  const parts: string[] = [];
  counts.forEach((slot, label) => {
    parts.push(`${label} × ${slot.count} (${fmt$(slot.total)})`);
  });
  return parts.join("; ");
}

export interface IncomeEngineTraceArgs {
  aggregate: AggregatedIncome;
  /** ISO date the trace was built — keeps the calculation reproducible. */
  asOf?: string;
  /** Optional scenario id for the audit panel header. */
  scenarioId?: string;
}

/**
 * Build the audit trace describing the income classification engine output.
 */
export function buildIncomeClassificationTrace(
  args: IncomeEngineTraceArgs,
): CalculationTrace {
  const a = args.aggregate;
  const asOf = args.asOf ?? ts();

  const includedRecords = a.recurringRecords.map(describeRecord);
  const excludedRecords = a.excludedOneOffEvents.map(describeRecord);

  return {
    id: INCOME_ENGINE_TRACE_ID,
    label: "Recurring Monthly Income",
    finalValue: fmt$(a.recurringMonthlyIncome),
    plainEnglish:
      "Recurring Monthly Income is the sum of every income record classified " +
      "as RECURRING (employment salary, rental, dividend, interest, business " +
      "income, and any 'Other' record the user explicitly marked recurring). " +
      "One-off events such as employment bonuses, tax refunds, asset sales, " +
      "and gifts / inheritances are treated as cash events in their event " +
      "month only — they NEVER inflate this figure or any forecast, Monte " +
      "Carlo, deposit-power or serviceability projection.",
    formula:
      "recurringMonthlyIncome = Σ monthlyEquivalent( records where forecast_treatment = include )",
    expanded:
      a.recurringRecords.length === 0
        ? "Σ () = $0"
        : `Σ ( ${a.recurringRecords.map(r => fmt$(r.monthlyEquivalent)).join(" + ")} ) = ${fmt$(a.recurringMonthlyIncome)}`,
    inputs: [
      {
        label: "Recurring Income Sources Used",
        value: countByType(a.recurringRecords),
        source: "sf_income (classified — forecast_treatment=include)",
        note: `${a.recurringRecords.length} record(s) → ${fmt$(a.recurringMonthlyIncome)}/mo`,
      },
      {
        label: "Excluded One-Off Income Events",
        value: countByType(a.excludedOneOffEvents),
        source: "sf_income (classified — forecast_treatment=exclude)",
        note: `${a.excludedOneOffEvents.length} event(s) — excluded from recurring; cash impact in event month only`,
      },
      {
        label: "Recurring Monthly Income",
        value: fmt$(a.recurringMonthlyIncome),
        source: "incomeClassificationEngine.aggregateIncome",
      },
      {
        label: "One-Off Income (last 12 months)",
        value: fmt$(a.oneOffIncomeLast12Months),
        source: "incomeClassificationEngine.aggregateIncome",
      },
      {
        label: "Total Income (historical)",
        value: fmt$(a.totalHistoricalIncome),
        source: "incomeClassificationEngine.aggregateIncome",
      },
      {
        label: "Forecast Income Used",
        value: fmt$(a.engineInputs.forecastIncomeUsed),
        source: "forecastEngine input",
        note: "recurring monthly income — one-off events excluded",
      },
      {
        label: "Monte Carlo Income Used",
        value: fmt$(a.engineInputs.monteCarloIncomeUsed),
        source: "monteCarloCanonical input",
        note: "recurring monthly income — one-off events excluded",
      },
      {
        label: "Serviceability Income Used",
        value: fmt$(a.engineInputs.serviceabilityIncomeUsed),
        source: "depositPower / affordability input",
        note: "recurring monthly income — one-off events excluded",
      },
      {
        label: "Applied Modules",
        value: INCOME_ENGINE_APPLIED_MODULES.length,
        source: "incomeClassificationEngine downstream consumers",
        note: INCOME_ENGINE_APPLIED_MODULES.join(" · "),
      },
    ],
    assumptions: [
      {
        label: "Recurring types",
        value: "Employment Salary, Rental, Dividend, Interest, Business, recurring Other",
        source: "incomeClassificationEngine.DEFAULT_BEHAVIOUR",
      },
      {
        label: "One-off types (excluded)",
        value: "Employment Bonus, Tax Refund, Asset Sale, Gift / Inheritance, one-off Other",
        source: "incomeClassificationEngine.DEFAULT_BEHAVIOUR",
      },
      {
        label: "User-override precedence",
        value: "explicit behaviour & forecast_treatment fields override type defaults",
        source: "classifyIncomeRecord",
      },
    ],
    dataSource: "sf_income ledger classified by incomeClassificationEngine.ts",
    sourceEngine: "incomeClassificationEngine",
    included: includedRecords.length > 0
      ? includedRecords
      : [{ label: "(no recurring records on ledger)", reason: "Falls back to snapshot sub-fields or master monthly_income" }],
    excluded: excludedRecords.length > 0
      ? excludedRecords
      : [{ label: "(no one-off events excluded)" }],
    calculatedAt: asOf,
    scenarioId: args.scenarioId,
    notes: [
      "One-off events affect cash on the event date but never the recurring monthly figure.",
      "An $80k crypto sale (asset_sale, one_off) leaves Recurring Monthly Income unchanged.",
      `Applied modules: ${INCOME_ENGINE_APPLIED_MODULES.join(', ')}.`,
    ],
  };
}
