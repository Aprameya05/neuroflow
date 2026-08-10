/**
 * NeuroFlow Reference App -- Adaptive Code Editor
 *
 * This is the production demo. A real code editor that adapts
 * its interface based on your inferred cognitive load.
 *
 * What adapts and why:
 *   rich (< 21%)    -- show everything, user can handle it
 *   normal (< 35%)  -- standard VS Code-like layout
 *   reduced (< 65%) -- collapse sidebar, increase font, more autocomplete
 *   minimal (> 65%) -- pure editor, nothing else, user needs to focus
 *
 * The adaptations are grounded in cognitive load theory (Sweller 1988,
 * Paas & van Merrienboer 1994). This is not just a demo -- it's a
 * working prototype of a genuinely new interaction paradigm.
 */
import { useState, useEffect } from "react";
import { useNeuroFlow } from "./hooks/useNeuroFlow";
import { AdaptiveEditor } from "./components/AdaptiveEditor";
import { LoadHUD } from "./components/LoadHUD";

// Stable session ID per browser session
const SESSION_ID = (() => {
  const stored = sessionStorage.getItem("nf-session-id");
  if (stored) return stored;
  const id = `editor-${crypto.randomUUID()}`;
  sessionStorage.setItem("nf-session-id", id);
  return id;
})();

const STATE_BACKGROUNDS: Record<string, string> = {
  rich:    "#0f1117",
  normal:  "#0f1117",
  reduced: "#0d1016",
  minimal: "#0a0d14",
};

export default function App() {
  const load = useNeuroFlow(SESSION_ID);
  const [showHUD, setShowHUD] = useState(true);
  const [prevState, setPrevState] = useState(load.uiState);
  const [transition, setTransition] = useState(false);

  // Animate background transition on state change
  useEffect(() => {
    if (load.uiState !== prevState) {
      setTransition(true);
      setTimeout(() => setTransition(false), 600);
      setPrevState(load.uiState);
    }
  }, [load.uiState, prevState]);

  const loadColor = load.score < 0.35 ? "#22c55e"
    : load.score < 0.65 ? "#f59e0b" : "#ef4444";

  return (
    <div style={{
      height: "100vh",
      display: "flex",
      flexDirection: "column",
      background: STATE_BACKGROUNDS[load.uiState],
      transition: "background 0.6s ease",
      overflow: "hidden",
    }}>
      {/* Title bar */}
      <div style={{
        height: 38,
        background: "#161b22",
        borderBottom: "1px solid #21262d",
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
        gap: 12,
        flexShrink: 0,
        userSelect: "none",
      }}>
        {/* Traffic lights */}
        <div style={{ display: "flex", gap: 6 }}>
          {["#ff5f57", "#febc2e", "#28c840"].map((c, i) => (
            <div key={i} style={{ width: 12, height: 12, borderRadius: "50%", background: c }} />
          ))}
        </div>

        <span style={{ fontSize: 13, color: "#8b949e", flex: 1, textAlign: "center" }}>
          NeuroFlow Editor
          <span style={{ marginLeft: 8, color: "#6b7280", fontSize: 11 }}>
            -- {load.uiState} mode
          </span>
        </span>

        {/* Connection status + HUD toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 5,
            fontSize: 11, color: load.isConnected ? "#22c55e" : "#ef4444",
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: "50%",
              background: load.isConnected ? "#22c55e" : "#ef4444",
            }} />
            {load.isConnected ? "Connected" : "Reconnecting..."}
          </div>

          <button
            onClick={() => setShowHUD(h => !h)}
            style={{
              fontSize: 11, padding: "3px 10px",
              background: showHUD ? "#1f2937" : "transparent",
              border: "1px solid #21262d",
              borderRadius: 5,
              color: "#8b949e",
              cursor: "pointer",
            }}
          >
            HUD
          </button>
        </div>
      </div>

      {/* Editor area -- takes all remaining height */}
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        <AdaptiveEditor
          uiState={load.uiState}
          score={load.score}
        />

        {/* State transition flash */}
        {transition && (
          <div style={{
            position: "absolute", inset: 0,
            background: `${loadColor}08`,
            pointerEvents: "none",
            animation: "flash 0.6s ease forwards",
          }} />
        )}
      </div>

      {/* Floating HUD */}
      <LoadHUD
        score={load.score}
        uiState={load.uiState}
        dominant={load.dominant}
        modelType={load.modelType}
        isConnected={load.isConnected}
        history={load.history}
        visible={showHUD}
      />

      <style>{`
        @keyframes flash {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
