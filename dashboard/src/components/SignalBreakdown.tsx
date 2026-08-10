/**
 * SignalBreakdown — horizontal bar chart showing which behavioral signals
 * are most frequently driving the cognitive load estimate.
 */
import type { LoadEstimate } from "../types";

const SIGNAL_LABELS: Record<string, string> = {
  keystroke_iki_ms: "Keystroke rhythm",
  mouse_velocity: "Mouse speed",
  mouse_acceleration: "Mouse jerkiness",
  mouse_direction_changes: "Direction changes",
  scroll_velocity: "Scroll speed",
  error_rate: "Error / backspace rate",
  tab_switches: "Tab switching",
  pause_duration_ms: "Pause duration",
  copy_paste_count: "Copy-paste freq.",
  stub_heuristic: "Heuristic (pre-training)",
};

interface Props {
  estimates: LoadEstimate[];
}

export function SignalBreakdown({ estimates }: Props) {
  if (estimates.length === 0) return null;

  const recent = estimates.slice(-60);
  const counts: Record<string, number> = {};
  for (const e of recent) {
    counts[e.dominant] = (counts[e.dominant] ?? 0) + 1;
  }

  const sorted = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  const max = sorted[0]?.[1] ?? 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {sorted.map(([signal, count]) => (
        <div key={signal}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 4,
            }}
          >
            <span style={{ fontSize: 12, color: "#374151" }}>
              {SIGNAL_LABELS[signal] ?? signal}
            </span>
            <span style={{ fontSize: 12, color: "#9ca3af" }}>
              {Math.round((count / recent.length) * 100)}%
            </span>
          </div>
          <div
            style={{ height: 5, background: "#f3f4f6", borderRadius: 3 }}
          >
            <div
              style={{
                height: "100%",
                width: `${(count / max) * 100}%`,
                background: "#6366f1",
                borderRadius: 3,
                transition: "width 0.6s ease",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
