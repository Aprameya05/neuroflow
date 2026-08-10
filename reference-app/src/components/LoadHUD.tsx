/**
 * LoadHUD -- high-end hardware monitor cognitive load HUD display.
 * Sits in the bottom-right corner, glassmorphic sci-fi telemetry UI.
 */
import type { UIState } from "../hooks/useNeuroFlow";
import { getLoadColor, getLoadColorRgba } from "../utils/theme";

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
  rich: { label: "RICH", desc: "Full feature set active" },
  normal: { label: "NORMAL", desc: "Standard workspace" },
  reduced: { label: "REDUCED", desc: "Simplifying interface" },
  minimal: { label: "MINIMAL", desc: "Zen focus mode active" },
};

const SIGNAL_SHORT: Record<string, string> = {
  keystroke_iki_ms: "Keystroke IKI",
  mouse_velocity: "Mouse speed",
  mouse_acceleration: "Mouse jitter",
  mouse_direction_changes: "Direction shift",
  scroll_velocity: "Scroll velocity",
  error_rate: "Error rate",
  tab_switches: "Tab switches",
  pause_duration_ms: "Pause duration",
  copy_paste_count: "Copy-paste",
  stub_heuristic: "Heuristic model",
};

function HardwareSparkline({ history, loadColor }: { history: number[]; loadColor: string }) {
  if (history.length < 2) return null;
  const w = 196, h = 36;
  const max = Math.max(...history, 0.1);
  const min = Math.min(...history, 0);

  const points = history.map((v, i) => {
    const x = (i / (history.length - 1)) * w;
    const range = max - min || 1;
    const y = h - ((v - min) / range) * (h - 6) - 3;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const lastPoint = points[points.length - 1].split(",");
  const areaPoints = [`0,${h}`, ...points, `${w},${h}`].join(" ");

  return (
    <div style={{ position: "relative", width: w, height: h }}>
      {/* Background grid lines */}
      <svg width={w} height={h} style={{ position: "absolute", inset: 0 }}>
        <line x1="0" y1={h * 0.33} x2={w} y2={h * 0.33} stroke="rgba(255,255,255,0.05)" strokeDasharray="2,2" />
        <line x1="0" y1={h * 0.66} x2={w} y2={h * 0.66} stroke="rgba(255,255,255,0.05)" strokeDasharray="2,2" />

        <defs>
          <linearGradient id="sparklineGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={loadColor} stopOpacity="0.35" />
            <stop offset="100%" stopColor={loadColor} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Gradient fill */}
        <polygon points={areaPoints} fill="url(#sparklineGrad)" />

        {/* Stroke path */}
        <polyline
          points={points.join(" ")}
          fill="none"
          stroke={loadColor}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Active node dot */}
        <circle
          cx={lastPoint[0]}
          cy={lastPoint[1]}
          r={3}
          fill="#ffffff"
          stroke={loadColor}
          strokeWidth={2}
        />
      </svg>
    </div>
  );
}

export function LoadHUD({ score, uiState, dominant, modelType, isConnected, history, visible }: LoadHUDProps) {
  if (!visible) return null;

  const pct = Math.round(score * 100);
  const info = STATE_INFO[uiState] || STATE_INFO.normal;
  const loadColor = getLoadColor(score);
  const loadGlowLow = getLoadColorRgba(score, 0.15);
  const loadGlowHigh = getLoadColorRgba(score, 0.35);

  return (
    <div style={{
      position: "fixed",
      bottom: 24,
      right: 24,
      background: "rgba(10, 13, 20, 0.82)",
      border: `1px solid ${loadGlowHigh}`,
      borderRadius: 14,
      padding: "14px 16px",
      width: 228,
      backdropFilter: "blur(16px) saturate(180%)",
      zIndex: 1000,
      boxShadow: `0 20px 40px rgba(0, 0, 0, 0.6), 0 0 30px ${loadGlowLow}`,
      transition: "all 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
      fontFamily: "'Inter', sans-serif",
      userSelect: "none",
    }}>
      {/* Sci-fi top hardware bar & corner accents */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: "1px solid rgba(255, 255, 255, 0.07)",
        paddingBottom: 8,
        marginBottom: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <div style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: isConnected ? "#34d399" : "#f87171",
            boxShadow: isConnected ? "0 0 8px #34d399" : "0 0 8px #f87171",
          }} />
          <span style={{
            fontSize: 9,
            fontWeight: 800,
            color: "#94a3b8",
            letterSpacing: "0.1em",
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            NEUROFLOW :: TELEMETRY
          </span>
        </div>

        <span style={{
          fontSize: 9,
          fontWeight: 700,
          padding: "1px 6px",
          borderRadius: 4,
          background: "rgba(255, 255, 255, 0.05)",
          color: "#cbd5e1",
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          {modelType === "onnx" ? "ML" : "HEURISTIC"}
        </span>
      </div>

      {/* Main Load percentage & State pill */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "baseline" }}>
          <span style={{
            fontSize: 38,
            fontWeight: 800,
            fontFamily: "'JetBrains Mono', monospace",
            color: loadColor,
            lineHeight: 1,
            textShadow: `0 0 20px ${loadGlowHigh}`,
            transition: "color 0.4s ease, text-shadow 0.4s ease",
            letterSpacing: "-0.04em",
          }}>
            {pct}
          </span>
          <span style={{
            fontSize: 14,
            fontWeight: 600,
            color: "#64748b",
            marginLeft: 2,
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            %
          </span>
        </div>

        <div style={{
          padding: "3px 10px",
          borderRadius: 20,
          background: loadGlowLow,
          border: `1px solid ${loadGlowHigh}`,
          color: loadColor,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.08em",
          boxShadow: `0 0 12px ${loadGlowLow}`,
          transition: "all 0.4s ease",
        }}>
          {info.label}
        </div>
      </div>

      {/* Dynamic progress meter bar */}
      <div style={{
        height: 4,
        background: "rgba(255, 255, 255, 0.08)",
        borderRadius: 2,
        marginBottom: 12,
        overflow: "hidden",
        position: "relative",
      }}>
        <div style={{
          height: "100%",
          width: `${pct}%`,
          background: `linear-gradient(90deg, #6366f1 0%, #f59e0b 50%, #ef4444 100%)`,
          borderRadius: 2,
          boxShadow: `0 0 10px ${loadColor}`,
          transition: "width 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        }} />
      </div>

      {/* Sparkline chart */}
      <div style={{ marginBottom: 12 }}>
        <HardwareSparkline history={history} loadColor={loadColor} />
      </div>

      {/* Telemetry info & Dominant signal */}
      <div style={{
        fontSize: 11,
        color: "#94a3b8",
        borderTop: "1px solid rgba(255, 255, 255, 0.07)",
        paddingTop: 8,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <span style={{ color: "#64748b", fontSize: 10 }}>Primary signal</span>
        <span style={{
          color: "#e2e8f0",
          fontWeight: 600,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
        }}>
          {SIGNAL_SHORT[dominant] ?? dominant}
        </span>
      </div>

      {/* UI state description footer */}
      <div style={{
        fontSize: 10,
        color: "#64748b",
        marginTop: 4,
        letterSpacing: "0.01em",
      }}>
        {info.desc}
      </div>
    </div>
  );
}
