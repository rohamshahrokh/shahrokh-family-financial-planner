/**
 * WealthFlowBanner.tsx — Wealth OS Pipeline Strip
 *
 * TODAY → PLAN → FUTURE → MOVE
 * Premium fintech / Wealth OS aesthetic.
 * Transparent background, no border box, native to platform.
 * Pure CSS + SVG animation. Zero external dependencies.
 * IntersectionObserver triggers on scroll-into-view.
 */

import { useEffect, useRef, useState } from "react";

// ── Stage definitions ─────────────────────────────────────────────────────────
const STAGES = [
  {
    id: "today",
    word: "TODAY",
    sub: "Live snapshot",
    accent: "#38bdf8",   // sky blue
    dim: "rgba(56,189,248,0.18)",
    glow: "rgba(56,189,248,0.5)",
  },
  {
    id: "plan",
    word: "PLAN",
    sub: "Your intentions",
    accent: "#818cf8",   // indigo
    dim: "rgba(129,140,248,0.18)",
    glow: "rgba(129,140,248,0.5)",
  },
  {
    id: "future",
    word: "FUTURE",
    sub: "AI modelling",
    accent: "#34d399",   // emerald
    dim: "rgba(52,211,153,0.18)",
    glow: "rgba(52,211,153,0.5)",
  },
  {
    id: "move",
    word: "MOVE",
    sub: "Best action now",
    accent: "#fb923c",   // orange
    dim: "rgba(251,146,60,0.18)",
    glow: "rgba(251,146,60,0.5)",
  },
] as const;

// ── SVG Icons (inline, crisp) ─────────────────────────────────────────────────

function IconToday({ c }: { c: string }) {
  // Pulse dot + live waveform
  return (
    <svg viewBox="0 0 32 32" fill="none" style={{ width: "100%", height: "100%" }}>
      {/* Outer pulse ring */}
      <circle cx="16" cy="16" r="13" stroke={c} strokeWidth="1" opacity="0.25" />
      {/* Screen bezel */}
      <rect x="6" y="9" width="20" height="14" rx="2.5" stroke={c} strokeWidth="1.4" />
      {/* Live heartbeat line */}
      <polyline
        points="8,16 11,16 12.5,12 14,20 15.5,14 17,18 18.5,16 24,16"
        stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      />
      {/* Live dot */}
      <circle cx="26" cy="10" r="2" fill={c} className="wfb-live-dot" />
    </svg>
  );
}

function IconPlan({ c }: { c: string }) {
  // Calendar with checkmarks / roadmap nodes
  return (
    <svg viewBox="0 0 32 32" fill="none" style={{ width: "100%", height: "100%" }}>
      {/* Calendar body */}
      <rect x="5" y="8" width="22" height="18" rx="2.5" stroke={c} strokeWidth="1.4" />
      {/* Header bar */}
      <rect x="5" y="8" width="22" height="6" rx="2.5" fill={c} opacity="0.15" />
      {/* Binding ticks */}
      <line x1="11" y1="5" x2="11" y2="10" stroke={c} strokeWidth="1.6" strokeLinecap="round" />
      <line x1="21" y1="5" x2="21" y2="10" stroke={c} strokeWidth="1.6" strokeLinecap="round" />
      {/* Roadmap nodes */}
      <circle cx="11" cy="19" r="1.8" fill={c} opacity="0.9" />
      <circle cx="16" cy="19" r="1.8" fill={c} opacity="0.5" />
      <circle cx="21" cy="19" r="1.8" stroke={c} strokeWidth="1.2" opacity="0.4" />
      {/* Connecting line */}
      <line x1="12.8" y1="19" x2="14.2" y2="19" stroke={c} strokeWidth="1" opacity="0.5" />
      <line x1="17.8" y1="19" x2="19.2" y2="19" stroke={c} strokeWidth="1" opacity="0.3" />
      {/* Checkmark in first node */}
      <polyline points="9.5,19 10.5,20 12.5,17.5" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
    </svg>
  );
}

function IconFuture({ c }: { c: string }) {
  // Rising orbital / AI wave graph
  return (
    <svg viewBox="0 0 32 32" fill="none" style={{ width: "100%", height: "100%" }}>
      {/* Orbit ellipse */}
      <ellipse cx="16" cy="16" rx="12" ry="6" stroke={c} strokeWidth="1" opacity="0.2" />
      {/* Rising trend line */}
      <polyline
        points="5,24 9,20 13,16 17,12 21,9 27,6"
        stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
        className="wfb-forecast-line"
        strokeDasharray="36"
        strokeDashoffset="36"
      />
      {/* Area fill */}
      <polygon
        points="5,24 9,20 13,16 17,12 21,9 27,6 27,26 5,26"
        fill={c} opacity="0"
        className="wfb-forecast-fill"
      />
      {/* AI nodes on the line */}
      <circle cx="9" cy="20" r="1.6" fill={c} opacity="0.7" />
      <circle cx="17" cy="12" r="1.6" fill={c} opacity="0.85" />
      <circle cx="27" cy="6" r="2" fill={c} />
      {/* Arrow tip */}
      <polyline points="25,4.5 27,6 25,7.5" stroke={c} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconMove({ c }: { c: string }) {
  // Target with lightning bolt
  return (
    <svg viewBox="0 0 32 32" fill="none" style={{ width: "100%", height: "100%" }}>
      {/* Outer ring */}
      <circle cx="16" cy="16" r="12" stroke={c} strokeWidth="1" opacity="0.25" />
      {/* Middle ring */}
      <circle cx="16" cy="16" r="7.5" stroke={c} strokeWidth="1.3" opacity="0.55" />
      {/* Lightning bolt */}
      <path
        d="M18 8 L13 16.5 H17 L14 24 L21 14.5 H17 Z"
        fill={c} opacity="0.9"
      />
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function WealthFlowBanner() {
  const ref = useRef<HTMLDivElement>(null);
  const [alive, setAlive] = useState(false);
  const [tip, setTip] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setAlive(true); },
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <>
      <style>{`
        /* ── Keyframes ───────────────────────────────────── */
        @keyframes wfb-orb {
          0%   { opacity: 0; }
          6%   { opacity: 1; }
          88%  { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes wfb-energy {
          0%   { stroke-dashoffset: 600; opacity: 0; }
          8%   { opacity: 1; }
          86%  { opacity: 1; }
          100% { stroke-dashoffset: 0;   opacity: 0; }
        }
        @keyframes wfb-pulse {
          0%, 100% { opacity: 0.6; transform: scale(0.97); }
          50%      { opacity: 1;   transform: scale(1.04); }
        }
        @keyframes wfb-live {
          0%, 100% { opacity: 1;   r: 2;   }
          50%      { opacity: 0.3; r: 2.8; }
        }
        @keyframes wfb-ring-out {
          0%   { transform: scale(0.5); opacity: 0.7; }
          100% { transform: scale(2.6); opacity: 0;   }
        }
        @keyframes wfb-label-in {
          from { opacity: 0; transform: translateY(5px); }
          to   { opacity: 1; transform: translateY(0);   }
        }
        @keyframes wfb-forecast-draw {
          0%, 8%   { stroke-dashoffset: 36; }
          55%, 90% { stroke-dashoffset: 0;  }
          100%     { stroke-dashoffset: 36; }
        }
        @keyframes wfb-forecast-fill {
          0%, 8%   { opacity: 0;    }
          55%, 88% { opacity: 0.07; }
          100%     { opacity: 0;    }
        }
        /* ── Active state classes ────────────────────────── */
        .wfb-on .wfb-energy-path {
          animation: wfb-energy 5s cubic-bezier(0.4,0,0.2,1) infinite;
        }
        .wfb-on .wfb-icon {
          animation: wfb-pulse 3.2s ease-in-out infinite;
        }
        .wfb-on .wfb-label-in {
          animation: wfb-label-in 0.6s cubic-bezier(0.22,1,0.36,1) forwards;
          opacity: 0;
        }
        .wfb-on .wfb-ring {
          animation: wfb-ring-out 2.4s ease-out infinite;
        }
        .wfb-on .wfb-live-dot {
          animation: wfb-live 1.1s ease-in-out infinite;
        }
        .wfb-on .wfb-forecast-line {
          animation: wfb-forecast-draw 5s ease-in-out infinite;
        }
        .wfb-on .wfb-forecast-fill {
          animation: wfb-forecast-fill 5s ease-in-out infinite;
        }
        /* ── Tooltip ─────────────────────────────────────── */
        .wfb-tip {
          position: absolute;
          bottom: calc(100% + 8px);
          left: 50%;
          transform: translateX(-50%);
          background: rgba(8,8,20,0.92);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px;
          padding: 6px 11px;
          pointer-events: none;
          white-space: nowrap;
          z-index: 60;
          backdrop-filter: blur(16px);
          animation: wfb-label-in 0.15s ease forwards;
        }
        .wfb-tip::after {
          content: '';
          position: absolute;
          top: 100%; left: 50%;
          transform: translateX(-50%);
          border: 4px solid transparent;
          border-top-color: rgba(255,255,255,0.08);
        }
        /* ── Mobile sub-label hide ───────────────────────── */
        .wfb-sub { display: none; }
        @media (min-width: 500px) { .wfb-sub { display: block; } }
        /* ── Stagger delays ──────────────────────────────── */
        .wfb-s0 { animation-delay: 0s !important; }
        .wfb-s1 { animation-delay: 0.12s !important; }
        .wfb-s2 { animation-delay: 0.24s !important; }
        .wfb-s3 { animation-delay: 0.36s !important; }
        .wfb-p0 { animation-delay: 0s; }
        .wfb-p1 { animation-delay: 0.8s; }
        .wfb-p2 { animation-delay: 1.6s; }
        .wfb-p3 { animation-delay: 2.4s; }
      `}</style>

      {/* ── Strip shell ───────────────────────────────────────────────────────── */}
      <div
        ref={ref}
        className={alive ? "wfb-on" : ""}
        style={{
          position: "relative",
          width: "100%",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          padding: "clamp(10px,1.8vw,18px) clamp(16px,4vw,48px)",
          height: "clamp(70px,10vw,90px)",
          overflow: "visible",
          userSelect: "none",
        }}
      >

        {/* ── SVG energy track ──────────────────────────────────────────────── */}
        <svg
          viewBox="0 0 600 40"
          preserveAspectRatio="none"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            overflow: "visible",
          }}
        >
          <defs>
            {/* Gradient for energy line */}
            <linearGradient id="wfb-grad" x1="0" y1="0" x2="600" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0%"   stopColor="#38bdf8" />
              <stop offset="33%"  stopColor="#818cf8" />
              <stop offset="66%"  stopColor="#34d399" />
              <stop offset="100%" stopColor="#fb923c" />
            </linearGradient>
            {/* Gradient for static track */}
            <linearGradient id="wfb-track" x1="0" y1="0" x2="600" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0%"   stopColor="#38bdf8" stopOpacity="0.12" />
              <stop offset="50%"  stopColor="#34d399" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#fb923c" stopOpacity="0.12" />
            </linearGradient>
          </defs>

          {/* Static faint track */}
          <line x1="50" y1="20" x2="550" y2="20"
            stroke="url(#wfb-track)" strokeWidth="1" />

          {/* Animated energy sweep */}
          <line
            x1="50" y1="20" x2="550" y2="20"
            stroke="url(#wfb-grad)"
            strokeWidth="1.5"
            strokeLinecap="round"
            className="wfb-energy-path"
            style={{ strokeDasharray: 600, strokeDashoffset: 600 }}
          />

          {/* Moving orb via animateMotion */}
          <circle r="3.5" fill="white" opacity="0.95" style={{ filter: "blur(0.5px)" }}>
            <animateMotion
              dur="5s" repeatCount="indefinite"
              begin={alive ? "0s" : "indefinite"}
              path="M 50 20 L 550 20"
              keyTimes="0;0.06;0.88;1"
              keySplines="0.4 0 0.2 1;0.4 0 0.2 1;0.4 0 0.2 1"
              calcMode="spline"
            />
            <animate attributeName="opacity"
              values="0;1;1;0"
              keyTimes="0;0.06;0.88;1"
              dur="5s" repeatCount="indefinite"
              begin={alive ? "0s" : "indefinite"}
            />
          </circle>
        </svg>

        {/* ── 4 Stage nodes ─────────────────────────────────────────────────── */}
        <div style={{
          position: "relative",
          zIndex: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          maxWidth: 780,
          gap: 0,
        }}>
          {STAGES.map((s, i) => (
            <div
              key={s.id}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "clamp(4px,0.8vw,7px)",
                position: "relative",
                cursor: "default",
              }}
              onMouseEnter={() => setTip(i)}
              onMouseLeave={() => setTip(null)}
            >
              {/* Tooltip */}
              {tip === i && (
                <div className="wfb-tip">
                  <span style={{
                    color: s.accent,
                    fontWeight: 700,
                    fontSize: 11,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}>
                    {s.word}
                  </span>
                  <span style={{
                    color: "rgba(255,255,255,0.45)",
                    fontSize: 10,
                    marginLeft: 6,
                  }}>
                    {s.sub}
                  </span>
                </div>
              )}

              {/* Icon wrapper */}
              <div
                className={`wfb-icon wfb-p${i}`}
                style={{
                  position: "relative",
                  width: "clamp(28px,3.8vw,40px)",
                  height: "clamp(28px,3.8vw,40px)",
                  opacity: alive ? undefined : 0,
                  transition: "opacity 0.4s ease",
                  ...(alive ? {} : {}),
                }}
              >
                {/* Ambient glow */}
                <div style={{
                  position: "absolute",
                  inset: "-50%",
                  borderRadius: "50%",
                  background: `radial-gradient(circle, ${s.glow} 0%, transparent 65%)`,
                  opacity: 0.5,
                  pointerEvents: "none",
                }} />

                {/* Pulse ring — only on MOVE stage */}
                {s.id === "move" && (
                  <>
                    <div className="wfb-ring wfb-p0" style={{
                      position: "absolute", inset: "0%",
                      borderRadius: "50%",
                      border: `1px solid ${s.accent}`,
                    }} />
                    <div className="wfb-ring wfb-p1" style={{
                      position: "absolute", inset: "0%",
                      borderRadius: "50%",
                      border: `1px solid ${s.accent}`,
                      animationDelay: "1.2s",
                    }} />
                  </>
                )}

                {/* TODAY: extra ring pulse */}
                {s.id === "today" && alive && (
                  <div className="wfb-ring" style={{
                    position: "absolute", inset: "0%",
                    borderRadius: "50%",
                    border: `1px solid ${s.accent}`,
                    animationDelay: "0.4s",
                  }} />
                )}

                {/* Icon SVG */}
                <div style={{ position: "absolute", inset: "10%", display: "flex" }}>
                  {s.id === "today"  && <IconToday  c={s.accent} />}
                  {s.id === "plan"   && <IconPlan   c={s.accent} />}
                  {s.id === "future" && <IconFuture c={s.accent} />}
                  {s.id === "move"   && <IconMove   c={s.accent} />}
                </div>
              </div>

              {/* Label block */}
              <div
                className={`wfb-label-in wfb-s${i}`}
                style={{
                  textAlign: "center",
                  opacity: 0,
                  animationFillMode: "forwards",
                  ...(alive ? {} : {}),
                }}
              >
                {/* Word */}
                <div style={{
                  fontFamily: "'SF Pro Display', 'Inter', system-ui, sans-serif",
                  fontSize: "clamp(9px,1.05vw,11px)",
                  fontWeight: 800,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: s.accent,
                  lineHeight: 1,
                }}>
                  {s.word}
                </div>

                {/* Sub-label */}
                <div
                  className="wfb-sub"
                  style={{
                    fontSize: "clamp(7px,0.78vw,9px)",
                    color: "rgba(255,255,255,0.3)",
                    letterSpacing: "0.04em",
                    marginTop: 2,
                    lineHeight: 1.2,
                  }}
                >
                  {s.sub}
                </div>
              </div>

              {/* Step dot connector (not on last item) */}
              {i < STAGES.length - 1 && (
                <div style={{
                  position: "absolute",
                  top: "clamp(14px,2vw,20px)",
                  right: 0,
                  width: "50%",
                  height: 1,
                  pointerEvents: "none",
                }} />
              )}
            </div>
          ))}
        </div>

        {/* ── Arrow connectors between stages ───────────────────────────────── */}
        <div style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
          zIndex: 1,
        }}>
          <div style={{
            display: "flex",
            width: "100%",
            maxWidth: 780,
            justifyContent: "space-around",
            padding: "0 12%",
            paddingBottom: "clamp(12px,2vw,18px)",
          }}>
            {[0,1,2].map(j => (
              <div key={j} style={{
                flex: 1,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
              }}>
                <svg width="20" height="10" viewBox="0 0 20 10" fill="none" style={{ opacity: 0.25 }}>
                  <polyline points="0,5 14,5" stroke="white" strokeWidth="1" />
                  <polyline points="11,2 15,5 11,8" stroke="white" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            ))}
          </div>
        </div>

      </div>
    </>
  );
}
