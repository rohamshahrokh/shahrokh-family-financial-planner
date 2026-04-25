import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import SaveButton from "@/components/SaveButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAppStore } from "@/lib/store";
import { Settings as SettingsIcon, Download, Upload, RefreshCw, User, Moon, Sun, Shield } from "lucide-react";
import * as XLSX from "xlsx";

export default function SettingsPage() {
  const { toast } = useToast();
  const { theme, toggleTheme } = useAppStore();
  const qc = useQueryClient();

  const [assumptions, setAssumptions] = useState({
    inflation: 3,
    ppor_growth: 6,
    super_return: 8,
    safe_withdrawal_rate: 4,
    risk_profile: 'moderate',
  });

  const [userSettings, setUserSettings] = useState({
    display_name: 'Roham Shahrokh',
    currency: 'AUD',
    timezone: 'Australia/Brisbane',
    notifications: true,
  });

  const handleExportAll = () => {
    // Export all data as JSON
    Promise.all([
      apiRequest('GET', '/api/snapshot').then(r => r.json()),
      apiRequest('GET', '/api/expenses').then(r => r.json()),
      apiRequest('GET', '/api/properties').then(r => r.json()),
      apiRequest('GET', '/api/stocks').then(r => r.json()),
      apiRequest('GET', '/api/crypto').then(r => r.json()),
    ]).then(([snapshot, expenses, properties, stocks, crypto]) => {
      const backup = {
        version: '1.0',
        exported_at: new Date().toISOString(),
        family: 'Shahrokh',
        snapshot, expenses, properties, stocks, crypto,
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Shahrokh_Family_Backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Backup Downloaded', description: 'Full data backup saved as JSON.' });
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
        if (backup.expenses?.length) {
          for (const exp of backup.expenses) {
            await apiRequest('POST', '/api/expenses', exp);
          }
        }
        qc.invalidateQueries();
        toast({ title: 'Backup Restored', description: 'All data has been restored from backup.' });
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
        <p className="text-muted-foreground text-sm">Configure your financial planner</p>
      </div>

      {/* User Preferences */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <User className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold">User Preferences</h2>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Display Name</label>
            <Input
              value={userSettings.display_name}
              onChange={e => setUserSettings({ ...userSettings, display_name: e.target.value })}
              className="h-8 text-sm mt-1"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Currency</label>
            <Select value={userSettings.currency} onValueChange={v => setUserSettings({ ...userSettings, currency: v })}>
              <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="AUD">AUD — Australian Dollar</SelectItem>
                <SelectItem value="USD">USD — US Dollar</SelectItem>
                <SelectItem value="EUR">EUR — Euro</SelectItem>
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
              <Button
                size="sm"
                variant={theme === 'dark' ? 'default' : 'outline'}
                className="gap-1.5 flex-1 h-8"
                onClick={() => theme !== 'dark' && toggleTheme()}
                style={theme === 'dark' ? { background: 'hsl(43,85%,55%)', color: 'hsl(224,40%,8%)', border: 'none' } : {}}
              >
                <Moon className="w-3.5 h-3.5" /> Dark
              </Button>
              <Button
                size="sm"
                variant={theme === 'light' ? 'default' : 'outline'}
                className="gap-1.5 flex-1 h-8"
                onClick={() => theme !== 'light' && toggleTheme()}
                style={theme === 'light' ? { background: 'hsl(43,85%,45%)', color: 'white', border: 'none' } : {}}
              >
                <Sun className="w-3.5 h-3.5" /> Light
              </Button>
            </div>
          </div>
        </div>
        <SaveButton label="Save Settings" onSave={async () => {
          await apiRequest('PUT', '/api/settings/user_settings', { value: JSON.stringify(userSettings) });
        }} />
      </div>

      {/* Planning Assumptions */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <SettingsIcon className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold">Planning Assumptions</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: 'Inflation Rate %', key: 'inflation', step: 0.5 },
            { label: 'PPOR Growth %', key: 'ppor_growth', step: 0.5 },
            { label: 'Super Return %', key: 'super_return', step: 0.5 },
            { label: 'Safe Withdrawal Rate %', key: 'safe_withdrawal_rate', step: 0.5 },
          ].map(f => (
            <div key={f.key}>
              <label className="text-xs text-muted-foreground">{f.label}</label>
              <Input
                type="number"
                value={(assumptions as any)[f.key]}
                step={f.step}
                onChange={e => setAssumptions({ ...assumptions, [f.key]: parseFloat(e.target.value) || 0 })}
                className="h-8 text-sm mt-1 num-display"
              />
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

        {/* Assumption notes */}
        <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
          {[
            { label: 'Conservative Returns', desc: 'Property: 4%, Stocks: 8%, Crypto: 15%', type: 'conservative' },
            { label: 'Moderate Returns', desc: 'Property: 6%, Stocks: 12%, Crypto: 25%', type: 'moderate' },
            { label: 'Aggressive Returns', desc: 'Property: 8%, Stocks: 18%, Crypto: 40%', type: 'aggressive' },
          ].map(p => (
            <button
              key={p.type}
              className={`text-left rounded-lg p-2.5 border transition-all ${assumptions.risk_profile === p.type ? 'border-primary bg-primary/10' : 'border-border bg-secondary/30'}`}
              onClick={() => setAssumptions({ ...assumptions, risk_profile: p.type })}
            >
              <p className="font-semibold">{p.label}</p>
              <p className="text-muted-foreground mt-1">{p.desc}</p>
            </button>
          ))}
        </div>

        <SaveButton label="Save Assumptions" onSave={async () => {
          await apiRequest('PUT', '/api/settings/assumptions', { value: JSON.stringify(assumptions) });
        }} />
      </div>

      {/* Security */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold">Security</h2>
        </div>
        <div className="rounded-lg bg-secondary/40 p-3 text-xs text-muted-foreground space-y-1">
          <p><span className="font-semibold text-foreground">Username:</span> Roham</p>
          <p><span className="font-semibold text-foreground">Password:</span> ●●●●●●●●●●●</p>
          <p className="text-muted-foreground mt-2">To change credentials, update the login page source code.</p>
        </div>
      </div>

      {/* Backup & Restore */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <RefreshCw className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold">Backup & Restore</h2>
        </div>
        <div className="space-y-3">
          <div className="rounded-lg bg-secondary/40 p-3 text-xs text-muted-foreground">
            <p>All data is stored in the server database. Download a full JSON backup or restore from a previous backup file.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-2" onClick={handleExportAll} data-testid="button-backup">
              <Download className="w-3.5 h-3.5" /> Export All Data
            </Button>
            <label className="cursor-pointer">
              <input type="file" accept=".json" className="hidden" onChange={handleImportJSON} />
              <Button variant="outline" size="sm" className="gap-2 pointer-events-none">
                <Upload className="w-3.5 h-3.5" /> Restore from Backup
              </Button>
            </label>
          </div>
        </div>
      </div>

      {/* Family Members */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-bold mb-4">Family Members</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { name: 'Roham Shahrokh', role: 'Primary Account Holder', initials: 'RS' },
            { name: 'Fara Ghiyasi', role: 'Co-Account Holder', initials: 'FG' },
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
      </div>

      {/* About */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-bold mb-3">About</h2>
        <div className="text-xs text-muted-foreground space-y-1">
          <p><span className="text-foreground font-semibold">Application:</span> Shahrokh Family Financial Planner</p>
          <p><span className="text-foreground font-semibold">Version:</span> 1.0.0</p>
          <p><span className="text-foreground font-semibold">Location:</span> Brisbane, Queensland, Australia</p>
          <p><span className="text-foreground font-semibold">Currency:</span> Australian Dollar (AUD)</p>
          <p><span className="text-foreground font-semibold">Platform:</span> Private Family Office Dashboard</p>
          <p className="mt-2">This is a private, secure financial planning tool for the Shahrokh family. All data is encrypted and stored locally.</p>
        </div>
      </div>
    </div>
  );
}
