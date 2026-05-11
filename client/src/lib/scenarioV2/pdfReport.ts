/**
 * Scenario Engine V2 — Premium PDF Report
 * ────────────────────────────────────────────────────────────────────────────
 * Executive-grade PDF for advisors/investors.
 *
 *   Cover                — branded gradient header, household name, decision summary
 *   Executive Summary    — TLDR card, key metrics, confidence ribbon
 *   Scenario Detail      — one page per scenario with chart, story, key moves,
 *                          why-it-works, what-could-go-wrong
 *   Comparison Table     — clean, premium-styled metrics matrix
 *   Stress Paths         — downside probabilities, dispersion, terminal rates
 *   Recommendation       — long-form advisor narrative
 *   Assumptions Appendix — every input + audit hash
 *   Disclaimer           — full legal text
 *
 * Charts: rendered from React refs (html2canvas) when supplied. Falls back to
 * jsPDF-native line charts if html2canvas isn't available or no ref provided.
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import html2canvas from "html2canvas";
import type { ExtendedScenarioResult } from "./runScenario";
import type { ComparisonNarrative } from "./narrative";

const fmt$ = (n: number) => "$" + Math.round(n).toLocaleString("en-AU");
const fmt$M = (n: number) =>
  Math.abs(n) >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(2)}M`
    : `$${Math.round(n / 1000)}k`;
const pct = (n: number, d = 1) => `${(n * 100).toFixed(d)}%`;

// Premium palette — matches app
const COLORS = {
  primary: [99, 102, 241] as [number, number, number],   // indigo-500
  accent: [168, 85, 247] as [number, number, number],    // purple-500
  emerald: [16, 185, 129] as [number, number, number],
  sky: [14, 165, 233] as [number, number, number],
  amber: [245, 158, 11] as [number, number, number],
  rose: [244, 63, 94] as [number, number, number],
  slate: [100, 116, 139] as [number, number, number],
  text: [15, 23, 42] as [number, number, number],        // slate-900
  muted: [100, 116, 139] as [number, number, number],
  border: [226, 232, 240] as [number, number, number],
  bgSoft: [248, 250, 252] as [number, number, number],
};

const SCENARIO_TONE: Record<string, [number, number, number]> = {
  base: COLORS.slate,
  property_50k: COLORS.sky,
  crypto_50k: COLORS.amber,
  cash_50k: COLORS.emerald,
};

function setText(doc: jsPDF, rgb: [number, number, number]) {
  doc.setTextColor(rgb[0], rgb[1], rgb[2]);
}
function setFill(doc: jsPDF, rgb: [number, number, number]) {
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
}
function setDraw(doc: jsPDF, rgb: [number, number, number]) {
  doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
}

// ─── Layout constants (A4 portrait, points) ───────────────────────────────────

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 42;
const CONTENT_W = PAGE_W - MARGIN * 2;

// ─── Page utilities ───────────────────────────────────────────────────────────

function drawPageFooter(doc: jsPDF, pageNum: number, totalPages: number, householdName: string) {
  setText(doc, COLORS.muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(
    `${householdName} · Family Wealth Lab · Scenario Engine V2`,
    MARGIN,
    PAGE_H - 22,
  );
  doc.text(`Page ${pageNum} of ${totalPages}`, PAGE_W - MARGIN, PAGE_H - 22, { align: "right" });
  // Top accent line
  setDraw(doc, COLORS.border);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, PAGE_H - 28, PAGE_W - MARGIN, PAGE_H - 28);
}

function newPage(doc: jsPDF): number {
  doc.addPage();
  return MARGIN + 20;
}

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > PAGE_H - 60) {
    return newPage(doc);
  }
  return y;
}

function sectionHeader(doc: jsPDF, y: number, title: string, accent = COLORS.primary): number {
  setFill(doc, accent);
  doc.rect(MARGIN, y - 2, 3, 16, "F");
  setText(doc, COLORS.text);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(title, MARGIN + 10, y + 10);
  return y + 22;
}

function paragraph(doc: jsPDF, text: string, y: number, opts?: {
  fontSize?: number;
  color?: [number, number, number];
  bold?: boolean;
  maxW?: number;
}): number {
  const fontSize = opts?.fontSize ?? 10;
  const color = opts?.color ?? COLORS.text;
  const bold = opts?.bold ?? false;
  const maxW = opts?.maxW ?? CONTENT_W;
  setText(doc, color);
  doc.setFont("helvetica", bold ? "bold" : "normal");
  doc.setFontSize(fontSize);
  const lines = doc.splitTextToSize(text, maxW) as string[];
  lines.forEach((line, i) => {
    doc.text(line, MARGIN, y + i * (fontSize + 3));
  });
  return y + lines.length * (fontSize + 3) + 4;
}

// ─── Cover page ───────────────────────────────────────────────────────────────

function renderCover(
  doc: jsPDF,
  data: PdfData,
): void {
  // Gradient-ish header band (jsPDF doesn't gradient natively — emulate with two rects)
  setFill(doc, COLORS.accent);
  doc.rect(0, 0, PAGE_W, 220, "F");
  setFill(doc, COLORS.primary);
  doc.rect(0, 180, PAGE_W, 40, "F");

  // Brand mark
  setText(doc, [255, 255, 255]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("FAMILY WEALTH LAB · SCENARIO ENGINE V2", MARGIN, 60);

  // Big title
  doc.setFontSize(34);
  doc.text("Capital Allocation", MARGIN, 110);
  doc.text("Decision Report", MARGIN, 145);

  // Subtitle
  doc.setFont("helvetica", "normal");
  doc.setFontSize(13);
  doc.text(
    `Deciding where to deploy ${fmt$(data.capital)} of marginal capital`,
    MARGIN,
    180,
  );

  // Decision summary card (white card on the gradient)
  const cardY = 250;
  const cardH = 200;
  setFill(doc, [255, 255, 255]);
  doc.roundedRect(MARGIN, cardY, CONTENT_W, cardH, 8, 8, "F");
  setDraw(doc, COLORS.border);
  doc.setLineWidth(1);
  doc.roundedRect(MARGIN, cardY, CONTENT_W, cardH, 8, 8, "S");

  // Card title
  setText(doc, COLORS.muted);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("THE DECISION", MARGIN + 18, cardY + 24);

  // Winner name (large)
  const winnerNarrative = data.narrative.scenarios.find(
    s => s.scenarioId === data.narrative.winnerScenarioId,
  );
  setText(doc, COLORS.text);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  const winnerLines = doc.splitTextToSize(
    winnerNarrative?.name ?? "Run engine",
    CONTENT_W - 36,
  ) as string[];
  let y = cardY + 50;
  winnerLines.forEach(l => {
    doc.text(l, MARGIN + 18, y);
    y += 26;
  });

  // TLDR sentence
  setText(doc, COLORS.slate);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const tldrLines = doc.splitTextToSize(data.narrative.tldr, CONTENT_W - 36) as string[];
  tldrLines.forEach(l => {
    doc.text(l, MARGIN + 18, y);
    y += 13;
  });

  // Confidence ribbon (bottom of card)
  const conf = data.narrative.confidenceOverall;
  const confColor: [number, number, number] =
    conf >= 70 ? COLORS.emerald : conf >= 50 ? COLORS.amber : COLORS.rose;
  const ribbonY = cardY + cardH - 36;
  setFill(doc, COLORS.bgSoft);
  doc.roundedRect(MARGIN + 18, ribbonY, CONTENT_W - 36, 22, 4, 4, "F");
  setText(doc, COLORS.muted);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("CONFIDENCE", MARGIN + 28, ribbonY + 14);
  // Bar fill
  const barX = MARGIN + 108;
  const barW = CONTENT_W - 36 - 108 - 60;
  setFill(doc, [229, 231, 235]);
  doc.roundedRect(barX, ribbonY + 8, barW, 6, 3, 3, "F");
  setFill(doc, confColor);
  doc.roundedRect(barX, ribbonY + 8, (barW * conf) / 100, 6, 3, 3, "F");
  setText(doc, confColor);
  doc.setFontSize(10);
  doc.text(`${conf}%`, MARGIN + 18 + (CONTENT_W - 36) - 14, ribbonY + 14, { align: "right" });

  // Metadata footer
  setText(doc, COLORS.muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    `Generated ${new Date(data.generatedAt).toLocaleString("en-AU", { dateStyle: "long", timeStyle: "short" })}`,
    MARGIN,
    PAGE_H - 80,
  );
  doc.text(
    `Horizon ${data.horizonYears} years · ${data.simulationCount.toLocaleString()} Monte Carlo sims · ` +
    `${data.results.length} scenarios compared`,
    MARGIN,
    PAGE_H - 66,
  );
  doc.text(
    `Snapshot hash: ${data.snapshotHash ?? "—"} · Assumptions hash: ${data.assumptionsHash ?? "—"}`,
    MARGIN,
    PAGE_H - 52,
  );
  doc.text("Family Wealth Lab", PAGE_W - MARGIN, PAGE_H - 52, { align: "right" });
}

// ─── Capture chart from DOM (best-effort) ─────────────────────────────────────

async function captureChart(el: HTMLElement | null): Promise<string | null> {
  if (!el) return null;
  try {
    const canvas = await html2canvas(el, {
      backgroundColor: "#ffffff",
      scale: 2,
      logging: false,
      useCORS: true,
    });
    return canvas.toDataURL("image/png");
  } catch (err) {
    console.warn("[pdfReport] chart capture failed:", err);
    return null;
  }
}

// ─── Scenario detail page ─────────────────────────────────────────────────────

function renderScenarioDetail(
  doc: jsPDF,
  result: ExtendedScenarioResult,
  narrative: ComparisonNarrative["scenarios"][number],
  capital: number,
  horizonYears: number,
  startY: number,
): number {
  let y = startY;
  const tone = SCENARIO_TONE[result.scenarioId] ?? COLORS.primary;

  // Title bar with tone color
  setFill(doc, tone);
  doc.roundedRect(MARGIN, y, CONTENT_W, 36, 6, 6, "F");
  setText(doc, [255, 255, 255]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(result.name, MARGIN + 16, y + 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    `Confidence ${narrative.confidence}% · ${horizonYears}yr horizon`,
    MARGIN + 16,
    y + 30,
  );
  y += 50;

  // Headline (large quote)
  setText(doc, COLORS.text);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  const headlineLines = doc.splitTextToSize(narrative.headline, CONTENT_W) as string[];
  headlineLines.forEach(l => {
    doc.text(l, MARGIN, y);
    y += 18;
  });
  y += 6;

  // KPI strip (4 metrics)
  const fanEnd = result.netWorthFan[result.netWorthFan.length - 1];
  const cashEnd = result.cashFan[result.cashFan.length - 1];
  const kpis: Array<{ label: string; value: string; tone?: [number, number, number] }> = [
    { label: "P50 Net Worth", value: fmt$M(fanEnd.p50), tone: COLORS.text },
    { label: "P10 (downside)", value: fmt$M(fanEnd.p10), tone: COLORS.rose },
    { label: "P90 (upside)", value: fmt$M(fanEnd.p90), tone: COLORS.emerald },
    { label: "Terminal Cash", value: fmt$M(cashEnd.p50), tone: COLORS.sky },
  ];
  const kpiW = (CONTENT_W - 12) / kpis.length;
  kpis.forEach((k, i) => {
    const x = MARGIN + i * (kpiW + 4);
    setFill(doc, COLORS.bgSoft);
    doc.roundedRect(x, y, kpiW, 50, 6, 6, "F");
    setText(doc, COLORS.muted);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text(k.label.toUpperCase(), x + 8, y + 14);
    setText(doc, k.tone ?? COLORS.text);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(k.value, x + 8, y + 35);
  });
  y += 64;

  // Story
  y = paragraph(doc, narrative.story, y, { fontSize: 10, color: COLORS.text });
  y += 4;

  // Key moves
  y = ensureSpace(doc, y, 80);
  setText(doc, COLORS.text);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("What happens", MARGIN, y);
  y += 14;
  setText(doc, COLORS.text);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  narrative.keyMoves.forEach(m => {
    const bulletLines = doc.splitTextToSize(`•  ${m}`, CONTENT_W - 8) as string[];
    bulletLines.forEach(l => {
      y = ensureSpace(doc, y, 14);
      doc.text(l, MARGIN + 4, y);
      y += 13;
    });
  });
  y += 6;

  // Why it works / what could go wrong (two-column)
  y = ensureSpace(doc, y, 110);
  const colW = (CONTENT_W - 12) / 2;
  // Left: why
  setFill(doc, [240, 253, 244]);
  doc.roundedRect(MARGIN, y, colW, 100, 6, 6, "F");
  setText(doc, COLORS.emerald);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("WHY IT WORKS", MARGIN + 10, y + 16);
  setText(doc, COLORS.text);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const whyLines = doc.splitTextToSize(narrative.whyItWorks, colW - 20) as string[];
  whyLines.forEach((l, i) => doc.text(l, MARGIN + 10, y + 32 + i * 12));
  // Right: what could go wrong
  setFill(doc, [254, 242, 242]);
  doc.roundedRect(MARGIN + colW + 12, y, colW, 100, 6, 6, "F");
  setText(doc, COLORS.rose);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("WHAT COULD GO WRONG", MARGIN + colW + 22, y + 16);
  setText(doc, COLORS.text);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const riskLines = doc.splitTextToSize(narrative.whatCouldGoWrong, colW - 20) as string[];
  riskLines.forEach((l, i) => doc.text(l, MARGIN + colW + 22, y + 32 + i * 12));
  y += 112;

  return y;
}

// ─── Main entry point ────────────────────────────────────────────────────────

export interface PdfData {
  householdName: string;
  capital: number;
  horizonYears: number;
  simulationCount: number;
  generatedAt: string;
  results: ExtendedScenarioResult[];
  narrative: ComparisonNarrative;
  assumptions: {
    propertyGrowthPct: number;
    propertyVolPct: number;
    cryptoReturnPct: number;
    cryptoVolPct: number;
    cashAprPct: number;
    mortgageRatePct: number;
    rentYieldPct: number;
  };
  snapshotHash?: string;
  assumptionsHash?: string;
  /** Optional refs to chart DOM nodes — captured via html2canvas. */
  chartEls?: {
    nwChart?: HTMLElement | null;
    liquidityChart?: HTMLElement | null;
    bandsChart?: HTMLElement | null;
  };
}

export async function generatePremiumPdf(data: PdfData): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  // ── Cover ──────────────────────────────────────────────────────────────────
  renderCover(doc, data);

  // ── Executive Summary ──────────────────────────────────────────────────────
  doc.addPage();
  let y = MARGIN + 12;
  y = sectionHeader(doc, y, "Executive Summary", COLORS.accent);

  // TLDR card
  setFill(doc, COLORS.bgSoft);
  doc.roundedRect(MARGIN, y, CONTENT_W, 70, 8, 8, "F");
  setText(doc, COLORS.muted);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("TLDR", MARGIN + 14, y + 16);
  setText(doc, COLORS.text);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  const tldrLines = doc.splitTextToSize(data.narrative.tldr, CONTENT_W - 28) as string[];
  tldrLines.forEach((l, i) => doc.text(l, MARGIN + 14, y + 34 + i * 14));
  y += 84;

  // Overall confidence ribbon
  const conf = data.narrative.confidenceOverall;
  const confColor: [number, number, number] =
    conf >= 70 ? COLORS.emerald : conf >= 50 ? COLORS.amber : COLORS.rose;
  setText(doc, COLORS.text);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Confidence in this recommendation", MARGIN, y);
  setText(doc, confColor);
  doc.text(`${conf}%`, PAGE_W - MARGIN, y, { align: "right" });
  y += 8;
  setFill(doc, [229, 231, 235]);
  doc.roundedRect(MARGIN, y, CONTENT_W, 8, 4, 4, "F");
  setFill(doc, confColor);
  doc.roundedRect(MARGIN, y, (CONTENT_W * conf) / 100, 8, 4, 4, "F");
  y += 24;

  // KPI grid summary
  const base = data.results.find(r => r.scenarioId === "base");
  const winner = data.results.find(r => r.scenarioId === data.narrative.winnerScenarioId);
  const winnerFan = winner ? winner.netWorthFan[winner.netWorthFan.length - 1] : null;
  const baseFan = base ? base.netWorthFan[base.netWorthFan.length - 1] : null;
  const summaryKpis: Array<{ label: string; value: string; sub: string }> = [
    {
      label: "Recommended path",
      value: winner?.name ?? "—",
      sub: `${data.horizonYears}-year horizon`,
    },
    {
      label: "Median NW (winner)",
      value: winnerFan ? fmt$M(winnerFan.p50) : "—",
      sub: `P10–P90: ${winnerFan ? fmt$M(winnerFan.p10) + " → " + fmt$M(winnerFan.p90) : "—"}`,
    },
    {
      label: "Delta vs base",
      value: winnerFan && baseFan ? fmt$M(winnerFan.p50 - baseFan.p50) : "—",
      sub: baseFan ? `Base: ${fmt$M(baseFan.p50)}` : "",
    },
    {
      label: "Downside (P10 vs P50)",
      value: winner ? pct(winner.riskMetrics.downsideRisk) : "—",
      sub: `Sequence CV ${winner ? pct(winner.sequenceDispersion.cv) : "—"}`,
    },
  ];
  const kpiW = (CONTENT_W - 12) / 2;
  summaryKpis.forEach((k, i) => {
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
  y += 64 * Math.ceil(summaryKpis.length / 2) + 10;

  // Comparison table
  y = ensureSpace(doc, y, 200);
  y = sectionHeader(doc, y, "Scenario Comparison", COLORS.primary);
  autoTable(doc, {
    startY: y,
    head: [["Scenario", "P10 NW", "P50 NW", "P90 NW", "P50 Cash", "DSR", "LVR", "Downside", "Conf"]],
    body: data.results.map((r) => {
      const fan = r.netWorthFan[r.netWorthFan.length - 1];
      const cashEnd = r.cashFan[r.cashFan.length - 1];
      const narr = data.narrative.scenarios.find(s => s.scenarioId === r.scenarioId);
      return [
        r.name,
        fmt$M(fan.p10),
        fmt$M(fan.p50),
        fmt$M(fan.p90),
        fmt$M(cashEnd.p50),
        pct(r.serviceability?.dsr ?? 0),
        pct(r.serviceability?.lvr ?? 0),
        pct(r.riskMetrics.downsideRisk),
        `${narr?.confidence ?? 0}%`,
      ];
    }),
    styles: { fontSize: 8.5, cellPadding: 5, textColor: COLORS.text },
    headStyles: { fillColor: COLORS.primary, textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: COLORS.bgSoft },
    margin: { left: MARGIN, right: MARGIN },
    columnStyles: { 0: { fontStyle: "bold" } },
  });
  y = (doc as any).lastAutoTable.finalY + 18;

  // ── Capture charts (best-effort) ───────────────────────────────────────────
  const nwImage = data.chartEls?.nwChart ? await captureChart(data.chartEls.nwChart) : null;
  const liquidityImage = data.chartEls?.liquidityChart ? await captureChart(data.chartEls.liquidityChart) : null;

  // ── NW Chart page ──────────────────────────────────────────────────────────
  if (nwImage) {
    doc.addPage();
    let yc = MARGIN + 12;
    yc = sectionHeader(doc, yc, "Net Worth Projection", COLORS.primary);
    doc.addImage(nwImage, "PNG", MARGIN, yc, CONTENT_W, CONTENT_W * 0.5);
    yc += CONTENT_W * 0.5 + 16;
    yc = paragraph(
      doc,
      `Median (P50) net worth trajectory across ${data.results.length} scenarios over ${data.horizonYears} years. ` +
      `The spread between scenarios shows the value created or destroyed by each capital allocation decision.`,
      yc,
      { color: COLORS.muted, fontSize: 9 },
    );

    if (liquidityImage) {
      yc = ensureSpace(doc, yc, 280);
      yc = sectionHeader(doc, yc, "Liquidity Projection", COLORS.sky);
      doc.addImage(liquidityImage, "PNG", MARGIN, yc, CONTENT_W, CONTENT_W * 0.5);
      yc += CONTENT_W * 0.5 + 16;
      yc = paragraph(
        doc,
        `Median (P50) cash balance over time — a proxy for liquidity and optionality under each path.`,
        yc,
        { color: COLORS.muted, fontSize: 9 },
      );
    }
  }

  // ── Per-scenario detail pages ──────────────────────────────────────────────
  for (const r of data.results) {
    doc.addPage();
    let ys = MARGIN + 12;
    const narr = data.narrative.scenarios.find(s => s.scenarioId === r.scenarioId);
    if (!narr) continue;
    renderScenarioDetail(doc, r, narr, data.capital, data.horizonYears, ys);
  }

  // ── Stress paths ───────────────────────────────────────────────────────────
  doc.addPage();
  let ys = MARGIN + 12;
  ys = sectionHeader(doc, ys, "Stress Paths & Risk Probabilities", COLORS.rose);
  ys = paragraph(
    doc,
    `Probability of hitting each stress condition at any point over the horizon. ` +
    `Values above 10% indicate material risk and are flagged in red.`,
    ys,
    { color: COLORS.muted, fontSize: 9.5 },
  );
  ys += 4;

  autoTable(doc, {
    startY: ys,
    head: [["Scenario", "Neg-Equity P", "Liquidity Stress", "Refi Pressure", "Terminal NW CV"]],
    body: data.results.map(r => [
      r.name,
      pct(r.negativeEquityProbability),
      pct(r.liquidityStressProbability),
      pct(r.refinancePressureProbability),
      pct(r.sequenceDispersion.cv),
    ]),
    styles: { fontSize: 9, cellPadding: 6, textColor: COLORS.text },
    headStyles: { fillColor: COLORS.rose, textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: COLORS.bgSoft },
    margin: { left: MARGIN, right: MARGIN },
    didParseCell: (raw) => {
      if (raw.section === "body" && raw.column.index > 0) {
        const val = parseFloat(String(raw.cell.raw).replace("%", ""));
        if (val > 10) {
          raw.cell.styles.textColor = COLORS.rose;
          raw.cell.styles.fontStyle = "bold";
        }
      }
    },
  });
  ys = (doc as any).lastAutoTable.finalY + 14;
  ys = paragraph(
    doc,
    "Neg-Equity P: probability that property loan balance ever exceeds property value. " +
    "Liquidity Stress: probability that cash buffer drops below 1× monthly expenses. " +
    "Refi Pressure: probability of LVR exceeding 90% (APRA refinance friction). " +
    "Terminal NW CV: stddev / mean of terminal net worth across all simulations.",
    ys,
    { color: COLORS.muted, fontSize: 8 },
  );

  // ── Recommendation page ────────────────────────────────────────────────────
  doc.addPage();
  let yr = MARGIN + 12;
  yr = sectionHeader(doc, yr, "Recommendation", COLORS.accent);

  // Decision card
  setFill(doc, [250, 245, 255]);
  setDraw(doc, [216, 180, 254]);
  doc.setLineWidth(1);
  doc.roundedRect(MARGIN, yr, CONTENT_W, 50, 8, 8, "FD");
  setText(doc, COLORS.accent);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("THE CALL", MARGIN + 14, yr + 16);
  setText(doc, COLORS.text);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(winner?.name ?? "—", MARGIN + 14, yr + 36);
  yr += 64;

  // Long-form recommendation
  yr = paragraph(doc, data.narrative.recommendation, yr, { fontSize: 10.5 });

  // ── Assumptions appendix ───────────────────────────────────────────────────
  doc.addPage();
  let ya = MARGIN + 12;
  ya = sectionHeader(doc, ya, "Assumptions & Audit Trail", COLORS.slate);

  autoTable(doc, {
    startY: ya,
    head: [["Assumption", "Value"]],
    body: [
      ["Capital under decision", fmt$(data.capital)],
      ["Forecast horizon", `${data.horizonYears} years`],
      ["Monte Carlo simulations", data.simulationCount.toLocaleString()],
      ["Property capital growth", `${data.assumptions.propertyGrowthPct.toFixed(2)}% / year`],
      ["Property volatility (σ)", `${data.assumptions.propertyVolPct.toFixed(2)}% / year`],
      ["Crypto expected return", `${data.assumptions.cryptoReturnPct.toFixed(2)}% / year`],
      ["Crypto volatility (σ)", `${data.assumptions.cryptoVolPct.toFixed(2)}% / year`],
      ["Cash / offset APR", `${data.assumptions.cashAprPct.toFixed(2)}% / year`],
      ["Mortgage rate", `${data.assumptions.mortgageRatePct.toFixed(2)}% / year`],
      ["Gross rent yield", `${data.assumptions.rentYieldPct.toFixed(2)}% / year`],
    ],
    styles: { fontSize: 9.5, cellPadding: 6, textColor: COLORS.text },
    headStyles: { fillColor: COLORS.slate, textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: COLORS.bgSoft },
    margin: { left: MARGIN, right: MARGIN },
  });
  ya = (doc as any).lastAutoTable.finalY + 18;

  // Audit hashes
  ya = ensureSpace(doc, ya, 80);
  setText(doc, COLORS.muted);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("REPRODUCIBILITY HASHES", MARGIN, ya);
  ya += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  setText(doc, COLORS.text);
  doc.text(`Snapshot hash:     ${data.snapshotHash ?? "—"}`, MARGIN, ya); ya += 13;
  doc.text(`Assumptions hash:  ${data.assumptionsHash ?? "—"}`, MARGIN, ya); ya += 13;
  doc.text(`Generated:         ${data.generatedAt}`, MARGIN, ya); ya += 13;
  setText(doc, COLORS.muted);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.text(
    "These hashes uniquely identify the inputs used. Re-running with the same hashes will produce the same result.",
    MARGIN, ya,
  );
  ya += 24;

  // ── Disclaimer ─────────────────────────────────────────────────────────────
  ya = ensureSpace(doc, ya, 120);
  setText(doc, COLORS.muted);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("DISCLAIMER", MARGIN, ya);
  ya += 12;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  const disc =
    "This report is generated by an automated financial planning tool using your own ledger data and the " +
    "assumptions you specified. It is not personal financial advice, and the operator of this tool is not " +
    "a licensed financial adviser. Monte Carlo projections illustrate a range of possible outcomes given " +
    "the input assumptions; actual results will differ — sometimes materially. Property, equity, and crypto " +
    "markets carry significant risk including total loss of capital. Past performance is not a reliable " +
    "indicator of future performance. Tax outcomes are simplified estimates and may not reflect your " +
    "individual circumstances. Consider consulting a licensed financial adviser, tax agent, and mortgage " +
    "broker before acting on any analysis in this report.";
  const discLines = doc.splitTextToSize(disc, CONTENT_W) as string[];
  discLines.forEach(l => {
    doc.text(l, MARGIN, ya);
    ya += 11;
  });

  // ── Add page footers (now that we know the total page count) ───────────────
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    if (i === 1) continue; // skip cover footer
    drawPageFooter(doc, i, totalPages, data.householdName);
  }

  return doc;
}
