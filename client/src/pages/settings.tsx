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
  Zap, TrendingDown, AlertTriangle, CreditCard, DollarSign, BarChart2,
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

function SectionCard({ title, icon: Icon, children }: { title: string; icon: React.ComponentType<any>; children: React.ReactNode }) {
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { toast } = useToast();
  const { theme, toggleTheme } = useAppStore();
  const qc = useQueryClient();

  // ── General settings ──────────────────────────────────────────────────────
  const [assumptions, setAssumptions] = useState({
    inflation: 3, ppor_growth: 6, super_return: 8, safe_withdrawal_rate: 4, risk_profile: 'moderate',
  });
  const [userSettings, setUserSettings] = useState({
    display_name: 'Roham Shahrokh', currency: 'AUD', timezone: 'Australia/Brisbane', notifications: true,
  });

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

  // Merge server data into local state once loaded
  const tgSettings = tg ?? (tgData ? { ...defaultTg, ...tgData } : defaultTg);

  const saveTg = useMutation({
    mutationFn: (data: any) => apiRequest('PUT', '/api/telegram-settings', data).then(r => r.json()),
    onSuccess: () => {
      invalidateSettingsCache();
      qc.invalidateQueries({ queryKey: ['/api/telegram-settings'] });
      toast({ title: 'Saved Successfully', description: 'Notification settings updated.' });
    },
    onError: () => toast({ title: 'Save Failed', variant: 'destructive' }),
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
      <SectionCard title="User Preferences" icon={User}>
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
        <SaveButton label="Save Settings" onSave={async () => { await apiRequest('PUT', '/api/settings/user_settings', { value: JSON.stringify(userSettings) }); }} />
      </SectionCard>

      {/* ── Telegram Bot Configuration ───────────────────────────────────── */}
      <SectionCard title="Telegram Bot" icon={Send}>
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
      <SectionCard title="Alert Thresholds & Toggles" icon={Bell}>
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
      <SectionCard title="Daily Family Messages" icon={Heart}>
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
        <SaveButton label="Save Family Message Settings" onSave={async () => saveTg.mutateAsync(tgSettings)} />
      </SectionCard>

      {/* ── Browser Push ─────────────────────────────────────────────────── */}
      <SectionCard title="Browser Push Notifications" icon={Zap}>
        <ToggleRow label="Enable Browser Push" desc="Receive alerts in browser even when app is open" checked={tgSettings.push_enabled} onChange={v => handleTgChange('push_enabled', v)} />
        <div className="flex gap-2 mt-1">
          <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={handleTestPush}>
            <Bell className="w-3.5 h-3.5" /> Test Push Notification
          </Button>
          <SaveButton label="Save Push Settings" onSave={async () => saveTg.mutateAsync(tgSettings)} />
        </div>
      </SectionCard>

      {/* ── Planning Assumptions ─────────────────────────────────────────── */}
      <SectionCard title="Planning Assumptions" icon={SettingsIcon}>
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
        <SaveButton label="Save Assumptions" onSave={async () => { await apiRequest('PUT', '/api/settings/assumptions', { value: JSON.stringify(assumptions) }); }} />
      </SectionCard>

      {/* ── Security ─────────────────────────────────────────────────────── */}
      <SectionCard title="Security" icon={Shield}>
        <div className="rounded-lg bg-secondary/40 p-3 text-xs text-muted-foreground space-y-1">
          <p><span className="font-semibold text-foreground">Username:</span> Roham</p>
          <p><span className="font-semibold text-foreground">Password:</span> ●●●●●●●●●●●</p>
          <p className="text-muted-foreground mt-2">To change credentials, update the login page source code.</p>
        </div>
      </SectionCard>

      {/* ── Backup & Restore ─────────────────────────────────────────────── */}
      <SectionCard title="Backup & Restore" icon={RefreshCw}>
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
      <SectionCard title="Family Members" icon={User}>
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
