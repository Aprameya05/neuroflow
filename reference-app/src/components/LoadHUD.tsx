/**
 * LoadHUD -- the floating cognitive load display.
 * Sits in the corner of the editor, minimally invasive.
 * Shows current load, UI state, and a sparkline of recent history.
 */
import type { UIState } from "../hooks/useNeuroFlow";

interface LoadHUDProps {
  score: number;
  uiState: UIState;
  dominant: string;
  modelType: string;
  isConnected: boolean;
  history: number[];
  visible: boolean;
}

const STATE_INFO = {
  rich:    { label: "Rich", color: "#6366f1", desc: "Full feature set active" },
  normal:  { label: "Normal", color: "#22c55e", desc: "Standard interface" },
  reduced: { label: "Reduced", color: "#f59e0b", desc: "Simplifying interface" },
  minimal: { label: "Minimal", color: "#ef4444", desc: "Focus mode active" },
};

const SIGNAL_SHORT: Record<string, string> = {
  keystroke_iki_ms: "Keystroke",
  mouse_velocity: "Mouse speed",
  mouse_acceleration: "Mouse jitter",
  mouse_direction_changes: "Direction",
  scroll_velocity: "Scroll",
  error_rate: "Errors",
  tab_switches: "Tab switches",
  pause_duration_ms: "Pausing",
  copy_paste_count: "Copy-paste",
  stub_heuristic: "Heuristic",
};

function Sparkline({ history }: { history: number[] }) {
  if (history.length < 2) return null;
  const w = 80, h = 24;
  const max = Math.max(...history, 0.1);
  const points = history.map((v, i) => {
    const x = (i / (history.length - 1)) * w;
    const y = h - (v / max) * h;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <polyline
        points={points}
        fill="none"
        stroke="#6366f1"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LoadHUD({ score, uiState, dominant, modelType, isConnected, history, visible }: LoadHUDProps) {
  if (!visible) return null;

  const pct = Math.round(score * 100);
  const info = STATE_INFO[uiState];

  return (
    <div style={{
      position: "fixed",
      bottom: 24,
      right: 24,
      background: "rgba(15, 17, 23, 0.95)",
      border: `1px solid ${info.color}33`,
      borderRadius: 12,
      padding: "12px 16px",
      width: 200,
      backdropFilter: "blur(8px)",
      zIndex: 1000,
      boxShadow: `0 4px 24px ${info.color}22`,
      transition: "border-color 0.5s ease, box-shadow 0.5s ease",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{
            width: 6, height: 6, borderRadius: "50%",
            background: isConnected ? "#22c55e" : "#ef4444",
          }} />
          <span style={{ fontSize: 10, color: "#8b949e", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            NeuroFlow
          </span>
        </div>
        <span style={{ fontSize: 10, color: "#8b949e" }}>
          {modelType === "onnx" ? "ML" : "heuristic"}
        </span>
      </div>

      {/* Load number */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
        <span style={{
          fontSize: 36, fontWeight: 700, fontFamily: "monospace",
          color: info.color, lineHeight: 1,
          transition: "color 0.5s ease",
        }}>
          {pct}
        </span>
        <span style={{ fontSize: 14, color: "#8b949e" }}>%</span>
        <div style={{
          marginLeft: "auto",
          padding: "2px 8px",
          borderRadius: 99,
          background: `${info.color}22`,
          color: info.color,
          fontSize: 10,
          fontWeight: 600,
        }}>
          {info.label}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 3, background: "#21262d", borderRadius: 2, marginBottom: 10 }}>
        <div style={{
          height: "100%",
          width: `${pct}%`,
          background: info.color,
          borderRadius: 2,
          transition: "width 0.5s ease, background 0.5s ease",
        }} />
      </div>

      {/* Sparkline */}
      <div style={{ marginBottom: 10 }}>
        <Sparkline history={history} />
      </div>

      {/* Dominant signal */}
      <div style={{
        fontSize: 11, color: "#8b949e",
        borderTop: "1px solid #21262d",
        paddingTop: 8,
      }}>
        <span style={{ color: "#6b7280" }}>Driven by </span>
        <span style={{ color: "#e2e8f0" }}>
          {SIGNAL_SHORT[dominant] ?? dominant}
        </span>
      </div>

      {/* UI State description */}
      <div style={{ fontSize: 10, color: "#6b7280", marginTop: 4 }}>
        {info.desc}
      </div>
    </div>
  );
}
