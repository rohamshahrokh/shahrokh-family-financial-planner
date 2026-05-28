/**
 * property/index.ts — Sprint 20 PR-F2 property module barrel.
 *
 * Re-exports the canonical types and helpers so consumers can write a
 * single `import { ... } from "@/lib/property"`.
 */

export type {
  CanonicalProperty,
  PropertyKind,
  PropertyLifecycle,
  PpoRKind,
  InvestmentKind,
  RawPropertyLike,
} from "./types";

export {
  classifyProperty,
  classifyProperties,
  classifyKind,
} from "./classify";

export {
  selectSettledProperties,
  totalPropertyLoans,
  totalPropertyValue,
  propertyLeverage,
  propertyLeverageBreakdown,
} from "./leverage";
export type { PropertyLeverageBreakdown } from "./leverage";

export {
  investmentCashflow,
  pporCashflow,
  MAINTENANCE_RATE_OF_VALUE,
  WEEKS_PER_YEAR,
} from "./cashflow";
export type { InvestmentCashflow, PpoRCashflow } from "./cashflow";
