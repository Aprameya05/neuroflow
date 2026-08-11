/**
 * LoadGauge — glowing semicircular arc gauge.
 * Dark background, radial glow, animated arc, pulsing ring on high load.
 */
import { loadColor, loadColorRgba, loadLabel } from "../utils/colors";

interface LoadGaugeProps {
  load: number | null;
  size?: number;
}

export function LoadGauge({ load, size = 220 }: LoadGaugeProps) {
  const r = (size / 2) * 0.74;
  const cx = size / 2;
  const cy = size * 0.60;
  const circumference = Math.PI * r;

  const filled = load ?? 0;
  const strokeDashoffset = circumference * (1 - filled);
  const color = load !== null ? loadColor(load) : "#334155";
  const glowRgba = load !== null ? loadColorRgba(load, 0.35) : "rgba(0,0,0,0)";
  const glowRgbaLow = load !== null ? loadColorRgba(load, 0.12) : "rgba(0,0,0,0)";
  const pct = load !== null ? Math.round(load * 100) : null;
  const label = load !== null ? loadLabel(load) : "Waiting…";
  const isHigh = (load ?? 0) >= 0.65;

  const trackR = r + 16;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
      {/* Pulse ring on high load */}
      {isHigh && (
        <div style={{
          position: "absolute",
          top: "50%", left: "50%",
          width: size * 0.78, height: size * 0.78,
          marginTop: `-${size * 0.39}px`, marginLeft: `-${size * 0.39}px`,
          borderRadius: "50%",
          border: `2px solid ${color}`,
          opacity: 0,
          animation: "pulse-ring 1.8s ease-out infinite",
          pointerEvents: "none",
        }} />
      )}

      <svg width={size} height={size * 0.65} viewBox={`0 0 ${size} ${size * 0.65}`} style={{ overflow: "visible" }}>
        <defs>
          <radialGradient id={`gaugeGlow-${size}`} cx="50%" cy="80%" r="60%">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </radialGradient>
          <filter id={`arcGlow-${size}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id={`arcGrad-${size}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
        </defs>

        {/* Ambient glow background */}
        <ellipse
          cx={cx} cy={cy}
          rx={r + 20} ry={r * 0.5}
          fill={`url(#gaugeGlow-${size})`}
        />

        {/* Outer tick ring (subtle) */}
        {Array.from({ length: 11 }).map((_, i) => {
          const angle = Math.PI * (i / 10);
          const x1 = cx - (trackR) * Math.cos(angle);
          const y1 = cy - (trackR) * Math.sin(angle);
          const x2 = cx - (trackR + 5) * Math.cos(angle);
          const y2 = cy - (trackR + 5) * Math.sin(angle);
          return (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="rgba(255,255,255,0.08)" strokeWidth={i === 0 || i === 5 || i === 10 ? 2 : 1}
            />
          );
        })}

        {/* Track */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={12}
          strokeLinecap="round"
        />

        {/* Zone bands on track */}
        {/* Green zone 0-30% */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx - r + 2 * r * 0.3} ${cy}`}
          fill="none"
          stroke="rgba(52,211,153,0.12)"
          strokeWidth={12}
          strokeLinecap="butt"
          style={{ pointerEvents: "none" }}
        />

        {/* Filled arc */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={`url(#arcGrad-${size})`}
          strokeWidth={12}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          filter={`url(#arcGlow-${size})`}
          style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(0.16,1,0.3,1)" }}
        />

        {/* Percentage text */}
        <text
          x={cx} y={cy - 12}
          textAnchor="middle"
          style={{
            fontSize: size * 0.235,
            fontWeight: 800,
            fill: color,
            fontFamily: "'JetBrains Mono', monospace",
            filter: `drop-shadow(0 0 12px ${glowRgba})`,
            transition: "fill 0.5s ease",
            letterSpacing: "-0.04em",
          }}
        >
          {pct !== null ? pct : "—"}
        </text>

        {/* % unit */}
        <text
          x={cx + size * 0.17} y={cy - 14}
          textAnchor="middle"
          style={{
            fontSize: size * 0.09,
            fontWeight: 600,
            fill: "#64748b",
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {pct !== null ? "%" : ""}
        </text>

        {/* State label */}
        <text
          x={cx} y={cy + 14}
          textAnchor="middle"
          style={{
            fontSize: size * 0.085,
            fontWeight: 600,
            fill: color,
            fontFamily: "'Inter', sans-serif",
            letterSpacing: "0.04em",
            transition: "fill 0.5s ease",
          }}
        >
          {label}
        </text>

        {/* Scale labels */}
        <text x={cx - r - 4} y={cy + 16} textAnchor="end"
          style={{ fontSize: 9, fill: "#475569", fontFamily: "'JetBrains Mono', monospace" }}>0</text>
        <text x={cx + r + 4} y={cy + 16} textAnchor="start"
          style={{ fontSize: 9, fill: "#475569", fontFamily: "'JetBrains Mono', monospace" }}>100</text>
      </svg>

      {/* Glow pill under gauge */}
      {load !== null && (
        <div style={{
          marginTop: -6,
          padding: "3px 14px",
          borderRadius: 20,
          background: glowRgbaLow,
          border: `1px solid ${glowRgba}`,
          fontSize: 10,
          fontWeight: 700,
          color,
          fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          transition: "all 0.5s ease",
        }}>
          {load < 0.21 ? "RICH UI" : load < 0.35 ? "NORMAL UI" : load < 0.65 ? "REDUCED UI" : "MINIMAL UI"}
        </div>
      )}
    </div>
  );
}
