/**
 * EstimateLog — real-time terminal-style log of load estimates.
 * Scrolling feed, color-coded by load level, monospace font.
 */
import { useRef, useEffect } from "react";
import type { LoadEstimate } from "../types";
import { loadColor } from "../utils/colors";

const SIGNAL_SHORT: Record<string, string> = {
  keystroke_iki_ms: "KST",
  mouse_velocity: "MVL",
  mouse_acceleration: "MAC",
  mouse_direction_changes: "MDC",
  scroll_velocity: "SCR",
  error_rate: "ERR",
  tab_switches: "TAB",
  pause_duration_ms: "PSE",
  copy_paste_count: "CPY",
  stub_heuristic: "HEU",
};

function uiStateChar(load: number): string {
  if (load < 0.21) return "R";
  if (load < 0.35) return "N";
  if (load < 0.65) return "D";
  return "M";
}

export function EstimateLog({ estimates }: { estimates: LoadEstimate[] }) {
  const logRef = useRef<HTMLDivElement>(null);
  const recent = estimates.slice(-50);

  // Auto-scroll to bottom as new entries arrive
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [estimates.length]);

  return (
    <div style={{
      background: "rgba(4,6,10,0.9)",
      border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 14,
      overflow: "hidden",
    }}>
      {/* Terminal title bar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 16px",
        background: "rgba(255,255,255,0.02)",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", gap: 6 }}>
            {["#ff5f57","#febc2e","#28c840"].map((c,i) => (
              <div key={i} style={{ width: 9, height: 9, borderRadius: "50%", background: c, opacity: 0.7 }} />
            ))}
          </div>
          <span style={{
            fontSize: 11, color: "#475569",
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: "0.06em",
          }}>
            NEUROFLOW :: LIVE STREAM
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 6, height: 6, borderRadius: "50%",
            background: estimates.length > 0 ? "#34d399" : "#334155",
            boxShadow: estimates.length > 0 ? "0 0 6px #34d399" : "none",
            animation: estimates.length > 0 ? "blink 2s infinite" : "none",
          }} />
          <span style={{ fontSize: 10, color: "#334155", fontFamily: "'JetBrains Mono', monospace" }}>
            {estimates.length} events
          </span>
        </div>
      </div>

      {/* Log entries */}
      <div
        ref={logRef}
        style={{
          height: 200,
          overflowY: "auto",
          padding: "10px 0",
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        {recent.length === 0 ? (
          <div style={{ padding: "12px 16px", color: "#334155", fontSize: 12 }}>
            <span style={{ animation: "blink 1.2s infinite", display: "inline-block" }}>▌</span>
            {" "}waiting for signal data…
          </div>
        ) : (
          recent.map((e, i) => {
            const color = loadColor(e.load);
            const isNew = i === recent.length - 1;
            return (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "90px 48px 32px 80px 1fr 60px",
                  alignItems: "center",
                  gap: 0,
                  padding: "3px 16px",
                  fontSize: 11,
                  background: isNew ? "rgba(255,255,255,0.02)" : "transparent",
                  borderLeft: isNew ? `2px solid ${color}` : "2px solid transparent",
                  animation: isNew ? "slide-in 0.2s ease" : "none",
                  transition: "background 0.3s ease",
                }}
              >
                <span style={{ color: "#334155" }}>
                  {new Date(e.ts).toLocaleTimeString("en", { hour12: false })}
                </span>
                <span style={{
                  color,
                  fontWeight: 700,
                  fontSize: 12,
                  textShadow: isNew ? `0 0 8px ${color}` : "none",
                }}>
                  {Math.round(e.load * 100).toString().padStart(3, " ")}%
                </span>
                <span style={{
                  color: "#475569",
                  fontSize: 10,
                  fontWeight: 600,
                  padding: "1px 3px",
                  background: `${color}15`,
                  borderRadius: 3,
                  textAlign: "center",
                }}>
                  {uiStateChar(e.load)}
                </span>
                <span style={{ color: "#475569", paddingLeft: 8 }}>
                  {SIGNAL_SHORT[e.dominant] ?? e.dominant.slice(0, 3).toUpperCase()}
                </span>
                <div style={{
                  width: "100%", height: 3,
                  background: "rgba(255,255,255,0.04)",
                  borderRadius: 2, overflow: "hidden",
                }}>
                  <div style={{
                    height: "100%",
                    width: `${e.load * 100}%`,
                    background: color,
                    borderRadius: 2,
                    transition: "width 0.4s ease",
                  }} />
                </div>
                <span style={{ color: "#2d3748", textAlign: "right", fontSize: 10 }}>
                  {Math.round(e.confidence * 100)}%
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
