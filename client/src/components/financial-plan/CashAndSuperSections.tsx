/**
 * CashAndSuperSections.tsx
 *
 * Cash Allocation + Superannuation input forms — moved out of Settings as
 * part of the May-2026 input consolidation. These are the canonical input
 * forms for the corresponding fields on the central sf_snapshot row, and
 * they live alongside the rest of Financial Plan / Financial Centre.
 *
 * Settings must NOT re-host these forms; doing so would re-introduce the
 * duplicated-state regression this refactor exists to fix.
 *
 * Implementation note: the layout and field set is preserved as-is from the
 * original Settings implementation so behaviour is unchanged. We swapped the
 * adminOnly-section wrapper for a plain card and reuse the surrounding
 * Financial Plan styling.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import SaveButton from "@/components/SaveButton";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { DollarSign, Briefcase, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ─── Investment option → growth rate mapping ──────────────────────────────────
const OPTION_GROWTH: Record<string, number> = {
  "High Growth": 9.5,
  "Growth": 8.0,
  "Balanced": 7.0,
  "Conservative": 5.5,
  "Cash": 3.5,
  "Custom": 0,
};
const SUPER_OPTIONS = ["High Growth", "Growth", "Balanced", "Conservative", "Cash", "Custom"];

function PlainCard({
  title, icon: Icon, children,
}: { title: string; icon: React.ComponentType<any>; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-bold">{title}</h2>
      </div>
      {children}
    </div>
  );
}

// ─── Per-person super form ────────────────────────────────────────────────────
function SuperPersonForm({
  prefix, label, data, onChange, annualIncome,
}: {
  prefix: "roham" | "fara";
  label: string;
  data: Record<string, any>;
  onChange: (k: string, v: any) => void;
  annualIncome: number;
}) {
  const n = (k: string) => `${prefix}_${k}`;
  const sgRate = parseFloat(data[n("employer_contrib")]) || 11.5;
  const salary = parseFloat(data[n("super_salary")]) || annualIncome;
  const impliedEmpAmt = (salary * sgRate / 100) / 12;

  const handleOptionChange = (opt: string) => {
    onChange(n("super_option"), opt);
    if (opt !== "Custom") onChange(n("super_growth_rate"), OPTION_GROWTH[opt]);
  };

  return (
    <div className="rounded-xl border border-border bg-secondary/20 p-4 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
          style={{ background: "hsl(43,85%,55%)", color: "hsl(224,40%,8%)" }}
        >
          {label.slice(0, 2).toUpperCase()}
        </div>
        <span className="text-sm font-bold">{label}</span>
      </div>

      <div>
        <p className="text-xs font-semibold text-primary/80 uppercase tracking-wide mb-2">Current Position</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Current Balance ($)</label>
            <Input type="number" value={data[n("super_balance")] || ""} step={1000} min={0}
              onChange={e => onChange(n("super_balance"), parseFloat(e.target.value) || 0)}
              className="h-8 text-sm mt-1 num-display font-semibold" placeholder="e.g. 85000" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Investment Option</label>
            <Select value={data[n("super_option")] || "High Growth"} onValueChange={handleOptionChange}>
              <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SUPER_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Fund / Provider (optional)</label>
            <Input type="text" value={data[n("super_provider")] || ""}
              onChange={e => onChange(n("super_provider"), e.target.value)}
              className="h-8 text-sm mt-1" placeholder="e.g. AustralianSuper" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Retirement Access Age</label>
            <Input type="number" value={data[n("retirement_age")] || 60} min={55} max={70} step={1}
              onChange={e => onChange(n("retirement_age"), parseFloat(e.target.value) || 60)}
              className="h-8 text-sm mt-1 num-display" />
          </div>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-primary/80 uppercase tracking-wide mb-2">Employer Contributions</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Annual Salary ($)</label>
            <Input type="number" value={data[n("super_salary")] || ""} step={1000} min={0}
              onChange={e => onChange(n("super_salary"), parseFloat(e.target.value) || 0)}
              className="h-8 text-sm mt-1 num-display" placeholder={`e.g. ${Math.round(annualIncome)}`} />
            <p className="text-xs text-muted-foreground/60 mt-0.5">Gross annual (pre-tax). Defaults to household income split if blank.</p>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">SG Rate % <span className="text-muted-foreground/60">(defaults 11.5%)</span></label>
            <Input type="number" value={data[n("employer_contrib")] || 11.5} step={0.5} min={0} max={30}
              onChange={e => onChange(n("employer_contrib"), parseFloat(e.target.value) || 11.5)}
              className="h-8 text-sm mt-1 num-display" />
            <p className="text-xs text-emerald-400/70 mt-0.5">
              = {impliedEmpAmt > 0 ? `$${Math.round(impliedEmpAmt).toLocaleString()}/mo` : "—"} per month
            </p>
          </div>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-primary/80 uppercase tracking-wide mb-2">Extra Contributions (Optional)</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Salary Sacrifice (annual $)</label>
            <Input type="number" value={data[n("salary_sacrifice")] || ""} step={500} min={0}
              onChange={e => onChange(n("salary_sacrifice"), parseFloat(e.target.value) || 0)}
              className="h-8 text-sm mt-1 num-display" placeholder="0" />
            <p className="text-xs text-muted-foreground/60 mt-0.5">Pre-tax concessional contribution</p>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Personal After-Tax (annual $)</label>
            <Input type="number" value={data[n("super_personal_contrib")] || ""} step={500} min={0}
              onChange={e => onChange(n("super_personal_contrib"), parseFloat(e.target.value) || 0)}
              className="h-8 text-sm mt-1 num-display" placeholder="0" />
            <p className="text-xs text-muted-foreground/60 mt-0.5">Non-concessional contribution</p>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Annual One-Off Top-Up ($)</label>
            <Input type="number" value={data[n("super_annual_topup")] || ""} step={500} min={0}
              onChange={e => onChange(n("super_annual_topup"), parseFloat(e.target.value) || 0)}
              className="h-8 text-sm mt-1 num-display" placeholder="0" />
            <p className="text-xs text-muted-foreground/60 mt-0.5">Spouse contribution, co-contribution, etc.</p>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Insurance inside Super ($/yr)</label>
            <Input type="number" value={data[n("super_insurance_pa")] || ""} step={100} min={0}
              onChange={e => onChange(n("super_insurance_pa"), parseFloat(e.target.value) || 0)}
              className="h-8 text-sm mt-1 num-display" placeholder="0" />
            <p className="text-xs text-muted-foreground/60 mt-0.5">Annual premium deducted from super</p>
          </div>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-primary/80 uppercase tracking-wide mb-2">Forecast Settings</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Expected Annual Return %</label>
            <Input type="number" value={data[n("super_growth_rate")] || 8} step={0.5} min={0} max={25}
              onChange={e => onChange(n("super_growth_rate"), parseFloat(e.target.value) || 8)}
              className="h-8 text-sm mt-1 num-display" />
            {data[n("super_option")] && data[n("super_option")] !== "Custom" && (
              <p className="text-xs text-primary/60 mt-0.5">Auto-set from {data[n("super_option")]} option</p>
            )}
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Annual Fee %</label>
            <Input type="number" value={data[n("super_fee_pct")] || 0.5} step={0.05} min={0} max={5}
              onChange={e => onChange(n("super_fee_pct"), parseFloat(e.target.value) || 0)}
              className="h-8 text-sm mt-1 num-display" />
            <p className="text-xs text-muted-foreground/60 mt-0.5">Management & admin fee on balance</p>
          </div>
        </div>
      </div>

      <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-xs space-y-1">
        <div className="flex items-center gap-1.5 text-primary/70">
          <Info className="w-3 h-3" /> <span className="font-semibold">Projected annual formula</span>
        </div>
        <p className="text-muted-foreground">
          Opening + Employer SG ({sgRate}% × salary) + Salary Sacrifice + Personal + Top-Up
          <br />− Fees ({data[n("super_fee_pct")] || 0.5}% of balance) − Insurance
          <br />+ Growth ({data[n("super_growth_rate")] || 8}% on net balance)
          <br />= Closing Balance
        </p>
      </div>
    </div>
  );
}

// ─── Superannuation card ──────────────────────────────────────────────────────
export function SuperSection() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: snapshotRaw } = useQuery<any>({
    queryKey: ["/api/snapshot"],
    queryFn: () => apiRequest("GET", "/api/snapshot").then(r => r.json()),
    staleTime: 0,
  });

  const DEFAULT_SUPER = {
    roham_super_balance: 0, roham_super_salary: 0, roham_employer_contrib: 11.5,
    roham_salary_sacrifice: 0, roham_super_personal_contrib: 0, roham_super_annual_topup: 0,
    roham_super_growth_rate: 8.0, roham_super_fee_pct: 0.5, roham_super_insurance_pa: 0,
    roham_super_option: "High Growth", roham_super_provider: "", roham_retirement_age: 60,
    fara_super_balance: 0, fara_super_salary: 0, fara_employer_contrib: 11.5,
    fara_salary_sacrifice: 0, fara_super_personal_contrib: 0, fara_super_annual_topup: 0,
    fara_super_growth_rate: 8.0, fara_super_fee_pct: 0.5, fara_super_insurance_pa: 0,
    fara_super_option: "High Growth", fara_super_provider: "", fara_retirement_age: 60,
  };

  const [draft, setDraft] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const serverSuper = snapshotRaw ? { ...DEFAULT_SUPER, ...snapshotRaw } : DEFAULT_SUPER;
  const data = draft ?? serverSuper;
  const onChange = (key: string, val: any) => {
    setDraft((prev: any) => ({ ...(prev ?? serverSuper), [key]: val }));
  };
  const annualIncome = (snapshotRaw?.monthly_income || 22000) * 12;

  const handleSave = async () => {
    const payload = draft ?? serverSuper;
    setSaving(true);
    try {
      const allSuperKeys = [
        "roham_super_balance", "roham_super_salary", "roham_employer_contrib",
        "roham_salary_sacrifice", "roham_super_personal_contrib", "roham_super_annual_topup",
        "roham_super_growth_rate", "roham_super_fee_pct", "roham_super_insurance_pa",
        "roham_super_option", "roham_super_provider", "roham_retirement_age",
        "fara_super_balance", "fara_super_salary", "fara_employer_contrib",
        "fara_salary_sacrifice", "fara_super_personal_contrib", "fara_super_annual_topup",
        "fara_super_growth_rate", "fara_super_fee_pct", "fara_super_insurance_pa",
        "fara_super_option", "fara_super_provider", "fara_retirement_age",
      ];
      const superPayload: Record<string, any> = {};
      for (const k of allSuperKeys) {
        if (payload[k] !== undefined) superPayload[k] = payload[k];
      }
      await apiRequest("PUT", "/api/snapshot", superPayload);
      await qc.refetchQueries({ queryKey: ["/api/snapshot"] });
      setDraft(null);
      toast({ title: "Saved Successfully", description: "Superannuation settings saved." });
    } catch (err: any) {
      toast({ title: "Save Failed", description: err?.message ?? "Error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <PlainCard title="Superannuation" icon={Briefcase}>
      <div className="rounded-lg bg-secondary/30 border border-border/50 p-3 text-xs text-muted-foreground space-y-1">
        <p>
          Configure super balances, contributions, and forecast assumptions for both members. These values flow directly
          into the Net Worth Projection, Dashboard, FIRE calculator, and Monte Carlo simulations.
        </p>
        <p>
          Super is tracked separately as{" "}
          <strong className="text-foreground">Locked Retirement Wealth</strong> — it is NOT counted as accessible cash.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mt-2">
        <SuperPersonForm prefix="roham" label="Roham Shahrokh" data={data} onChange={onChange}
          annualIncome={annualIncome * 0.7} />
        <SuperPersonForm prefix="fara" label="Fara Ghiyasi" data={data} onChange={onChange}
          annualIncome={annualIncome * 0.3} />
      </div>

      <SaveButton label={saving ? "Saving..." : "Save Superannuation Settings"} onSave={handleSave} />
    </PlainCard>
  );
}

// ─── Cash Allocation card ─────────────────────────────────────────────────────
export function CashAllocationSection() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: snapshotRaw } = useQuery<any>({
    queryKey: ["/api/snapshot"],
    queryFn: () => apiRequest("GET", "/api/snapshot").then(r => r.json()),
    staleTime: 0,
  });

  const DEFAULT_CASH = { savings_cash: 0, emergency_cash: 0, other_cash: 0 };
  const [draft, setDraft] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const serverCash = snapshotRaw ? { ...DEFAULT_CASH, ...snapshotRaw } : DEFAULT_CASH;
  const data = draft ?? serverCash;

  const field = (key: string) => ({
    value: data[key] ?? 0,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setDraft({ ...(draft ?? serverCash), [key]: parseFloat(e.target.value) || 0 });
    },
  });

  const handleSave = async () => {
    if (!draft) { toast({ title: "No changes to save" }); return; }
    setSaving(true);
    try {
      const payload: Record<string, number> = {
        savings_cash:   draft.savings_cash   ?? 0,
        emergency_cash: draft.emergency_cash ?? 0,
        other_cash:     draft.other_cash     ?? 0,
      };
      await apiRequest("PUT", "/api/snapshot", payload);
      await qc.refetchQueries({ queryKey: ["/api/snapshot"] });
      setDraft(null);
      toast({ title: "Saved Successfully", description: "Cash allocation updated." });
    } catch (err: any) {
      toast({ title: "Save Failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <PlainCard title="Cash Allocation" icon={DollarSign}>
      <div className="rounded-lg bg-secondary/30 border border-border/50 p-3 text-xs text-muted-foreground space-y-1 mb-4">
        <p>
          Break down your cash across accounts. <strong className="text-foreground">Cash (Everyday)</strong> in the
          Dashboard snapshot is used for Net Worth. These allocation fields feed the cash breakdown panels and
          engine inputs.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="text-xs text-muted-foreground block mb-1.5">Savings Account</label>
          <Input type="number" className="h-9 text-sm" {...field("savings_cash")} />
          <p className="text-[11px] text-muted-foreground mt-1">High-interest savings or term deposit</p>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1.5">Emergency Fund</label>
          <Input type="number" className="h-9 text-sm" {...field("emergency_cash")} />
          <p className="text-[11px] text-muted-foreground mt-1">Liquid emergency reserve (3–6 months expenses)</p>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1.5">Other Cash</label>
          <Input type="number" className="h-9 text-sm" {...field("other_cash")} />
          <p className="text-[11px] text-muted-foreground mt-1">Any other cash not counted above</p>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between pt-3 border-t border-border/40">
        <div className="text-xs text-muted-foreground">
          Total breakdown:{" "}
          <span className="text-foreground font-semibold">
            $
            {((data.savings_cash ?? 0) + (data.emergency_cash ?? 0) + (data.other_cash ?? 0)).toLocaleString("en-AU", {
              maximumFractionDigits: 0,
            })}
          </span>
        </div>
        <div className="flex gap-2">
          {draft && (
            <Button variant="ghost" size="sm" onClick={() => setDraft(null)} disabled={saving}>
              Cancel
            </Button>
          )}
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </PlainCard>
  );
}
