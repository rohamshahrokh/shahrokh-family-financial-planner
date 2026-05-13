/**
 * TaxRegimeHeaderStrip
 * --------------------
 * Thin route-aware wrapper that mounts the global modelling-assumptions
 * chip inside the app header for the 6 tax-reform-aware pages:
 *   Dashboard, Decision Engine, Property Plan, CGT, Forecast, FIRE
 *
 * Renders NOTHING on other routes. Additive only — never modifies the
 * surrounding header. Reads the live location from wouter and matches by
 * pathname prefix.
 *
 * V2 (#FixGlobalScenarioSelectorConsumerUX): replaces the raw dropdown
 * with a calm one-line chip ("Using <X>  Change") that opens an
 * explanatory dialog. The raw <TaxRegimeSelector> is still exported by
 * the barrel for ad-hoc use, but is no longer surfaced in the header.
 *
 * © Family Wealth Lab. This is modelling only and not personal tax advice.
 */
import { useLocation } from "wouter";
import { ModellingAssumptionsChip } from "./ModellingAssumptionsChip";

/** Routes (pathname prefixes) that should display the regime selector. */
const REGIME_AWARE_ROUTES: ReadonlyArray<string> = [
  "/",                  // Dashboard
  "/dashboard",
  "/decision",          // Decision Engine
  "/property-plan",     // Property Plan
  "/property",
  "/cgt",               // CGT Calculator
  "/forecast",          // Forecast
  "/fire",              // FIRE
];

function pathIsRegimeAware(pathname: string): boolean {
  if (pathname === "/" || pathname === "/dashboard") return true;
  return REGIME_AWARE_ROUTES.some(
    (r) => r !== "/" && r !== "/dashboard" && pathname.startsWith(r),
  );
}

export interface TaxRegimeHeaderStripProps {
  /** Force-show even when route doesn't match. Default: false. */
  forceVisible?: boolean;
  /** Force-hide even when route does match. Default: false. */
  forceHidden?: boolean;
  /** Optional className passthrough for layout tuning. */
  className?: string;
}

export function TaxRegimeHeaderStrip(props: TaxRegimeHeaderStripProps) {
  const { forceVisible, forceHidden, className } = props;
  const [location] = useLocation();

  if (forceHidden) return null;
  if (!forceVisible && !pathIsRegimeAware(location)) return null;

  return (
    <div
      className={`flex items-center ${className ?? ""}`}
      data-testid="tax-regime-header-strip"
    >
      <ModellingAssumptionsChip />
    </div>
  );
}

export default TaxRegimeHeaderStrip;
