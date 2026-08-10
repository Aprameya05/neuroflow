/**
 * NeuroFlow Reference App -- Adaptive Code Editor
 * Production-grade UI for CHI demo.
 *
 * The editor is ALWAYS rendered from frame 1.
 * activeUIState only updates after the hook's warmup + debounce.
 * Reconnects are invisible to the UI.
 */
import { useState, useEffect, useRef } from "react";
import { useNeuroFlow } from "./hooks/useNeuroFlow";
import { AdaptiveEditor } from "./components/AdaptiveEditor";
import { LoadHUD } from "./components/LoadHUD";
import { getLoadColor, getLoadColorRgba } from "./utils/theme";
import type { UIState } from "./hooks/useNeuroFlow";

const SESSION_ID = (() => {
  const stored = sessionStorage.getItem("nf-session-id");
  if (stored) return stored;
  const id = `editor-${crypto.randomUUID()}`;
  sessionStorage.setItem("nf-session-id", id);
  return id;
})();

export default function App() {
  const load = useNeuroFlow(SESSION_ID);
  const [showHUD, setShowHUD] = useState(true);

  // activeUIState is the rendered state -- starts as normal, never undefined
  const [activeUIState, setActiveUIState] = useState<UIState>("normal");
  const [transitionKey, setTransitionKey] = useState(0);
  const prevUIState = useRef<UIState>("normal");
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track first render -- skip pulse on initial mount
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
  }, []);

  // Sync activeUIState only when load.uiState actually changes
  useEffect(() => {
    if (!mounted.current) return;
    if (load.uiState === prevUIState.current) return;
    prevUIState.current = load.uiState;

    if (pulseTimer.current) clearTimeout(pulseTimer.current);
    pulseTimer.current = setTimeout(() => {
      setActiveUIState(load.uiState);
      setTransitionKey(k => k + 1);
    }, 400);

    return () => {
      if (pulseTimer.current) clearTimeout(pulseTimer.current);
    };
  }, [load.uiState]);

  const loadColor = getLoadColor(load.score);
  const loadGlowLow = getLoadColorRgba(load.score, 0.1);
  const loadGlowHigh = getLoadColorRgba(load.score, 0.28);

  return (
    <div style={{
      height: "100vh",
      width: "100vw",
      display: "flex",
      flexDirection: "column",
      background: "#0a0d14",
      overflow: "hidden",
      position: "relative",
      userSelect: "none",
    }}>
      {/* Ambient background -- rich mode only */}
      {activeUIState === "rich" && (
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: `
            radial-gradient(circle at 15% 20%, ${loadGlowLow} 0%, transparent 45%),
            radial-gradient(circle at 85% 80%, rgba(99,102,241,0.05) 0%, transparent 50%),
            linear-gradient(to right, rgba(255,255,255,0.01) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,0.01) 1px, transparent 1px)
          `,
          backgroundSize: "100% 100%, 100% 100%, 32px 32px, 32px 32px",
          pointerEvents: "none",
          zIndex: 0,
        }} />
      )}

      {/* Radial pulse -- fires once per state transition, never on mount */}
      {transitionKey > 0 && (
        <div
          key={transitionKey}
          style={{
            position: "absolute",
            top: "50%", left: "50%",
            width: "120vmax", height: "120vmax",
            marginTop: "-60vmax", marginLeft: "-60vmax",
            borderRadius: "50%",
            background: `radial-gradient(circle, ${loadGlowHigh} 0%, ${loadGlowLow} 35%, transparent 70%)`,
            pointerEvents: "none",
            zIndex: 99,
            animation: "radialPulse 1s cubic-bezier(0.16,1,0.3,1) forwards",
          }}
        />
      )}

      {/* Zen vignette -- minimal mode only */}
      {activeUIState === "minimal" && (
        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(circle at center, transparent 38%, rgba(4,6,10,0.8) 100%)",
          pointerEvents: "none",
          zIndex: 5,
        }} />
      )}

      {/* Title bar */}
      <div style={{
        height: 42,
        background: "rgba(10,13,20,0.75)",
        backdropFilter: "blur(12px)",
        borderBottom: `1px solid rgba(255,255,255,${activeUIState === "minimal" ? "0.03" : "0.07"})`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 18px",
        zIndex: 10,
        flexShrink: 0,
        transition: "border-color 0.4s ease",
      }}>
        {/* Left: window controls + logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", gap: 7 }}>
            {["#ff5f57", "#febc2e", "#28c840"].map((c, i) => (
              <div key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: c, opacity: 0.85 }} />
            ))}
          </div>
          <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.1)" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 18, height: 18, borderRadius: 5,
              background: `linear-gradient(135deg, ${loadColor}, #3b82f6)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: `0 0 10px ${loadGlowHigh}`,
              transition: "all 0.5s ease",
            }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: "#fff", fontFamily: "JetBrains Mono" }}>N</span>
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.02em", color: "#f1f5f9" }}>
              NeuroFlow
            </span>
          </div>
        </div>

        {/* Center: active file */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "4px 12px", borderRadius: 20,
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.05)",
          fontSize: 12, color: "#94a3b8",
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          <span style={{ color: loadColor, fontSize: 10 }}>●</span>
          <span>main.py</span>
        </div>

        {/* Right: status + state pill + HUD */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 11,
            color: load.isConnected ? "#34d399" : "#f87171",
            padding: "3px 8px", borderRadius: 12,
            background: load.isConnected ? "rgba(52,211,153,0.08)" : "rgba(248,113,113,0.08)",
            border: `1px solid ${load.isConnected ? "rgba(52,211,153,0.2)" : "rgba(248,113,113,0.2)"}`,
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: "50%",
              background: load.isConnected ? "#34d399" : "#f87171",
              boxShadow: load.isConnected ? "0 0 8px #34d399" : "none",
              animation: load.isConnected ? "pulseDot 2s infinite" : "none",
            }} />
            <span>{load.isConnected ? "Connected" : "Reconnecting"}</span>
          </div>

          <div style={{
            padding: "4px 12px", borderRadius: 20,
            background: getLoadColorRgba(load.score, 0.12),
            border: `1px solid ${getLoadColorRgba(load.score, 0.28)}`,
            fontSize: 11, fontWeight: 600,
            textTransform: "uppercase", letterSpacing: "0.08em",
            color: loadColor,
            transition: "all 0.5s ease",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <div style={{
              width: 5, height: 5, borderRadius: "50%",
              background: loadColor, boxShadow: `0 0 6px ${loadColor}`,
            }} />
            {activeUIState} mode
          </div>

          <button
            onClick={() => setShowHUD(h => !h)}
            style={{
              fontSize: 11, fontWeight: 500, padding: "4px 12px",
              background: showHUD ? getLoadColorRgba(load.score, 0.18) : "rgba(255,255,255,0.04)",
              border: `1px solid ${showHUD ? getLoadColorRgba(load.score, 0.38) : "rgba(255,255,255,0.08)"}`,
              borderRadius: 6,
              color: showHUD ? "#ffffff" : "#94a3b8",
              cursor: "pointer",
              transition: "all 0.25s ease",
              display: "flex", alignItems: "center", gap: 5,
            }}
          >
            <span style={{ fontSize: 10 }}>⚡</span> HUD
          </button>
        </div>
      </div>

      {/* Editor -- always rendered from frame 1, never unmounted */}
      <div style={{ flex: 1, overflow: "hidden", position: "relative", zIndex: 1 }}>
        <AdaptiveEditor uiState={activeUIState} score={load.score} />
      </div>

      <LoadHUD
        score={load.score}
        uiState={activeUIState}
        dominant={load.dominant}
        modelType={load.modelType}
        isConnected={load.isConnected}
        history={load.history}
        visible={showHUD}
      />

      <style>{`
        @keyframes radialPulse {
          0%   { transform: scale(0.05); opacity: 0.7; }
          60%  { opacity: 0.2; }
          100% { transform: scale(1.8); opacity: 0; }
        }
        @keyframes pulseDot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(0.85); }
        }
      `}</style>
    </div>
  );
}
