/**
 * V3 — Investor Behaviour & Priorities slider panel.
 *
 * Eleven 1-10 sliders, grouped into four UX clusters. Each slider's value is
 * translated into a scoring-weight delta by `applyPrioritiesToWeights()` in
 * the registry — this component is pure UI. Sliders default to neutral (5)
 * so existing users see no behaviour change unless they configure priorities.
 */

import { useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  Shield,
  Heart,
  Coins,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Info,
} from "lucide-react";
import {
  PRIORITY_REGISTRY,
  DEFAULT_PRIORITIES,
  isDefaultPriorities,
  type BehaviouralPriorities,
  type PriorityKey,
  type PrioritySpec,
} from "@/lib/scenarioV2/registry";

interface Group {
  id: PrioritySpec["group"];
  label: string;
  subtitle: string;
  icon: React.ReactNode;
}

const GROUPS: Group[] = [
  { id: "growth",         label: "Growth & wealth",      subtitle: "Compounding speed and return",       icon: <TrendingUp className="h-3.5 w-3.5" /> },
  { id: "safety",         label: "Safety & resilience",  subtitle: "Survival and stability priorities",  icon: <Shield className="h-3.5 w-3.5" /> },
  { id: "liquidity_flex", label: "Liquidity & flexibility", subtitle: "Cash access and optionality",     icon: <Coins className="h-3.5 w-3.5" /> },
  { id: "tax_family",     label: "Tax & family",         subtitle: "Tax efficiency and dependants",      icon: <Heart className="h-3.5 w-3.5" /> },
];

export interface BehaviouralPrioritiesPanelProps {
  value: BehaviouralPriorities;
  onChange: (v: BehaviouralPriorities) => void;
  /** Whether the panel starts expanded. Defaults to collapsed on mobile. */
  defaultExpanded?: boolean;
}

export function BehaviouralPrioritiesPanel({
  value,
  onChange,
  defaultExpanded = false,
}: BehaviouralPrioritiesPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const activeCount = Object.entries(value).filter(([, v]) => v !== 5).length;
  const allNeutral = isDefaultPriorities(value);

  const setOne = (key: PriorityKey, v: number) => {
    onChange({ ...value, [key]: v });
  };
  const resetAll = () => onChange({ ...DEFAULT_PRIORITIES });

  return (
    <Card className="border-[hsl(var(--intelligence)/0.30)]" data-testid="behavioural-priorities-panel">
      <CardHeader className="pb-3">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          className="w-full text-left"
        >
          <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
            <Info className="h-4 w-4 text-[hsl(var(--intelligence-light))]" />
            <span>Investor behaviour &amp; priorities</span>
            {!allNeutral && (
              <Badge variant="outline" className="text-[10px] font-medium border-[hsl(var(--intelligence)/0.40)] text-[hsl(var(--intelligence-light))]">
                {activeCount} active
              </Badge>
            )}
            <span className="ml-auto text-muted-foreground">
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </span>
          </CardTitle>
          <CardDescription className="text-xs leading-snug">
            Eleven 1–10 sliders shape how the engine ranks paths. Leave all at 5 for neutral behaviour, or tune them to express what you actually care about.
          </CardDescription>
        </button>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 space-y-5">
          {GROUPS.map((g) => {
            const items: PrioritySpec[] = Object.values(PRIORITY_REGISTRY).filter((p) => p.group === g.id);
            if (items.length === 0) return null;
            return (
              <div key={g.id} className="space-y-3">
                <div className="flex items-center gap-2 pb-1 border-b border-border">
                  <span className="text-[hsl(var(--intelligence-light))]">{g.icon}</span>
                  <div>
                    <div className="text-xs sm:text-sm font-semibold">{g.label}</div>
                    <div className="text-[10px] text-muted-foreground leading-snug">{g.subtitle}</div>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3">
                  {items.map((spec) => {
                    const v = value[spec.key] ?? 5;
                    return (
                      <PrioritySliderRow
                        key={spec.key}
                        spec={spec}
                        value={v}
                        onChange={(next) => setOne(spec.key, next)}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
            <div className="text-[10px] text-muted-foreground leading-snug">
              Priorities re-weight the composite score within ±25% of the profile base — the underlying Monte Carlo and serviceability math is unchanged.
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={resetAll}
              disabled={allNeutral}
              className="text-[11px] gap-1.5 h-8"
              data-testid="behavioural-priorities-reset"
            >
              <RotateCcw className="h-3 w-3" />
              Reset to neutral
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function PrioritySliderRow({
  spec,
  value,
  onChange,
}: {
  spec: PrioritySpec;
  value: number;
  onChange: (v: number) => void;
}) {
  const isActive = value !== 5;
  return (
    <div className="space-y-1" data-testid={`priority-row-${spec.key}`}>
      <div className="flex items-center justify-between gap-2">
        <Label
          className="text-[11px] sm:text-xs font-medium flex items-center gap-1.5"
          title={spec.description}
        >
          <span className="truncate">{spec.label}</span>
        </Label>
        <span className={`text-[11px] tabular-nums font-semibold ${isActive ? "text-[hsl(var(--intelligence-light))]" : "text-muted-foreground"}`}>
          {value}/10
        </span>
      </div>
      <Slider
        value={[value]}
        min={1}
        max={10}
        step={1}
        onValueChange={([n]) => onChange(n)}
        aria-label={spec.label}
      />
      <div className="text-[10px] text-muted-foreground leading-snug">
        {value >= 7 ? spec.whatHigherDoes : value <= 3 ? spec.whatLowerDoes : spec.description}
      </div>
    </div>
  );
}
