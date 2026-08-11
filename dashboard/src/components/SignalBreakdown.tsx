/**
 * SignalBreakdown — which behavioral signals are driving cognitive load.
 * Glowing bars, ranked by dominance frequency, with signal icons.
 */
import type { LoadEstimate } from "../types";
import { loadColor } from "../utils/colors";

const SIGNAL_META: Record<string, { label: string; icon: string; color: string }> = {
  keystroke_iki_ms:       { label: "Keystroke rhythm",    icon: "⌨", color: "#a78bfa" },
  mouse_velocity:         { label: "Mouse speed",         icon: "🖱", color: "#60a5fa" },
  mouse_acceleration:     { label: "Mouse jitter",        icon: "⚡", color: "#f472b6" },
  mouse_direction_changes:{ label: "Direction shifts",    icon: "↯", color: "#fb923c" },
  scroll_velocity:        { label: "Scroll velocity",     icon: "⇕", color: "#34d399" },
  error_rate:             { label: "Error rate",          icon: "⌫", color: "#ef4444" },
  tab_switches:           { label: "Tab switching",       icon: "⇄", color: "#f59e0b" },
  pause_duration_ms:      { label: "Pause duration",      icon: "⏸", color: "#94a3b8" },
  copy_paste_count:       { label: "Copy-paste events",   icon: "⎘", color: "#4ade80" },
  stub_heuristic:         { label: "Heuristic model",     icon: "◈", color: "#6366f1" },
};

interface Props {
  estimates: LoadEstimate[];
  currentLoad?: number;
}

export function SignalBreakdown({ estimates, currentLoad = 0.3 }: Props) {
  if (estimates.length === 0) return null;

  const recent = estimates.slice(-60);
  const counts: Record<string, number> = {};
  for (const e of recent) {
    counts[e.dominant] = (counts[e.dominant] ?? 0) + 1;
  }

  const sorted = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7);

  const max = sorted[0]?.[1] ?? 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      {sorted.map(([signal, count], idx) => {
        const meta = SIGNAL_META[signal] ?? { label: signal, icon: "◉", color: "#6366f1" };
        const pct = Math.round((count / recent.length) * 100);
        const barPct = (count / max) * 100;
        const isDominant = idx === 0;
        const barColor = isDominant ? loadColor(currentLoad) : meta.color;

        return (
          <div key={signal}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  fontSize: 12,
                  width: 20, textAlign: "center",
                  opacity: isDominant ? 1 : 0.65,
                }}>
                  {meta.icon}
                </span>
                <span style={{
                  fontSize: 12,
                  color: isDominant ? "#f8fafc" : "#94a3b8",
                  fontWeight: isDominant ? 600 : 400,
                  fontFamily: "'Inter', sans-serif",
                }}>
                  {meta.label}
                </span>
                {isDominant && (
                  <span style={{
                    fontSize: 8, fontWeight: 700,
                    padding: "1px 5px", borderRadius: 4,
                    background: `${barColor}22`,
                    color: barColor,
                    letterSpacing: "0.08em",
                    fontFamily: "'JetBrains Mono', monospace",
                    border: `1px solid ${barColor}44`,
                  }}>
                    PRIMARY
                  </span>
                )}
              </div>
              <span style={{
                fontSize: 11, fontWeight: isDominant ? 700 : 400,
                color: isDominant ? barColor : "#475569",
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {pct}%
              </span>
            </div>
            <div style={{
              height: 4,
              background: "rgba(255,255,255,0.05)",
              borderRadius: 2,
              overflow: "hidden",
            }}>
              <div style={{
                height: "100%",
                width: `${barPct}%`,
                background: barColor,
                borderRadius: 2,
                boxShadow: isDominant ? `0 0 8px ${barColor}` : "none",
                transition: "width 0.6s cubic-bezier(0.16,1,0.3,1)",
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
