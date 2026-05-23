/**
 * auditMode/index.ts — Public barrel for the global Audit Mode feature.
 *
 *   • Engines / trace-factory modules import:
 *       import { registerTrace, type CalculationTrace } from "@/lib/auditMode";
 *
 *   • UI surfaces import:
 *       import { useAuditMode, AuditableMetric } from "@/lib/auditMode";
 *
 * Keeping a single barrel prevents UI components from reaching into engine
 * trace-factory files and lets every consumer compose against the same model.
 */

export type {
  CalculationTrace,
  TraceInput,
  TraceAssumption,
  TraceIncludedExcluded,
  TraceDisplayValue,
} from './calculationTrace';
export { hashTraceInputs } from './calculationTrace';

export {
  registerTrace,
  registerTraceFactory,
  resolveTrace,
  hasTrace,
  listTraceIds,
  unregisterTrace,
  subscribeRegistry,
  __resetTraceRegistry,
} from './auditRegistry';

export {
  AuditModeProvider,
  useAuditMode,
  type AuditModeContextValue,
} from './AuditModeContext';

export { AuditableMetric } from '../../components/auditMode/AuditableMetric';
export { CalculationTracePanel } from '../../components/auditMode/CalculationTracePanel';
export { AuditModeToggle } from '../../components/auditMode/AuditModeToggle';
