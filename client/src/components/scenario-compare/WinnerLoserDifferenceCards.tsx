/**
 * WinnerLoserDifferenceCards — Sprint 12 Phase 4.
 *
 * Three cards side-by-side:
 *   Winner card   — best scenario name + ΔNW / ΔPI / ΔP(FF) vs base
 *   Loser card    — worst scenario name + the matching deltas (sign-flipped)
 *   Difference    — total spread "$X swing in NW · Z% swing in P(FF)"
 *
 * Reads scenario results that the existing scenario-compare-v2 engine already
 * produces — no new engine. The component is told which is base, winner, loser
 * via props so it doesn't re-rank internally.
 */

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Trophy, TrendingDown, GitCompare } from "lucide-react";
import { formatCurrency } from "@/lib/finance";
import { isEmptyValue } from "@/lib/uiEmptyField";

export interface ScenarioMetricRef {
  scenarioId: string;
  name: string;
  netWorthP50: number | null;
  passiveIncomeP50?: number | null;
  probability?: number | null;
}

interface Props {
  base: ScenarioMetricRef | null;
  winner: ScenarioMetricRef | null;
  loser: ScenarioMetricRef | null;
}

function fmt$M(v: number | null | undefined): string | null {
  if (v == null || !Number.isFinite(v)) return null;
  return formatCurrency(v, true);
}

function signedM(v: number | null | undefined): string | null {
  if (v == null || !Number.isFinite(v) || v === 0) return null;
  const sign = v > 0 ? "+ " : "− ";
  return `${sign}${formatCurrency(Math.abs(v), true)}`;
}

function pctSigned(v: number | null | undefined): string | null {
  if (v == null || !Number.isFinite(v) || v === 0) return null;
  return `${v > 0 ? "+" : "−"}${Math.round(Math.abs(v) * 100)}%`;
}

interface CardKind {
  testid: string;
  label: string;
  icon: React.ReactNode;
  ring: string;
  tone: string;
  name: string;
  facts: { label: string; value: string | null; testid: string }[];
}

function ScenarioCard({ kind }: { kind: CardKind }) {
  const visible = kind.facts.filter((f) => !isEmptyValue(f.value));
  if (isEmptyValue(kind.name) && visible.length === 0) return null;
  return (
    <Card className={`p-4 ${kind.ring}`} data-testid={kind.testid}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${kind.tone}`}>
          {kind.icon}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          {kind.label}
        </span>
      </div>
      {!isEmptyValue(kind.name) ? (
        <div className="text-base font-semibold text-foreground" data-testid={`${kind.testid}-name`}>
          {kind.name}
        </div>
      ) : null}
      {visible.length > 0 ? (
        <ul className="text-xs mt-2 space-y-1">
          {visible.map((f, i) => (
            <li
              key={`${kind.testid}-fact-${i}`}
              className="flex justify-between gap-2"
              data-testid={f.testid}
            >
              <span className="text-muted-foreground">{f.label}</span>
              <span className="font-semibold tabular-nums text-foreground">{f.value}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

export function WinnerLoserDifferenceCards({ base, winner, loser }: Props) {
  const deltaNw = (a: ScenarioMetricRef | null, b: ScenarioMetricRef | null): number | null => {
    if (!a || !b) return null;
    if (a.netWorthP50 == null || b.netWorthP50 == null) return null;
    return a.netWorthP50 - b.netWorthP50;
  };
  const deltaPi = (a: ScenarioMetricRef | null, b: ScenarioMetricRef | null): number | null => {
    if (!a || !b) return null;
    if (a.passiveIncomeP50 == null || b.passiveIncomeP50 == null) return null;
    return a.passiveIncomeP50 - b.passiveIncomeP50;
  };
  const deltaProb = (a: ScenarioMetricRef | null, b: ScenarioMetricRef | null): number | null => {
    if (!a || !b) return null;
    if (a.probability == null || b.probability == null) return null;
    return a.probability - b.probability;
  };

  const winnerVsBase = {
    nw: deltaNw(winner, base),
    pi: deltaPi(winner, base),
    p: deltaProb(winner, base),
  };
  const loserVsBase = {
    nw: deltaNw(loser, base),
    pi: deltaPi(loser, base),
    p: deltaProb(loser, base),
  };
  const spreadNw =
    winner && loser && winner.netWorthP50 != null && loser.netWorthP50 != null
      ? winner.netWorthP50 - loser.netWorthP50
      : null;
  const spreadProb =
    winner && loser && winner.probability != null && loser.probability != null
      ? winner.probability - loser.probability
      : null;

  const winnerCard: CardKind = {
    testid: "sc-winner-card",
    label: "Winner",
    icon: <Trophy className="h-4 w-4" />,
    ring: "border-emerald-500/30 bg-emerald-500/5",
    tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    name: winner?.name ?? "",
    facts: [
      { label: "Δ NW vs base", value: signedM(winnerVsBase.nw), testid: "sc-winner-card-nw-delta" },
      { label: "Δ Passive Income", value: signedM(winnerVsBase.pi), testid: "sc-winner-card-pi-delta" },
      { label: "Δ P(FF)", value: pctSigned(winnerVsBase.p), testid: "sc-winner-card-prob-delta" },
    ],
  };

  const loserCard: CardKind = {
    testid: "sc-loser-card",
    label: "Loser",
    icon: <TrendingDown className="h-4 w-4" />,
    ring: "border-rose-500/30 bg-rose-500/5",
    tone: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
    name: loser?.name ?? "",
    facts: [
      { label: "Δ NW vs base", value: signedM(loserVsBase.nw), testid: "sc-loser-card-nw-delta" },
      { label: "Δ Passive Income", value: signedM(loserVsBase.pi), testid: "sc-loser-card-pi-delta" },
      { label: "Δ P(FF)", value: pctSigned(loserVsBase.p), testid: "sc-loser-card-prob-delta" },
    ],
  };

  const differenceCard: CardKind = {
    testid: "sc-difference-card",
    label: "Difference",
    icon: <GitCompare className="h-4 w-4" />,
    ring: "border-indigo-500/30 bg-indigo-500/5",
    tone: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
    name: "Winner – Loser spread",
    facts: [
      { label: "NW swing", value: signedM(spreadNw), testid: "sc-difference-card-nw-spread" },
      { label: "P(FF) swing", value: pctSigned(spreadProb), testid: "sc-difference-card-prob-spread" },
    ],
  };

  const anyVisible = winner || loser;
  if (!anyVisible) return null;

  return (
    <section className="grid grid-cols-1 md:grid-cols-3 gap-3" data-testid="sc-winner-loser-difference">
      <ScenarioCard kind={winnerCard} />
      <ScenarioCard kind={loserCard} />
      <ScenarioCard kind={differenceCard} />
    </section>
  );
}

export default WinnerLoserDifferenceCards;
