/**
 * SessionStats — computed metrics panel.
 * Focus score, load volatility, trend indicator, flow time, overload streaks.
 */
import type { LoadEstimate } from "../types";
import { loadColor, loadColorRgba } from "../utils/colors";

interface Props {
  estimates: LoadEstimate[];
  currentLoad: number | null;
}

function stddev(vals: number[]): number {
  if (vals.length < 2) return 0;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
  return Math.sqrt(variance);
}

function trend(vals: number[]): "rising" | "falling" | "stable" {
  if (vals.length < 5) return "stable";
  const recent = vals.slice(-10);
  const first = recent.slice(0, recent.length / 2).reduce((a, b) => a + b, 0) / Math.floor(recent.length / 2);
  const second = recent.slice(recent.length / 2).reduce((a, b) => a + b, 0) / Math.ceil(recent.length / 2);
  const delta = second - first;
  if (delta > 0.04) return "rising";
  if (delta < -0.04) return "falling";
  return "stable";
}

function maxStreak(vals: number[], threshold: number, above: boolean): number {
  let max = 0, current = 0;
  for (const v of vals) {
    if (above ? v >= threshold : v < threshold) { current++; max = Math.max(max, current); }
    else current = 0;
  }
  return max;
}

interface StatTileProps {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  glow?: boolean;
}

function StatTile({ label, value, sub, color = "#94a3b8", glow = false }: StatTileProps) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.05)",
      borderRadius: 10,
      padding: "14px 16px",
    }}>
      <div style={{
        fontSize: 9, fontWeight: 700, color: "#475569",
        textTransform: "uppercase", letterSpacing: "0.1em",
        fontFamily: "'JetBrains Mono', monospace", marginBottom: 8,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 24, fontWeight: 800, color,
        fontFamily: "'JetBrains Mono', monospace",
        letterSpacing: "-0.02em", lineHeight: 1,
        textShadow: glow ? `0 0 16px ${color}80` : "none",
        transition: "all 0.4s ease",
      }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: "#334155", marginTop: 5, fontFamily: "'Inter', sans-serif" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

const TREND_ICONS = { rising: "↑", falling: "↓", stable: "→" } as const;
const TREND_COLORS = { rising: "#ef4444", falling: "#34d399", stable: "#f59e0b" } as const;

export function SessionStats({ estimates, currentLoad }: Props) {
  const loads = estimates.map(e => e.load);
  const cl = currentLoad ?? 0;

  if (loads.length === 0) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {["Focus Score", "Volatility", "Flow Time", "Trend"].map(l => (
          <StatTile key={l} label={l} value="—" />
        ))}
      </div>
    );
  }

  const avg = loads.reduce((a, b) => a + b, 0) / loads.length;
  const focusScore = Math.round((1 - avg) * 100);
  const volatility = Math.round(stddev(loads) * 100);
  const flowPct = Math.round((loads.filter(v => v < 0.35).length / loads.length) * 100);
  const overloadPct = Math.round((loads.filter(v => v >= 0.65).length / loads.length) * 100);
  const t = trend(loads);
  const longestFlow = maxStreak(loads, 0.35, false);

  const focusColor = focusScore >= 70 ? "#34d399" : focusScore >= 40 ? "#f59e0b" : "#ef4444";
  const volColor = volatility < 10 ? "#34d399" : volatility < 20 ? "#f59e0b" : "#ef4444";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      <StatTile
        label="Focus Score"
        value={`${focusScore}`}
        sub={`avg load: ${Math.round(avg * 100)}%`}
        color={focusColor}
        glow={focusScore >= 70}
      />
      <StatTile
        label="Volatility"
        value={`${volatility}`}
        sub={volatility < 10 ? "very stable" : volatility < 20 ? "moderate" : "high variance"}
        color={volColor}
      />
      <StatTile
        label="Flow Time"
        value={`${flowPct}%`}
        sub={`${longestFlow} streak peak`}
        color={flowPct > 50 ? "#34d399" : "#475569"}
        glow={flowPct > 60}
      />
      <StatTile
        label="Trend"
        value={`${TREND_ICONS[t]} ${t}`}
        sub={`${overloadPct}% overload`}
        color={TREND_COLORS[t]}
      />
      <StatTile
        label="Current Load"
        value={`${Math.round(cl * 100)}%`}
        sub={cl < 0.21 ? "in flow" : cl < 0.65 ? "moderate" : "high — UI simplified"}
        color={loadColor(cl)}
        glow={cl >= 0.65}
      />
      <StatTile
        label="Confidence"
        value={estimates.length > 0 ? `${Math.round((estimates[estimates.length-1]?.confidence ?? 0) * 100)}%` : "—"}
        sub="model confidence"
        color="#6366f1"
      />
    </div>
  );
}
