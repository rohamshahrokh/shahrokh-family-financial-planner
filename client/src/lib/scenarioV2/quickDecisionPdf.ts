/**
 * Quick Decision — Institutional PDF Report (Phase 2.7)
 * ─────────────────────────────────────────────────────────────────────────────
 * Executive-grade PDF for the unified Quick Decision flow. Surfaces the full
 * Phase 2.2–2.4 surface area:
 *
 *   Cover                — branded header, question, winner, profile, hashes
 *   Executive Summary    — TLDR, composite score, P50/P10/P90 NW, tail summary
 *   Why It Wins          — winner rationale + score waterfall table
 *   Tail Risk            — VaR/CVaR/MaxDD/insolvency/liquidity probability
 *   Fan Chart            — P5–P95 percentile table, optionally a captured PNG
 *   Score Comparison     — Winner vs runner-up axis-by-axis table
 *   Invalidation         — engine-derived conditions that would flip the call
 *   Execution Plan       — phased deterministic plan (start/end month, actions)
 *   Conditional Recs     — trigger/action/rationale, sorted by severity
 *   Discarded            — alternatives rejected and the reason
 *   Audit Trail          — basePlanHash, generatedAt, profile weights
 *   Disclaimer           — full legal text
 *
 * Strict rules:
 *   • No AI-generated copy.
 *   • All numbers come from the engine. No filler text.
 *   • Privacy toggle honoured everywhere (currency + pct + narrative).
 *   • Determinism: same QuickDecisionOutput → byte-identical PDF body
 *     (jsPDF metadata aside).
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import html2canvas from "html2canvas";

import type {
  QuickDecisionOutput,
  ExecutionPlanPhase,
  ConditionalRecommendation,
  RiskControlMode,
} from "./decisionEngine/candidateGenerator";
import type { InvestorProfileSpec } from "./registry";
import { collectAssumptionsUsed } from "./assumptions";
import type { CanonicalNetWorth, NwReconciliation } from "../dashboardDataContract";

// ─── PDF glyph sanitisation (audit fix P1.6 / PDF-1) ─────────────────────────
//
// jsPDF's default WinAnsi encoding cannot render the box-drawing characters,
// arrow symbols, and emoji that creep into the source as visual flourishes.
// Embedding a Unicode TTF adds ~200KB to the bundle; instead we map every
// known offender to an ASCII equivalent and strip any remaining > 0xFF
// codepoint to "?".

const PDF_GLYPH_MAP: Record<string, string> = {
  "→": "->",   // →
  "←": "<-",   // ←
  "↑": "^",    // ↑
  "↓": "v",    // ↓
  "≥": ">=",   // ≥
  "≤": "<=",   // ≤
  "≠": "!=",   // ≠
  "≈": "~=",   // ≈
  "±": "+/-",  // ±
  "−": "-",    // −
  "—": "--",   // —
  "–": "-",    // –
  "·": "-",    // ·
  "•": "*",    // •
  "…": "...",  // …
  "✓": "[OK]", // ✓
  "✗": "[X]",  // ✗
  "⚠": "[!]",  // ⚠
  "★": "*",    // ★
  "☆": "*",    // ☆
  "°": " deg", // °
  "“": '"',    // “
  "”": '"',    // ”
  "‘": "'",    // ‘
  "’": "'",    // ’
  "∞": "inf",  // ∞
  "ν": "nu",   // ν
  "σ": "sigma", // σ
  "μ": "mu",   // μ
  // Box-drawing
  "─": "-", "│": "|",
  "┌": "+", "┐": "+", "└": "+", "┘": "+",
  "├": "+", "┤": "+", "┬": "+", "┴": "+", "┼": "+",
};

/** Replace every non-WinAnsi glyph with an ASCII fallback. */
export function pdfSafe(s: string | number | undefined | null): string {
  if (s === null || s === undefined) return "";
  let out = typeof s === "number" ? String(s) : s;
  for (const [u, a] of Object.entries(PDF_GLYPH_MAP)) {
    if (out.indexOf(u) >= 0) out = out.split(u).join(a);
  }
  // Anything else > 0xFF is replaced with "?" so the WinAnsi encoder cannot
  // produce wide blank rectangles.
  return out.replace(/[^\x00-\xFF]/g, "?");
}

/**
 * Monkey-patch a jsPDF instance so every `doc.text(...)` call routes through
 * `pdfSafe`. Cleaner than search-replacing 200 callsites; carries no behaviour
 * change beyond the glyph sanitisation.
 */
function installPdfSafeText(doc: jsPDF): void {
  const orig = doc.text.bind(doc) as (...args: any[]) => any;
  (doc as any).text = (...args: any[]) => {
    const t = args[0];
    if (typeof t === "string") {
      args[0] = pdfSafe(t);
    } else if (Array.isArray(t)) {
      args[0] = t.map(x => (typeof x === "string" ? pdfSafe(x) : x));
    }
    return orig(...args);
  };
}

/** Sanitise an autoTable `body` matrix (every cell string is passed through pdfSafe). */
function sanitiseTableBody(body: any[][]): any[][] {
  return body.map(row => row.map(cell => (typeof cell === "string" ? pdfSafe(cell) : cell)));
}

/** Sanitise an autoTable `head` matrix. */
function sanitiseTableHead(head: any[][]): any[][] {
  return head.map(row => row.map(cell => (typeof cell === "string" ? pdfSafe(cell) : cell)));
}

/**
 * Wrapper around jspdf-autotable that pre-sanitises any string in head/body
 * cells (numbers + arrays of style objects pass through unchanged).
 */
function safeAutoTable(doc: jsPDF, opts: Parameters<typeof autoTable>[1]): void {
  const next: any = { ...opts };
  if (Array.isArray(next.body)) next.body = sanitiseTableBody(next.body);
  if (Array.isArray(next.head)) next.head = sanitiseTableHead(next.head);
  autoTable(doc, next);
}

// ─── Palette (mirrors pdfReport.ts so the two PDFs look consistent) ──────────

const COLORS = {
  primary: [99, 102, 241] as [number, number, number],   // indigo-500
  accent:  [168, 85, 247] as [number, number, number],   // purple-500
  emerald: [16, 185, 129] as [number, number, number],
  sky:     [14, 165, 233] as [number, number, number],
  amber:   [245, 158, 11] as [number, number, number],
  rose:    [244, 63, 94]  as [number, number, number],
  slate:   [100, 116, 139] as [number, number, number],
  text:    [15, 23, 42]    as [number, number, number],   // slate-900
  muted:   [100, 116, 139] as [number, number, number],
  border:  [226, 232, 240] as [number, number, number],
  bgSoft:  [248, 250, 252] as [number, number, number],
};

const SEVERITY_TONE: Record<ConditionalRecommendation["severity"], [number, number, number]> = {
  critical: COLORS.rose,
  warn: COLORS.amber,
  info: COLORS.sky,
};

// ─── Layout ──────────────────────────────────────────────────────────────────

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 42;
const CONTENT_W = PAGE_W - MARGIN * 2;

// ─── Privacy-aware formatters ────────────────────────────────────────────────

const raw$ = (n: number) => "$" + Math.round(n).toLocaleString("en-AU");
const raw$M = (n: number) =>
  Math.abs(n) >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(2)}M`
    : `$${Math.round(n / 1000)}k`;
const rawPct = (n: number, d = 1) => `${(n * 100).toFixed(d)}%`;

function buildFmts(hidden: boolean) {
  if (!hidden) {
    return {
      fmt$: raw$,
      fmt$M: raw$M,
      pct: rawPct,
      sentence: (s: string) => s,
    };
  }
  return {
    fmt$: (_n: number) => "$******",
    fmt$M: (_n: number) => "$****",
    pct: (_n: number, _d = 1) => "***%",
    // Mask $X and X% inside narrative strings, leave the rest intact
    sentence: (s: string) =>
      s.replace(/\$[\d,.\-]+[kKmM]?/g, "$******").replace(/[\d,.]+%/g, "***%"),
  };
}

// ─── Primitives ──────────────────────────────────────────────────────────────

function setText(doc: jsPDF, rgb: [number, number, number]) { doc.setTextColor(rgb[0], rgb[1], rgb[2]); }
function setFill(doc: jsPDF, rgb: [number, number, number]) { doc.setFillColor(rgb[0], rgb[1], rgb[2]); }
function setDraw(doc: jsPDF, rgb: [number, number, number]) { doc.setDrawColor(rgb[0], rgb[1], rgb[2]); }

function newPage(doc: jsPDF): number { doc.addPage(); return MARGIN + 20; }

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > PAGE_H - 60) return newPage(doc);
  return y;
}

function sectionHeader(doc: jsPDF, y: number, title: string, accent: [number, number, number] = COLORS.primary): number {
  setFill(doc, accent);
  doc.rect(MARGIN, y - 2, 3, 16, "F");
  setText(doc, COLORS.text);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(title, MARGIN + 10, y + 10);
  return y + 22;
}

function paragraph(
  doc: jsPDF,
  text: string,
  y: number,
  opts?: { fontSize?: number; color?: [number, number, number]; bold?: boolean; maxW?: number },
): number {
  const fontSize = opts?.fontSize ?? 10;
  const color = opts?.color ?? COLORS.text;
  const bold = opts?.bold ?? false;
  const maxW = opts?.maxW ?? CONTENT_W;
  setText(doc, color);
  doc.setFont("helvetica", bold ? "bold" : "normal");
  doc.setFontSize(fontSize);
  const lines = doc.splitTextToSize(text, maxW) as string[];
  lines.forEach((line, i) => doc.text(line, MARGIN, y + i * (fontSize + 3)));
  return y + lines.length * (fontSize + 3) + 4;
}

function drawPageFooter(doc: jsPDF, pageNum: number, totalPages: number, householdName: string) {
  setText(doc, COLORS.muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`${householdName} · Family Wealth Lab · Quick Decision`, MARGIN, PAGE_H - 22);
  doc.text(`Page ${pageNum} of ${totalPages}`, PAGE_W - MARGIN, PAGE_H - 22, { align: "right" });
  setDraw(doc, COLORS.border);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, PAGE_H - 28, PAGE_W - MARGIN, PAGE_H - 28);
}

async function captureChart(el: HTMLElement | null): Promise<string | null> {
  if (!el) return null;
  try {
    const canvas = await html2canvas(el, {
      scale: 2,
      backgroundColor: "#ffffff",
      logging: false,
      useCORS: true,
    });
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

// ─── Entry-point shape ───────────────────────────────────────────────────────

export interface QuickDecisionPdfData {
  householdName: string;
  output: QuickDecisionOutput;
  profile: InvestorProfileSpec;
  generatedAt: string;
  hideValues?: boolean;
  /** Optional captured DOM nodes (FanChart, ScoreWaterfall) for embedding. */
  chartEls?: {
    fanChart?: HTMLElement | null;
    waterfall?: HTMLElement | null;
  };
  /**
   * Audit fix P1.6: canonical NW + reconciliation snapshot. When supplied, the
   * PDF renders a dedicated reconciliation page so users can confirm the
   * underlying figures match the dashboard.
   */
  netWorthReconciliation?: {
    canonical: CanonicalNetWorth;
    reconciliation: NwReconciliation;
  };
}

// ─── Cover page ──────────────────────────────────────────────────────────────

function renderCover(doc: jsPDF, data: QuickDecisionPdfData, F: ReturnType<typeof buildFmts>): void {
  // Header band
  setFill(doc, COLORS.accent);
  doc.rect(0, 0, PAGE_W, 200, "F");
  setFill(doc, COLORS.primary);
  doc.rect(0, 165, PAGE_W, 35, "F");

  setText(doc, [255, 255, 255]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("FAMILY WEALTH LAB · QUICK DECISION REPORT", MARGIN, 58);

  doc.setFontSize(32);
  doc.text(prettyQuestion(data.output.question), MARGIN, 108);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  const cap = data.output.capital != null
    ? `Capital under decision: ${F.fmt$(data.output.capital)}`
    : `Decision: ${prettyQuestion(data.output.question)}`;
  doc.text(cap, MARGIN, 142);

  // Decision card
  const cardY = 230;
  const cardH = 220;
  setFill(doc, [255, 255, 255]);
  doc.roundedRect(MARGIN, cardY, CONTENT_W, cardH, 8, 8, "F");
  setDraw(doc, COLORS.border);
  doc.setLineWidth(1);
  doc.roundedRect(MARGIN, cardY, CONTENT_W, cardH, 8, 8, "S");

  setText(doc, COLORS.muted);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("THE RECOMMENDATION", MARGIN + 18, cardY + 24);

  const winner = data.output.ranked[0];
  setText(doc, COLORS.text);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  const winnerLines = doc.splitTextToSize(winner?.label ?? "No viable candidate", CONTENT_W - 36) as string[];
  let y = cardY + 50;
  winnerLines.slice(0, 3).forEach(l => { doc.text(l, MARGIN + 18, y); y += 24; });

  // Headline
  setText(doc, COLORS.slate);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  if (winner?.headline) {
    const headlineLines = doc.splitTextToSize(F.sentence(winner.headline), CONTENT_W - 36) as string[];
    headlineLines.slice(0, 4).forEach(l => { doc.text(l, MARGIN + 18, y); y += 13; });
  }

  // Score ribbon
  if (winner) {
    const conf = Math.max(0, Math.min(100, winner.score.score));
    const confColor: [number, number, number] =
      conf >= 70 ? COLORS.emerald : conf >= 50 ? COLORS.amber : COLORS.rose;
    const ribbonY = cardY + cardH - 36;
    setFill(doc, COLORS.bgSoft);
    doc.roundedRect(MARGIN + 18, ribbonY, CONTENT_W - 36, 22, 4, 4, "F");
    setText(doc, COLORS.muted);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("COMPOSITE SCORE", MARGIN + 28, ribbonY + 14);
    setText(doc, confColor);
    doc.setFontSize(11);
    doc.text(`${conf.toFixed(1)} / 100`, PAGE_W - MARGIN - 28, ribbonY + 14, { align: "right" });
  }

  // Footer strip with profile + hash
  const fy = PAGE_H - 80;
  setText(doc, COLORS.muted);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("INVESTOR PROFILE", MARGIN, fy);
  setText(doc, COLORS.text);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.text(data.profile.label, MARGIN, fy + 14);

  setText(doc, COLORS.muted);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("GENERATED", PAGE_W / 2, fy);
  setText(doc, COLORS.text);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.text(data.generatedAt.slice(0, 19).replace("T", " "), PAGE_W / 2, fy + 14);

  setText(doc, COLORS.muted);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("BASE PLAN HASH", PAGE_W - MARGIN, fy, { align: "right" });
  setText(doc, COLORS.text);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.text(data.output.basePlanHash.slice(0, 12) + "…", PAGE_W - MARGIN, fy + 14, { align: "right" });
}

function prettyQuestion(q: string): string {
  // Convert e.g. "where_to_park_capital" → "Where to park capital?"
  const map: Record<string, string> = {
    where_to_park_capital: "Where to park new capital?",
    should_i_buy_property: "Should I buy property?",
    when_to_refinance: "When to refinance?",
    super_vs_debt: "Super contributions vs debt paydown?",
    accelerate_fire: "How do I accelerate FIRE?",
  };
  return map[q] ?? q.replace(/_/g, " ").replace(/^./, c => c.toUpperCase()) + "?";
}

// ─── Main entry-point ────────────────────────────────────────────────────────

export async function generateQuickDecisionPdf(data: QuickDecisionPdfData): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  // Audit fix P1.6: every string we render must pass through pdfSafe so that
  // jsPDF's WinAnsi encoding doesn't substitute wide blank rectangles for
  // arrows / box-drawing / emoji.
  installPdfSafeText(doc);
  const F = buildFmts(data.hideValues ?? false);
  const out = data.output;
  const winner = out.ranked[0];
  const runnerUp = out.ranked[1];

  // ── Cover ─────────────────────────────────────────────────────────────────
  renderCover(doc, data, F);

  if (!winner) {
    // Edge case: nothing to report
    doc.addPage();
    let y = MARGIN + 12;
    y = sectionHeader(doc, y, "No viable candidate", COLORS.rose);
    paragraph(doc, "The engine could not generate any candidate that passed the hard constraints (LVR ≤ 0.85, NSR ≥ 0.85, super caps, etc.). Loosen one or more inputs and re-run.", y, { fontSize: 10.5 });
    return doc;
  }

  // ── Executive summary ────────────────────────────────────────────────────
  doc.addPage();
  let y = MARGIN + 12;
  y = sectionHeader(doc, y, "Executive Summary", COLORS.accent);

  // TLDR (rationale[0])
  setFill(doc, COLORS.bgSoft);
  doc.roundedRect(MARGIN, y, CONTENT_W, 70, 8, 8, "F");
  setText(doc, COLORS.muted);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("TLDR", MARGIN + 14, y + 16);
  setText(doc, COLORS.text);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  const tldrText = winner.rationale[0] ?? winner.headline;
  const tldrLines = doc.splitTextToSize(F.sentence(tldrText), CONTENT_W - 28) as string[];
  tldrLines.slice(0, 3).forEach((l, i) => doc.text(l, MARGIN + 14, y + 34 + i * 14));
  y += 84;

  // KPI grid
  const finalFan = winner.result.netWorthFan[winner.result.netWorthFan.length - 1];
  const baseFinal = out.baseScenarioResult.netWorthFan[out.baseScenarioResult.netWorthFan.length - 1];
  const delta = finalFan && baseFinal ? finalFan.p50 - baseFinal.p50 : 0;
  const kpis: Array<{ label: string; value: string; sub: string }> = [
    { label: "Composite score", value: `${winner.score.score.toFixed(1)} / 100`, sub: `Profile: ${data.profile.label}` },
    { label: "Terminal NW (P50)", value: finalFan ? F.fmt$M(finalFan.p50) : "—", sub: finalFan ? `P10 ${F.fmt$M(finalFan.p10)} · P90 ${F.fmt$M(finalFan.p90)}` : "" },
    { label: "Delta vs base", value: F.fmt$M(delta), sub: baseFinal ? `Base P50: ${F.fmt$M(baseFinal.p50)}` : "" },
    { label: "Insolvency probability", value: F.pct(winner.result.defaultProbability ?? 0, 1), sub: `Liquidity exhaustion ${F.pct(winner.result.liquidityExhaustionProbability ?? 0, 1)}` },
  ];
  const kpiW = (CONTENT_W - 12) / 2;
  kpis.forEach((k, i) => {
    const x = MARGIN + (i % 2) * (kpiW + 12);
    const ky = y + Math.floor(i / 2) * 64;
    setFill(doc, [255, 255, 255]);
    setDraw(doc, COLORS.border);
    doc.setLineWidth(0.8);
    doc.roundedRect(x, ky, kpiW, 56, 6, 6, "FD");
    setText(doc, COLORS.muted);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text(k.label.toUpperCase(), x + 10, ky + 14);
    setText(doc, COLORS.text);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(k.value, x + 10, ky + 34);
    setText(doc, COLORS.muted);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(k.sub, x + 10, ky + 48);
  });
  y += 64 * Math.ceil(kpis.length / 2) + 16;

  // Why-it-wins bullets
  y = ensureSpace(doc, y, 100);
  y = sectionHeader(doc, y, "Why this wins", COLORS.emerald);
  for (const line of winner.rationale.slice(0, 6)) {
    y = ensureSpace(doc, y, 18);
    setText(doc, COLORS.emerald);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("✓", MARGIN, y + 8);
    setText(doc, COLORS.text);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(F.sentence(line), CONTENT_W - 16) as string[];
    lines.forEach((l, i) => doc.text(l, MARGIN + 14, y + 8 + i * 12));
    y += Math.max(16, lines.length * 12 + 4);
  }
  y += 8;

  // ── Net Worth Reconciliation page (audit fix P1.6 / P1.1) ─────────────────
  if (data.netWorthReconciliation) {
    doc.addPage();
    let yn = MARGIN + 12;
    yn = sectionHeader(doc, yn, "Net Worth Reconciliation", COLORS.primary);
    yn = paragraph(
      doc,
      "Side-by-side check of the dashboard's canonical NW vs the decision " +
      "engine's seeded initial state. Any drift greater than $1 is flagged as " +
      "a scope mismatch; the engine refuses to project when they disagree.",
      yn,
      { color: COLORS.muted, fontSize: 9.5 },
    );
    const cn = data.netWorthReconciliation.canonical;
    const rn = data.netWorthReconciliation.reconciliation;
    safeAutoTable(doc, {
      startY: yn,
      head: [["Component", "Amount"]],
      body: [
        ["PPOR",                          F.fmt$(cn.assets.ppor)],
        ["Cash + offset",                 F.fmt$(cn.assets.cashOffset)],
        ["Super (combined)",              F.fmt$(cn.assets.super)],
        ["Stocks",                        F.fmt$(cn.assets.stocks)],
        ["Crypto",                        F.fmt$(cn.assets.crypto)],
        ["Settled IP value",              F.fmt$(cn.assets.settledIpValue)],
        ["Cars",                          F.fmt$(cn.assets.cars)],
        ["Iran property",                 F.fmt$(cn.assets.iranProperty)],
        ["Other assets",                  F.fmt$(cn.assets.otherAssets)],
        ["Total assets",                  F.fmt$(cn.totalAssets)],
        ["PPOR mortgage",                 F.fmt$(-cn.liabilities.ppoMortgage)],
        ["Settled IP loans",              F.fmt$(-cn.liabilities.settledIpLoans)],
        ["Other debts",                   F.fmt$(-cn.liabilities.otherDebts)],
        ["Total liabilities",             F.fmt$(-cn.totalLiabilities)],
        ["Net worth (dashboard)",         F.fmt$(rn.dashboard)],
        ["Net worth (engine initial)",    F.fmt$(rn.engine)],
        ["Difference",                    F.fmt$(rn.diff)],
        ["Status",                        rn.status],
      ],
      styles: { fontSize: 9, cellPadding: 4, textColor: COLORS.text },
      headStyles: { fillColor: COLORS.primary, textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: COLORS.bgSoft },
      margin: { left: MARGIN, right: MARGIN },
      columnStyles: {
        0: { cellWidth: 250 },
        1: { halign: "right" },
      },
    });
  }

  // ── Score Waterfall page ─────────────────────────────────────────────────
  doc.addPage();
  let yw = MARGIN + 12;
  yw = sectionHeader(doc, yw, "Score Waterfall — axis contributions", COLORS.primary);
  yw = paragraph(
    doc,
    `The composite score is a convex-weighted sum of the axes below, less any penalties. ` +
    `Penalties (refinance pressure, LVR > 0.80) reduce the final score from the base.`,
    yw,
    { color: COLORS.muted, fontSize: 9.5 },
  );

  const sortedBreakdown = [...winner.score.breakdown].sort((a, b) => b.contribution - a.contribution);
  safeAutoTable(doc, {
    startY: yw,
    head: [["Axis", "Weight", "Raw value", "Contribution"]],
    body: sortedBreakdown.map(b => [
      String(b.axis).replace(/([A-Z])/g, " $1").replace(/^./, c => c.toUpperCase()).trim(),
      `${(b.weight * 100).toFixed(0)}%`,
      formatRaw(String(b.axis), b.rawValue, F),
      `+${b.contribution.toFixed(1)}`,
    ]),
    styles: { fontSize: 9, cellPadding: 5, textColor: COLORS.text },
    headStyles: { fillColor: COLORS.primary, textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: COLORS.bgSoft },
    margin: { left: MARGIN, right: MARGIN },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 160 },
      1: { halign: "right", cellWidth: 60 },
      2: { halign: "right", cellWidth: 110 },
      3: { halign: "right", cellWidth: 90 },
    },
  });
  yw = (doc as any).lastAutoTable.finalY + 12;

  // Penalties
  const penalties = winner.score.penalties.filter(p => p.magnitude > 0);
  if (penalties.length > 0) {
    yw = ensureSpace(doc, yw, 80);
    safeAutoTable(doc, {
      startY: yw,
      head: [["Penalty", "Magnitude", "Detail"]],
      body: penalties.map(p => [p.reason, `−${p.magnitude.toFixed(1)}`, p.id]),
      styles: { fontSize: 9, cellPadding: 5, textColor: COLORS.text },
      headStyles: { fillColor: COLORS.rose, textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: COLORS.bgSoft },
      margin: { left: MARGIN, right: MARGIN },
      columnStyles: {
        0: { cellWidth: 200 },
        1: { halign: "right", cellWidth: 80 },
        2: { cellWidth: "auto" },
      },
    });
    yw = (doc as any).lastAutoTable.finalY + 12;
  }

  // Composite total
  yw = ensureSpace(doc, yw, 36);
  setFill(doc, COLORS.bgSoft);
  doc.roundedRect(MARGIN, yw, CONTENT_W, 28, 4, 4, "F");
  setText(doc, COLORS.text);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Composite score", MARGIN + 14, yw + 18);
  doc.text(`Base ${winner.score.baseScore.toFixed(1)} → final ${winner.score.score.toFixed(1)} / 100`, PAGE_W - MARGIN - 14, yw + 18, { align: "right" });

  // ── Tail Risk page ────────────────────────────────────────────────────────
  doc.addPage();
  let yt = MARGIN + 12;
  yt = sectionHeader(doc, yt, "Tail Risk Metrics", COLORS.rose);
  yt = paragraph(
    doc,
    `Worst-case projections from ${winner.result.simulationCount ?? "N"} Monte Carlo paths. ` +
    `VaR95 = the 5th percentile dollar loss vs the initial position; CVaR95 = the average loss within that worst 5% tail.`,
    yt,
    { color: COLORS.muted, fontSize: 9.5 },
  );

  const rm = winner.result.riskMetrics;
  const tailRows = [
    ["Value at Risk (95%)", F.fmt$M(rm.varDollars95 ?? 0), "5th-percentile dollar loss"],
    ["Conditional VaR (95%)", F.fmt$M(rm.cvarDollars95 ?? 0), "Average loss in the worst 5% of paths"],
    ["Max drawdown (P50)", F.pct(rm.maxDrawdownMedian ?? 0, 1), "Median peak-to-trough across paths"],
    ["Max drawdown (P90)", F.pct(rm.maxDrawdownP90 ?? 0, 1), "90th-percentile peak-to-trough (severe scenario)"],
    ["Insolvency probability", F.pct(winner.result.defaultProbability ?? 0, 1), "Probability NW ends negative or default triggers"],
    ["Liquidity exhaustion P", F.pct(winner.result.liquidityExhaustionProbability ?? 0, 1), "Probability cash hits zero at any month"],
    ["Refinance pressure P", F.pct(winner.result.refinancePressureProbability ?? 0, 1), "Probability NSR drops below 0.85"],
    ["Negative-equity P", F.pct(winner.result.negativeEquityProbability ?? 0, 1), "Probability loan ever exceeds property value"],
  ];
  safeAutoTable(doc, {
    startY: yt,
    head: [["Metric", "Value", "Definition"]],
    body: tailRows,
    styles: { fontSize: 9, cellPadding: 5, textColor: COLORS.text },
    headStyles: { fillColor: COLORS.rose, textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: COLORS.bgSoft },
    margin: { left: MARGIN, right: MARGIN },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 150 },
      1: { halign: "right", cellWidth: 90 },
      2: { cellWidth: "auto" },
    },
  });
  yt = (doc as any).lastAutoTable.finalY + 16;

  // ── Fan Chart (percentile table + optional embed) ─────────────────────────
  yt = ensureSpace(doc, yt, 240);
  yt = sectionHeader(doc, yt, "Net Worth Projection — percentile fan", COLORS.primary);
  yt = paragraph(
    doc,
    `Distribution of terminal net worth (in nominal AUD) across simulated paths. ` +
    `The 5–95% band shows extreme outcomes; the 25–75% band shows the typical range.`,
    yt,
    { color: COLORS.muted, fontSize: 9.5 },
  );

  const fanImage = data.chartEls?.fanChart ? await captureChart(data.chartEls.fanChart) : null;
  if (fanImage) {
    const imgH = Math.min(CONTENT_W * 0.45, 220);
    doc.addImage(fanImage, "PNG", MARGIN, yt, CONTENT_W, imgH);
    yt += imgH + 12;
  }

  // Terminal-NW percentile table (always rendered)
  const fan = winner.result.netWorthFan;
  const fanInitial = fan[0];
  const fanFinal = fan[fan.length - 1];
  if (fanInitial && fanFinal) {
    yt = ensureSpace(doc, yt, 80);
    safeAutoTable(doc, {
      startY: yt,
      head: [["Percentile", "Month 0 (today)", "Terminal (final)", "Change"]],
      body: [
        ["P5",  F.fmt$M(fanInitial.p5),  F.fmt$M(fanFinal.p5),  F.fmt$M(fanFinal.p5  - fanInitial.p5)],
        ["P10", F.fmt$M(fanInitial.p10), F.fmt$M(fanFinal.p10), F.fmt$M(fanFinal.p10 - fanInitial.p10)],
        ["P25", F.fmt$M(fanInitial.p25), F.fmt$M(fanFinal.p25), F.fmt$M(fanFinal.p25 - fanInitial.p25)],
        ["P50 (median)", F.fmt$M(fanInitial.p50), F.fmt$M(fanFinal.p50), F.fmt$M(fanFinal.p50 - fanInitial.p50)],
        ["P75", F.fmt$M(fanInitial.p75), F.fmt$M(fanFinal.p75), F.fmt$M(fanFinal.p75 - fanInitial.p75)],
        ["P90", F.fmt$M(fanInitial.p90), F.fmt$M(fanFinal.p90), F.fmt$M(fanFinal.p90 - fanInitial.p90)],
        ["P95", F.fmt$M(fanInitial.p95), F.fmt$M(fanFinal.p95), F.fmt$M(fanFinal.p95 - fanInitial.p95)],
      ],
      styles: { fontSize: 9, cellPadding: 5, textColor: COLORS.text },
      headStyles: { fillColor: COLORS.primary, textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: COLORS.bgSoft },
      margin: { left: MARGIN, right: MARGIN },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 90 },
        1: { halign: "right" },
        2: { halign: "right" },
        3: { halign: "right" },
      },
    });
  }

  // ── Winner vs Runner-up ──────────────────────────────────────────────────
  if (runnerUp) {
    doc.addPage();
    let yc = MARGIN + 12;
    yc = sectionHeader(doc, yc, "Why winner beat runner-up", COLORS.emerald);

    const margin = winner.score.score - runnerUp.score.score;
    yc = paragraph(
      doc,
      `Winner ${winner.label} (${winner.score.score.toFixed(1)}) leads the runner-up ${runnerUp.label} ` +
      `(${runnerUp.score.score.toFixed(1)}) by ${margin.toFixed(1)} points. Axes sorted by contribution gap.`,
      yc,
      { color: COLORS.muted, fontSize: 9.5 },
    );

    const gapRows = winner.score.breakdown.map(w => {
      const r = runnerUp.score.breakdown.find(x => x.axis === w.axis);
      const gap = r ? w.contribution - r.contribution : w.contribution;
      return {
        axis: String(w.axis),
        winnerContribution: w.contribution,
        runnerUpContribution: r ? r.contribution : 0,
        gap,
      };
    }).sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));

    safeAutoTable(doc, {
      startY: yc,
      head: [["Axis", "Winner pts", "Runner-up pts", "Gap"]],
      body: gapRows.map(r => [
        r.axis.replace(/([A-Z])/g, " $1").replace(/^./, c => c.toUpperCase()).trim(),
        r.winnerContribution.toFixed(1),
        r.runnerUpContribution.toFixed(1),
        `${r.gap >= 0 ? "+" : "−"}${Math.abs(r.gap).toFixed(1)}`,
      ]),
      styles: { fontSize: 9, cellPadding: 5, textColor: COLORS.text },
      headStyles: { fillColor: COLORS.emerald, textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: COLORS.bgSoft },
      margin: { left: MARGIN, right: MARGIN },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 170 },
        1: { halign: "right" },
        2: { halign: "right" },
        3: { halign: "right" },
      },
      didParseCell: (raw) => {
        if (raw.section === "body" && raw.column.index === 3 && typeof raw.cell.raw === "string") {
          const s = raw.cell.raw;
          if (s.startsWith("+")) raw.cell.styles.textColor = COLORS.emerald;
          else if (s.startsWith("−")) raw.cell.styles.textColor = COLORS.rose;
          raw.cell.styles.fontStyle = "bold";
        }
      },
    });
    yc = (doc as any).lastAutoTable.finalY + 12;

    // Narrative
    yc = paragraph(
      doc,
      F.sentence(out.comparativeNarrative.secondPlaceAndWhy),
      yc,
      { fontSize: 10 },
    );
  }

  // ── Invalidation Engine ──────────────────────────────────────────────────
  doc.addPage();
  let yi = MARGIN + 12;
  yi = sectionHeader(doc, yi, "What would invalidate this recommendation", COLORS.amber);
  yi = paragraph(
    doc,
    "Engine-detected stress conditions that, if realised, would weaken or flip this call. " +
    "These are derived from the winner's serviceability bands, MC stress probabilities, " +
    "and registered constraint thresholds — not authored.",
    yi,
    { color: COLORS.muted, fontSize: 9.5 },
  );

  const conditions = out.comparativeNarrative.whatCouldInvalidate;
  if (conditions.length === 0) {
    yi = paragraph(doc, "No material stress conditions detected. The winner is robust across the modelled range.", yi, { fontSize: 10 });
  } else {
    for (const line of conditions) {
      yi = ensureSpace(doc, yi, 24);
      setFill(doc, COLORS.amber);
      doc.rect(MARGIN, yi + 2, 2, 14, "F");
      setText(doc, COLORS.text);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const lines = doc.splitTextToSize(F.sentence(line), CONTENT_W - 12) as string[];
      lines.forEach((l, i) => doc.text(l, MARGIN + 10, yi + 12 + i * 12));
      yi += Math.max(20, lines.length * 12 + 8);
    }
  }

  // ── Execution Plan ───────────────────────────────────────────────────────
  doc.addPage();
  let yp = MARGIN + 12;
  yp = sectionHeader(doc, yp, "Phased Execution Plan", COLORS.primary);
  yp = paragraph(
    doc,
    "Deterministic phasing of the winner's events. Events within 3 months are grouped into a phase; " +
    "each phase shows its month range, the actions to execute, and the engine-generated effect of each.",
    yp,
    { color: COLORS.muted, fontSize: 9.5 },
  );

  const plan: ExecutionPlanPhase[] = out.executionPlan ?? [];
  if (plan.length === 0) {
    yp = paragraph(doc, "No execution events for this path — the winner is the steady-state base plan.", yp, { fontSize: 10 });
  } else {
    for (const phase of plan) {
      yp = ensureSpace(doc, yp, 60);
      setFill(doc, COLORS.primary);
      doc.circle(MARGIN + 8, yp + 8, 8, "F");
      setText(doc, [255, 255, 255]);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(String(phase.index + 1), MARGIN + 8, yp + 11, { align: "center" });

      setText(doc, COLORS.text);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(phase.label, MARGIN + 24, yp + 11);
      yp += 22;

      // Actions
      for (const a of phase.actions) {
        yp = ensureSpace(doc, yp, 22);
        setText(doc, COLORS.text);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9.5);
        const evLines = doc.splitTextToSize(a.event, CONTENT_W - 28) as string[];
        evLines.forEach((l, i) => doc.text(l, MARGIN + 24, yp + 4 + i * 12));
        yp += evLines.length * 12 + 2;

        setText(doc, COLORS.muted);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        const efLines = doc.splitTextToSize(F.sentence(a.effect), CONTENT_W - 28) as string[];
        efLines.forEach((l, i) => doc.text(l, MARGIN + 24, yp + 4 + i * 11));
        yp += efLines.length * 11 + 6;
      }

      // Rationale
      yp = ensureSpace(doc, yp, 16);
      setText(doc, COLORS.slate);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8.5);
      const ratLines = doc.splitTextToSize(F.sentence(phase.rationale), CONTENT_W - 24) as string[];
      ratLines.forEach((l, i) => doc.text(l, MARGIN + 24, yp + 4 + i * 11));
      yp += ratLines.length * 11 + 12;
    }
  }

  // ── Conditional Recommendations ──────────────────────────────────────────
  doc.addPage();
  let yr = MARGIN + 12;
  yr = sectionHeader(doc, yr, "Conditional / Event-driven Recommendations", COLORS.sky);
  yr = paragraph(
    doc,
    "When-then rules derived from engine fields. Sorted by severity (critical → warn → info). " +
    "Each rec carries an explicit trigger so you act only when the condition fires.",
    yr,
    { color: COLORS.muted, fontSize: 9.5 },
  );

  const sevOrder: Record<ConditionalRecommendation["severity"], number> = { critical: 0, warn: 1, info: 2 };
  const sortedRecs = [...(out.conditionalRecommendations ?? [])].sort(
    (a, b) => sevOrder[a.severity] - sevOrder[b.severity],
  );

  for (const rec of sortedRecs) {
    yr = ensureSpace(doc, yr, 80);
    const tone = SEVERITY_TONE[rec.severity];
    setFill(doc, tone);
    doc.rect(MARGIN, yr, 3, 60, "F");

    setText(doc, tone);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(rec.severity.toUpperCase(), MARGIN + 10, yr + 10);

    setText(doc, COLORS.text);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    const trigLines = doc.splitTextToSize(`IF · ${F.sentence(rec.trigger)}`, CONTENT_W - 14) as string[];
    trigLines.forEach((l, i) => doc.text(l, MARGIN + 10, yr + 24 + i * 11));
    let dy = yr + 24 + trigLines.length * 11;

    doc.setFont("helvetica", "normal");
    const actLines = doc.splitTextToSize(`THEN · ${F.sentence(rec.action)}`, CONTENT_W - 14) as string[];
    actLines.forEach((l, i) => doc.text(l, MARGIN + 10, dy + i * 11));
    dy += actLines.length * 11;

    setText(doc, COLORS.muted);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    const ratLines = doc.splitTextToSize(`Why · ${F.sentence(rec.rationale)}`, CONTENT_W - 14) as string[];
    ratLines.forEach((l, i) => doc.text(l, MARGIN + 10, dy + i * 11));
    dy += ratLines.length * 11;

    yr = dy + 12;
  }

  // ── High-risk but possible paths (Phase 2.8) ─────────────────────────────
  if (out.highRiskPaths && out.highRiskPaths.length > 0) {
    doc.addPage();
    let yh = MARGIN + 12;
    yh = sectionHeader(doc, yh, "High-risk but possible paths", COLORS.amber);
    yh = paragraph(
      doc,
      "These candidates would normally be filtered out under balanced defaults, but were preserved by the " +
      "active risk-control mode. Each carries soft warnings (concentration, leverage, liquidity, refi pressure). " +
      "Score penalties already reflect these risks. Treat as exploratory — not as the engine's recommendation.",
      yh,
      { color: COLORS.muted, fontSize: 9.5 },
    );

    for (const hr of out.highRiskPaths) {
      yh = ensureSpace(doc, yh, 110);
      setFill(doc, COLORS.amber);
      doc.rect(MARGIN, yh, 3, 92, "F");

      setText(doc, COLORS.text);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(hr.label, MARGIN + 10, yh + 12);

      setText(doc, COLORS.amber);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.text(`SCORE ${hr.score.score.toFixed(1)} · HIGH RISK`, PAGE_W - MARGIN - 10, yh + 12, { align: "right" });

      setText(doc, COLORS.slate);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      const headlineLines = doc.splitTextToSize(F.sentence(hr.headline ?? ""), CONTENT_W - 16) as string[];
      headlineLines.slice(0, 2).forEach((l, i) => doc.text(l, MARGIN + 10, yh + 26 + i * 11));
      let dy = yh + 26 + Math.min(headlineLines.length, 2) * 11 + 4;

      // Soft warnings
      for (const w of hr.softWarnings.slice(0, 4)) {
        const tone: [number, number, number] =
          w.severity === "critical" ? COLORS.rose : w.severity === "warn" ? COLORS.amber : COLORS.sky;
        setFill(doc, tone);
        doc.rect(MARGIN + 10, dy + 2, 2, 8, "F");
        setText(doc, COLORS.text);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.text(w.label, MARGIN + 18, dy + 9);
        setText(doc, COLORS.muted);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        const detail = doc.splitTextToSize(F.sentence(w.detail), CONTENT_W - 30) as string[];
        detail.slice(0, 1).forEach(l => doc.text(l, MARGIN + 100, dy + 9));
        dy += 12;
      }
      yh = dy + 10;
    }
  }

  // ── Discarded alternatives (Phase 2.8 extended) ───────────────────────────
  if (out.discarded.length > 0) {
    doc.addPage();
    let yd = MARGIN + 12;
    yd = sectionHeader(doc, yd, "Discarded alternatives — full diagnostics", COLORS.slate);
    yd = paragraph(
      doc,
      "Candidates the engine evaluated but rejected. Each entry shows the 5-field rejection explanation " +
      "(technical reason, plain-English meaning, primary driver, stress window, what would fix it), the " +
      "override path (if any), horizon-sensitivity diagnostics, and recovery analysis for leveraged-property " +
      "paths. This makes the decision trail fully auditable.",
      yd,
      { color: COLORS.muted, fontSize: 9.5 },
    );

    for (const d of out.discarded) {
      yd = ensureSpace(doc, yd, 180);
      const tone: [number, number, number] = d.severity === "hard_blocker" ? COLORS.rose : COLORS.amber;

      // Header strip
      setFill(doc, tone);
      doc.rect(MARGIN, yd, CONTENT_W, 18, "F");
      setText(doc, [255, 255, 255]);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.text(d.label, MARGIN + 8, yd + 12);
      const sevLabel = d.severity === "hard_blocker" ? "HARD BLOCKER" : "SOFT WARNING";
      doc.text(sevLabel, PAGE_W - MARGIN - 8, yd + 12, { align: "right" });
      yd += 22;

      // Horizon-sensitivity badge
      if (d.horizonSensitive && d.viableHorizonYears != null) {
        setFill(doc, COLORS.sky);
        doc.roundedRect(MARGIN, yd, 220, 14, 3, 3, "F");
        setText(doc, [255, 255, 255]);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.text(`HORIZON-SENSITIVE · viable at ${d.viableHorizonYears}y+`, MARGIN + 6, yd + 10);
        yd += 20;
      }

      // 5-field explanation table
      const expRows: Array<[string, string]> = [
        ["Technical", F.sentence(d.explanation.technical)],
        ["In plain English", F.sentence(d.explanation.plainEnglish)],
        ["Primary driver", F.sentence(d.explanation.primaryDriver)],
        ["Stress window", F.sentence(d.explanation.stressPeriod)],
      ];
      safeAutoTable(doc, {
        startY: yd,
        body: expRows,
        styles: { fontSize: 8.5, cellPadding: 4, textColor: COLORS.text, valign: "top" },
        margin: { left: MARGIN, right: MARGIN },
        columnStyles: {
          0: { fontStyle: "bold", cellWidth: 110, textColor: COLORS.muted },
          1: { cellWidth: "auto" },
        },
        theme: "plain",
        // Audit fix P1.6 / PDF-3: long explanation strings used to overflow the
        // page; tableWidth: "wrap" forces autoTable to respect the column widths
        // and split content across rows instead of clipping it.
        tableWidth: "wrap",
      });
      yd = (doc as any).lastAutoTable.finalY + 4;

      // What would fix it
      if (d.explanation.whatWouldFix.length > 0) {
        yd = ensureSpace(doc, yd, 14 + d.explanation.whatWouldFix.length * 11);
        setText(doc, COLORS.emerald);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.text("What would fix it", MARGIN, yd);
        yd += 10;
        for (const fix of d.explanation.whatWouldFix) {
          yd = ensureSpace(doc, yd, 12);
          setText(doc, COLORS.emerald);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8.5);
          doc.text("→", MARGIN, yd + 8);
          setText(doc, COLORS.text);
          const fixLines = doc.splitTextToSize(F.sentence(fix), CONTENT_W - 12) as string[];
          fixLines.forEach((l, i) => doc.text(l, MARGIN + 10, yd + 8 + i * 10));
          yd += Math.max(11, fixLines.length * 10 + 2);
        }
        yd += 4;
      }

      // Recovery analysis (leveraged property)
      if (d.recovery) {
        yd = ensureSpace(doc, yd, 60);
        setFill(doc, COLORS.bgSoft);
        doc.roundedRect(MARGIN, yd, CONTENT_W, 50, 4, 4, "F");
        setText(doc, COLORS.muted);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.text("RECOVERY DIAGNOSTICS", MARGIN + 8, yd + 12);

        const cellW = (CONTENT_W - 16) / 4;
        const recCells: Array<[string, string]> = [
          ["Liquidity trough", `Year ${d.recovery.liquidityTroughYear}`],
          ["Debt stabilises", `Year ${d.recovery.debtStabilisationYear}`],
          ["Refi-risk window", `Y${d.recovery.refinanceRiskWindow.startYear}–Y${d.recovery.refinanceRiskWindow.endYear}`],
          ["Recovery period", `${d.recovery.recoveryYears} years`],
        ];
        recCells.forEach(([label, value], i) => {
          const cx = MARGIN + 8 + i * cellW;
          setText(doc, COLORS.muted);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(7);
          doc.text(label.toUpperCase(), cx, yd + 26);
          setText(doc, COLORS.text);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(10);
          doc.text(value, cx, yd + 42);
        });
        yd += 58;
      }

      // Override row
      yd = ensureSpace(doc, yd, 24);
      setText(doc, COLORS.muted);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text("OVERRIDE", MARGIN, yd + 8);
      setText(doc, d.override.possible ? COLORS.amber : COLORS.rose);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      const ovText = (d.override.possible ? "Possible: " : "Not overridable: ") + F.sentence(d.override.mechanism);
      const ovLines = doc.splitTextToSize(ovText, CONTENT_W - 60) as string[];
      ovLines.forEach((l, i) => doc.text(l, MARGIN + 60, yd + 8 + i * 10));
      yd += Math.max(14, ovLines.length * 10 + 4);

      // Footer row: profile + mode
      setText(doc, COLORS.muted);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.text(`Profile: ${d.profileContext} · Risk mode: ${d.riskMode} · Stage: ${d.stage}`, MARGIN, yd + 8);
      yd += 18;

      // Separator
      setDraw(doc, COLORS.border);
      doc.setLineWidth(0.4);
      doc.line(MARGIN, yd, PAGE_W - MARGIN, yd);
      yd += 10;
    }
  }

  // ── Risk Controls audit page (Phase 2.8) ─────────────────────────────────
  doc.addPage();
  let yrc = MARGIN + 12;
  yrc = sectionHeader(doc, yrc, "Risk Controls applied", COLORS.primary);
  yrc = paragraph(
    doc,
    "The risk-control mode and resolved thresholds active during this run. Hard floors are enforced even " +
    "under Custom mode (maxLvr ≤ 0.85, maxDefaultProbability ≤ 0.40, minNsrBuffered ≥ 0.70) — the engine " +
    "never bypasses APRA realism, liquidity floors, or survival-first constraints. Risk modes change which " +
    "paths are visible, not the underlying math.",
    yrc,
    { color: COLORS.muted, fontSize: 9.5 },
  );

  const rc = out.riskControlsApplied;
  const modeColor: Record<RiskControlMode, [number, number, number]> = {
    conservative: COLORS.sky,
    balanced: COLORS.emerald,
    aggressive: COLORS.amber,
    custom: COLORS.accent,
  };
  const modeBg = modeColor[rc.mode] ?? COLORS.primary;
  setFill(doc, modeBg);
  doc.roundedRect(MARGIN, yrc, CONTENT_W, 36, 6, 6, "F");
  setText(doc, [255, 255, 255]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("ACTIVE RISK MODE", MARGIN + 14, yrc + 14);
  doc.setFontSize(18);
  doc.text(rc.mode.toUpperCase(), MARGIN + 14, yrc + 30);
  yrc += 48;

  const ctrlRows: Array<[string, string, string]> = [
    ["Max crypto share", `${(rc.resolved.maxCryptoSharePct * 100).toFixed(0)}%`, "Hard cap on crypto allocation"],
    ["Max LVR", `${(rc.resolved.maxLvr * 100).toFixed(0)}%`, "Loan-to-value ceiling (hard floor 85%)"],
    ["Min NSR (buffered)", rc.resolved.minNsrBuffered.toFixed(2), "Net surplus ratio with APRA buffer (hard floor 0.70)"],
    ["Max single-asset share", `${(rc.resolved.maxSingleAssetSharePct * 100).toFixed(0)}%`, "Concentration cap on any one asset"],
    ["Max default probability", `${(rc.resolved.maxDefaultProbability * 100).toFixed(0)}%`, "Insolvency-probability ceiling (hard floor 40%)"],
    ["Allow high-risk paths", rc.resolved.allowHighRiskPaths ? "Yes" : "No", "Surface soft-warning candidates under their own section"],
    ["Show filtered paths", rc.resolved.showFilteredHighRiskPaths ? "Yes" : "No", "Show high-risk paths in UI alongside ranked list"],
  ];
  safeAutoTable(doc, {
    startY: yrc,
    head: [["Control", "Resolved value", "Meaning"]],
    body: ctrlRows,
    styles: { fontSize: 9, cellPadding: 5, textColor: COLORS.text },
    headStyles: { fillColor: COLORS.primary, textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: COLORS.bgSoft },
    margin: { left: MARGIN, right: MARGIN },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 160 },
      1: { halign: "right", cellWidth: 100 },
      2: { cellWidth: "auto" },
    },
  });
  yrc = (doc as any).lastAutoTable.finalY + 14;

  // Hard floors callout
  yrc = ensureSpace(doc, yrc, 80);
  setFill(doc, COLORS.bgSoft);
  doc.roundedRect(MARGIN, yrc, CONTENT_W, 64, 6, 6, "F");
  setText(doc, COLORS.rose);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("HARD FLOORS — ENFORCED IN EVERY MODE", MARGIN + 12, yrc + 14);
  setText(doc, COLORS.text);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("• maxLvr is clamped to ≤ 0.85 (APRA absolute ceiling)", MARGIN + 12, yrc + 30);
  doc.text("• maxDefaultProbability is clamped to ≤ 0.40 (survival-first)", MARGIN + 12, yrc + 42);
  doc.text("• minNsrBuffered is clamped to ≥ 0.70 (APRA serviceability buffer)", MARGIN + 12, yrc + 54);
  yrc += 72;

  // ── Assumptions Appendix (audit fix P1.6 / AS-1) ─────────────────────────
  doc.addPage();
  let yas = MARGIN + 12;
  yas = sectionHeader(doc, yas, "Assumptions Appendix", COLORS.primary);
  yas = paragraph(
    doc,
    "Every editable rail and locked Monte Carlo constant the engine touched " +
    "to produce this projection. Editable rows can be tuned on /wealth-strategy; " +
    "non-editable rows reflect regulatory or process constants enforced by the engine.",
    yas,
    { color: COLORS.muted, fontSize: 9.5 },
  );
  const assumptionRows = collectAssumptionsUsed();
  safeAutoTable(doc, {
    startY: yas,
    head: [["Category", "Assumption", "Value", "Source", "Editable", "Impacts"]],
    body: assumptionRows.map(r => [
      r.category,
      r.label,
      r.value,
      r.source,
      r.editable ? "Yes" : "No",
      r.impacts,
    ]),
    styles: { fontSize: 8, cellPadding: 3, textColor: COLORS.text, valign: "top" },
    headStyles: { fillColor: COLORS.primary, textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: COLORS.bgSoft },
    margin: { left: MARGIN, right: MARGIN },
    columnStyles: {
      0: { cellWidth: 55, fontStyle: "bold" },
      1: { cellWidth: 110 },
      2: { cellWidth: 80, halign: "right" },
      3: { cellWidth: 90 },
      4: { cellWidth: 40, halign: "center" },
      5: { cellWidth: "auto" },
    },
  });

  // ── Audit trail + disclaimer ─────────────────────────────────────────────
  doc.addPage();
  let ya = MARGIN + 12;
  ya = sectionHeader(doc, ya, "Audit Trail & Reproducibility", COLORS.slate);

  safeAutoTable(doc, {
    startY: ya,
    head: [["Field", "Value"]],
    body: [
      ["Question", prettyQuestion(out.question)],
      ["Capital", out.capital != null ? F.fmt$(out.capital) : "—"],
      ["Investor profile", `${data.profile.label} (${data.profile.id})`],
      ["Profile description", data.profile.description],
      ["Candidates evaluated", `${out.ranked.length + out.discarded.length}`],
      ["Candidates retained", `${out.ranked.length}`],
      ["Candidates discarded", `${out.discarded.length}`],
      ["Base plan hash", out.basePlanHash],
      ["Generated at", data.generatedAt],
    ],
    styles: { fontSize: 9, cellPadding: 5, textColor: COLORS.text },
    headStyles: { fillColor: COLORS.slate, textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: COLORS.bgSoft },
    margin: { left: MARGIN, right: MARGIN },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 140 },
      1: { cellWidth: "auto" },
    },
  });
  ya = (doc as any).lastAutoTable.finalY + 18;

  // Dedicated Limitations & Disclaimer page (audit fix P1.6) — pulled out of
  // the audit trail page so the legal text has space and a clear visual break.
  doc.addPage();
  let yl = MARGIN + 12;
  yl = sectionHeader(doc, yl, "Limitations & Disclaimer", COLORS.slate);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  setText(doc, COLORS.text);
  const disc =
    "This report is generated from simulated outcomes using Monte Carlo techniques and your self-reported " +
    "financial position. It is not financial advice. Past performance does not predict future results. " +
    "Assumed returns may not be achieved. Consult a licensed financial advisor (AFSL) before making " +
    "investment decisions. Tax outcomes vary by individual circumstance and depend on ATO rules current " +
    "at the time of lodgement. APRA serviceability buffers (+3.00pp on the assessment rate) and DTI " +
    "scrutiny lines are applied as the engine's default proxies for bank policy; individual lenders may " +
    "apply tighter rules. Property, equity, and crypto markets carry significant risk including total " +
    "loss of capital. Monte Carlo projections illustrate a range of possible outcomes given the input " +
    "assumptions; actual results will differ, sometimes materially. The operator of this tool is not a " +
    "licensed financial adviser. Consider consulting a licensed financial adviser, tax agent, and " +
    "mortgage broker before acting on any analysis in this report.";
  const discLines = doc.splitTextToSize(disc, CONTENT_W) as string[];
  discLines.forEach(l => { doc.text(l, MARGIN, yl); yl += 12; });

  // ── Footers ──────────────────────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    if (i === 1) continue;
    drawPageFooter(doc, i, totalPages, data.householdName);
  }

  return doc;
}

// ─── Local helper: format a raw axis value (mirrors ScoreVisualizations) ────

function formatRaw(axis: string, raw: number, F: ReturnType<typeof buildFmts>): string {
  if (/probability|factor|return|drag|stress|risk/i.test(axis)) {
    return F.pct(raw, 1);
  }
  if (/terminalNetWorth/i.test(axis)) {
    return F.fmt$M(raw);
  }
  if (/months|fireMonth|fireAccel/i.test(axis)) {
    return `${raw.toFixed(0)} mo`;
  }
  return raw.toFixed(2);
}
