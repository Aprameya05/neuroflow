/**
 * StateDistribution — concentric arc rings showing % time spent in each UI state.
 * Rich → Normal → Reduced → Minimal, each ring glows with its state color.
 */
import type { LoadEstimate } from "../types";
import { STATE_COLORS, STATE_LABELS } from "../utils/colors";

type UIState = "rich" | "normal" | "reduced" | "minimal";

interface Props {
  estimates: LoadEstimate[];
}

function classifyState(load: number): UIState {
  if (load < 0.21) return "rich";
  if (load < 0.35) return "normal";
  if (load < 0.65) return "reduced";
  return "minimal";
}

function ArcRing({
  cx, cy, r, pct, color, thickness = 10,
}: {
  cx: number; cy: number; r: number;
  pct: number; color: string; thickness?: number;
}) {
  const circumference = 2 * Math.PI * r;
  const dash = circumference * Math.min(pct, 1);
  const gap = circumference - dash;

  return (
    <>
      {/* Track */}
      <circle cx={cx} cy={cy} r={r}
        fill="none"
        stroke="rgba(255,255,255,0.04)"
        strokeWidth={thickness}
      />
      {/* Filled arc (starts at top, clockwise) */}
      <circle cx={cx} cy={cy} r={r}
        fill="none"
        stroke={color}
        strokeWidth={thickness}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${gap}`}
        strokeDashoffset={circumference * 0.25}   // start at top
        style={{
          filter: pct > 0.05 ? `drop-shadow(0 0 5px ${color}80)` : "none",
          transition: "stroke-dasharray 0.8s cubic-bezier(0.16,1,0.3,1)",
        }}
      />
    </>
  );
}

const STATES: UIState[] = ["rich", "normal", "reduced", "minimal"];

export function StateDistribution({ estimates }: Props) {
  if (estimates.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 160 }}>
        <span style={{ color: "#334155", fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
          collecting data…
        </span>
      </div>
    );
  }

  const counts: Record<UIState, number> = { rich: 0, normal: 0, reduced: 0, minimal: 0 };
  for (const e of estimates) counts[classifyState(e.load)]++;
  const total = estimates.length || 1;

  const size = 160;
  const cx = size / 2;
  const cy = size / 2;
  const radii = [62, 50, 38, 26];
  const thickness = 9;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      {/* SVG rings */}
      <svg width={size} height={size} style={{ flexShrink: 0 }}>
        {STATES.map((state, i) => (
          <ArcRing
            key={state}
            cx={cx} cy={cy}
            r={radii[i]}
            pct={counts[state] / total}
            color={STATE_COLORS[state]}
            thickness={thickness}
          />
        ))}
        {/* Center text */}
        <text x={cx} y={cy - 3} textAnchor="middle"
          style={{ fontSize: 18, fontWeight: 800, fill: "#f8fafc", fontFamily: "'JetBrains Mono', monospace" }}>
          {estimates.length}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle"
          style={{ fontSize: 9, fill: "#475569", fontFamily: "'JetBrains Mono', monospace" }}>
          ESTIMATES
        </text>
      </svg>

      {/* Legend */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
        {STATES.map((state) => {
          const pct = Math.round((counts[state] / total) * 100);
          const color = STATE_COLORS[state];
          return (
            <div key={state}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: color,
                    boxShadow: pct > 10 ? `0 0 6px ${color}` : "none",
                  }} />
                  <span style={{ fontSize: 12, color: "#94a3b8" }}>{STATE_LABELS[state]}</span>
                </div>
                <span style={{
                  fontSize: 12, fontWeight: 600,
                  color: pct > 20 ? color : "#475569",
                  fontFamily: "'JetBrains Mono', monospace",
                }}>
                  {pct}%
                </span>
              </div>
              <div style={{ height: 3, background: "rgba(255,255,255,0.04)", borderRadius: 2 }}>
                <div style={{
                  height: "100%", width: `${pct}%`,
                  background: color, borderRadius: 2,
                  boxShadow: pct > 20 ? `0 0 6px ${color}60` : "none",
                  transition: "width 0.8s cubic-bezier(0.16,1,0.3,1)",
                }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
