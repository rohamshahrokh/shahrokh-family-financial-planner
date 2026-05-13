/**
 * Barrel index for the P1b taxRegime UI module.
 *
 * #FWL_P1B_UI_Finalisation_TaxReform
 *
 * Importers can do:
 *   import { TaxRegimeSelector, PropertyComparisonPanel } from "@/components/taxRegime";
 *
 * This barrel never imports an engine — only components, hooks, and pure
 * formatters. The engine layer remains untouched.
 */

export { TaxRegimeSelector, default as TaxRegimeSelectorDefault } from "./TaxRegimeSelector";
export { TaxRegimeHeaderStrip, type TaxRegimeHeaderStripProps } from "./TaxRegimeHeaderStrip";
export { ModellingAssumptionsChip } from "./ModellingAssumptionsChip";
export { ModellingAssumptionsDialog } from "./ModellingAssumptionsDialog";
export { AutoDetectRationaleCard } from "./AutoDetectRationaleCard";
export { PropertyTaxFieldsCard, type PropertyTaxFields } from "./PropertyTaxFieldsCard";
export { PropertyComparisonPanel, type PropertyComparisonRow } from "./PropertyComparisonPanel";
export { CgtRegimeComparison, type CgtBranch } from "./CgtRegimeComparison";
export { DeferredLossLedgerCard, type DeferredLossRow } from "./DeferredLossLedgerCard";
export { TaxTimingDragSection, type DragSeriesPoint } from "./TaxTimingDragSection";
export { RegimeOverlayToggle, type RegimeOverlayMode } from "./RegimeOverlayToggle";
export { RegimeOverlayChart, type RegimeSeriesPoint } from "./RegimeOverlayChart";
export { FireRegimeDelayCard, type FireRegimeBranch } from "./FireRegimeDelayCard";
export { StrategyReformTags, type StrategyReformMetrics } from "./StrategyReformTags";
export { PolicyShockSimulator, type PolicyShockInputs, type PolicyShockOutputs } from "./PolicyShockSimulator";
export { RegimeDashboardCards, type RegimeDashboardData } from "./RegimeDashboardCards";
export * from "./formatters";
