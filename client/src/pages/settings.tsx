import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import SaveButton from "@/components/SaveButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAppStore } from "@/lib/store";
import {
  Settings as SettingsIcon, Download, Upload, RefreshCw, User, Moon, Sun, Shield,
  Send, Bell, BellOff, CheckCircle2, XCircle, MessageSquare, Heart, Clock,
  Zap, TrendingDown, AlertTriangle, CreditCard, DollarSign, BarChart2, Lock,
  UserPlus, KeyRound, UserCheck, UserX, ChevronDown, ChevronUp, Eye, EyeOff,
  Briefcase, TrendingUp, Info,
} from "lucide-react";
import * as XLSX from "xlsx";
import { sendTestMessage, sendBrowserPush, invalidateSettingsCache } from "@/lib/notifications";

// ─── Toggle Row helper ────────────────────────────────────────────────────────

function ToggleRow({
  label, desc, checked, onChange,
}: { label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-5.5 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-secondary'}`}
        style={{ minWidth: 40, height: 22 }}
        aria-pressed={checked}
      >
        <span
          className="absolute top-0.5 left-0.5 w-4.5 h-4.5 bg-white rounded-full shadow transition-transform"
          style={{ width: 18, height: 18, transform: checked ? 'translateX(18px)' : 'translateX(0)' }}
        />
      </button>
    </div>
  );
}

// ─── Section card ─────────────────────────────────────────────────────────────

function SectionCard({
  title, icon: Icon, children, adminOnly, isAdmin,
}: {
  title: string;
  icon: React.ComponentType<any>;
  children: React.ReactNode;
  adminOnly?: boolean;
  isAdmin?: boolean;
}) {
  // Locked state for non-admin users on admin-only sections
  if (adminOnly && !isAdmin) {
    return (
      <div className="rounded-xl border border-border/50 bg-card/50 p-4 opacity-70">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
          <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
            <Lock className="w-3 h-3" /> Admin only
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          This section is restricted to admin. Contact Roham to make changes.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-bold">{title}</h2>
        {adminOnly && isAdmin && (
          <span className="ml-auto flex items-center gap-1 text-xs text-primary/60 bg-primary/10 px-2 py-0.5 rounded-full">
            <Shield className="w-3 h-3" /> Admin
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

// ─── User Management components (defined outside SettingsPage to avoid re-render focus loss) ─────

function PwdInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? 'New password'}
        className="h-8 text-sm pr-8 font-mono"
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow(s => !s)}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      >
        {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

function UserRow({ user, onSaved }: { user: any; onSaved: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [pwdField, setPwdField] = useState('');
  const [displayName, setDisplayName] = useState(user.display_name);
  const [role, setRole] = useState(user.role);
  const [active, setActive] = useState(user.active);
  const [notes, setNotes] = useState(user.notes ?? '');
  const [saving, setSaving] = useState(false);

  const roleBadgeStyle = role === 'admin'
    ? 'bg-primary/15 text-primary border-primary/30'
    : 'bg-secondary text-muted-foreground border-border/50';

  const handleSave = async () => {
    if (!displayName.trim()) { toast({ title: 'Display name is required', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const payload: any = { display_name: displayName, role, active, notes };
      if (pwdField.trim()) payload.password = pwdField.trim();
      await apiRequest('PUT', `/api/users/${user.id}`, payload).then(r => r.json());
      qc.invalidateQueries({ queryKey: ['/api/users'] });
      setPwdField('');
      setExpanded(false);
      onSaved();
      toast({ title: 'Saved Successfully', description: `User "${displayName}" updated.` });
    } catch (err: any) {
      toast({ title: 'Save Failed', description: err?.message ?? 'Supabase error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`rounded-lg border transition-all ${
      expanded ? 'border-primary/40 bg-primary/5' : 'border-border/50 bg-secondary/20'
    }`}>
      {/* Header row */}
      <div className="flex items-center gap-3 p-3">
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
          style={{ background: 'hsl(43,85%,55%)', color: 'hsl(224,40%,8%)' }}>
          {(displayName || user.username).slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{displayName}</p>
          <p className="text-xs text-muted-foreground">@{user.username}</p>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full border flex-shrink-0 ${roleBadgeStyle}`}>{role}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
          active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
        }`}>{active ? 'Active' : 'Disabled'}</span>
        <button
          onClick={() => setExpanded(e => !e)}
          className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Expanded edit form */}
      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-border/40 pt-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Display Name</label>
              <Input value={displayName} onChange={e => setDisplayName(e.target.value)} className="h-8 text-sm mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Role</label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="family_user">Family User</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">New Password <span className="text-muted-foreground/60">(leave blank to keep current)</span></label>
              <div className="mt-1">
                <PwdInput value={pwdField} onChange={setPwdField} />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Notes</label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} className="h-8 text-sm mt-1" placeholder="Optional" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Account Active</span>
              <button
                onClick={() => setActive((a: boolean) => !a)}
                className={`relative w-10 rounded-full transition-colors ${active ? 'bg-primary' : 'bg-secondary'}`}
                style={{ minWidth: 40, height: 22 }}
                aria-pressed={active}
              >
                <span
                  className="absolute top-0.5 bg-white rounded-full shadow transition-transform"
                  style={{ width: 18, height: 18, left: 2, transform: active ? 'translateX(18px)' : 'translateX(0)' }}
                />
              </button>
            </div>
            <div className="flex-1" />
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setExpanded(false)}>Cancel</Button>
            <Button size="sm" className="h-7 text-xs gap-1.5" onClick={handleSave} disabled={saving}
              style={{ background: 'hsl(43,85%,55%)', color: 'hsl(224,40%,8%)', border: 'none' }}>
              {saving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <KeyRound className="w-3 h-3" />}
              Save Changes
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

const ADD_USER_INITIAL = { username: '', display_name: '', password: '', role: 'family_user', notes: '' };

function AddUserForm({ onAdded }: { onAdded: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState(ADD_USER_INITIAL);
  const [saving, setSaving] = useState(false);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleAdd = async () => {
    if (!form.username.trim()) { toast({ title: 'Username is required', variant: 'destructive' }); return; }
    if (!form.display_name.trim()) { toast({ title: 'Display name is required', variant: 'destructive' }); return; }
    if (!form.password.trim()) { toast({ title: 'Password is required', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      await apiRequest('POST', '/api/users', {
        username: form.username.trim().toLowerCase(),
        display_name: form.display_name.trim(),
        password: form.password.trim(),
        role: form.role,
        notes: form.notes,
      }).then(r => r.json());
      qc.invalidateQueries({ queryKey: ['/api/users'] });
      setForm(ADD_USER_INITIAL);
      onAdded();
      toast({ title: 'Saved Successfully', description: `User "${form.display_name}" created.` });
    } catch (err: any) {
      toast({ title: 'Save Failed', description: err?.message ?? 'Supabase error. Username may already exist.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4 space-y-3">
      <p className="text-xs font-semibold text-primary flex items-center gap-1.5"><UserPlus className="w-3.5 h-3.5" /> New User</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Username</label>
          <Input value={form.username} onChange={e => set('username', e.target.value)} className="h-8 text-sm mt-1" placeholder="fara" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Display Name</label>
          <Input value={form.display_name} onChange={e => set('display_name', e.target.value)} className="h-8 text-sm mt-1" placeholder="Fara Ghiyasi" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Password</label>
          <div className="mt-1">
            <PwdInput value={form.password} onChange={v => set('password', v)} placeholder="Initial password" />
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Role</label>
          <Select value={form.role} onValueChange={v => set('role', v)}>
            <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="family_user">Family User</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Notes <span className="text-muted-foreground/60">(optional)</span></label>
        <Input value={form.notes} onChange={e => set('notes', e.target.value)} className="h-8 text-sm mt-1" placeholder="e.g. Fara's account" />
      </div>
      <div className="flex justify-end">
        <Button size="sm" className="h-8 text-xs gap-1.5" onClick={handleAdd} disabled={saving}
          style={{ background: 'hsl(43,85%,55%)', color: 'hsl(224,40%,8%)', border: 'none' }}>
          {saving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
          Create User
        </Button>
      </div>
    </div>
  );
}

function UserManagementSection({ isAdmin }: { isAdmin: boolean }) {
  const [showAddForm, setShowAddForm] = useState(false);

  const { data: users = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ['/api/users'],
    queryFn: () => apiRequest('GET', '/api/users').then(r => r.json()),
    staleTime: 0,
    enabled: isAdmin,
  });

  if (!isAdmin) {
    return (
      <div className="rounded-xl border border-border/50 bg-card/50 p-4 opacity-70">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-muted-foreground">User Management</h2>
          <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
            <Lock className="w-3 h-3" /> Admin only
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-2">This section is restricted to admin. Contact Roham to make changes.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Shield className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-bold">User Management</h2>
        <span className="ml-auto flex items-center gap-1 text-xs text-primary/60 bg-primary/10 px-2 py-0.5 rounded-full">
          <Shield className="w-3 h-3" /> Admin
        </span>
      </div>

      <div className="rounded-lg bg-secondary/30 border border-border/50 p-3 text-xs text-muted-foreground space-y-1">
        <p>Manage all family app users. Changes are written directly to Supabase — no code changes required.</p>
        <p>Family users cannot change admin settings, API keys, Telegram tokens, or other users' passwords.</p>
      </div>

      {isLoading ? (
        <div className="text-xs text-muted-foreground animate-pulse">Loading users from Supabase...</div>
      ) : users.length === 0 ? (
        <div className="text-xs text-muted-foreground">No users found in sf_users table.</div>
      ) : (
        <div className="space-y-2">
          {(users as any[]).map((u: any) => (
            <UserRow key={u.id} user={u} onSaved={() => refetch()} />
          ))}
        </div>
      )}

      {showAddForm ? (
        <AddUserForm onAdded={() => { setShowAddForm(false); refetch(); }} />
      ) : (
        <Button
          size="sm" variant="outline"
          className="w-full h-8 text-xs gap-1.5 border-dashed"
          onClick={() => setShowAddForm(true)}
        >
          <UserPlus className="w-3.5 h-3.5" /> Add New User
        </Button>
      )}
    </div>
  );
}


// ─── Investment option → growth rate mapping ──────────────────────────────────
const OPTION_GROWTH: Record<string, number> = {
  'High Growth':   9.5,
  'Growth':        8.0,
  'Balanced':      7.0,
  'Conservative':  5.5,
  'Cash':          3.5,
  'Custom':        0,   // user sets manually
};

const SUPER_OPTIONS = ['High Growth', 'Growth', 'Balanced', 'Conservative', 'Cash', 'Custom'];
const CONTRIB_FREQS = ['weekly', 'fortnightly', 'monthly', 'quarterly', 'annual'];

// Convert employer contribution amount + frequency → annual $
function toAnnual(amount: number, freq: string): number {
  const map: Record<string, number> = {
    weekly: 52, fortnightly: 26, monthly: 12, quarterly: 4, annual: 1,
  };
  return amount * (map[freq] ?? 12);
}

// ─── Per-person super form ────────────────────────────────────────────────────
function SuperPersonForm({
  prefix,
  label,
  data,
  onChange,
  annualIncome,
}: {
  prefix: 'roham' | 'fara';
  label: string;
  data: Record<string, any>;
  onChange: (k: string, v: any) => void;
  annualIncome: number;
}) {
  const n = (k: string) => `${prefix}_${k}`;

  // Smart default: if employer_contrib_amount is blank, compute from salary × SG%
  const sgRate        = parseFloat(data[n('employer_contrib')])   || 11.5;
  const salary        = parseFloat(data[n('super_salary')])       || annualIncome;
  const impliedEmpAmt = (salary * sgRate / 100) / 12; // monthly amount

  // When option changes, auto-populate growth rate unless user picked Custom
  const handleOptionChange = (opt: string) => {
    onChange(n('super_option'), opt);
    if (opt !== 'Custom') onChange(n('super_growth_rate'), OPTION_GROWTH[opt]);
  };

  return (
    <div className="rounded-xl border border-border bg-secondary/20 p-4 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
          style={{ background: 'hsl(43,85%,55%)', color: 'hsl(224,40%,8%)' }}>
          {label.slice(0, 2).toUpperCase()}
        </div>
        <span className="text-sm font-bold">{label}</span>
      </div>

      {/* ── Current Position ────────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold text-primary/80 uppercase tracking-wide mb-2">Current Position</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Current Balance ($)</label>
            <Input type="number" value={data[n('super_balance')] || ''} step={1000} min={0}
              onChange={e => onChange(n('super_balance'), parseFloat(e.target.value) || 0)}
              className="h-8 text-sm mt-1 num-display font-semibold" placeholder="e.g. 85000" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Investment Option</label>
            <Select value={data[n('super_option')] || 'High Growth'} onValueChange={handleOptionChange}>
              <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SUPER_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Fund / Provider (optional)</label>
            <Input type="text" value={data[n('super_provider')] || ''}
              onChange={e => onChange(n('super_provider'), e.target.value)}
              className="h-8 text-sm mt-1" placeholder="e.g. AustralianSuper" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Retirement Access Age</label>
            <Input type="number" value={data[n('retirement_age')] || 60} min={55} max={70} step={1}
              onChange={e => onChange(n('retirement_age'), parseFloat(e.target.value) || 60)}
              className="h-8 text-sm mt-1 num-display" />
          </div>
        </div>
      </div>

      {/* ── Employer Contributions ──────────────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold text-primary/80 uppercase tracking-wide mb-2">Employer Contributions</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Annual Salary ($)</label>
            <Input type="number" value={data[n('super_salary')] || ''} step={1000} min={0}
              onChange={e => onChange(n('super_salary'), parseFloat(e.target.value) || 0)}
              className="h-8 text-sm mt-1 num-display" placeholder={`e.g. ${Math.round(annualIncome)}`} />
            <p className="text-xs text-muted-foreground/60 mt-0.5">Gross annual (pre-tax). Defaults to household income split if blank.</p>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">SG Rate % <span className="text-muted-foreground/60">(defaults 11.5%)</span></label>
            <Input type="number" value={data[n('employer_contrib')] || 11.5} step={0.5} min={0} max={30}
              onChange={e => onChange(n('employer_contrib'), parseFloat(e.target.value) || 11.5)}
              className="h-8 text-sm mt-1 num-display" />
            <p className="text-xs text-emerald-400/70 mt-0.5">
              = {impliedEmpAmt > 0 ? `$${Math.round(impliedEmpAmt).toLocaleString()}/mo` : '—'} per month
            </p>
          </div>
        </div>
      </div>

      {/* ── Extra Contributions ─────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold text-primary/80 uppercase tracking-wide mb-2">Extra Contributions (Optional)</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Salary Sacrifice (annual $)</label>
            <Input type="number" value={data[n('salary_sacrifice')] || ''} step={500} min={0}
              onChange={e => onChange(n('salary_sacrifice'), parseFloat(e.target.value) || 0)}
              className="h-8 text-sm mt-1 num-display" placeholder="0" />
            <p className="text-xs text-muted-foreground/60 mt-0.5">Pre-tax concessional contribution</p>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Personal After-Tax (annual $)</label>
            <Input type="number" value={data[n('super_personal_contrib')] || ''} step={500} min={0}
              onChange={e => onChange(n('super_personal_contrib'), parseFloat(e.target.value) || 0)}
              className="h-8 text-sm mt-1 num-display" placeholder="0" />
            <p className="text-xs text-muted-foreground/60 mt-0.5">Non-concessional contribution</p>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Annual One-Off Top-Up ($)</label>
            <Input type="number" value={data[n('super_annual_topup')] || ''} step={500} min={0}
              onChange={e => onChange(n('super_annual_topup'), parseFloat(e.target.value) || 0)}
              className="h-8 text-sm mt-1 num-display" placeholder="0" />
            <p className="text-xs text-muted-foreground/60 mt-0.5">Spouse contribution, co-contribution, etc.</p>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Insurance inside Super ($/yr)</label>
            <Input type="number" value={data[n('super_insurance_pa')] || ''} step={100} min={0}
              onChange={e => onChange(n('super_insurance_pa'), parseFloat(e.target.value) || 0)}
              className="h-8 text-sm mt-1 num-display" placeholder="0" />
            <p className="text-xs text-muted-foreground/60 mt-0.5">Annual premium deducted from super</p>
          </div>
        </div>
      </div>

      {/* ── Forecast Settings ───────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold text-primary/80 uppercase tracking-wide mb-2">Forecast Settings</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Expected Annual Return %</label>
            <Input type="number" value={data[n('super_growth_rate')] || 8} step={0.5} min={0} max={25}
              onChange={e => onChange(n('super_growth_rate'), parseFloat(e.target.value) || 8)}
              className="h-8 text-sm mt-1 num-display" />
            {data[n('super_option')] && data[n('super_option')] !== 'Custom' && (
              <p className="text-xs text-primary/60 mt-0.5">
                Auto-set from {data[n('super_option')]} option
              </p>
            )}
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Annual Fee %</label>
            <Input type="number" value={data[n('super_fee_pct')] || 0.5} step={0.05} min={0} max={5}
              onChange={e => onChange(n('super_fee_pct'), parseFloat(e.target.value) || 0)}
              className="h-8 text-sm mt-1 num-display" />
            <p className="text-xs text-muted-foreground/60 mt-0.5">Management & admin fee on balance</p>
          </div>
        </div>
      </div>

      {/* ── Summary chip ────────────────────────────────────────────────── */}
      <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-xs space-y-1">
        <div className="flex items-center gap-1.5 text-primary/70"><Info className="w-3 h-3" /> <span className="font-semibold">Projected annual formula</span></div>
        <p className="text-muted-foreground">
          Opening + Employer SG ({sgRate}% × salary) + Salary Sacrifice + Personal + Top-Up
          <br/>− Fees ({data[n('super_fee_pct')] || 0.5}% of balance) − Insurance
          <br/>+ Growth ({data[n('super_growth_rate')] || 8}% on net balance)
          <br/>= Closing Balance
        </p>
      </div>
    </div>
  );
}

// ─── Super settings section ───────────────────────────────────────────────────
function SuperSection({
  isAdmin, qc, toast,
}: {
  isAdmin: boolean;
  qc: ReturnType<typeof useQueryClient>;
  toast: ReturnType<typeof useToast>['toast'];
}) {
  const { data: snapshotRaw } = useQuery<any>({
    queryKey: ['/api/snapshot'],
    queryFn: () => apiRequest('GET', '/api/snapshot').then(r => r.json()),
    staleTime: 0,
  });

  // All super fields for both persons — start from snapshot values
  const DEFAULT_SUPER = {
    roham_super_balance:          0,
    roham_super_salary:           0,
    roham_employer_contrib:       11.5,
    roham_salary_sacrifice:       0,
    roham_super_personal_contrib: 0,
    roham_super_annual_topup:     0,
    roham_super_growth_rate:      8.0,
    roham_super_fee_pct:          0.5,
    roham_super_insurance_pa:     0,
    roham_super_option:           'High Growth',
    roham_super_provider:         '',
    roham_retirement_age:         60,
    fara_super_balance:           0,
    fara_super_salary:            0,
    fara_employer_contrib:        11.5,
    fara_salary_sacrifice:        0,
    fara_super_personal_contrib:  0,
    fara_super_annual_topup:      0,
    fara_super_growth_rate:       8.0,
    fara_super_fee_pct:           0.5,
    fara_super_insurance_pa:      0,
    fara_super_option:            'High Growth',
    fara_super_provider:          '',
    fara_retirement_age:          60,
  };

  const [draft, setDraft] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  // Merge server data once loaded — local draft takes precedence
  const serverSuper = snapshotRaw ? { ...DEFAULT_SUPER, ...snapshotRaw } : DEFAULT_SUPER;
  const data = draft ?? serverSuper;

  const onChange = (key: string, val: any) => {
    setDraft((prev: any) => ({ ...(prev ?? serverSuper), [key]: val }));
  };

  const annualIncome = (snapshotRaw?.monthly_income || 22000) * 12;

  const handleSave = async () => {
    if (!draft) { toast({ title: 'No changes to save' }); return; }
    setSaving(true);
    try {
      // UPSERT snapshot with super fields only — backend merges via PATCH
      await apiRequest('PUT', '/api/snapshot', { ...snapshotRaw, ...draft });
      qc.invalidateQueries({ queryKey: ['/api/snapshot'] });
      setDraft(null);
      toast({ title: 'Saved Successfully', description: 'Superannuation settings saved to Supabase.' });
    } catch (err: any) {
      toast({ title: 'Save Failed', description: err?.message ?? 'Supabase error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard title="Superannuation" icon={Briefcase} adminOnly isAdmin={isAdmin}>
      <div className="rounded-lg bg-secondary/30 border border-border/50 p-3 text-xs text-muted-foreground space-y-1">
        <p>Configure super balances, contributions, and forecast assumptions for both members. These values flow directly into the Net Worth Projection, Dashboard, FIRE calculator, and Monte Carlo simulations.</p>
        <p>Super is tracked separately as <strong className="text-foreground">Locked Retirement Wealth</strong> — it is NOT counted as accessible cash.</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mt-2">
        <SuperPersonForm
          prefix="roham"
          label="Roham Shahrokh"
          data={data}
          onChange={onChange}
          annualIncome={annualIncome * 0.7}
        />
        <SuperPersonForm
          prefix="fara"
          label="Fara Ghiyasi"
          data={data}
          onChange={onChange}
          annualIncome={annualIncome * 0.3}
        />
      </div>

      <SaveButton
        label={saving ? 'Saving...' : 'Save Superannuation Settings'}
        onSave={handleSave}
      />
    </SectionCard>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { toast } = useToast();
  const { theme, toggleTheme, role } = useAppStore();
  const isAdmin = role === "admin";
  const qc = useQueryClient();

  // ── General settings ──────────────────────────────────────────────────────
  // ── App-wide settings: loaded from Supabase on mount ───────────────────────
  const DEFAULT_ASSUMPTIONS = {
    inflation: 3, ppor_growth: 6, super_return: 8, safe_withdrawal_rate: 4, risk_profile: 'moderate',
  };
  const DEFAULT_USER = {
    display_name: 'Roham Shahrokh', currency: 'AUD', timezone: 'Australia/Brisbane', notifications: true,
  };

  // Fetch all app settings from Supabase (sf_app_settings id='default')
  const { data: appSettings } = useQuery({
    queryKey: ['/api/app-settings'],
    queryFn: () => apiRequest('GET', '/api/app-settings').then(r => r.json()),
    staleTime: 0,
  });

  // Local edit state — null = "not yet modified by user this session"
  const [assumptionsEdit, setAssumptionsEdit] = useState<any>(null);
  const [userSettingsEdit, setUserSettingsEdit] = useState<any>(null);

  // Effective values: local edit > Supabase > hardcoded defaults
  const assumptions = assumptionsEdit ??
    (appSettings?.assumptions ? { ...DEFAULT_ASSUMPTIONS, ...appSettings.assumptions } : DEFAULT_ASSUMPTIONS);
  const userSettings = userSettingsEdit ??
    (appSettings?.user_settings ? { ...DEFAULT_USER, ...appSettings.user_settings } : DEFAULT_USER);

  function setAssumptions(val: any) { setAssumptionsEdit(val); }
  function setUserSettings(val: any) { setUserSettingsEdit(val); }

  // ── Telegram / notification settings ─────────────────────────────────────
  const { data: tgData, isLoading: tgLoading } = useQuery({
    queryKey: ['/api/telegram-settings'],
    queryFn: () => apiRequest('GET', '/api/telegram-settings').then(r => r.json()),
  });

  const defaultTg = {
    enabled: false,
    bot_token: '', roham_chat_id: '', fara_chat_id: '',
    alert_large_expense: true, large_expense_threshold: 300,
    alert_budget_warning: true, budget_warning_pct: 80,
    alert_budget_exceeded: true, alert_cashflow: true,
    alert_mortgage_due: true, alert_bills_due: true,
    alert_salary_missing: true, alert_income_received: false,
    alert_weekly_summary: true, alert_buy_zone: false,
    alert_portfolio_drop: true, portfolio_drop_pct: 6,
    alert_duplicate_tx: true, alert_deposit_ready: true,
    family_msgs_enabled: false,
    family_msgs_morning: true, family_msgs_midday: true, family_msgs_evening: true,
    family_msgs_morning_time: '08:00', family_msgs_midday_time: '12:30', family_msgs_evening_time: '20:30',
    family_msgs_language: 'English', family_msgs_recipient: 'Both',
    family_msgs_paused: false, push_enabled: false,
  };

  const [tg, setTg] = useState<any>(null);
  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'ok' | 'fail'>('idle');

  // Merge server data into local state once loaded.
  // Coerce null DB values to empty strings so controlled inputs don't flip uncontrolled.
  const tgFromServer = tgData
    ? {
        ...defaultTg,
        ...tgData,
        bot_token:      tgData.bot_token      ?? '',
        roham_chat_id:  tgData.roham_chat_id  ?? '',
        fara_chat_id:   tgData.fara_chat_id   ?? '',
      }
    : defaultTg;
  const tgSettings = tg ?? tgFromServer;

  const saveTg = useMutation({
    mutationFn: (data: any) => apiRequest('PUT', '/api/telegram-settings', data).then(r => r.json()),
    onSuccess: () => {
      invalidateSettingsCache();
      qc.invalidateQueries({ queryKey: ['/api/telegram-settings'] });
      // Reset local tg state so next read comes from fresh Supabase tgData
      setTg(null);
      toast({ title: 'Saved Successfully', description: 'Notification settings saved to Supabase.' });
    },
    onError: (err: any) => toast({
      title: 'Save Failed — Settings NOT saved',
      description: err?.message ?? 'Supabase returned an error. Check console.',
      variant: 'destructive',
    }),
  });

  const handleTgChange = (key: string, value: any) => {
    setTg((prev: any) => ({ ...(prev ?? tgSettings), [key]: value }));
  };

  const handleTestTelegram = async () => {
    if (!tgSettings.bot_token) { toast({ title: 'Missing Bot Token', variant: 'destructive' }); return; }
    setTestStatus('sending');
    const result = await sendTestMessage({
      bot_token: tgSettings.bot_token,
      roham_chat_id: tgSettings.roham_chat_id,
      fara_chat_id: tgSettings.fara_chat_id,
    });
    setTestStatus(result.ok ? 'ok' : 'fail');
    toast({
      title: result.ok ? 'Test Sent!' : 'Test Failed',
      description: result.ok ? 'Check your Telegram.' : result.error,
      variant: result.ok ? 'default' : 'destructive',
    });
    setTimeout(() => setTestStatus('idle'), 3000);
  };

  const handleTestPush = async () => {
    await sendBrowserPush('Shahrokh Family Planner', 'Push notifications are working!');
    toast({ title: 'Push sent', description: 'Check your browser notifications.' });
  };

  // ── Data export/restore ───────────────────────────────────────────────────
  const handleExportAll = () => {
    Promise.all([
      apiRequest('GET', '/api/snapshot').then(r => r.json()),
      apiRequest('GET', '/api/expenses').then(r => r.json()),
      apiRequest('GET', '/api/properties').then(r => r.json()),
      apiRequest('GET', '/api/stocks').then(r => r.json()),
      apiRequest('GET', '/api/crypto').then(r => r.json()),
      apiRequest('GET', '/api/bills').then(r => r.json()),
      apiRequest('GET', '/api/budgets').then(r => r.json()),
    ]).then(([snapshot, expenses, properties, stocks, crypto, bills, budgets]) => {
      const backup = {
        version: '2.0', exported_at: new Date().toISOString(), family: 'Shahrokh',
        snapshot, expenses, properties, stocks, crypto, bills, budgets,
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Shahrokh_Backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Backup Downloaded', description: 'Full data backup saved.' });
    });
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const backup = JSON.parse(ev.target?.result as string);
        if (backup.snapshot) await apiRequest('PUT', '/api/snapshot', backup.snapshot);
        qc.invalidateQueries();
        toast({ title: 'Backup Restored', description: 'All data has been restored.' });
      } catch {
        toast({ title: 'Import Failed', description: 'Invalid backup file.', variant: 'destructive' });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-5 pb-8 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm">Configure your financial planner, notifications, and Telegram alerts</p>
      </div>

      {/* ── User Preferences ─────────────────────────────────────────────── */}
      <SectionCard title="User Preferences" icon={User} isAdmin={isAdmin}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Display Name</label>
            <Input value={userSettings.display_name} onChange={e => setUserSettings({ ...userSettings, display_name: e.target.value })} className="h-8 text-sm mt-1" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Currency</label>
            <Select value={userSettings.currency} onValueChange={v => setUserSettings({ ...userSettings, currency: v })}>
              <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="AUD">AUD — Australian Dollar</SelectItem>
                <SelectItem value="USD">USD — US Dollar</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Timezone</label>
            <Input value={userSettings.timezone} readOnly className="h-8 text-sm mt-1 opacity-60" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Theme</label>
            <div className="flex gap-2 mt-1">
              <Button size="sm" variant={theme === 'dark' ? 'default' : 'outline'} className="gap-1.5 flex-1 h-8"
                onClick={() => theme !== 'dark' && toggleTheme()}
                style={theme === 'dark' ? { background: 'hsl(43,85%,55%)', color: 'hsl(224,40%,8%)', border: 'none' } : {}}>
                <Moon className="w-3.5 h-3.5" /> Dark
              </Button>
              <Button size="sm" variant={theme === 'light' ? 'default' : 'outline'} className="gap-1.5 flex-1 h-8"
                onClick={() => theme !== 'light' && toggleTheme()}
                style={theme === 'light' ? { background: 'hsl(43,85%,45%)', color: 'white', border: 'none' } : {}}>
                <Sun className="w-3.5 h-3.5" /> Light
              </Button>
            </div>
          </div>
        </div>
        <SaveButton label="Save Settings" onSave={async () => {
          try {
            await apiRequest('PATCH', '/api/app-settings', { user_settings: userSettings });
            setUserSettingsEdit(null);
            qc.invalidateQueries({ queryKey: ['/api/app-settings'] });
          } catch (err: any) {
            throw new Error(err?.message ?? 'Failed to save user settings to Supabase');
          }
        }} />
      </SectionCard>

      {/* ── Telegram Bot Configuration ───────────────────────────────────── */}
      <SectionCard title={`Telegram Bot${tgLoading ? ' — Loading…' : ''}`} icon={Send} adminOnly isAdmin={isAdmin}>
        <div className="rounded-lg bg-secondary/30 p-3 text-xs text-muted-foreground space-y-1 border border-border/50">
          <p className="font-semibold text-foreground">Setup Guide</p>
          <p>1. Open Telegram → search <strong>@BotFather</strong> → send <code>/newbot</code> → copy the token below</p>
          <p>2. Start a chat with your bot, send any message, then visit:</p>
          <p><code>https://api.telegram.org/bot&#123;TOKEN&#125;/getUpdates</code> → copy your chat_id</p>
        </div>
        <ToggleRow label="Enable Telegram Alerts" checked={tgSettings.enabled} onChange={v => handleTgChange('enabled', v)} />
        <div className="grid gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Bot Token</label>
            <Input type="password" value={tgSettings.bot_token} onChange={e => handleTgChange('bot_token', e.target.value)}
              className="h-8 text-sm mt-1 font-mono" placeholder="123456789:ABCdef..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Roham Chat ID</label>
              <Input value={tgSettings.roham_chat_id} onChange={e => handleTgChange('roham_chat_id', e.target.value)}
                className="h-8 text-sm mt-1 font-mono" placeholder="-100123456789" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Fara Chat ID</label>
              <Input value={tgSettings.fara_chat_id} onChange={e => handleTgChange('fara_chat_id', e.target.value)}
                className="h-8 text-sm mt-1 font-mono" placeholder="-100123456789" />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={handleTestTelegram} disabled={testStatus === 'sending'}>
            {testStatus === 'sending' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> :
             testStatus === 'ok'      ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> :
             testStatus === 'fail'    ? <XCircle className="w-3.5 h-3.5 text-red-400" /> :
             <Send className="w-3.5 h-3.5" />}
            {testStatus === 'sending' ? 'Sending...' : 'Test Message'}
          </Button>
          <SaveButton label="Save Telegram Settings" onSave={async () => saveTg.mutateAsync(tgSettings)} />
        </div>
      </SectionCard>

      {/* ── Alert Toggles ────────────────────────────────────────────────── */}
      <SectionCard title="Alert Thresholds & Toggles" icon={Bell} adminOnly isAdmin={isAdmin}>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-xs text-muted-foreground">Large Expense Threshold ($)</label>
            <Input type="number" value={tgSettings.large_expense_threshold} onChange={e => handleTgChange('large_expense_threshold', parseFloat(e.target.value))}
              className="h-8 text-sm mt-1" min={0} step={50} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Budget Warning Threshold (%)</label>
            <Input type="number" value={tgSettings.budget_warning_pct} onChange={e => handleTgChange('budget_warning_pct', parseFloat(e.target.value))}
              className="h-8 text-sm mt-1" min={50} max={100} step={5} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Portfolio Drop Alert (%)</label>
            <Input type="number" value={tgSettings.portfolio_drop_pct} onChange={e => handleTgChange('portfolio_drop_pct', parseFloat(e.target.value))}
              className="h-8 text-sm mt-1" min={1} max={50} step={0.5} />
          </div>
        </div>

        <div className="space-y-0">
          <ToggleRow label="Large Expense Alert" desc={`Trigger when expense > $${tgSettings.large_expense_threshold}`} checked={tgSettings.alert_large_expense} onChange={v => handleTgChange('alert_large_expense', v)} />
          <ToggleRow label="Budget Warning" desc="Alert at 80% of monthly budget" checked={tgSettings.alert_budget_warning} onChange={v => handleTgChange('alert_budget_warning', v)} />
          <ToggleRow label="Budget Exceeded" desc="Alert when category goes over budget" checked={tgSettings.alert_budget_exceeded} onChange={v => handleTgChange('alert_budget_exceeded', v)} />
          <ToggleRow label="Negative Cashflow" desc="Alert if this month goes negative" checked={tgSettings.alert_cashflow} onChange={v => handleTgChange('alert_cashflow', v)} />
          <ToggleRow label="Mortgage Due" desc="Remind before mortgage payment" checked={tgSettings.alert_mortgage_due} onChange={v => handleTgChange('alert_mortgage_due', v)} />
          <ToggleRow label="Bills Due Reminder" desc="Remind before any recurring bill is due" checked={tgSettings.alert_bills_due} onChange={v => handleTgChange('alert_bills_due', v)} />
          <ToggleRow label="Income Received" desc="Notify when income is logged" checked={tgSettings.alert_income_received} onChange={v => handleTgChange('alert_income_received', v)} />
          <ToggleRow label="Missing Salary Alert" desc="Alert if expected salary not received this fortnight" checked={tgSettings.alert_salary_missing} onChange={v => handleTgChange('alert_salary_missing', v)} />
          <ToggleRow label="Weekly CFO Summary" desc="Weekly spending + savings digest" checked={tgSettings.alert_weekly_summary} onChange={v => handleTgChange('alert_weekly_summary', v)} />
          <ToggleRow label="Portfolio Drop Alert" desc={`Alert when portfolio drops > ${tgSettings.portfolio_drop_pct}%`} checked={tgSettings.alert_portfolio_drop} onChange={v => handleTgChange('alert_portfolio_drop', v)} />
          <ToggleRow label="Duplicate Transactions" desc="Alert when duplicates detected" checked={tgSettings.alert_duplicate_tx} onChange={v => handleTgChange('alert_duplicate_tx', v)} />
          <ToggleRow label="Deposit Ready Alert" desc="Alert when deposit target reached" checked={tgSettings.alert_deposit_ready} onChange={v => handleTgChange('alert_deposit_ready', v)} />
        </div>
        <SaveButton label="Save Alert Settings" onSave={async () => saveTg.mutateAsync(tgSettings)} />
      </SectionCard>

      {/* ── Family Messages ──────────────────────────────────────────────── */}
      <SectionCard title="Daily Family Messages" icon={Heart} adminOnly isAdmin={isAdmin}>
        <div className="rounded-lg bg-amber-950/20 border border-amber-800/30 p-3 text-xs text-amber-200/80">
          <p className="font-semibold text-amber-200 mb-1">About Family Messages</p>
          <p>Send 3 warm, meaningful messages per day to Roham, Fara, or both via Telegram — reminding you why you are building wealth together. Uses a 100+ built-in message library. No AI cost.</p>
        </div>
        <ToggleRow label="Enable Daily Family Messages" checked={tgSettings.family_msgs_enabled} onChange={v => handleTgChange('family_msgs_enabled', v)} />
        <ToggleRow label="Pause Messages" desc="Temporarily pause without disabling" checked={tgSettings.family_msgs_paused} onChange={v => handleTgChange('family_msgs_paused', v)} />

        <div className="grid grid-cols-3 gap-2 mt-2">
          {[
            { key: 'family_msgs_morning', label: 'Morning', timeKey: 'family_msgs_morning_time' },
            { key: 'family_msgs_midday',  label: 'Midday',  timeKey: 'family_msgs_midday_time'  },
            { key: 'family_msgs_evening', label: 'Evening', timeKey: 'family_msgs_evening_time'  },
          ].map(({ key, label, timeKey }) => (
            <div key={key} className={`rounded-lg border p-3 transition-all ${tgSettings[key] ? 'border-primary bg-primary/5' : 'border-border bg-secondary/20'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold">{label}</span>
                <button onClick={() => handleTgChange(key, !tgSettings[key])}
                  className={`w-8 h-4 rounded-full transition-colors ${tgSettings[key] ? 'bg-primary' : 'bg-secondary'} relative`}>
                  <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${tgSettings[key] ? 'left-4.5' : 'left-0.5'}`}
                    style={{ left: tgSettings[key] ? 18 : 2 }} />
                </button>
              </div>
              <Input type="time" value={tgSettings[timeKey]} onChange={e => handleTgChange(timeKey, e.target.value)}
                className="h-7 text-xs" disabled={!tgSettings[key]} />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 mt-1">
          <div>
            <label className="text-xs text-muted-foreground">Message Language</label>
            <Select value={tgSettings.family_msgs_language} onValueChange={v => handleTgChange('family_msgs_language', v)}>
              <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="English">English</SelectItem>
                <SelectItem value="Persian">Persian (Farsi)</SelectItem>
                <SelectItem value="Mixed">Mixed English/Persian</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Recipient</label>
            <Select value={tgSettings.family_msgs_recipient} onValueChange={v => handleTgChange('family_msgs_recipient', v)}>
              <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Roham">Roham</SelectItem>
                <SelectItem value="Fara">Fara</SelectItem>
                <SelectItem value="Both">Both</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {/* ── Scheduler Status Panel ───────────────────────────────────────── */}
        <div className="rounded-lg border border-border bg-secondary/10 p-3 mt-2">
          <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Scheduler Status (Live)</p>
          <div className="grid grid-cols-3 gap-2">
            {([
              { slot: 'morning', label: 'Morning', col: 'family_morning_last_sent' as const },
              { slot: 'midday',  label: 'Midday',  col: 'family_midday_last_sent'  as const },
              { slot: 'evening', label: 'Evening', col: 'family_evening_last_sent' as const },
            ] as const).map(({ slot, label, col }) => {
              const lastSent = tgSettings[col] as string | null | undefined;
              const lastMs   = lastSent ? new Date(lastSent).getTime() : null;
              const msSince  = lastMs ? Date.now() - lastMs : null;
              const cooldown = 20 * 60 * 60 * 1000;
              const onCD     = msSince !== null && msSince < cooldown;
              const nextMs   = lastMs ? lastMs + cooldown : null;
              const fmtTime  = (ms: number) => new Date(ms).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', timeZone: 'Australia/Brisbane' });
              const fmtDate  = (ms: number) => new Date(ms).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'Australia/Brisbane' });
              return (
                <div key={slot} className="rounded border border-border bg-background/50 p-2">
                  <p className="text-xs font-semibold mb-1">{label}</p>
                  {lastMs ? (
                    <>
                      <p className="text-[10px] text-muted-foreground">Last sent</p>
                      <p className="text-xs font-mono">{fmtDate(lastMs)} {fmtTime(lastMs)}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">Next eligible</p>
                      <p className={`text-xs font-mono ${onCD ? 'text-amber-400' : 'text-green-400'}`}>
                        {onCD && nextMs ? `${fmtDate(nextMs)} ${fmtTime(nextMs)}` : 'Now'}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">Never sent</p>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            ⚠️ Each slot can only send <strong>once per 20 hours</strong>. This dedup is stored in Supabase — safe across all devices and browser tabs.
          </p>
        </div>

        <SaveButton label="Save Family Message Settings" onSave={async () => saveTg.mutateAsync(tgSettings)} />
      </SectionCard>

      {/* ── Browser Push ─────────────────────────────────────────────────── */}
      <SectionCard title="Browser Push Notifications" icon={Zap} adminOnly isAdmin={isAdmin}>
        <ToggleRow label="Enable Browser Push" desc="Receive alerts in browser even when app is open" checked={tgSettings.push_enabled} onChange={v => handleTgChange('push_enabled', v)} />
        <div className="flex gap-2 mt-1">
          <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={handleTestPush}>
            <Bell className="w-3.5 h-3.5" /> Test Push Notification
          </Button>
          <SaveButton label="Save Push Settings" onSave={async () => saveTg.mutateAsync(tgSettings)} />
        </div>
      </SectionCard>


      {/* ── Superannuation Settings ──────────────────────────────────────── */}
      <SuperSection isAdmin={isAdmin} qc={qc} toast={toast} />

      {/* ── Planning Assumptions ─────────────────────────────────────────── */}
      <SectionCard title="Planning Assumptions" icon={SettingsIcon} adminOnly isAdmin={isAdmin}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: 'Inflation Rate %', key: 'inflation', step: 0.5 },
            { label: 'PPOR Growth %', key: 'ppor_growth', step: 0.5 },
            { label: 'Super Return %', key: 'super_return', step: 0.5 },
            { label: 'Safe Withdrawal Rate %', key: 'safe_withdrawal_rate', step: 0.5 },
          ].map(f => (
            <div key={f.key}>
              <label className="text-xs text-muted-foreground">{f.label}</label>
              <Input type="number" value={(assumptions as any)[f.key]} step={f.step}
                onChange={e => setAssumptions({ ...assumptions, [f.key]: parseFloat(e.target.value) || 0 })}
                className="h-8 text-sm mt-1 num-display" />
            </div>
          ))}
          <div>
            <label className="text-xs text-muted-foreground">Risk Profile</label>
            <Select value={assumptions.risk_profile} onValueChange={v => setAssumptions({ ...assumptions, risk_profile: v })}>
              <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="conservative">Conservative</SelectItem>
                <SelectItem value="moderate">Moderate</SelectItem>
                <SelectItem value="aggressive">Aggressive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
          {[
            { label: 'Conservative', desc: 'Property: 4%, Stocks: 8%, Crypto: 15%', type: 'conservative' },
            { label: 'Moderate',     desc: 'Property: 6%, Stocks: 12%, Crypto: 25%', type: 'moderate' },
            { label: 'Aggressive',   desc: 'Property: 8%, Stocks: 18%, Crypto: 40%', type: 'aggressive' },
          ].map(p => (
            <button key={p.type}
              className={`text-left rounded-lg p-2.5 border transition-all ${assumptions.risk_profile === p.type ? 'border-primary bg-primary/10' : 'border-border bg-secondary/30'}`}
              onClick={() => setAssumptions({ ...assumptions, risk_profile: p.type })}>
              <p className="font-semibold">{p.label}</p>
              <p className="text-muted-foreground mt-1">{p.desc}</p>
            </button>
          ))}
        </div>
        <SaveButton label="Save Assumptions" onSave={async () => {
          try {
            await apiRequest('PATCH', '/api/app-settings', { assumptions });
            setAssumptionsEdit(null); // reset so Supabase data is re-read on next load
            qc.invalidateQueries({ queryKey: ['/api/app-settings'] });
          } catch (err: any) {
            throw new Error(err?.message ?? 'Failed to save assumptions to Supabase');
          }
        }} />
      </SectionCard>

      {/* ── User Management ───────────────────────────────────────────────── */}
      <UserManagementSection isAdmin={isAdmin} />

      {/* ── Backup & Restore ─────────────────────────────────────────────── */}
      <SectionCard title="Backup & Restore" icon={RefreshCw} adminOnly isAdmin={isAdmin}>
        <div className="rounded-lg bg-secondary/40 p-3 text-xs text-muted-foreground">
          <p>All data is synced to Supabase. Download a full JSON backup (includes bills + budgets) or restore from a previous backup file.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" className="gap-2" onClick={handleExportAll}>
            <Download className="w-3.5 h-3.5" /> Export All Data
          </Button>
          <label className="cursor-pointer">
            <input type="file" accept=".json" className="hidden" onChange={handleImportJSON} />
            <Button variant="outline" size="sm" className="gap-2 pointer-events-none">
              <Upload className="w-3.5 h-3.5" /> Restore from Backup
            </Button>
          </label>
        </div>
      </SectionCard>

      {/* ── Family Members ───────────────────────────────────────────────── */}
      <SectionCard title="Family Members" icon={User} isAdmin={isAdmin}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { name: 'Roham Shahrokh', role: 'Primary', initials: 'RS' },
            { name: 'Fara Ghiyasi', role: 'Co-Holder', initials: 'FG' },
            { name: 'Yara Shahrokh', role: 'Beneficiary', initials: 'YS' },
            { name: 'Jana Shahrokh', role: 'Beneficiary', initials: 'JS' },
          ].map(m => (
            <div key={m.name} className="rounded-lg bg-secondary/40 p-3 text-center">
              <div className="w-10 h-10 rounded-full mx-auto flex items-center justify-center text-sm font-bold mb-2"
                style={{ background: 'hsl(43,85%,55%)', color: 'hsl(224,40%,8%)' }}>
                {m.initials}
              </div>
              <p className="text-xs font-semibold">{m.name}</p>
              <p className="text-xs text-muted-foreground">{m.role}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* ── About ────────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-bold mb-3">About</h2>
        <div className="text-xs text-muted-foreground space-y-1">
          <p><span className="text-foreground font-semibold">Application:</span> Shahrokh Family Financial Planner</p>
          <p><span className="text-foreground font-semibold">Version:</span> 2.0.0 — Smart CFO Edition</p>
          <p><span className="text-foreground font-semibold">Location:</span> Brisbane, Queensland, Australia</p>
          <p><span className="text-foreground font-semibold">Stack:</span> React + Vite + Supabase + Vercel</p>
          <p><span className="text-foreground font-semibold">New in v2:</span> Telegram alerts, Family messages, Recurring bills, Monthly budgets</p>
        </div>
      </div>
    </div>
  );
}
