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
  RankedCandidate,
  ExecutionPlanPhase,
  ConditionalRecommendation,
} from "./decisionEngine/candidateGenerator";
import type { InvestorProfileSpec } from "./registry";

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
  autoTable(doc, {
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
    autoTable(doc, {
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
  autoTable(doc, {
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
    autoTable(doc, {
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

    autoTable(doc, {
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

  // ── Discarded alternatives ───────────────────────────────────────────────
  if (out.discarded.length > 0) {
    doc.addPage();
    let yd = MARGIN + 12;
    yd = sectionHeader(doc, yd, "Discarded alternatives", COLORS.slate);
    yd = paragraph(
      doc,
      "Candidates the engine evaluated but rejected. Each row shows severity " +
      "(HARD BLOCKER = institutional ceiling breach; SOFT WARNING = behavioural-realism rule), " +
      "the reason, override availability, and the investor profile under which the discard occurred. " +
      "This makes the decision trail fully auditable.",
      yd,
      { color: COLORS.muted, fontSize: 9.5 },
    );
    autoTable(doc, {
      startY: yd,
      head: [["Candidate", "Severity", "Reason / Detail", "Override", "Profile"]],
      body: out.discarded.map(d => [
        d.label,
        d.severity === "hard_blocker" ? "HARD BLOCKER" : "SOFT WARNING",
        `${d.reason} — ${F.sentence(d.detail)}`,
        d.override.possible
          ? `Possible: ${F.sentence(d.override.mechanism)}`
          : `Not overridable: ${F.sentence(d.override.mechanism)}`,
        String(d.profileContext),
      ]),
      styles: { fontSize: 8.5, cellPadding: 4, textColor: COLORS.text, valign: "top" },
      headStyles: { fillColor: COLORS.slate, textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: COLORS.bgSoft },
      margin: { left: MARGIN, right: MARGIN },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 95 },
        1: { cellWidth: 70, fontStyle: "bold" },
        2: { cellWidth: "auto" },
        3: { cellWidth: 130 },
        4: { cellWidth: 60 },
      },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 1) {
          const isHard = String(data.cell.raw) === "HARD BLOCKER";
          data.cell.styles.textColor = isHard ? [190, 18, 60] : [180, 83, 9];
        }
      },
    });
  }

  // ── Audit trail + disclaimer ─────────────────────────────────────────────
  doc.addPage();
  let ya = MARGIN + 12;
  ya = sectionHeader(doc, ya, "Audit Trail & Reproducibility", COLORS.slate);

  autoTable(doc, {
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

  ya = ensureSpace(doc, ya, 100);
  setText(doc, COLORS.muted);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("DISCLAIMER", MARGIN, ya);
  ya += 12;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  const disc =
    "This report is generated by an automated financial planning tool using your own ledger data and " +
    "the assumptions you specified. It is not personal financial advice, and the operator of this tool " +
    "is not a licensed financial adviser. Monte Carlo projections illustrate a range of possible outcomes " +
    "given the input assumptions; actual results will differ — sometimes materially. APRA serviceability " +
    "buffers (≥3.00% on the assessment rate) and DTI scrutiny lines (≥6.0) are applied as the engine's " +
    "default proxies for bank policy — individual lenders may apply tighter rules. Property, equity, and " +
    "crypto markets carry significant risk including total loss of capital. Past performance is not a " +
    "reliable indicator of future performance. Tax outcomes are simplified estimates and may not reflect " +
    "your individual circumstances. Consider consulting a licensed financial adviser, tax agent, and " +
    "mortgage broker before acting on any analysis in this report.";
  const discLines = doc.splitTextToSize(disc, CONTENT_W) as string[];
  discLines.forEach(l => { doc.text(l, MARGIN, ya); ya += 11; });

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
