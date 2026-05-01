/**
 * WealthFlowBanner.tsx
 *
 * Animated hero banner — 4-stage wealth pipeline.
 * Pure CSS + SVG animation. Zero external dependencies.
 * Intersection Observer triggers animation on scroll-into-view.
 */

import { useEffect, useRef, useState } from "react";

const STAGES = [
  {
    id: "data",
    label: "Data Input",
    sub: "Live financial data",
    color: "#60a5fa",      // blue
    glow: "rgba(96,165,250,0.35)",
  },
  {
    id: "ai",
    label: "AI Engine",
    sub: "Neural processing",
    color: "#a78bfa",      // violet
    glow: "rgba(167,139,250,0.35)",
  },
  {
    id: "forecast",
    label: "Forecast",
    sub: "10-year projection",
    color: "#34d399",      // emerald
    glow: "rgba(52,211,153,0.35)",
  },
  {
    id: "action",
    label: "Action",
    sub: "Smart wealth moves",
    color: "#fbbf24",      // amber
    glow: "rgba(251,191,36,0.35)",
  },
];

// ── Inline SVG icons ──────────────────────────────────────────────────────────

function IconData({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%" }}>
      {/* Database stack */}
      <ellipse cx="20" cy="12" rx="12" ry="4.5" stroke={color} strokeWidth="1.6" />
      <path d="M8 12v8c0 2.5 5.4 4.5 12 4.5s12-2 12-4.5v-8" stroke={color} strokeWidth="1.6" />
      <path d="M8 20v8c0 2.5 5.4 4.5 12 4.5s12-2 12-4.5v-8" stroke={color} strokeWidth="1.6" />
      {/* Data dots */}
      <circle cx="14" cy="12" r="1.5" fill={color} opacity="0.7" />
      <circle cx="20" cy="13" r="1.5" fill={color} opacity="0.7" />
      <circle cx="26" cy="11.5" r="1.5" fill={color} opacity="0.7" />
    </svg>
  );
}

function IconAI({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%" }}>
      {/* Chip body */}
      <rect x="11" y="11" width="18" height="18" rx="3" stroke={color} strokeWidth="1.6" />
      {/* Grid inside */}
      <line x1="16" y1="11" x2="16" y2="29" stroke={color} strokeWidth="0.8" opacity="0.5" />
      <line x1="20" y1="11" x2="20" y2="29" stroke={color} strokeWidth="0.8" opacity="0.5" />
      <line x1="24" y1="11" x2="24" y2="29" stroke={color} strokeWidth="0.8" opacity="0.5" />
      <line x1="11" y1="16" x2="29" y2="16" stroke={color} strokeWidth="0.8" opacity="0.5" />
      <line x1="11" y1="20" x2="29" y2="20" stroke={color} strokeWidth="0.8" opacity="0.5" />
      <line x1="11" y1="24" x2="29" y2="24" stroke={color} strokeWidth="0.8" opacity="0.5" />
      {/* Pins */}
      <line x1="14" y1="8" x2="14" y2="11" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <line x1="20" y1="8" x2="20" y2="11" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <line x1="26" y1="8" x2="26" y2="11" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <line x1="14" y1="29" x2="14" y2="32" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <line x1="20" y1="29" x2="20" y2="32" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <line x1="26" y1="29" x2="26" y2="32" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <line x1="8" y1="14" x2="11" y2="14" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <line x1="8" y1="20" x2="11" y2="20" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <line x1="8" y1="26" x2="11" y2="26" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <line x1="29" y1="14" x2="32" y2="14" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <line x1="29" y1="20" x2="32" y2="20" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <line x1="29" y1="26" x2="32" y2="26" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      {/* Center dot */}
      <circle cx="20" cy="20" r="2.5" fill={color} opacity="0.9" />
    </svg>
  );
}

function IconForecast({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%" }}>
      {/* Axes */}
      <line x1="9" y1="31" x2="9" y2="9" stroke={color} strokeWidth="1.4" strokeLinecap="round" opacity="0.5" />
      <line x1="9" y1="31" x2="33" y2="31" stroke={color} strokeWidth="1.4" strokeLinecap="round" opacity="0.5" />
      {/* Rising line — animated via CSS class on the path */}
      <polyline
        className="forecast-line"
        points="10,29 16,24 21,19 26,14 31,9"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        strokeDasharray="60"
        strokeDashoffset="60"
      />
      {/* Area fill */}
      <polygon
        className="forecast-area"
        points="10,29 16,24 21,19 26,14 31,9 31,31 10,31"
        fill={color}
        opacity="0"
      />
      {/* Arrow tip */}
      <polyline points="29,7 31,9 29,11" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconAction({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%" }}>
      {/* Target rings */}
      <circle cx="20" cy="20" r="14" stroke={color} strokeWidth="1.2" opacity="0.3" />
      <circle cx="20" cy="20" r="9" stroke={color} strokeWidth="1.4" opacity="0.55" />
      <circle cx="20" cy="20" r="4.5" stroke={color} strokeWidth="1.6" opacity="0.85" />
      {/* Bull-eye */}
      <circle cx="20" cy="20" r="2" fill={color} />
      {/* Cross hairs */}
      <line x1="20" y1="5" x2="20" y2="10" stroke={color} strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
      <line x1="20" y1="30" x2="20" y2="35" stroke={color} strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
      <line x1="5" y1="20" x2="10" y2="20" stroke={color} strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
      <line x1="30" y1="20" x2="35" y2="20" stroke={color} strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function WealthFlowBanner() {
  const bannerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [tooltip, setTooltip] = useState<number | null>(null);

  // Intersection observer — animate on enter
  useEffect(() => {
    const el = bannerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.2 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <>
      {/* ── Scoped keyframes injected once ── */}
      <style>{`
        @keyframes wfb-pulse {
          0%, 100% { opacity: 0.7; transform: scale(1); }
          50%       { opacity: 1;   transform: scale(1.08); }
        }
        @keyframes wfb-ring {
          0%   { transform: scale(0.6); opacity: 0.8; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes wfb-energy {
          0%   { stroke-dashoffset: 400; opacity: 0; }
          10%  { opacity: 1; }
          85%  { opacity: 1; }
          100% { stroke-dashoffset: 0; opacity: 0; }
        }
        @keyframes wfb-dot {
          0%   { cx: -10; opacity: 0; }
          5%   { opacity: 1; }
          90%  { opacity: 1; }
          100% { cx: 410; opacity: 0; }
        }
        @keyframes wfb-fadein {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes wfb-line {
          0%, 10%  { stroke-dashoffset: 60; }
          55%, 90% { stroke-dashoffset: 0; }
          100%     { stroke-dashoffset: 60; }
        }
        @keyframes wfb-area {
          0%, 10%  { opacity: 0; }
          55%, 85% { opacity: 0.08; }
          100%     { opacity: 0; }
        }
        @keyframes wfb-chip {
          0%, 100% { box-shadow: 0 0 0 0 rgba(167,139,250,0); }
          40%      { box-shadow: 0 0 16px 4px rgba(167,139,250,0.45); }
        }
        @keyframes wfb-scanline {
          0%   { top: 14%; opacity: 0.9; }
          100% { top: 85%; opacity: 0; }
        }
        .wfb-energy-path {
          stroke-dasharray: 400;
          stroke-dashoffset: 400;
        }
        .wfb-energy-path.wfb-active {
          animation: wfb-energy 6s cubic-bezier(0.4,0,0.2,1) infinite;
        }
        .wfb-icon-wrap.wfb-active {
          animation: wfb-pulse 3s ease-in-out infinite;
        }
        .wfb-ring.wfb-active {
          animation: wfb-ring 2.4s ease-out infinite;
        }
        .wfb-fadein.wfb-active {
          animation: wfb-fadein 0.7s cubic-bezier(0.22,1,0.36,1) forwards;
        }
        .forecast-line.wfb-active {
          animation: wfb-line 6s ease-in-out infinite;
        }
        .forecast-area.wfb-active {
          animation: wfb-area 6s ease-in-out infinite;
        }
        /* tooltip */
        .wfb-tooltip {
          position: absolute;
          bottom: calc(100% + 10px);
          left: 50%;
          transform: translateX(-50%);
          background: rgba(10,10,20,0.95);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 8px;
          padding: 7px 12px;
          pointer-events: none;
          white-space: nowrap;
          z-index: 50;
          animation: wfb-fadein 0.18s ease forwards;
          backdrop-filter: blur(12px);
        }
        .wfb-tooltip::after {
          content: '';
          position: absolute;
          top: 100%; left: 50%;
          transform: translateX(-50%);
          border: 5px solid transparent;
          border-top-color: rgba(255,255,255,0.12);
        }
      `}</style>

      {/* ── Banner shell ── */}
      <div
        ref={bannerRef}
        style={{
          position: "relative",
          width: "100%",
          overflow: "hidden",
          background: "linear-gradient(135deg, rgba(6,6,18,0.98) 0%, rgba(12,10,28,0.98) 100%)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          borderRadius: "0 0 16px 16px",
          userSelect: "none",
        }}
      >
        {/* Subtle grid overlay */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)
          `,
          backgroundSize: "32px 32px",
          pointerEvents: "none",
        }} />

        {/* Ambient glow blobs */}
        <div style={{
          position: "absolute", top: "-40%", left: "15%",
          width: 180, height: 180,
          background: "radial-gradient(circle, rgba(96,165,250,0.08) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", top: "-30%", left: "60%",
          width: 200, height: 200,
          background: "radial-gradient(circle, rgba(167,139,250,0.09) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />

        {/* ── Inner layout ── */}
        <div style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "clamp(12px, 2vw, 20px) clamp(12px, 4vw, 32px)",
          gap: 0,
          minHeight: "clamp(100px, 14vw, 160px)",
          maxHeight: 180,
        }}>

          {/* ── SVG energy track behind everything ── */}
          <svg
            viewBox="0 0 420 60"
            preserveAspectRatio="none"
            style={{
              position: "absolute",
              left: "8%", right: "8%",
              width: "84%",
              height: "100%",
              top: 0,
              pointerEvents: "none",
              overflow: "visible",
            }}
          >
            {/* Static track */}
            <path
              d="M 0 30 L 420 30"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="1"
              fill="none"
            />

            {/* Animated energy flow */}
            <path
              d="M 0 30 L 420 30"
              stroke="url(#wfb-grad)"
              strokeWidth="1.5"
              fill="none"
              className={`wfb-energy-path ${visible ? "wfb-active" : ""}`}
            />

            {/* Moving orb dot — CSS animated circle */}
            <circle r="4" fill="white" opacity="0.9" style={{
              filter: "blur(1px)",
              ...(visible ? {
                animation: "wfb-dot 6s cubic-bezier(0.4,0,0.6,1) infinite",
                animationDelay: "0.3s",
              } : {}),
            }}>
              <animateMotion
                dur="6s"
                repeatCount="indefinite"
                begin={visible ? "0s" : "indefinite"}
                path="M 0 30 L 420 30"
                keyTimes="0;0.08;0.85;1"
                keySplines="0.4 0 0.2 1; 0.4 0 0.2 1; 0.4 0 0.2 1"
              />
            </circle>

            {/* Gradient for energy line */}
            <defs>
              <linearGradient id="wfb-grad" x1="0" y1="0" x2="420" y2="0" gradientUnits="userSpaceOnUse">
                <stop offset="0%"   stopColor="#60a5fa" />
                <stop offset="33%"  stopColor="#a78bfa" />
                <stop offset="66%"  stopColor="#34d399" />
                <stop offset="100%" stopColor="#fbbf24" />
              </linearGradient>
            </defs>
          </svg>

          {/* ── 4 stages ── */}
          {STAGES.map((stage, i) => {
            const delay = `${i * 0.15}s`;
            const pulseDelay = `${i * 0.75}s`;
            return (
              <div
                key={stage.id}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "clamp(4px, 1vw, 8px)",
                  position: "relative",
                  zIndex: 2,
                  cursor: "default",
                  padding: "4px 0",
                }}
                onMouseEnter={() => setTooltip(i)}
                onMouseLeave={() => setTooltip(null)}
              >
                {/* Tooltip */}
                {tooltip === i && (
                  <div className="wfb-tooltip">
                    <div style={{ color: stage.color, fontWeight: 700, fontSize: 12, letterSpacing: "0.05em" }}>
                      {stage.label}
                    </div>
                    <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, marginTop: 2 }}>
                      {stage.sub}
                    </div>
                  </div>
                )}

                {/* Icon container */}
                <div
                  className={visible ? "wfb-active" : ""}
                  style={{
                    position: "relative",
                    width: "clamp(36px, 5vw, 52px)",
                    height: "clamp(36px, 5vw, 52px)",
                    animationDelay: pulseDelay,
                    animationDuration: "3s",
                    ...(visible ? {
                      animation: `wfb-pulse 3s ease-in-out ${pulseDelay} infinite`,
                      opacity: 0,
                      animationFillMode: "forwards",
                    } : { opacity: 0 }),
                  }}
                >
                  {/* Glow backdrop */}
                  <div style={{
                    position: "absolute", inset: "-30%",
                    borderRadius: "50%",
                    background: `radial-gradient(circle, ${stage.glow} 0%, transparent 70%)`,
                    pointerEvents: "none",
                  }} />

                  {/* Icon bg ring */}
                  <div style={{
                    position: "absolute", inset: 0,
                    borderRadius: "50%",
                    border: `1.5px solid ${stage.color}30`,
                    background: `radial-gradient(circle at 35% 35%, ${stage.color}18 0%, transparent 70%)`,
                  }} />

                  {/* Pulse ring (target stage only) */}
                  {stage.id === "action" && (
                    <>
                      <div
                        className={visible ? "wfb-ring wfb-active" : "wfb-ring"}
                        style={{
                          position: "absolute", inset: 0,
                          borderRadius: "50%",
                          border: `1.5px solid ${stage.color}`,
                          animationDelay: "0s",
                        }}
                      />
                      <div
                        className={visible ? "wfb-ring wfb-active" : "wfb-ring"}
                        style={{
                          position: "absolute", inset: 0,
                          borderRadius: "50%",
                          border: `1.5px solid ${stage.color}`,
                          animationDelay: "1.2s",
                        }}
                      />
                    </>
                  )}

                  {/* Chip scan line (AI stage only) */}
                  {stage.id === "ai" && visible && (
                    <div style={{
                      position: "absolute",
                      left: "18%", right: "18%",
                      height: 1,
                      background: `linear-gradient(90deg, transparent, ${stage.color}, transparent)`,
                      animation: `wfb-scanline 2.4s ease-in-out infinite`,
                    }} />
                  )}

                  {/* SVG Icon */}
                  <div style={{ position: "absolute", inset: "16%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {stage.id === "data"     && <IconData     color={stage.color} />}
                    {stage.id === "ai"       && <IconAI       color={stage.color} />}
                    {stage.id === "forecast" && <IconForecast color={stage.color} />}
                    {stage.id === "action"   && <IconAction   color={stage.color} />}
                  </div>

                  {/* Animate forecast SVG sub-elements */}
                  {stage.id === "forecast" && visible && (
                    <style>{`
                      .forecast-line { animation: wfb-line 6s ease-in-out infinite !important; }
                      .forecast-area { animation: wfb-area 6s ease-in-out infinite !important; }
                    `}</style>
                  )}
                </div>

                {/* Stage number badge */}
                <div style={{
                  width: "clamp(14px, 1.8vw, 18px)",
                  height: "clamp(14px, 1.8vw, 18px)",
                  borderRadius: "50%",
                  background: `${stage.color}20`,
                  border: `1px solid ${stage.color}50`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "clamp(8px, 1vw, 10px)",
                  fontWeight: 700,
                  color: stage.color,
                  letterSpacing: 0,
                  lineHeight: 1,
                }}>
                  {i + 1}
                </div>

                {/* Label block */}
                <div
                  className={visible ? "wfb-fadein wfb-active" : "wfb-fadein"}
                  style={{
                    textAlign: "center",
                    animationDelay: `${0.3 + i * 0.12}s`,
                    opacity: 0,
                    animationFillMode: "forwards",
                  }}
                >
                  <div style={{
                    fontSize: "clamp(9px, 1.1vw, 12px)",
                    fontWeight: 700,
                    color: stage.color,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    lineHeight: 1.2,
                  }}>
                    {stage.label}
                  </div>
                  <div style={{
                    fontSize: "clamp(8px, 0.9vw, 10px)",
                    color: "rgba(255,255,255,0.38)",
                    marginTop: 1,
                    letterSpacing: "0.02em",
                    display: "none", // hidden on very small
                  }}
                    className="wfb-sub"
                  >
                    {stage.sub}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom edge accent line */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, height: 1,
          background: "linear-gradient(90deg, transparent, rgba(96,165,250,0.3), rgba(167,139,250,0.4), rgba(52,211,153,0.3), rgba(251,191,36,0.3), transparent)",
        }} />

        {/* Mobile: show subtitle */}
        <style>{`
          @media (min-width: 480px) { .wfb-sub { display: block !important; } }
        `}</style>
      </div>
    </>
  );
}
