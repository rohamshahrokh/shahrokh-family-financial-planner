/**
 * uiCopy.test.tsx — Sprint 20 PR-A + PR-B banned-strings guard.
 *
 * Static-scan guard: parses every .tsx file under client/src and looks for
 * banned strings inside JSX text content + UI string attributes (title,
 * subtitle, label, placeholder, aria-label). Comments, JSDoc, source-tag
 * audit strings, and code-only identifier references (e.g.
 * `import x from "./decisionCandidates"`) are intentionally excluded — they
 * are not user-visible.
 *
 * Banned strings (exact, case-insensitive):
 *   - "incomplete data"     → use <EmptyStateExplainer /> or "inputs missing"
 *   - "undefined"           → user-visible undefined is a bug
 *   - "NaN"                 → user-visible NaN is a bug
 *   - "canonical engine"    → say "live planner" or "verified pass-through"
 *   - "canonical engines"   → say "live planner"
 *   - "decisionCandidates"  → engineering noun; never user-visible
 *   - "scenario ids"        → engineering noun
 *   - "audit traces"        → engineering noun
 *   - "search exhausted"    → say what was searched + why
 *   - "engine-backed scenarios" → say "simulated paths"
 *   - "closed-form estimate"   → engineering noun; use "deterministic estimate"
 *   - "probability" — when used for heuristic confidence (user constraint:
 *     don't call heuristic confidence "probability"). Allowed only when paired
 *     with "Monte Carlo" / "MC" within ~40 chars (a true MC probability).
 *
 * Run with:
 *   npx tsx client/src/__tests__/uiCopy.test.tsx
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✔ ${name}`); }
  else { fail++; console.log(`  ✘ ${name}${detail ? ` — ${detail}` : ""}`); }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..", "..", "..");
const CLIENT_SRC = join(REPO_ROOT, "client", "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      walk(full, out);
    } else if (/\.tsx$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** Strip /* … * / block comments and // line comments from a TSX source. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/**
 * Extract spans of source that are reasonably likely to be user-visible:
 *
 *   - JSX text content between `>` and `<` (i.e. `<p>Hello {n}</p>`)
 *   - String attribute values for attribute names typically used for visible
 *     copy: title, subtitle, label, placeholder, aria-label
 *   - Top-level template literals inside *those* JSX spans (already part of
 *     the text)
 *
 * This is intentionally conservative — false positives (e.g. an import path)
 * are excluded by limiting to JSX text content + visible attributes.
 */
function extractVisibleSpans(src: string): string[] {
  const noComments = stripComments(src);
  const spans: string[] = [];

  // JSX text content: anything between `>` and `<` that isn't itself a tag.
  // This regex over-matches a little (e.g. it grabs `>{value}<`), which is
  // fine because we then filter banned strings inside those spans.
  const jsxText = noComments.match(/>[^<>{}\n]{4,}</g);
  if (jsxText) {
    for (const m of jsxText) {
      spans.push(m.slice(1, -1));
    }
  }

  // Visible attribute literals: title="...", subtitle="...", label="...",
  // placeholder="...", aria-label="..."
  const attrRe = /\b(title|subtitle|label|placeholder|aria-label)\s*=\s*(["'`])([^"'`]+)\2/g;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(noComments)) !== null) {
    spans.push(m[3]);
  }

  return spans;
}

const BANNED: { pattern: RegExp; label: string }[] = [
  { pattern: /\bincomplete data\b/i, label: "incomplete data" },
  { pattern: /\bcanonical engines?\b/i, label: "canonical engine(s)" },
  { pattern: /\bdecisionCandidates\b/, label: "decisionCandidates" },
  { pattern: /\bscenario ids\b/i, label: "scenario ids" },
  { pattern: /\baudit traces\b/i, label: "audit traces" },
  { pattern: /\bsearch exhausted\b/i, label: "search exhausted" },
  { pattern: /\bengine-backed scenarios\b/i, label: "engine-backed scenarios" },
  { pattern: /\bclosed-form estimate\b/i, label: "closed-form estimate" },
  // Literal "NaN" or "undefined" in a JSX text span is almost always a bug;
  // these match the bare word to avoid catching code identifiers (which are
  // not in JSX text spans anyway).
  { pattern: /\bNaN\b/, label: "NaN" },
  { pattern: /\bundefined\b/, label: "undefined" },
];

/**
 * Heuristic-confidence "probability" guard (user constraint).
 *
 * A user-visible span is flagged when it uses the word "probability" /
 * "probabilities" outside of a Monte-Carlo context. The check is file-aware:
 * pages/components whose source clearly hosts Monte-Carlo (imports MC
 * engines or shows "Monte Carlo" copy) are allowed because those probabilities
 * are calibrated, not heuristic.
 *
 * Spans that explicitly mention "FIRE", "monte carlo", "MC ", "simulation"
 * inside the same span are also allowed.
 */
function isFileMcContext(src: string): boolean {
  return (
    /Monte\s*Carlo|monteCarlo|forecastStore|MonteCarloDashboard|MonteCarloChart|MonteCarloOverlay/.test(src)
  );
}
function spanHasHeuristicProbability(span: string, fileSrc: string): boolean {
  const lower = span.toLowerCase();
  if (!/\bprobabilit(y|ies)\b/.test(lower)) return false;
  if (/\b(monte\s*carlo|\bmc[-\s]|simulation|simulated|\bfire\b)\b/.test(lower)) return false;
  if (isFileMcContext(fileSrc)) return false;
  return true;
}

console.log("\n── Scan: banned strings in user-visible JSX text + attrs ──");
{
  const violations: { file: string; banned: string; sample: string }[] = [];
  for (const file of walk(CLIENT_SRC)) {
    const rel = relative(CLIENT_SRC, file).split(sep).join("/");
    // Skip EmptyStateExplainer (the canonical replacement) and the Help page
    // (which legitimately documents NaN/data-quality as a user-visible
    // concept — the data-health card it describes is a real feature).
    if (rel === "components/EmptyStateExplainer.tsx") continue;
    if (rel === "pages/help.tsx") continue;
    const src = readFileSync(file, "utf8");
    const spans = extractVisibleSpans(src);
    for (const span of spans) {
      for (const rule of BANNED) {
        if (rule.pattern.test(span)) {
          violations.push({ file: rel, banned: rule.label, sample: span.trim().slice(0, 80) });
        }
      }
      if (spanHasHeuristicProbability(span, src)) {
        violations.push({
          file: rel,
          banned: "probability (heuristic confidence — Sprint 20 PR-B)",
          sample: span.trim().slice(0, 80),
        });
      }
    }
  }

  check(
    `no banned strings in user-visible JSX text / attribute literals (found ${violations.length})`,
    violations.length === 0,
    violations.length
      ? "\n      " + violations.slice(0, 10).map((v) => `[${v.banned}] ${v.file}: "${v.sample}"`).join("\n      ")
      : undefined,
  );
}

console.log(`\n── Summary ──\n  pass: ${pass}\n  fail: ${fail}`);
if (fail > 0) process.exit(1);
