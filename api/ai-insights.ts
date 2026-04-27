/**
 * api/ai-insights.ts
 * Vercel Serverless Function — POST /api/ai-insights
 *
 * Receives summarised financial data from the frontend,
 * calls OpenAI gpt-4o-mini, returns structured insights JSON.
 * OPENAI_API_KEY is never exposed to the client.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";

// ─── Prompt templates per page type ──────────────────────────────────────────

function buildPrompt(page: string, data: Record<string, unknown>): string {
  const base = `You are a concise financial analysis assistant for an Australian family.
Analyse the data provided and return a JSON object with exactly these keys:
{
  "summary": "2-3 sentence overall assessment",
  "risks": ["risk 1", "risk 2", "risk 3"],
  "opportunities": ["opportunity 1", "opportunity 2", "opportunity 3"],
  "recommendations": ["recommendation 1", "recommendation 2", "recommendation 3"],
  "nextActions": ["action 1", "action 2", "action 3"]
}
Keep each item under 20 words. Be direct and practical. No fluff.
IMPORTANT: This is general information only, not financial advice.
Return ONLY valid JSON — no markdown, no preamble.

DATA:
${JSON.stringify(data, null, 2)}`;

  const pageContext: Record<string, string> = {
    dashboard: `Focus on: overall financial health, net worth trajectory, savings rate adequacy, debt management, cash flow sustainability, and 10-year forecast risks. If incomeSource is 'Income Tracker', comment on income tracking quality. If 'Snapshot fallback', recommend setting up the income tracker.`,
    expenses: `Focus on: overspending categories, unusual spikes, savings opportunities, spending trends, and a practical action plan to reduce costs.`,
    income: `Focus on: income stability across sources, salary vs passive income ratio, recurring vs one-off income mix, whether income is growing, diversification opportunities, and family member income balance. If income records are sparse, highlight the risk.`,
    cashflow: `Focus on: monthly net cash flow trend, whether savings rate is sustainable, months with negative cash flow (daily spikes), income vs expense trajectory, and specific months where spending exceeded income. Provide concrete recommendations to improve cash flow.`,
    property: `Focus on: LVR risk, cash flow pressure from loans, rental yield adequacy, equity opportunities, and whether future purchases look affordable.`,
    stocks: `Focus on: portfolio concentration risk, sector imbalance, underweight/overweight positions, DCA effectiveness, and unrealised gain/loss implications.`,
    crypto: `Focus on: volatility exposure, concentration in BTC/ETH vs altcoins, DCA strategy effectiveness, allocation as % of net worth, and long-term risk.`,
    timeline: `Focus on: net worth milestone projections, weak years in the forecast, years of strong growth, recommended adjustments to reach goals faster.`,
    "ai-insights": `Provide a holistic view across all financial areas. Identify the single biggest risk and the single best opportunity across the entire financial picture. If income tracking data is available, comment on cashflow sustainability.`,
  };

  return `${pageContext[page] || pageContext.dashboard}\n\n${base}`;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers for the static SPA origin
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "OPENAI_API_KEY is not configured. Add it to Vercel Environment Variables.",
    });
  }

  const { page, data } = req.body as { page: string; data: Record<string, unknown> };
  if (!page || !data) {
    return res.status(400).json({ error: "Missing required fields: page, data" });
  }

  try {
    const prompt = buildPrompt(page, data);

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.4,
        max_tokens: 600,
        response_format: { type: "json_object" },
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error("[ai-insights] OpenAI error:", errText);
      return res.status(502).json({ error: `OpenAI API error: ${openaiRes.status}` });
    }

    const openaiData = await openaiRes.json() as any;
    const content = openaiData.choices?.[0]?.message?.content;

    if (!content) {
      return res.status(502).json({ error: "Empty response from OpenAI" });
    }

    let insights: unknown;
    try {
      insights = JSON.parse(content);
    } catch {
      return res.status(502).json({ error: "OpenAI returned invalid JSON" });
    }

    const usage = openaiData.usage;
    console.log(`[ai-insights] page=${page} tokens=${usage?.total_tokens ?? 0}`);

    return res.status(200).json({
      insights,
      generatedAt: new Date().toISOString(),
      model: "gpt-4o-mini",
      tokens: usage?.total_tokens ?? 0,
    });
  } catch (err: unknown) {
    console.error("[ai-insights] Unexpected error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
