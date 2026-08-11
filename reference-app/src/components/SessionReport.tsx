/**
 * SessionReport -- post-session report card modal.
 * Shows avg load, peak load, time in each UI state, dominant signal.
 * Designed to be beautiful -- research tool meets sci-fi telemetry.
 */
import type { UIState } from "../hooks/useNeuroFlow";
import { getLoadColor, getLoadColorRgba } from "../utils/theme";

interface ReportData {
  duration: number;
  timeInState: Record<UIState, number>;
  avg: number;
  peak: number;
  dominantState: UIState;
  dominant: string;
}

interface SessionReportProps {
  data: ReportData;
  onClose: () => void;
  sessionId: string;
}

const STATE_META: Record<UIState, { label: string; emoji: string; desc: string; color: string }> = {
  rich:    { label: "Rich",    emoji: "✦", desc: "Deep focus — full feature set", color: "#34d399" },
  normal:  { label: "Normal",  emoji: "◈", desc: "Standard workspace",            color: "#60a5fa" },
  reduced: { label: "Reduced", emoji: "◇", desc: "Interface simplified",          color: "#fbbf24" },
  minimal: { label: "Minimal", emoji: "◌", desc: "Zen focus mode",                color: "#f87171" },
};

const SIGNAL_LABELS: Record<string, string> = {
  keystroke_iki_ms: "Keystroke rhythm",
  mouse_velocity: "Mouse speed",
  mouse_acceleration: "Mouse jitter",
  mouse_direction_changes: "Direction shifts",
  scroll_velocity: "Scroll velocity",
  error_rate: "Error rate",
  tab_switches: "Tab switching",
  pause_duration_ms: "Pause duration",
  copy_paste_count: "Copy-paste events",
  stub_heuristic: "Heuristic model",
};

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}

function LoadBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ height: 6, background: "rgba(255,255,255,0.07)", borderRadius: 3, overflow: "hidden" }}>
      <div style={{
        width: `${pct}%`,
        height: "100%",
        background: color,
        borderRadius: 3,
        boxShadow: `0 0 8px ${color}`,
        transition: "width 0.8s cubic-bezier(0.16,1,0.3,1)",
      }} />
    </div>
  );
}

export function SessionReport({ data, onClose, sessionId }: SessionReportProps) {
  const avgColor = getLoadColor(data.avg);
  const peakColor = getLoadColor(data.peak);

  const totalTracked = Object.values(data.timeInState).reduce((a, b) => a + b, 0) || 1;

  const stateOrder: UIState[] = ["rich", "normal", "reduced", "minimal"];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 2000,
        background: "rgba(4,6,10,0.82)",
        backdropFilter: "blur(10px)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "rgba(10,13,20,0.97)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 18,
          padding: "28px 32px",
          width: 480,
          maxWidth: "90vw",
          boxShadow: "0 32px 80px rgba(0,0,0,0.7), 0 0 60px rgba(99,102,241,0.08)",
          fontFamily: "'Inter', sans-serif",
          animation: "fadeInUp 0.4s cubic-bezier(0.16,1,0.3,1) forwards",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <div style={{
              fontSize: 10, fontWeight: 700, color: "#6366f1",
              letterSpacing: "0.12em", textTransform: "uppercase",
              fontFamily: "'JetBrains Mono', monospace", marginBottom: 4,
            }}>
              NEUROFLOW :: SESSION REPORT
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#f8fafc" }}>
              Session complete
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 3, fontFamily: "'JetBrains Mono', monospace" }}>
              {sessionId.slice(0, 24)}… · {formatDuration(data.duration)}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8, width: 32, height: 32,
              color: "#64748b", cursor: "pointer", fontSize: 16,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            ×
          </button>
        </div>

        {/* Key metrics row */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
          gap: 12, marginBottom: 24,
        }}>
          {[
            { label: "Duration",   value: formatDuration(data.duration), color: "#94a3b8" },
            { label: "Avg load",   value: `${Math.round(data.avg * 100)}%`, color: avgColor },
            { label: "Peak load",  value: `${Math.round(data.peak * 100)}%`, color: peakColor },
          ].map(({ label, value, color }) => (
            <div key={label} style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 12, padding: "14px 16px",
              textAlign: "center",
            }}>
              <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, fontFamily: "'JetBrains Mono', monospace" }}>
                {label}
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "-0.02em" }}>
                {value}
              </div>
            </div>
          ))}
        </div>

        {/* Time in each state */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14, fontFamily: "'JetBrains Mono', monospace" }}>
            Time in each state
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {stateOrder.map(state => {
              const meta = STATE_META[state];
              const pct = Math.round((data.timeInState[state] / totalTracked) * 100);
              const isDominant = state === data.dominantState;
              return (
                <div key={state}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ color: meta.color, fontSize: 12 }}>{meta.emoji}</span>
                      <span style={{ fontSize: 13, color: isDominant ? meta.color : "#94a3b8", fontWeight: isDominant ? 600 : 400 }}>
                        {meta.label}
                      </span>
                      {isDominant && (
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 8,
                          background: getLoadColorRgba(data.avg, 0.15),
                          color: meta.color, letterSpacing: "0.06em",
                          fontFamily: "'JetBrains Mono', monospace",
                        }}>
                          DOMINANT
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 11, color: "#64748b", fontFamily: "'JetBrains Mono', monospace" }}>
                        {formatDuration(data.timeInState[state])}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: meta.color, fontFamily: "'JetBrains Mono', monospace", minWidth: 32, textAlign: "right" }}>
                        {pct}%
                      </span>
                    </div>
                  </div>
                  <LoadBar pct={pct} color={meta.color} />
                </div>
              );
            })}
          </div>
        </div>

        {/* Primary signal */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px",
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 12,
          marginBottom: 20,
        }}>
          <div>
            <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'JetBrains Mono', monospace", marginBottom: 4 }}>
              Primary signal
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>
              {SIGNAL_LABELS[data.dominant] ?? data.dominant}
            </div>
          </div>
          <div style={{ fontSize: 28 }}>
            {data.dominant.includes("keystroke") ? "⌨️"
              : data.dominant.includes("mouse") ? "🖱️"
              : data.dominant.includes("error") ? "⚠️"
              : data.dominant.includes("pause") ? "⏸️"
              : data.dominant.includes("scroll") ? "📜"
              : "📡"}
          </div>
        </div>

        {/* Close CTA */}
        <button
          onClick={onClose}
          style={{
            width: "100%", padding: "12px",
            background: "linear-gradient(135deg, rgba(99,102,241,0.2), rgba(59,130,246,0.2))",
            border: "1px solid rgba(99,102,241,0.3)",
            borderRadius: 10, cursor: "pointer",
            color: "#a5b4fc", fontSize: 13, fontWeight: 600,
            transition: "all 0.2s ease",
          }}
        >
          Continue coding
        </button>
      </div>
    </div>
  );
}
