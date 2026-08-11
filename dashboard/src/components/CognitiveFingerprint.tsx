/**
 * CognitiveFingerprint — SVG radar chart showing the relative dominance of
 * each behavioral signal. This is the user's unique cognitive pattern.
 *
 * Each axis = one signal. Each polygon vertex = normalized average dominance.
 * Two polygons: current window (last 10 estimates) vs session baseline.
 */
import type { LoadEstimate } from "../types";

const SIGNALS = [
  { key: "keystroke_iki_ms",        label: "Keystroke" },
  { key: "error_rate",              label: "Errors" },
  { key: "mouse_velocity",          label: "Mouse spd" },
  { key: "mouse_acceleration",      label: "Mouse jitter" },
  { key: "mouse_direction_changes", label: "Direction" },
  { key: "pause_duration_ms",       label: "Pauses" },
  { key: "scroll_velocity",         label: "Scroll" },
  { key: "tab_switches",            label: "Tab switch" },
  { key: "copy_paste_count",        label: "Copy-paste" },
];

const N = SIGNALS.length;
const CX = 110;
const CY = 110;
const OUTER_R = 90;
const TICKS = 4;

/** Compute dominance score [0,1] per signal for a window of estimates. */
function computeDominance(estimates: LoadEstimate[]): number[] {
  if (estimates.length === 0) return new Array(N).fill(0);
  const counts = new Array(N).fill(0);
  for (const e of estimates) {
    const idx = SIGNALS.findIndex(s => s.key === e.dominant);
    if (idx >= 0) counts[idx]++;
  }
  const max = Math.max(...counts, 1);
  return counts.map(c => c / max);
}

/** Angle for axis i (starting at top, clockwise). */
function axisAngle(i: number): number {
  return (i / N) * 2 * Math.PI - Math.PI / 2;
}

/** Polar to cartesian. */
function pt(r: number, angle: number): [number, number] {
  return [CX + r * Math.cos(angle), CY + r * Math.sin(angle)];
}

/** Build an SVG polygon points string from dominance values. */
function buildPolygon(values: number[]): string {
  return values.map((v, i) => {
    const r = v * OUTER_R;
    const [x, y] = pt(r, axisAngle(i));
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
}

interface Props {
  estimates: LoadEstimate[];
}

export function CognitiveFingerprint({ estimates }: Props) {
  const sessionValues = computeDominance(estimates);
  const recentValues = computeDominance(estimates.slice(-15));

  const hasData = estimates.length > 0;

  return (
    <div>
      {/* Legend */}
      <div style={{ display: "flex", gap: 16, marginBottom: 8, paddingLeft: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#475569",
          fontFamily: "'JetBrains Mono', monospace" }}>
          <div style={{ width: 20, height: 2, background: "rgba(99,102,241,0.6)", borderRadius: 1 }} />
          Session
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#475569",
          fontFamily: "'JetBrains Mono', monospace" }}>
          <div style={{ width: 20, height: 2, background: "rgba(52,211,153,0.8)", borderRadius: 1 }} />
          Now
        </div>
      </div>

      <svg width={220} height={220} style={{ display: "block", margin: "0 auto" }}>
        <defs>
          <radialGradient id="fpBaseGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(99,102,241,0.08)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
        </defs>

        {/* Background radial fill */}
        <circle cx={CX} cy={CY} r={OUTER_R} fill="url(#fpBaseGrad)" />

        {/* Concentric tick rings */}
        {Array.from({ length: TICKS }, (_, t) => {
          const r = (OUTER_R / TICKS) * (t + 1);
          return (
            <polygon
              key={t}
              points={Array.from({ length: N }, (_, i) => {
                const [x, y] = pt(r, axisAngle(i));
                return `${x.toFixed(2)},${y.toFixed(2)}`;
              }).join(" ")}
              fill="none"
              stroke="rgba(255,255,255,0.05)"
              strokeWidth={1}
            />
          );
        })}

        {/* Axis spokes */}
        {SIGNALS.map((_, i) => {
          const [x, y] = pt(OUTER_R, axisAngle(i));
          return (
            <line key={i}
              x1={CX} y1={CY} x2={x.toFixed(2)} y2={y.toFixed(2)}
              stroke="rgba(255,255,255,0.07)" strokeWidth={1}
            />
          );
        })}

        {hasData ? (
          <>
            {/* Session baseline polygon */}
            <polygon
              points={buildPolygon(sessionValues)}
              fill="rgba(99,102,241,0.1)"
              stroke="rgba(99,102,241,0.55)"
              strokeWidth={1.5}
              style={{ transition: "all 0.8s cubic-bezier(0.16,1,0.3,1)" }}
            />

            {/* Current window polygon */}
            <polygon
              points={buildPolygon(recentValues)}
              fill="rgba(52,211,153,0.1)"
              stroke="rgba(52,211,153,0.75)"
              strokeWidth={1.5}
              style={{
                filter: "drop-shadow(0 0 4px rgba(52,211,153,0.4))",
                transition: "all 0.5s cubic-bezier(0.16,1,0.3,1)",
              }}
            />

            {/* Vertex dots for current window */}
            {recentValues.map((v, i) => {
              const r = v * OUTER_R;
              const [x, y] = pt(r, axisAngle(i));
              return (
                <circle key={i}
                  cx={x.toFixed(2)} cy={y.toFixed(2)} r={2.5}
                  fill="#34d399"
                  style={{ filter: "drop-shadow(0 0 3px rgba(52,211,153,0.8))" }}
                />
              );
            })}
          </>
        ) : (
          <text x={CX} y={CY + 4} textAnchor="middle"
            style={{ fontSize: 11, fill: "#334155", fontFamily: "'JetBrains Mono', monospace" }}>
            waiting…
          </text>
        )}

        {/* Axis labels */}
        {SIGNALS.map((sig, i) => {
          const angle = axisAngle(i);
          const labelR = OUTER_R + 16;
          const [x, y] = pt(labelR, angle);
          const anchor = Math.cos(angle) > 0.1 ? "start" : Math.cos(angle) < -0.1 ? "end" : "middle";
          return (
            <text key={sig.key}
              x={x.toFixed(2)} y={(y + 3).toFixed(2)}
              textAnchor={anchor}
              style={{
                fontSize: 8,
                fill: recentValues[i] > 0.6 ? "#34d399" : "#334155",
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: recentValues[i] > 0.6 ? 700 : 400,
                transition: "fill 0.4s ease",
              }}
            >
              {sig.label}
            </text>
          );
        })}

        {/* Center label */}
        <text x={CX} y={CY - 3} textAnchor="middle"
          style={{ fontSize: 9, fill: "#475569", fontFamily: "'JetBrains Mono', monospace" }}>
          FINGERPRINT
        </text>
      </svg>
    </div>
  );
}
