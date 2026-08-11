/**
 * NeuroFlow Reference App -- Adaptive Code Editor
 * Production-grade UI for CHI demo.
 *
 * The editor is ALWAYS rendered from frame 1.
 * activeUIState only updates after the hook's warmup + debounce.
 * Reconnects are invisible to the UI.
 *
 * Features:
 * - Ctrl+1-4: force UI states for demo purposes
 * - ?watch=<sessionId>: watch another session's cognitive load live
 * - Share button: copies a watch URL to the clipboard
 * - End session: shows a beautiful post-session report card
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useNeuroFlow } from "./hooks/useNeuroFlow";
import { AdaptiveEditor } from "./components/AdaptiveEditor";
import { LoadHUD } from "./components/LoadHUD";
import { SessionReport } from "./components/SessionReport";
import { getLoadColor, getLoadColorRgba } from "./utils/theme";
import type { UIState } from "./hooks/useNeuroFlow";

// ── Session ID resolution ──────────────────────────────────────────────────
// Priority: ?watch= param (watch mode) > ?session= param > stored > new
const urlParams = new URLSearchParams(window.location.search);
const watchParam = urlParams.get("watch");
const sessionParam = urlParams.get("session");

const IS_WATCH_MODE = Boolean(watchParam);

const SESSION_ID = (() => {
  if (watchParam) return watchParam;
  if (sessionParam) return sessionParam;
  const stored = sessionStorage.getItem("nf-session-id");
  if (stored) return stored;
  const id = `editor-${crypto.randomUUID()}`;
  sessionStorage.setItem("nf-session-id", id);
  return id;
})();

// ── State time tracker for report card ────────────────────────────────────
interface StateLog { state: UIState; startTime: number }

export default function App() {
  const load = useNeuroFlow(SESSION_ID, { watchMode: IS_WATCH_MODE });
  const [showHUD, setShowHUD] = useState(true);
  const [showReport, setShowReport] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);

  // activeUIState is the rendered state -- starts as normal, never undefined
  const [activeUIState, setActiveUIState] = useState<UIState>("normal");
  const [transitionKey, setTransitionKey] = useState(0);
  const prevUIState = useRef<UIState>("normal");
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Forced state: set by Ctrl+1-4 shortcuts, overrides the hook's state
  const [forcedState, setForcedState] = useState<UIState | null>(null);
  const forcedStateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track first render -- skip pulse on initial mount
  const mounted = useRef(false);

  // Session report tracking
  const sessionStart = useRef(Date.now());
  const stateLog = useRef<StateLog[]>([{ state: "normal", startTime: Date.now() }]);

  useEffect(() => {
    mounted.current = true;
  }, []);

  // Sync activeUIState only when load.uiState actually changes
  useEffect(() => {
    if (!mounted.current) return;
    if (load.uiState === prevUIState.current) return;
    prevUIState.current = load.uiState;

    // Track for report card
    stateLog.current.push({ state: load.uiState, startTime: Date.now() });

    if (pulseTimer.current) clearTimeout(pulseTimer.current);
    pulseTimer.current = setTimeout(() => {
      if (!forcedState) {
        setActiveUIState(load.uiState);
        setTransitionKey(k => k + 1);
      }
    }, 400);

    return () => {
      if (pulseTimer.current) clearTimeout(pulseTimer.current);
    };
  }, [load.uiState, forcedState]);

  // Apply forced state from Ctrl+1-4 shortcuts
  useEffect(() => {
    if (forcedState) {
      stateLog.current.push({ state: forcedState, startTime: Date.now() });
      setActiveUIState(forcedState);
      setTransitionKey(k => k + 1);
    }
  }, [forcedState]);

  // Ctrl+1-4 keyboard shortcuts to force UI states
  const forceState = useCallback((state: UIState) => {
    if (forcedStateTimer.current) clearTimeout(forcedStateTimer.current);
    setForcedState(state);
    // Auto-release forced state after 30s so real load can take over again
    forcedStateTimer.current = setTimeout(() => setForcedState(null), 30_000);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      if (e.key === "1") { e.preventDefault(); forceState("rich"); }
      if (e.key === "2") { e.preventDefault(); forceState("normal"); }
      if (e.key === "3") { e.preventDefault(); forceState("reduced"); }
      if (e.key === "4") { e.preventDefault(); forceState("minimal"); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [forceState]);

  // Session sharing: copy watch URL to clipboard
  const handleShare = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("watch", SESSION_ID);
    url.searchParams.delete("session");
    navigator.clipboard.writeText(url.toString()).then(() => {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    });
  }, []);

  // Compute report card data
  const computeReportData = useCallback(() => {
    const now = Date.now();
    const duration = now - sessionStart.current;
    const timeInState: Record<UIState, number> = { rich: 0, normal: 0, reduced: 0, minimal: 0 };

    for (let i = 0; i < stateLog.current.length; i++) {
      const entry = stateLog.current[i];
      const end = i + 1 < stateLog.current.length ? stateLog.current[i + 1].startTime : now;
      timeInState[entry.state] += end - entry.startTime;
    }

    const avg = load.history.length > 0
      ? load.history.reduce((a, b) => a + b, 0) / load.history.length
      : load.score;
    const peak = load.history.length > 0 ? Math.max(...load.history) : load.score;

    // Dominant state (most time in)
    const dominantState = (Object.entries(timeInState) as [UIState, number][])
      .sort((a, b) => b[1] - a[1])[0][0];

    return { duration, timeInState, avg, peak, dominantState, dominant: load.dominant };
  }, [load]);

  const displayState = activeUIState;
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
      {/* Watch mode banner */}
      {IS_WATCH_MODE && (
        <div style={{
          position: "absolute",
          top: 42,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 200,
          background: "rgba(99,102,241,0.15)",
          border: "1px solid rgba(99,102,241,0.4)",
          borderRadius: 20,
          padding: "5px 16px",
          fontSize: 12,
          color: "#a5b4fc",
          fontFamily: "'JetBrains Mono', monospace",
          backdropFilter: "blur(12px)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          pointerEvents: "none",
        }}>
          <span style={{ fontSize: 10 }}>👁</span>
          Watching session <strong style={{ color: "#c7d2fe" }}>{SESSION_ID.slice(0, 12)}…</strong>
        </div>
      )}

      {/* Forced state indicator */}
      {forcedState && (
        <div style={{
          position: "absolute",
          top: 50,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 200,
          background: "rgba(245,158,11,0.15)",
          border: "1px solid rgba(245,158,11,0.4)",
          borderRadius: 20,
          padding: "5px 16px",
          fontSize: 12,
          color: "#fcd34d",
          fontFamily: "'JetBrains Mono', monospace",
          backdropFilter: "blur(12px)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          pointerEvents: "none",
        }}>
          <span style={{ fontSize: 10 }}>🔒</span>
          Demo mode: <strong>{forcedState}</strong> — Ctrl+1-4 to switch, auto-releases in 30s
        </div>
      )}

      {/* Ambient background -- rich mode only */}
      {displayState === "rich" && (
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
      {displayState === "minimal" && (
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
        borderBottom: `1px solid rgba(255,255,255,${displayState === "minimal" ? "0.03" : "0.07"})`,
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

        {/* Center: mode pill */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "4px 12px", borderRadius: 20,
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.05)",
          fontSize: 12, color: "#94a3b8",
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          <span style={{ color: loadColor, fontSize: 10 }}>●</span>
          <span>{IS_WATCH_MODE ? "watch mode" : "editor"}</span>
        </div>

        {/* Right: status + state pill + buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
            <span>{load.isConnected ? (IS_WATCH_MODE ? "Watching" : "Connected") : "Reconnecting"}</span>
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
            {displayState} mode
          </div>

          {/* Share button */}
          {!IS_WATCH_MODE && (
            <button
              onClick={handleShare}
              title="Copy a live watch link to clipboard"
              style={{
                fontSize: 11, fontWeight: 500, padding: "4px 12px",
                background: copyFeedback ? "rgba(52,211,153,0.18)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${copyFeedback ? "rgba(52,211,153,0.38)" : "rgba(255,255,255,0.08)"}`,
                borderRadius: 6,
                color: copyFeedback ? "#34d399" : "#94a3b8",
                cursor: "pointer",
                transition: "all 0.25s ease",
                display: "flex", alignItems: "center", gap: 5,
              }}
            >
              <span style={{ fontSize: 10 }}>{copyFeedback ? "✓" : "🔗"}</span>
              {copyFeedback ? "Copied!" : "Share"}
            </button>
          )}

          {/* End session button */}
          {!IS_WATCH_MODE && (
            <button
              onClick={() => setShowReport(true)}
              title="End session and view report card"
              style={{
                fontSize: 11, fontWeight: 500, padding: "4px 12px",
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.2)",
                borderRadius: 6,
                color: "#f87171",
                cursor: "pointer",
                transition: "all 0.25s ease",
                display: "flex", alignItems: "center", gap: 5,
              }}
            >
              <span style={{ fontSize: 10 }}>■</span> End
            </button>
          )}

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
        <AdaptiveEditor uiState={displayState} score={load.score} readOnly={IS_WATCH_MODE} />
      </div>

      <LoadHUD
        score={load.score}
        uiState={displayState}
        dominant={load.dominant}
        modelType={load.modelType}
        isConnected={load.isConnected}
        history={load.history}
        visible={showHUD}
        isWatchMode={IS_WATCH_MODE}
        forcedState={forcedState}
      />

      {/* Post-session report card modal */}
      {showReport && (
        <SessionReport
          data={computeReportData()}
          onClose={() => setShowReport(false)}
          sessionId={SESSION_ID}
        />
      )}

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
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
