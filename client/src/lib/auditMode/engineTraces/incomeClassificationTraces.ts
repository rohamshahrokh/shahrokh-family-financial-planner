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
import { INCOME_TYPE_LABELS } from "../../incomeClassificationEngine";

export const INCOME_ENGINE_TRACE_ID = "dashboard:income-engine";

const fmt$ = (n: number) =>
  n < 0
    ? `-$${Math.abs(Math.round(n)).toLocaleString()}`
    : `$${Math.round(n).toLocaleString()}`;

const ts = () => new Date().toISOString();

function describeRecord(r: ClassifiedIncomeRecord): TraceIncludedExcluded {
  const typeLabel = INCOME_TYPE_LABELS[r.incomeType] ?? r.incomeType;
  const dateBit = r.date ? ` · ${r.date}` : "";
  return {
    label: `${typeLabel} — ${r.member}${dateBit}`,
    value: fmt$(r.amount),
    reason: r.classificationReason,
  };
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
        label: "Recurring records (count)",
        value: a.recurringRecords.length,
        source: "sf_income (classified)",
      },
      {
        label: "One-off records (count)",
        value: a.excludedOneOffEvents.length,
        source: "sf_income (classified)",
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
      },
      {
        label: "Monte Carlo Income Used",
        value: fmt$(a.engineInputs.monteCarloIncomeUsed),
        source: "monteCarloCanonical input",
      },
      {
        label: "Serviceability Income Used",
        value: fmt$(a.engineInputs.serviceabilityIncomeUsed),
        source: "depositPower / affordability input",
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
    ],
  };
}
