/**
 * test-sprint12-decision-frame.ts
 *
 * Sprint 12 — DecisionFrame primitive + uiEmptyField helpers.
 *
 * Validates:
 *   §1 Slot rendering for fully-populated frame
 *   §2 Empty slots collapse (no "—" anywhere)
 *   §3 Testid prefix system
 *   §4 isEmptyValue / hideOrCollapse helpers
 *   §5 Status badge renders when set
 *
 * Run: tsx script/test-sprint12-decision-frame.ts
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DecisionFrame } from "../client/src/components/ui/DecisionFrame";
import { isEmptyValue, hideOrCollapse, nullIfEmpty } from "../client/src/lib/uiEmptyField";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function ok(label: string, cond: any) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(label);
    console.error(`  FAIL ${label}`);
  }
}

function has(html: string, id: string): boolean {
  return html.includes(`data-testid="${id}"`);
}

console.log("\nSprint 12 — DecisionFrame + uiEmptyField\n");

/* §1 Full populated frame */
{
  const html = renderToStaticMarkup(
    React.createElement(DecisionFrame, {
      testidPrefix: "test-frame",
      title: "Test",
      currentPosition: { label: "Current NW", value: "$2.5M", subtitle: "today", status: "on-track" },
      targetPosition: { label: "Target NW", value: "$5M", subtitle: "by 2045" },
      gap: { label: "Gap", value: "$2.5M", direction: "negative", subtitle: "to close" },
      recommendedAction: { label: "Next Move", value: "Buy IP 2027", ctaHref: "/decision", ctaLabel: "View" },
      expectedOutcome: { label: "Impact", value: "+ $1.2M NW" },
      doNothingOutcome: { label: "Do Nothing", value: "Hits goal 2052" },
    }),
  );
  ok("§1.1 root testid present", has(html, "test-frame"));
  ok("§1.2 current slot testid", has(html, "test-frame-current"));
  ok("§1.3 target slot testid", has(html, "test-frame-target"));
  ok("§1.4 gap slot testid", has(html, "test-frame-gap"));
  ok("§1.5 action slot testid", has(html, "test-frame-recommended-action"));
  ok("§1.6 expected slot testid", has(html, "test-frame-expected-outcome"));
  ok("§1.7 do-nothing slot testid", has(html, "test-frame-do-nothing"));
  ok("§1.8 status chip rendered", has(html, "test-frame-current-status"));
  ok("§1.9 CTA rendered", has(html, "test-frame-recommended-action-cta"));
  ok("§1.10 NO em-dash in default render", !html.includes(">—<"));
  ok("§1.11 NO 'Incomplete' rendered", !html.includes("Incomplete"));
}

/* §2 Empty slots collapse */
{
  const html = renderToStaticMarkup(
    React.createElement(DecisionFrame, {
      testidPrefix: "empty-frame",
      currentPosition: { label: "Current NW", value: "$2.5M" },
      // Other slots intentionally undefined or set to empty values
      targetPosition: { label: "Target NW", value: "—" } as any,
      gap: { label: "Gap", value: "Incomplete" } as any,
    }),
  );
  ok("§2.1 root present (still has currentPosition)", has(html, "empty-frame"));
  ok("§2.2 current slot rendered", has(html, "empty-frame-current"));
  ok("§2.3 target slot HIDDEN (value '—')", !has(html, "empty-frame-target"));
  ok("§2.4 gap slot HIDDEN (value 'Incomplete')", !has(html, "empty-frame-gap"));
  ok("§2.5 action slot HIDDEN (undefined)", !has(html, "empty-frame-recommended-action"));
  ok("§2.6 expected slot HIDDEN (undefined)", !has(html, "empty-frame-expected-outcome"));
  ok("§2.7 do-nothing slot HIDDEN (undefined)", !has(html, "empty-frame-do-nothing"));
  ok("§2.8 no '—' in DOM", !html.includes(">—<"));
}

/* §3 Fully empty frame returns null */
{
  const html = renderToStaticMarkup(
    React.createElement(DecisionFrame, { testidPrefix: "none-frame" } as any),
  );
  ok("§3.1 fully empty frame renders empty (no root testid)", !has(html, "none-frame"));
}

/* §4 isEmptyValue covers spec strings */
{
  ok("§4.1 isEmptyValue(undefined)", isEmptyValue(undefined));
  ok("§4.2 isEmptyValue(null)", isEmptyValue(null));
  ok("§4.3 isEmptyValue('')", isEmptyValue(""));
  ok("§4.4 isEmptyValue('—')", isEmptyValue("—"));
  ok("§4.5 isEmptyValue('Incomplete')", isEmptyValue("Incomplete"));
  ok("§4.6 isEmptyValue('Missing Data')", isEmptyValue("Missing Data"));
  ok("§4.7 isEmptyValue('N/A')", isEmptyValue("N/A"));
  ok("§4.8 isEmptyValue('NaN')", isEmptyValue("NaN"));
  ok("§4.9 isEmptyValue(NaN)", isEmptyValue(NaN));
  ok("§4.10 isEmptyValue('0')", isEmptyValue("0"));
  ok("§4.11 isEmptyValue('$0')", isEmptyValue("$0"));
  ok("§4.12 isEmptyValue('hello') === false", isEmptyValue("hello") === false);
  ok("§4.13 isEmptyValue(0) === false (a raw number 0 may still be meaningful)", isEmptyValue(0) === false);
  ok("§4.14 isEmptyValue(1) === false", isEmptyValue(1) === false);
}

/* §5 hideOrCollapse / nullIfEmpty */
{
  ok("§5.1 hideOrCollapse('—') => undefined", hideOrCollapse("—") === undefined);
  ok("§5.2 hideOrCollapse('hello') => 'hello'", hideOrCollapse("hello") === "hello");
  ok("§5.3 nullIfEmpty('') => undefined", nullIfEmpty("") === undefined);
  ok("§5.4 nullIfEmpty(42) => 42", nullIfEmpty(42) === 42);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFailures:");
  for (const f of failures) console.error(f);
  process.exit(1);
}
process.exit(0);
