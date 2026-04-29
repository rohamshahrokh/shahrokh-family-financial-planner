/**
 * liquidityRules.ts
 *
 * Evaluates the monthly ledger for liquidity stress events and generates:
 *   - Warnings (projected low cash months)
 *   - Smart suggested actions (delay purchase, reduce DCA, etc.)
 *   - Emergency buffer status
 *   - Next major cash event summary
 */

import type { LedgerMonth } from './ledgerBuilder';
import type { CashEvent } from './eventProcessor';

// ─── Types ────────────────────────────────────────────────────────────────────

export type LiquidityWarningLevel = 'critical' | 'warning' | 'caution' | 'ok';

export interface LiquidityWarning {
  monthKey: string;
  label: string;
  level: LiquidityWarningLevel;
  availableCash: number;
  closingCash: number;
  message: string;
}

export interface SmartAction {
  type: 'delay_purchase' | 'reduce_dca' | 'refinance' | 'sell_asset' | 'increase_income';
  description: string;
  estimatedImpact: number; // $ improvement to cash
  targetMonthKey?: string;
}

export interface LiquidityReport {
  warnings: LiquidityWarning[];
  smartActions: SmartAction[];
  emergencyBufferStatus: 'healthy' | 'at_risk' | 'depleted';
  lowestCashMonth: LedgerMonth | null;
  lowestCashAmount: number;
  nextMajorEvent: CashEvent | null;
  forecastCash2030: number;
  forecastCash2035: number;
  bufferThreshold: number;
}

// ─── Default thresholds ───────────────────────────────────────────────────────

const BUFFER_CRITICAL = 0;          // Below $0: critical
const BUFFER_WARNING  = 30_000;     // Below $30k: warning
const BUFFER_CAUTION  = 60_000;     // Below $60k: caution

// ─── Main evaluator ───────────────────────────────────────────────────────────

export function evaluateLiquidity(
  ledger: LedgerMonth[],
  bufferThreshold = 30_000,
): LiquidityReport {
  const warnings: LiquidityWarning[] = [];
  const smartActions: SmartAction[] = [];

  const forecastMonths = ledger.filter(m => !m.isActual);

  // Scan for low cash months
  for (const m of forecastMonths) {
    if (m.availableCash < BUFFER_CRITICAL) {
      warnings.push({
        monthKey: m.key,
        label:    m.label,
        level:    'critical',
        availableCash: m.availableCash,
        closingCash:   m.closingCash,
        message: `⚠ Cash goes negative in ${m.label} — immediate action required`,
      });
    } else if (m.availableCash < bufferThreshold) {
      warnings.push({
        monthKey: m.key,
        label:    m.label,
        level:    'warning',
        availableCash: m.availableCash,
        closingCash:   m.closingCash,
        message: `Projected liquidity stress in ${m.label} — available: $${m.availableCash.toLocaleString()}`,
      });
    } else if (m.availableCash < bufferThreshold * 2) {
      warnings.push({
        monthKey: m.key,
        label:    m.label,
        level:    'caution',
        availableCash: m.availableCash,
        closingCash:   m.closingCash,
        message: `Low cash buffer approaching in ${m.label}`,
      });
    }
  }

  // Generate smart actions for warning/critical months
  if (warnings.some(w => w.level === 'critical' || w.level === 'warning')) {
    // Check if there are large property purchases we could delay
    const hasPropertyPurchase = forecastMonths.some(m => m.propertyPurchase > 0);
    if (hasPropertyPurchase) {
      const purchaseMonth = forecastMonths.find(m => m.propertyPurchase > 0);
      smartActions.push({
        type: 'delay_purchase',
        description: `Consider delaying property purchase (${purchaseMonth?.label ?? 'upcoming'}) by 6–12 months to preserve cash buffer`,
        estimatedImpact: purchaseMonth?.propertyPurchase ?? 0,
        targetMonthKey: purchaseMonth?.key,
      });
    }

    // Check DCA outflows
    const totalMonthlyDCA = forecastMonths.length > 0
      ? forecastMonths.slice(0, 3).reduce((s, m) => s + m.stockInvesting + m.cryptoInvesting, 0) / 3
      : 0;
    if (totalMonthlyDCA > 2_000) {
      smartActions.push({
        type: 'reduce_dca',
        description: `Reducing monthly DCA by 50% would free ~$${Math.round(totalMonthlyDCA * 0.5).toLocaleString()}/mo`,
        estimatedImpact: totalMonthlyDCA * 0.5,
      });
    }

    // Refinance suggestion if mortgage is a large outflow
    const avgMortgage = forecastMonths.slice(0, 3).reduce((s, m) => s + m.mortgagePpor + m.mortgageIp, 0) / 3;
    if (avgMortgage > 4_000) {
      smartActions.push({
        type: 'refinance',
        description: 'Refinancing at a lower rate could reduce monthly mortgage outflows',
        estimatedImpact: avgMortgage * 0.1, // 10% saving estimate
      });
    }
  }

  // Emergency buffer status
  const currentMonth = forecastMonths[0] ?? ledger[ledger.length - 1];
  let emergencyBufferStatus: LiquidityReport['emergencyBufferStatus'] = 'healthy';
  if (currentMonth) {
    if (currentMonth.availableCash < BUFFER_CRITICAL) {
      emergencyBufferStatus = 'depleted';
    } else if (currentMonth.availableCash < bufferThreshold) {
      emergencyBufferStatus = 'at_risk';
    }
  }

  // Lowest cash month
  let lowestCashMonth: LedgerMonth | null = null;
  let lowestCash = Infinity;
  for (const m of forecastMonths) {
    if (m.closingCash < lowestCash) {
      lowestCash = m.closingCash;
      lowestCashMonth = m;
    }
  }

  // Next major event (first significant one-time outflow or inflow)
  let nextMajorEvent: CashEvent | null = null;
  const now = new Date();
  const nowKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  for (const m of forecastMonths) {
    if (m.key < nowKey) continue;
    const major = m.events.find(ev =>
      Math.abs(ev.amount) >= 10_000 &&
      ['property_purchase', 'stock_buy', 'crypto_buy', 'stock_sell', 'crypto_sell', 'tax_refund'].includes(ev.type)
    );
    if (major) {
      nextMajorEvent = major;
      break;
    }
  }

  // Forecast cash at 2030 and 2035
  const month2030 = [...ledger].reverse().find(m => m.year === 2030);
  const month2035 = [...ledger].reverse().find(m => m.year === 2035);
  const forecastCash2030 = month2030?.closingCash ?? 0;
  const forecastCash2035 = month2035?.closingCash ?? 0;

  return {
    warnings,
    smartActions,
    emergencyBufferStatus,
    lowestCashMonth,
    lowestCashAmount: lowestCash === Infinity ? 0 : Math.round(lowestCash),
    nextMajorEvent,
    forecastCash2030,
    forecastCash2035,
    bufferThreshold,
  };
}

// ─── Helper: get warning level for a month key ────────────────────────────────

export function getWarningLevel(
  report: LiquidityReport,
  monthKey: string,
): LiquidityWarningLevel {
  const w = report.warnings.find(x => x.monthKey === monthKey);
  return w?.level ?? 'ok';
}
