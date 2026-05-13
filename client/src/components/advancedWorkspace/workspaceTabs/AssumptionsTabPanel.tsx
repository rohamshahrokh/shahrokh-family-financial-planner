/**
 * AssumptionsTabPanel — surfaces the existing AssumptionsPanel inside
 * the workspace's chrome.
 */
import AssumptionsPanel from "@/components/AssumptionsPanel";
import { PANEL_HEADING_CLS, MICRO_CLS } from "../workspaceTokens";

export function AssumptionsTabPanel() {
  return (
    <section className="space-y-3" data-testid="assumptions-tab-panel">
      <header>
        <h2 className={PANEL_HEADING_CLS}>Engine assumptions</h2>
        <p className={MICRO_CLS}>
          Every assumption the engine uses for this run. Modelling only — not personal tax or financial advice.
        </p>
      </header>
      <div className="border border-border rounded-md bg-card/95 dark:bg-card/70">
        <AssumptionsPanel mode="full" />
      </div>
    </section>
  );
}
