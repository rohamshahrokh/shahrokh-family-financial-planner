/**
 * helpPrimitives.tsx — Shared Help-Center building blocks.
 *
 * #FWL_HELP_CENTER_OVERHAUL
 *
 * Extracted from help.tsx so additional content modules (e.g. the Decision
 * Engine sections) can re-use the same Callout / Formula / Table / heading
 * components and keep layout consistent across all sections.
 *
 * Pure presentation. No engine coupling. RTL/Persian font handling is done
 * at the parent (AccordionItem) level via a single style override.
 */

import type { ReactNode } from "react";
import { Info, AlertTriangle, CheckCircle } from "lucide-react";

export function Callout({
  type,
  children,
}: {
  type: "info" | "warning" | "tip";
  children: ReactNode;
}): JSX.Element {
  const styles = {
    info: {
      bg: "hsl(210,50%,10%)",
      border: "hsl(210,60%,35%)",
      icon: <Info className="w-3.5 h-3.5 shrink-0 text-blue-400" />,
      text: "text-blue-300",
    },
    warning: {
      bg: "hsl(40,50%,10%)",
      border: "hsl(43,60%,35%)",
      icon: <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-yellow-400" />,
      text: "text-yellow-300",
    },
    tip: {
      bg: "hsl(142,50%,8%)",
      border: "hsl(142,50%,30%)",
      icon: <CheckCircle className="w-3.5 h-3.5 shrink-0 text-emerald-400" />,
      text: "text-emerald-300",
    },
  };
  const s = styles[type];
  return (
    <div
      className="flex gap-2.5 rounded-lg px-3 py-2.5 text-xs my-3"
      style={{ background: s.bg, border: `1px solid ${s.border}` }}
    >
      {s.icon}
      <span className={s.text}>{children}</span>
    </div>
  );
}

export function Formula({ children }: { children: ReactNode }): JSX.Element {
  return (
    <code
      className="block rounded-md px-3 py-2 text-xs my-2 font-mono leading-relaxed whitespace-pre-wrap"
      style={{
        background: "hsl(224,15%,8%)",
        border: "1px solid hsl(224,12%,20%)",
        color: "hsl(43,85%,65%)",
      }}
    >
      {children}
    </code>
  );
}

export function Table({ rows }: { rows: [string, string][] }): JSX.Element {
  return (
    <div className="overflow-x-auto my-3 rounded-lg" style={{ border: "1px solid hsl(224,12%,20%)" }}>
      <table className="w-full text-xs">
        <tbody>
          {rows.map(([a, b], i) => (
            <tr
              key={i}
              style={{ background: i % 2 === 0 ? "hsl(224,15%,10%)" : "hsl(224,15%,12%)" }}
            >
              <td className="px-3 py-2 font-mono" style={{ color: "hsl(43,85%,65%)", borderRight: "1px solid hsl(224,12%,20%)" }}>{a}</td>
              <td className="px-3 py-2 text-muted-foreground">{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PTag({ children }: { children: ReactNode }): JSX.Element {
  return <p className="text-sm text-muted-foreground leading-relaxed mb-3">{children}</p>;
}

export function H3({ children, id }: { children: ReactNode; id?: string }): JSX.Element {
  return (
    <h3 id={id} className="text-sm font-semibold text-foreground mb-2 mt-4 scroll-mt-24">
      {children}
    </h3>
  );
}

export function H4({ children, id }: { children: ReactNode; id?: string }): JSX.Element {
  return (
    <h4 id={id} className="text-[13px] font-semibold text-foreground mb-1.5 mt-3 scroll-mt-24">
      {children}
    </h4>
  );
}

export function UL({ items }: { items: ReactNode[] }): JSX.Element {
  return (
    <ul className="list-none space-y-1 mb-3">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2 text-sm text-muted-foreground">
          <span style={{ color: "hsl(43,85%,55%)" }}>▸</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Inline link to another help topic (or anchor within this page). */
export function Anchor({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <a
      href={href}
      className="underline underline-offset-2 hover:text-foreground transition-colors"
      style={{ color: "hsl(199,89%,55%)" }}
    >
      {children}
    </a>
  );
}

/**
 * MetricCard — a soft well used for individual risk-metric / chart-guide
 * articles. Provides an anchor target for deep links like
 * /help?topic=de-risk-metrics#cvar.
 */
export function MetricCard({
  anchor,
  title,
  children,
}: {
  anchor: string;
  title: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <div
      id={anchor}
      className="rounded-xl p-3.5 my-3 space-y-1.5 scroll-mt-24"
      style={{
        background: "hsl(224,15%,10%)",
        border: "1px solid hsl(224,12%,18%)",
      }}
    >
      <h4 className="text-[13px] font-semibold text-foreground">{title}</h4>
      <div className="text-xs text-muted-foreground leading-relaxed space-y-1.5 [&_strong]:text-foreground">
        {children}
      </div>
    </div>
  );
}
