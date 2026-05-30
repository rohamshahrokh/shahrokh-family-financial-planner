/**
 * goal-closure-lab.tsx — Sprint 28.
 *
 * Goal Closure Lab is replaced by the new /action-roadmap flagship page (see
 * SPRINT28_ARCHITECTURE.md §1). The route in App.tsx now redirects directly,
 * so this file exists only as a fallback in case the page is mounted by any
 * remaining import path. It immediately redirects to /action-roadmap.
 */
import { Redirect } from "wouter";

export default function GoalClosureLabPage() {
  return <Redirect to="/action-roadmap" />;
}
