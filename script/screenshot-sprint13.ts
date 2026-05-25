/**
 * Sprint 13 — screenshot capture.
 *
 * Renders the 4 redesigned screens as static HTML using a hand-built mock
 * of the Sprint 13 sections. We use a hand-built HTML mock rather than SSR
 * because the AuditModeContext provider depends on React in module scope,
 * and we want zero runtime dependencies for the screenshot pipeline.
 *
 * Captures: portfolio-lab, decision, closure-lab, scenario-compare,
 * each at 1440×900 (desktop) and 390×844 (mobile), in two states (empty +
 * populated). 16 total.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const ROOT = path.resolve(process.cwd());
const SHOT_DIR = path.join(ROOT, "screenshots", "sprint13");
fs.mkdirSync(SHOT_DIR, { recursive: true });

// Find the built CSS bundle so the rendered HTML matches production tailwind.
function findCssBundle(): string {
  const dir = path.join(ROOT, "dist", "public", "assets");
  if (!fs.existsSync(dir)) return "";
  const f = fs.readdirSync(dir).find((n) => n.endsWith(".css"));
  if (!f) return "";
  return fs.readFileSync(path.join(dir, f), "utf8");
}

const css = findCssBundle();

function fmtMoney(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

function tile(label: string, value: string, source: string, testid: string, tone: string = ""): string {
  return `
  <div class="rounded-lg border border-border bg-card/70 px-3 py-2" data-testid="${testid}">
    <div class="text-[10px] uppercase tracking-wider text-muted-foreground leading-tight">${label}</div>
    <div class="text-lg sm:text-xl font-semibold tabular-nums leading-tight ${tone}" data-testid="${testid}-value">${value}</div>
    <div class="text-[11px] leading-tight text-muted-foreground/80 mt-1" data-testid="${testid}-source">Source: ${source}</div>
  </div>`;
}

function fireCommandCenter(prefix: string, populated: boolean): string {
  if (!populated) {
    return `
    <section class="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4" data-testid="${prefix}-empty">
      <h2 class="text-base sm:text-lg font-semibold text-foreground mb-1">Set a FIRE goal to see your gap</h2>
      <p class="text-xs text-muted-foreground mb-3">The Command Center activates once your Dashboard has a FIRE target net worth.</p>
      <a href="/dashboard" class="inline-flex items-center text-sm font-medium text-emerald-700">Go to Dashboard →</a>
    </section>`;
  }
  return `
  <section class="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 sm:p-4 shadow-sm" data-testid="${prefix}">
    <header class="mb-3 flex items-baseline justify-between">
      <h2 class="text-base sm:text-lg font-semibold text-foreground" data-testid="${prefix}-title">FIRE Command Center</h2>
      <span class="text-[11px] uppercase tracking-wider text-muted-foreground">Your situation in 30 seconds</span>
    </header>
    <div class="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
      ${tile("Current Net Worth", fmtMoney(1_220_000), "Canonical Ledger", `${prefix}-current-nw`)}
      ${tile("Target Net Worth", fmtMoney(3_500_000), "Dashboard Goal", `${prefix}-target-nw`)}
      ${tile("Gap", fmtMoney(2_280_000), "Forecast Engine", `${prefix}-gap`, "text-rose-600")}
      ${tile("Years Remaining", "19 yrs", "Dashboard Goal", `${prefix}-years-remaining`)}
      ${tile("Probability", "62%", "Scenario Engine", `${prefix}-probability`, "text-amber-600")}
    </div>
  </section>`;
}

function topActions(prefix: string, populated: boolean, title = "Top 3 Actions"): string {
  if (!populated) {
    return `<section data-testid="${prefix}-empty"><p class="text-xs text-muted-foreground">All current paths meet feasibility — no actions needed.</p></section>`;
  }
  const cards = [
    { what: "Buy investment property in 2027", when: "2027", why: "Adds passive income and accelerates net worth growth.", expected: "+$1.2M NW · +$35k PI · +17%" },
    { what: "Set monthly investing to $4k/mo", when: "Now", why: "Boosts portfolio compounding before retirement.", expected: "+$800K NW" },
    { what: "Reach FIRE by 2042", when: "2042", why: "Median projected FIRE year — the destination this plan targets.", expected: "+5%" },
  ];
  return `
  <section data-testid="${prefix}">
    <header class="mb-2 flex items-baseline justify-between">
      <h3 class="text-sm font-semibold uppercase tracking-wider text-muted-foreground">${title}</h3>
    </header>
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
      ${cards
        .map(
          (c, idx) => `
        <div class="rounded-lg border border-emerald-500/25 bg-card p-3 flex flex-col gap-2" data-testid="${prefix}-card-${idx + 1}">
          <div>
            <div class="text-sm font-medium text-foreground leading-snug" data-testid="${prefix}-card-${idx + 1}-what">${c.what}</div>
            <div class="text-[11px] text-muted-foreground mt-0.5" data-testid="${prefix}-card-${idx + 1}-when">${c.when}</div>
          </div>
          <div class="text-xs text-muted-foreground leading-snug border-t border-border/60 pt-2" data-testid="${prefix}-card-${idx + 1}-why">${c.why}</div>
          <div class="text-[11px] font-medium text-emerald-700 tabular-nums border-t border-border/60 pt-2" data-testid="${prefix}-card-${idx + 1}-expected">${c.expected}</div>
          <div class="text-[11px] leading-tight text-muted-foreground/80 mt-1">Source: Goal Solver</div>
        </div>`,
        )
        .join("")}
    </div>
  </section>`;
}

function blockersRow(prefix: string, populated: boolean): string {
  if (!populated) return "";
  const rows = [
    { rank: 1, label: "Monthly surplus too low", impact: "●●●●●", required: "Increase savings by $1,200/month", benefit: "+14% probability" },
    { rank: 2, label: "Equity timing locked", impact: "●●●○○", required: "Delay equity release to 2028", benefit: "+8% probability" },
    { rank: 3, label: "Risk limit exceeded", impact: "●●○○○", required: "Lower equity exposure to ≤ 65%", benefit: "+3% probability" },
  ];
  return `
  <section data-testid="${prefix}">
    <header class="mb-2 flex items-baseline justify-between">
      <h3 class="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Biggest Blockers</h3>
    </header>
    <div class="flex flex-col gap-1.5">
      ${rows
        .map(
          (b) => `
        <div class="rounded-lg border border-rose-500/20 bg-card px-3 py-2 flex flex-col sm:flex-row sm:items-center sm:gap-3" data-testid="${prefix}-row-${b.rank}">
          <div class="flex items-center gap-2 min-w-0 flex-1">
            <span class="text-xs font-bold text-rose-600 tabular-nums">#${b.rank}</span>
            <span class="text-sm font-medium text-foreground" data-testid="${prefix}-row-${b.rank}-label">${b.label}</span>
          </div>
          <div class="flex items-center gap-3 text-[11px] mt-1 sm:mt-0">
            <span class="font-mono text-rose-500" data-testid="${prefix}-row-${b.rank}-impact">${b.impact}</span>
            <span class="text-muted-foreground" data-testid="${prefix}-row-${b.rank}-required">${b.required}</span>
            <span class="text-emerald-700" data-testid="${prefix}-row-${b.rank}-benefit">${b.benefit}</span>
          </div>
        </div>`,
        )
        .join("")}
    </div>
  </section>`;
}

function doNothing(prefix: string, populated: boolean): string {
  if (!populated) return "";
  return `
  <section class="rounded-lg border border-zinc-300/40 bg-muted/20 px-3 py-2" data-testid="${prefix}">
    <h3 class="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">If you do nothing</h3>
    <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
      <div class="flex items-baseline justify-between gap-2 text-sm" data-testid="${prefix}-nw">
        <dt class="text-muted-foreground">Net Worth:</dt>
        <dd class="flex items-baseline gap-2">
          <span class="font-semibold tabular-nums text-foreground" data-testid="${prefix}-nw-value">${fmtMoney(1_220_000)}</span>
          <span class="text-[11px] text-muted-foreground/80">Source: Forecast Engine (baseline)</span>
        </dd>
      </div>
      <div class="flex items-baseline justify-between gap-2 text-sm" data-testid="${prefix}-pi">
        <dt class="text-muted-foreground">Passive Income:</dt>
        <dd class="flex items-baseline gap-2">
          <span class="font-semibold tabular-nums text-foreground" data-testid="${prefix}-pi-value">$30K</span>
          <span class="text-[11px] text-muted-foreground/80">Source: Forecast Engine (baseline)</span>
        </dd>
      </div>
      <div class="flex items-baseline justify-between gap-2 text-sm" data-testid="${prefix}-prob">
        <dt class="text-muted-foreground">Probability:</dt>
        <dd class="flex items-baseline gap-2">
          <span class="font-semibold tabular-nums text-foreground" data-testid="${prefix}-prob-value">12%</span>
          <span class="text-[11px] text-muted-foreground/80">Source: Scenario Engine</span>
        </dd>
      </div>
      <div class="flex items-baseline justify-between gap-2 text-sm" data-testid="${prefix}-fire-date">
        <dt class="text-muted-foreground">Expected FIRE:</dt>
        <dd class="flex items-baseline gap-2">
          <span class="font-semibold tabular-nums text-foreground" data-testid="${prefix}-fire-date-value">2061</span>
          <span class="text-[11px] text-muted-foreground/80">Source: Path Simulation</span>
        </dd>
      </div>
    </dl>
  </section>`;
}

function recVsBaselineChart(populated: boolean): string {
  if (!populated) return "";
  return `
  <div class="rounded-lg border border-border bg-card/70 px-3 py-2" data-testid="chart-recommended-vs-do-nothing">
    <div class="flex items-baseline justify-between mb-1">
      <h3 class="text-[11px] uppercase tracking-wider text-muted-foreground">Recommended vs Do Nothing</h3>
      <span class="text-[10px] text-muted-foreground">Source: Path Simulation · Forecast Engine</span>
    </div>
    <svg width="100%" height="180" viewBox="0 0 800 180" preserveAspectRatio="none">
      <line x1="0" y1="160" x2="800" y2="60" stroke="#10b981" stroke-width="3" fill="none" />
      <line x1="0" y1="160" x2="800" y2="160" stroke="#9ca3af" stroke-width="2" stroke-dasharray="5 5" fill="none" />
      <text x="650" y="55" fill="#10b981" font-size="11">Recommended</text>
      <text x="650" y="155" fill="#9ca3af" font-size="11">Do nothing</text>
    </svg>
  </div>`;
}

function pageDoc(title: string, breakpoint: "desktop" | "mobile", populated: boolean): string {
  const desktop = breakpoint === "desktop";
  const w = desktop ? 1440 : 390;
  const prefix = title === "portfolio-lab" ? "fcc"
    : title === "decision" ? "fcc"
    : title === "closure-lab" ? "gcl-fcc"
    : "sc-fcc";
  const top3Prefix = title === "closure-lab" ? "gcl-top3" : title === "scenario-compare" ? "sc-top3" : "top3";
  const blockersPrefix = title === "closure-lab" ? "gcl-blockers" : title === "scenario-compare" ? "sc-blockers" : "blockers";
  const doNothingPrefix = title === "closure-lab" ? "gcl-do-nothing" : title === "scenario-compare" ? "sc-do-nothing" : "do-nothing";
  const top3Title = title === "scenario-compare" ? "Top 3 differences vs base" : "Top 3 Actions";
  const body = `
    <div class="flex flex-col gap-3 sm:gap-4 p-3 sm:p-4">
      <h1 class="text-lg sm:text-xl font-bold text-foreground capitalize">${title.replace("-", " ")}</h1>
      ${fireCommandCenter(prefix, populated)}
      ${recVsBaselineChart(populated)}
      ${topActions(top3Prefix, populated, top3Title)}
      ${blockersRow(blockersPrefix, populated)}
      ${doNothing(doNothingPrefix, populated)}
      <details class="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30">
        <summary class="px-4 py-3 text-sm font-medium text-muted-foreground cursor-pointer">View Supporting Analysis</summary>
        <div class="px-4 py-4 text-xs text-muted-foreground">[Sprint 11/12 sections live here, collapsed by default]</div>
      </details>
    </div>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=${w}, initial-scale=1" />
<title>Sprint 13 ${title} ${breakpoint} ${populated ? "populated" : "empty"}</title>
<style>${css}</style>
<style>
  body { margin: 0; padding: 0; background: #f8fafc; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #0f172a; }
  #root { max-width: ${w}px; margin: 0 auto; }
</style>
</head><body><div id="root">${body}</div></body></html>`;
}

(async () => {
  const executablePath =
    process.env.PLAYWRIGHT_CHROMIUM ||
    `${process.env.HOME}/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome`;
  const browser = await chromium.launch({
    headless: true,
    executablePath: fs.existsSync(executablePath) ? executablePath : undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });

  const screens = ["portfolio-lab", "decision", "closure-lab", "scenario-compare"] as const;
  const breakpoints: Array<{ name: "desktop" | "mobile"; w: number; h: number }> = [
    { name: "desktop", w: 1440, h: 900 },
    { name: "mobile", w: 390, h: 844 },
  ];
  const states = [
    { name: "populated", populated: true },
    { name: "empty", populated: false },
  ];

  for (const bp of breakpoints) {
    const context = await browser.newContext({ viewport: { width: bp.w, height: bp.h }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    for (const screen of screens) {
      for (const state of states) {
        const doc = pageDoc(screen, bp.name, state.populated);
        const name = `${screen}_${bp.name}_${state.name}`;
        const htmlPath = path.join(SHOT_DIR, `${name}.html`);
        fs.writeFileSync(htmlPath, doc);
        await page.setContent(doc, { waitUntil: "networkidle" });
        const outPath = path.join(SHOT_DIR, `${name}.png`);
        await page.screenshot({ path: outPath, fullPage: true });
        const stat = fs.statSync(outPath);
        console.log(`Wrote ${outPath} (${(stat.size / 1024).toFixed(1)} KB)`);
      }
    }
    await context.close();
  }

  await browser.close();
  console.log("Done.");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
