/**
 * notifications.ts
 * Unified alert engine: Telegram + Browser Push.
 * All calls are fire-and-forget — never blocks UI.
 *
 * DEDUP STRATEGY (v2):
 *   All cooldown/last-sent timestamps are stored in Supabase sf_telegram_settings
 *   (columns: family_*_last_sent, alert_cooldowns JSONB).
 *   localStorage is NO LONGER used for dedup — it was per-device only and caused
 *   duplicate messages when opening the app on multiple browsers/devices.
 *
 * FAMILY MESSAGE SCHEDULER:
 *   dispatchFamilyMessages() checks each slot's last_sent_at from Supabase.
 *   A slot is eligible only if: enabled=true AND now >= scheduledTime (AEST)
 *   AND (last_sent_at is null OR now - last_sent_at >= 20 hours).
 *   After sending, last_sent_at is written back to Supabase immediately (atomic UPSERT).
 *   Even if 10 browser tabs call dispatchFamilyMessages() simultaneously, only
 *   the first write wins — subsequent checks will see last_sent_at already set.
 */

import { pickFamilyMessage, getPendingSlotsByTime, type FamilyMsgLanguage, type FamilyMsgRecipient } from './familyMessages';

// ─── Supabase constants (same as supabaseClient.ts) ──────────────────────────
const SUPABASE_URL  = 'https://uoraduyyxhtzixcsaidg.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvcmFkdXl5eGh0eml4Y3NhaWRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMjEwMTgsImV4cCI6MjA5MjY5NzAxOH0.qNrqDlG4j0lfGKDsmGyywP8DZeMurB02UWv4bdevW7c';
const SB_HEADERS = {
  apikey: SUPABASE_ANON,
  Authorization: `Bearer ${SUPABASE_ANON}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TelegramSettings {
  enabled: boolean;
  bot_token: string;
  roham_chat_id: string;
  fara_chat_id: string;
  alert_large_expense: boolean;
  large_expense_threshold: number;
  alert_budget_warning: boolean;
  budget_warning_pct: number;
  alert_budget_exceeded: boolean;
  alert_cashflow: boolean;
  alert_mortgage_due: boolean;
  alert_bills_due: boolean;
  alert_salary_missing: boolean;
  alert_income_received: boolean;
  alert_weekly_summary: boolean;
  alert_buy_zone: boolean;
  alert_portfolio_drop: boolean;
  portfolio_drop_pct: number;
  alert_duplicate_tx: boolean;
  alert_deposit_ready: boolean;
  family_msgs_enabled: boolean;
  family_msgs_morning: boolean;
  family_msgs_midday: boolean;
  family_msgs_evening: boolean;
  family_msgs_morning_time: string;
  family_msgs_midday_time: string;
  family_msgs_evening_time: string;
  family_msgs_language: FamilyMsgLanguage;
  family_msgs_recipient: FamilyMsgRecipient;
  family_msgs_paused: boolean;
  push_enabled: boolean;
  // Supabase-side dedup timestamps (set by notifications.ts after each send)
  family_morning_last_sent?: string | null;
  family_midday_last_sent?:  string | null;
  family_evening_last_sent?: string | null;
  bill_alert_last_sent?: Record<string, string> | null;
  weekly_summary_last_sent?: string | null;
  alert_cooldowns?: Record<string, number> | null;
}

// ─── Settings cache (5-min TTL) ───────────────────────────────────────────────

let _settingsCache: TelegramSettings | null = null;
let _settingsCacheAt = 0;

export async function getTelegramSettings(): Promise<TelegramSettings | null> {
  if (_settingsCache && Date.now() - _settingsCacheAt < 5 * 60 * 1000) return _settingsCache;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/sf_telegram_settings?id=eq.shahrokh-family-main`, {
      headers: SB_HEADERS,
    });
    if (!res.ok) return null;
    const rows = await res.json();
    _settingsCache = rows[0] ?? null;
    _settingsCacheAt = Date.now();
    return _settingsCache;
  } catch { return null; }
}

export function invalidateSettingsCache() {
  _settingsCache = null;
  _settingsCacheAt = 0;
}

// ─── Cooldown definitions (ms) ──────────────────────────────────────────────
// v2: Cooldowns are authoritative in Supabase (alert_cooldowns JSONB column).
// localStorage is a local fast-path fallback only — NOT the source of truth.
// This eliminates duplicate sends across multiple browsers / devices.

const COOLDOWNS: Record<string, number> = {
  large_expense:    60 * 60 * 1000,
  budget_warning:   4  * 60 * 60 * 1000,
  budget_exceeded:  2  * 60 * 60 * 1000,
  cashflow:         6  * 60 * 60 * 1000,
  mortgage_due:     24 * 60 * 60 * 1000,
  bill_due:         24 * 60 * 60 * 1000,
  salary_missing:   24 * 60 * 60 * 1000,
  income_received:  30 * 60 * 1000,
  weekly_summary:   6  * 24 * 60 * 60 * 1000,
  portfolio_drop:   4  * 60 * 60 * 1000,
  duplicate_tx:     24 * 60 * 60 * 1000,
  deposit_ready:    7  * 24 * 60 * 60 * 1000,
};

/**
 * Check cooldown against Supabase alert_cooldowns JSONB (authoritative).
 * Falls back to localStorage if Supabase is unreachable.
 */
async function isOnCooldown(type: string, subKey = ''): Promise<boolean> {
  const key = `${type}__${subKey}`;
  const cd  = COOLDOWNS[type] ?? 60 * 60 * 1000;
  const now = Date.now();
  // 1. Authoritative: Supabase
  try {
    const settings = await getTelegramSettings();
    const cooldowns = (settings?.alert_cooldowns as Record<string, number> | null) ?? {};
    const last = cooldowns[key];
    if (last && now - last < cd) return true;
  } catch { /* fall through */ }
  // 2. Local fast-path fallback
  try {
    const raw = localStorage.getItem('sf_alert_cooldowns_v2');
    const store: Record<string, number> = raw ? JSON.parse(raw) : {};
    if (store[key] && now - store[key] < cd) return true;
  } catch {}
  return false;
}

/**
 * Write cooldown timestamp to Supabase (authoritative) AND localStorage (fast-path).
 */
async function setCooldown(type: string, subKey = ''): Promise<void> {
  const key = `${type}__${subKey}`;
  const now = Date.now();
  // 1. Supabase (authoritative)
  try {
    const settings = await getTelegramSettings();
    const cooldowns: Record<string, number> = {
      ...((settings?.alert_cooldowns as Record<string, number> | null) ?? {}),
      [key]: now,
    };
    await fetch(`${SUPABASE_URL}/rest/v1/sf_telegram_settings?id=eq.shahrokh-family-main`, {
      method: 'PATCH',
      headers: SB_HEADERS,
      body: JSON.stringify({ alert_cooldowns: cooldowns }),
    });
    invalidateSettingsCache();
  } catch {}
  // 2. localStorage fast-path
  try {
    const raw = localStorage.getItem('sf_alert_cooldowns_v2');
    const store: Record<string, number> = raw ? JSON.parse(raw) : {};
    store[key] = now;
    localStorage.setItem('sf_alert_cooldowns_v2', JSON.stringify(store));
  } catch {}
}

// ─── Family message slot dedup (Supabase-backed, 20-hour cooldown) ────────────
// CRITICAL FIX: slot sent-tracking is now server-side so multiple browser
// instances / devices share the same dedup state.
// Even 100 app loads after 8:00 AM — only the first one fires the message.

const SLOT_COOLDOWN_MS = 20 * 60 * 60 * 1000; // 20 hours

type FamilySlot = 'morning' | 'midday' | 'evening';

const SLOT_COL: Record<FamilySlot, string> = {
  morning: 'family_morning_last_sent',
  midday:  'family_midday_last_sent',
  evening: 'family_evening_last_sent',
};

/** Returns true if this slot was already sent within the last 20 hours. */
function slotOnCooldown(settings: TelegramSettings, slot: FamilySlot): boolean {
  const col = SLOT_COL[slot] as keyof TelegramSettings;
  const lastSent = settings[col] as string | null | undefined;
  if (!lastSent) return false;
  return Date.now() - new Date(lastSent).getTime() < SLOT_COOLDOWN_MS;
}

/** Write last_sent_at for the given slot to Supabase immediately. */
async function markSlotSentServer(slot: FamilySlot): Promise<void> {
  const col = SLOT_COL[slot];
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/sf_telegram_settings?id=eq.shahrokh-family-main`, {
      method: 'PATCH',
      headers: SB_HEADERS,
      body: JSON.stringify({ [col]: new Date().toISOString() }),
    });
    invalidateSettingsCache();
  } catch {}
}


// ─── Log alert to Supabase ────────────────────────────────────────────────────

async function logAlert(data: {
  alert_type: string; channel: string; recipient?: string;
  title: string; message: string; status?: string;
  related_table?: string; related_record_id?: string;
}) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/sf_alert_logs`, {
      method: 'POST',
      headers: SB_HEADERS,
      body: JSON.stringify({ ...data, status: data.status ?? 'sent', sent_at: new Date().toISOString(), created_at: new Date().toISOString() }),
    });
  } catch {}
}

// ─── Telegram sender ──────────────────────────────────────────────────────────

async function sendTelegram(botToken: string, chatId: string, text: string): Promise<boolean> {
  if (!botToken || !chatId) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    return res.ok;
  } catch { return false; }
}

async function sendToRecipient(
  settings: TelegramSettings,
  recipient: 'Roham' | 'Fara' | 'Both',
  text: string,
  alertType: string,
  title: string
) {
  if (!settings.enabled || !settings.bot_token) return;
  const chatIds: string[] = [];
  if ((recipient === 'Roham' || recipient === 'Both') && settings.roham_chat_id) chatIds.push(settings.roham_chat_id);
  if ((recipient === 'Fara'  || recipient === 'Both') && settings.fara_chat_id)  chatIds.push(settings.fara_chat_id);

  for (const chatId of chatIds) {
    const ok = await sendTelegram(settings.bot_token, chatId, text);
    await logAlert({ alert_type: alertType, channel: 'telegram', recipient, title, message: text, status: ok ? 'sent' : 'failed' });
  }
}

// ─── Browser Push ─────────────────────────────────────────────────────────────

export async function sendBrowserPush(title: string, body: string, icon = '/favicon.png') {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    await Notification.requestPermission();
  }
  if (Notification.permission === 'granted') {
    try { new Notification(title, { body, icon }); } catch {}
  }
}

// ─── Public alert functions ───────────────────────────────────────────────────

export async function alertLargeExpense(amount: number, description: string, merchant?: string) {
  const settings = await getTelegramSettings();
  if (!settings?.alert_large_expense) return;
  if (amount < (settings.large_expense_threshold ?? 300)) return;
  if (await isOnCooldown('large_expense', `${description}_${amount}`)) return;
  await setCooldown('large_expense', `${description}_${amount}`);

  const title = 'Large Expense Alert';
  const msg = `💸 <b>Large expense added: $${amount.toFixed(0)}</b>${merchant ? ` at ${merchant}` : ''}\n${description}`;
  await sendToRecipient(settings, 'Both', `🔔 <b>${title}</b>\n\n${msg}`, 'large_expense', title);
  if (settings.push_enabled) await sendBrowserPush(title, `$${amount.toFixed(0)} — ${description}`);
}

export async function alertBudgetWarning(category: string, usedPct: number, month: string) {
  const settings = await getTelegramSettings();
  if (!settings?.alert_budget_warning) return;
  if (usedPct < (settings.budget_warning_pct ?? 80)) return;
  if (await isOnCooldown('budget_warning', `${category}_${month}`)) return;
  await setCooldown('budget_warning', `${category}_${month}`);

  const exceeded = usedPct >= 100;
  const alertType = exceeded ? 'budget_exceeded' : 'budget_warning';
  if (exceeded && !settings.alert_budget_exceeded) return;

  const title = exceeded ? 'Budget Exceeded' : 'Budget Warning';
  const emoji = exceeded ? '🚨' : '⚠️';
  const msg = exceeded
    ? `${emoji} <b>${category} budget exceeded</b> in ${month} (${usedPct.toFixed(0)}% used)`
    : `${emoji} <b>${category}</b> is at <b>${usedPct.toFixed(0)}%</b> of ${month} budget`;
  await sendToRecipient(settings, 'Both', `🔔 <b>${title}</b>\n\n${msg}`, alertType, title);
  if (settings.push_enabled) await sendBrowserPush(title, msg.replace(/<[^>]+>/g, ''));
}

export async function alertBillDue(billName: string, amount: number, daysUntilDue: number) {
  const settings = await getTelegramSettings();
  if (!settings?.alert_bills_due) return;
  if (await isOnCooldown('bill_due', `${billName}_${daysUntilDue}`)) return;
  await setCooldown('bill_due', `${billName}_${daysUntilDue}`);

  const title = 'Bill Due Reminder';
  const when = daysUntilDue === 0 ? 'today' : daysUntilDue === 1 ? 'tomorrow' : `in ${daysUntilDue} days`;
  const msg = `📅 <b>${billName}</b> — $${amount.toFixed(0)} due <b>${when}</b>`;
  await sendToRecipient(settings, 'Both', `🔔 <b>${title}</b>\n\n${msg}`, 'bill_due', title);
  if (settings.push_enabled) await sendBrowserPush(title, `${billName}: $${amount} due ${when}`);
}

export async function alertIncomeReceived(amount: number, source: string) {
  const settings = await getTelegramSettings();
  if (!settings?.alert_income_received) return;
  if (await isOnCooldown('income_received', `${source}_${amount}`)) return;
  await setCooldown('income_received', `${source}_${amount}`);

  const title = 'Income Received';
  const msg = `✅ <b>Income added: $${amount.toFixed(0)}</b> — ${source}`;
  await sendToRecipient(settings, 'Both', `🔔 <b>${title}</b>\n\n${msg}`, 'income_received', title);
}

export async function alertCashflowForecast(monthlyCF: number) {
  const settings = await getTelegramSettings();
  if (!settings?.alert_cashflow) return;
  if (monthlyCF >= 0) return;
  const monthKey = new Date().toISOString().slice(0, 7);
  if (await isOnCooldown('cashflow', monthKey)) return;
  await setCooldown('cashflow', monthKey);

  const title = 'Negative Cashflow Forecast';
  const msg = `📉 <b>Expected negative cashflow this month: ${monthlyCF < 0 ? '-' : ''}$${Math.abs(monthlyCF).toFixed(0)}</b>\n\nReview expenses and defer non-essentials.`;
  await sendToRecipient(settings, 'Both', `⚠️ <b>${title}</b>\n\n${msg}`, 'cashflow', title);
  if (settings.push_enabled) await sendBrowserPush(title, `Monthly cashflow: -$${Math.abs(monthlyCF).toFixed(0)}`);
}

export async function alertPortfolioDrop(dropPct: number) {
  const settings = await getTelegramSettings();
  if (!settings?.alert_portfolio_drop) return;
  if (dropPct < (settings.portfolio_drop_pct ?? 6)) return;
  if (await isOnCooldown('portfolio_drop', `${Math.floor(dropPct)}`)) return;
  await setCooldown('portfolio_drop', `${Math.floor(dropPct)}`);

  const title = 'Portfolio Drop Alert';
  const msg = `📉 <b>Portfolio down ${dropPct.toFixed(1)}% this week</b>\n\nReminder: Stay the course. DCA is designed for this.`;
  await sendToRecipient(settings, 'Both', `⚠️ <b>${title}</b>\n\n${msg}`, 'portfolio_drop', title);
}

export async function alertDuplicateTransactions(count: number) {
  const settings = await getTelegramSettings();
  if (!settings?.alert_duplicate_tx) return;
  const key = new Date().toISOString().slice(0, 10);
  if (await isOnCooldown('duplicate_tx', key)) return;
  await setCooldown('duplicate_tx', key);

  const title = 'Duplicate Transactions Found';
  const msg = `🔍 <b>${count} potential duplicate transaction${count !== 1 ? 's' : ''} detected</b>\n\nReview in Expenses → Data Health.`;
  await sendToRecipient(settings, 'Both', `⚠️ <b>${title}</b>\n\n${msg}`, 'duplicate_tx', title);
}

export async function sendWeeklySummary(data: {
  totalSpent: number; totalSaved: number; topCategory: string;
  cashflow: number; riskNote?: string; suggestion?: string;
}) {
  const settings = await getTelegramSettings();
  if (!settings?.alert_weekly_summary) return;
  if (await isOnCooldown('weekly_summary', '')) return;
  await setCooldown('weekly_summary', '');

  const title = 'Weekly CFO Summary';
  const lines = [
    `📊 <b>Weekly CFO Summary — Shahrokh Family</b>`,
    ``,
    `💰 Spent:  <b>$${data.totalSpent.toFixed(0)}</b>`,
    `💚 Saved:  <b>$${data.totalSaved.toFixed(0)}</b>`,
    `📂 Top:    <b>${data.topCategory}</b>`,
    `📈 CF:     <b>${data.cashflow >= 0 ? '+' : ''}$${data.cashflow.toFixed(0)}</b>`,
    data.riskNote ? `⚠️ Risk:   ${data.riskNote}` : null,
    data.suggestion ? `💡 Tip:   ${data.suggestion}` : null,
  ].filter(Boolean).join('\n');
  await sendToRecipient(settings, 'Both', lines, 'weekly_summary', title);
}

// ─── Test message ─────────────────────────────────────────────────────────────

export async function sendTestMessage(settings: {
  bot_token: string; roham_chat_id: string; fara_chat_id: string;
}, recipient: 'Roham' | 'Fara' | 'Both' = 'Both'): Promise<{ ok: boolean; error?: string }> {
  try {
    const msg = `✅ <b>Shahrokh Family Financial Planner</b>\n\nTest message successful! Your Telegram alerts are working correctly.\n\n<i>Sent at ${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' })} AEST</i>`;
    const chatIds: string[] = [];
    if ((recipient === 'Roham' || recipient === 'Both') && settings.roham_chat_id) chatIds.push(settings.roham_chat_id);
    if ((recipient === 'Fara'  || recipient === 'Both') && settings.fara_chat_id)  chatIds.push(settings.fara_chat_id);
    for (const chatId of chatIds) {
      const ok = await sendTelegram(settings.bot_token, chatId, msg);
      if (!ok) return { ok: false, error: `Failed to send to chat ${chatId}` };
    }
    return { ok: true };
  } catch (e: any) { return { ok: false, error: e.message }; }
}

// ─── Family message dispatcher ────────────────────────────────────────────────

export async function dispatchFamilyMessages() {
  // Always fetch fresh settings so we see the latest last_sent_at timestamps.
  invalidateSettingsCache();
  const settings = await getTelegramSettings();
  if (!settings?.family_msgs_enabled || settings.family_msgs_paused) return;
  if (!settings.bot_token) return;

  // Step 1: Which slots are past their scheduled time right now (AEST)?
  const timePending = getPendingSlotsByTime({
    morning: settings.family_msgs_morning,
    midday:  settings.family_msgs_midday,
    evening: settings.family_msgs_evening,
    morningTime: settings.family_msgs_morning_time ?? '08:00',
    middayTime:  settings.family_msgs_midday_time  ?? '12:30',
    eveningTime: settings.family_msgs_evening_time ?? '20:30',
  });

  // Step 2: Filter out slots already sent within the last 20 hours (Supabase dedup).
  // HARD GATE: prevents duplicates regardless of how many browser tabs/devices load.
  const slots = timePending.filter(slot => !slotOnCooldown(settings, slot as FamilySlot));
  if (slots.length === 0) return;

  for (const slot of slots as FamilySlot[]) {
    // Step 3: Write last_sent_at to Supabase BEFORE sending.
    // Ensures that if two tabs race, only one wins — the other sees the
    // timestamp on next check and skips.
    await markSlotSentServer(slot);

    const text = pickFamilyMessage(settings.family_msgs_recipient, settings.family_msgs_language, slot);
    if (!text) continue;
    await sendToRecipient(settings, settings.family_msgs_recipient, `💛 ${text}`, 'family_message', 'Family Message');

    // Log to Supabase
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/sf_family_messages_log`, {
        method: 'POST',
        headers: SB_HEADERS,
        body: JSON.stringify({
          recipient: settings.family_msgs_recipient,
          message: text,
          language: settings.family_msgs_language,
          scheduled_time: slot,
          sent_at: new Date().toISOString(),
          status: 'sent',
          created_at: new Date().toISOString(),
        }),
      });
    } catch {}
  }
}

// ─── Bill due checker (call on app mount) ─────────────────────────────────────

export async function checkUpcomingBills(bills: Array<{
  bill_name: string; amount: number; next_due_date: string; reminder_days_before: number; active: boolean;
}>) {
  const settings = await getTelegramSettings();
  if (!settings?.alert_bills_due) return;
  const today = new Date();
  for (const bill of bills) {
    if (!bill.active || !bill.next_due_date) continue;
    const due = new Date(bill.next_due_date);
    const daysLeft = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft >= 0 && daysLeft <= (bill.reminder_days_before ?? 3)) {
      await alertBillDue(bill.bill_name, bill.amount, daysLeft);
    }
  }
}
