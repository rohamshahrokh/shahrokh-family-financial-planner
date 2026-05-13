/**
 * B3 — Scenario Tree View
 *
 * Expandable tree clustering the ranked candidates by family.
 * Families are derived deterministically from candidate IDs/labels:
 *
 *   Base (no-action plan)
 *     ETF
 *     Property
 *       IO (interest-only)
 *       P&I
 *     Crypto
 *     Super
 *     Offset
 *     Hybrid (multi-asset)
 *
 * Each leaf shows the candidate's rank, score, P50 NW and risk class.
 * Clicking a leaf calls onSelect — workspace switches Risk Rail to that
 * scenario.
 *
 * Engine data only — no fabricated grouping.
 */
import { useMemo, useState } from "react";
import { ChevronRight, ChevronDown, Crown } from "lucide-react";
import type { RankedCandidate, QuickDecisionOutput } from "@/lib/scenarioV2/decisionEngine/candidateGenerator";
import {
  LABEL_CLS, MICRO_CLS, NUM_CLS, PANEL_HEADING_CLS,
  POS_TEXT, NEG_TEXT,
} from "../workspaceTokens";
import { cn } from "@/lib/utils";

export interface ScenarioTreeViewProps {
  output: QuickDecisionOutput;
  selectedId: string | null;
  onSelect: (id: string) => void;
  fmt: {
    fmt$M: (n: number) => string;
    pct: (n: number, d?: number) => string;
  };
}

type FamilyKey =
  | "etf" | "property-io" | "property-pi" | "crypto"
  | "super" | "offset" | "hybrid" | "other";

interface TreeNode {
  key: string;
  label: string;
  children: TreeNode[];
  leaf?: {
    candidate: RankedCandidate;
    rank: number;
    isWinner: boolean;
  };
}

function classify(c: RankedCandidate): FamilyKey {
  const id = c.id.toLowerCase();
  const label = c.label.toLowerCase();
  const blob = id + " " + label;

  // Hybrid first — multi-asset takes priority
  if (/etf\d|etf_\d|offset\d|super\d|crypto\d|hybrid/.test(id) && countAssetMentions(blob) >= 2) {
    return "hybrid";
  }
  if (blob.includes("property") || blob.includes("deposit")) {
    if (blob.includes("io") || blob.includes("interest-only") || blob.includes("interest_only")) return "property-io";
    return "property-pi";
  }
  if (blob.includes("crypto") || blob.includes("btc")) return "crypto";
  if (blob.includes("super") || blob.includes("concessional")) return "super";
  if (blob.includes("offset")) return "offset";
  if (blob.includes("etf") || blob.includes("dca")) return "etf";
  return "other";
}

function countAssetMentions(s: string): number {
  let n = 0;
  if (s.includes("etf")) n++;
  if (s.includes("offset")) n++;
  if (s.includes("super")) n++;
  if (s.includes("crypto")) n++;
  if (s.includes("property") || s.includes("deposit")) n++;
  return n;
}

const FAMILY_LABEL: Record<FamilyKey, string> = {
  etf: "ETF",
  "property-io": "Property · IO",
  "property-pi": "Property · P&I",
  crypto: "Crypto",
  super: "Super",
  offset: "Offset",
  hybrid: "Hybrid (multi-asset)",
  other: "Other",
};

const FAMILY_ORDER: FamilyKey[] = ["etf", "property-pi", "property-io", "super", "offset", "crypto", "hybrid", "other"];

export function ScenarioTreeView({ output, selectedId, onSelect, fmt }: ScenarioTreeViewProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(["root", "Property"]));

  const tree: TreeNode = useMemo(() => {
    const byFamily: Record<FamilyKey, { c: RankedCandidate; rank: number }[]> = {
      etf: [], "property-io": [], "property-pi": [], crypto: [],
      super: [], offset: [], hybrid: [], other: [],
    };
    output.ranked.forEach((c, i) => {
      byFamily[classify(c)].push({ c, rank: i + 1 });
    });

    // Build property bucket as a parent node when both IO and P&I exist.
    const propertyIoLeaves = byFamily["property-io"];
    const propertyPiLeaves = byFamily["property-pi"];
    const propertyChildren: TreeNode[] = [];
    if (propertyPiLeaves.length > 0) {
      propertyChildren.push({
        key: "Property/P&I",
        label: "P&I (Principal + Interest)",
        children: propertyPiLeaves.map(({ c, rank }) => ({
          key: c.id, label: c.label, children: [],
          leaf: { candidate: c, rank, isWinner: rank === 1 },
        })),
      });
    }
    if (propertyIoLeaves.length > 0) {
      propertyChildren.push({
        key: "Property/IO",
        label: "IO (Interest-Only)",
        children: propertyIoLeaves.map(({ c, rank }) => ({
          key: c.id, label: c.label, children: [],
          leaf: { candidate: c, rank, isWinner: rank === 1 },
        })),
      });
    }

    const familyNodes: TreeNode[] = [];

    for (const fk of FAMILY_ORDER) {
      if (fk === "property-io" || fk === "property-pi") continue;
      const items = byFamily[fk];
      if (items.length === 0) continue;
      familyNodes.push({
        key: fk,
        label: FAMILY_LABEL[fk],
        children: items.map(({ c, rank }) => ({
          key: c.id, label: c.label, children: [],
          leaf: { candidate: c, rank, isWinner: rank === 1 },
        })),
      });
    }

    if (propertyChildren.length > 0) {
      familyNodes.splice(1, 0, {
        key: "Property",
        label: "Property",
        children: propertyChildren,
      });
    }

    return {
      key: "root",
      label: "Base plan",
      children: familyNodes,
    };
  }, [output.ranked]);

  function toggle(key: string) {
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
  }

  return (
    <div className="space-y-2" data-testid="scenario-tree-view">
      <div>
        <h3 className={PANEL_HEADING_CLS}>Scenario tree</h3>
        <p className={MICRO_CLS}>
          {output.ranked.length} ranked paths grouped by asset family
        </p>
      </div>
      <div className="border border-border rounded-md bg-card/95 dark:bg-card/70 p-2 max-h-[600px] overflow-y-auto">
        <TreeBranch
          node={tree}
          depth={0}
          expanded={expanded}
          toggle={toggle}
          selectedId={selectedId}
          onSelect={onSelect}
          fmt={fmt}
        />
      </div>
    </div>
  );
}

function TreeBranch({
  node, depth, expanded, toggle, selectedId, onSelect, fmt,
}: {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  toggle: (k: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  fmt: ScenarioTreeViewProps["fmt"];
}) {
  const isOpen = expanded.has(node.key);
  const isLeaf = node.leaf != null;
  const indent = depth * 12;

  if (isLeaf && node.leaf) {
    const { candidate, rank, isWinner } = node.leaf;
    const isSelected = selectedId === candidate.id;
    const p50 = candidate.result.terminalNwSorted[Math.floor(candidate.result.terminalNwSorted.length * 0.5)] ?? 0;
    const survival = 1 - candidate.result.defaultProbability;
    return (
      <button
        onClick={() => onSelect(candidate.id)}
        className={cn(
          "w-full text-left flex items-center gap-1.5 py-1 pr-1 rounded transition-colors",
          isSelected ? "bg-muted/80" : "hover:bg-muted/40",
        )}
        style={{ paddingLeft: indent + 18 }}
      >
        <span className={cn("text-[10px] uppercase tracking-wide w-5", NUM_CLS, "text-muted-foreground")}>#{rank}</span>
        {isWinner && <Crown className="h-2.5 w-2.5 text-emerald-600 dark:text-emerald-400 shrink-0" />}
        <span className={cn("flex-1 truncate text-[11px]", isWinner && "font-semibold", isSelected && "font-medium")}>
          {candidate.label}
        </span>
        <span className={cn("text-[10px] shrink-0", NUM_CLS)}>{fmt.fmt$M(p50)}</span>
        <span className={cn(
          "text-[10px] shrink-0 w-10 text-right",
          NUM_CLS,
          survival >= 0.95 ? POS_TEXT : survival >= 0.85 ? "text-amber-700 dark:text-amber-300" : NEG_TEXT,
        )}>
          {fmt.pct(survival, 0)}
        </span>
      </button>
    );
  }

  return (
    <div className="space-y-0.5">
      <button
        onClick={() => toggle(node.key)}
        className="w-full text-left flex items-center gap-1.5 py-1 hover:bg-muted/40 rounded transition-colors"
        style={{ paddingLeft: indent }}
      >
        {isOpen ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
        <span className={cn(
          "text-[11px] font-medium",
          depth === 0 ? "uppercase tracking-wide text-[10px] text-muted-foreground" : "",
        )}>{node.label}</span>
        <span className="text-[10px] text-muted-foreground ml-1">({countLeaves(node)})</span>
      </button>
      {isOpen && node.children.map((child) => (
        <TreeBranch
          key={child.key}
          node={child}
          depth={depth + 1}
          expanded={expanded}
          toggle={toggle}
          selectedId={selectedId}
          onSelect={onSelect}
          fmt={fmt}
        />
      ))}
    </div>
  );
}

function countLeaves(node: TreeNode): number {
  if (node.leaf) return 1;
  let n = 0;
  for (const c of node.children) n += countLeaves(c);
  return n;
}
