/**
 * Sprint 11 — AdvancedDisclosure smoke test.
 *
 * The project uses tsx scripts as its test runner. This script statically
 * inspects the AdvancedDisclosure component source for the contract used by
 * Sprint 11 redesigns:
 *
 *   - default collapsed (`useState(... defaultOpen || ...)`)
 *   - audit-mode auto-opens (`useAuditMode()` + `useEffect`)
 *   - exposes the documented testids
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const file = resolve(__dirname, "..", "client/src/components/ui/AdvancedDisclosure.tsx");
const src = readFileSync(file, "utf8");

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exitCode = 1;
  } else {
    console.log(`ok   ${msg}`);
  }
}

assert(src.includes("export function AdvancedDisclosure"), "exports AdvancedDisclosure");
assert(src.includes("useAuditMode"), "consumes useAuditMode");
assert(src.includes('"Where did these numbers come from?"'), "default title matches spec");
assert(src.includes('defaultOpen'), "exposes defaultOpen prop");
assert(/useState<boolean>\([^)]*defaultOpen/.test(src), "default state derived from defaultOpen");
assert(src.includes('data-testid={`${testId}-toggle`}'), "renders toggle testid");
assert(src.includes('data-testid={`${testId}-content`}'), "renders content testid (when open)");
assert(/auditMode\s*\)\s*setOpen\(true\)/.test(src), "audit-mode forces open via effect");

if (process.exitCode) {
  console.error("AdvancedDisclosure smoke test FAILED");
} else {
  console.log("AdvancedDisclosure smoke test passed");
}
