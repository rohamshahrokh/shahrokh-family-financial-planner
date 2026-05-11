/**
 * polishNarrativeWithAi.ts — optional LLM polish layer
 *
 * Takes a deterministically-derived StrategyNarrative and asks an LLM to
 * humanize the strengths/weaknesses/best-for/avoid-if bullets without
 * changing their meaning. The rule-based version is ALWAYS available; this
 * is a strictly additive enhancement.
 *
 * If no endpoint is configured (VITE_LLM_POLISH_ENDPOINT), the function
 * resolves with the original narrative unchanged. Failures fall back silently
 * to rules — financial logic is never replaced.
 */

import type { StrategyNarrative } from "./strategyIntelligence";

export interface PolishRequest {
  candidateLabel: string;
  identityLabel: string;
  rawNarrative: StrategyNarrative;
  /** Optional context the model can use (P50 NW, FIRE delta, survival, etc.). */
  context?: Record<string, string | number>;
}

const ENDPOINT =
  typeof import.meta !== "undefined" && (import.meta as { env?: Record<string, string> }).env?.VITE_LLM_POLISH_ENDPOINT
    ? (import.meta as unknown as { env: Record<string, string> }).env.VITE_LLM_POLISH_ENDPOINT
    : "";

/**
 * Returns a polished narrative if an LLM endpoint is configured and reachable;
 * otherwise returns the input unchanged. NEVER throws.
 */
export async function polishNarrativeWithAi(req: PolishRequest): Promise<StrategyNarrative> {
  if (!ENDPOINT) return req.rawNarrative;

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: buildPrompt(req),
        // Server is expected to enforce: same meaning, just rephrase.
      }),
      // 8s timeout via AbortController
      signal: makeTimeoutSignal(8_000),
    });
    if (!res.ok) return req.rawNarrative;
    const data = (await res.json()) as Record<string, unknown>;
    const inner =
      data && typeof data === "object" && data.narrative && typeof data.narrative === "object"
        ? (data.narrative as Record<string, unknown>)
        : data;

    return {
      identityLabel: req.rawNarrative.identityLabel,
      identityHint: req.rawNarrative.identityHint,
      strengths:    nonEmpty(inner.strengths) ?? req.rawNarrative.strengths,
      weaknesses:   nonEmpty(inner.weaknesses) ?? req.rawNarrative.weaknesses,
      bestFor:      nonEmpty(inner.bestFor) ?? req.rawNarrative.bestFor,
      avoidIf:      nonEmpty(inner.avoidIf) ?? req.rawNarrative.avoidIf,
    };
  } catch {
    return req.rawNarrative;
  }
}

function buildPrompt(req: PolishRequest): string {
  return [
    `You are polishing investment-committee-style narrative for a personal financial planner.`,
    `Strategy: ${req.candidateLabel} (${req.identityLabel}).`,
    `Rephrase each bullet to feel like an experienced financial strategist`,
    `talking to a sophisticated retail user. Keep meaning identical. Keep each`,
    `bullet under 14 words. Do not introduce new claims or numbers.`,
    ``,
    `INPUT:`,
    JSON.stringify(req.rawNarrative, null, 2),
    ``,
    req.context ? `CONTEXT: ${JSON.stringify(req.context)}` : ``,
    ``,
    `Return a single JSON object with keys: strengths, weaknesses, bestFor, avoidIf.`,
  ].join("\n");
}

function makeTimeoutSignal(ms: number): AbortSignal {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

function nonEmpty(arr: unknown): string[] | undefined {
  if (!Array.isArray(arr)) return undefined;
  const out = arr.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  return out.length > 0 ? out : undefined;
}
