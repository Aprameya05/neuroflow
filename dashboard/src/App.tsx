/**
 * NeuroFlow Research Dashboard
 * Dark sci-fi telemetry interface — CHI 2026.
 */
import { useState, useEffect, useRef, type ReactNode, type CSSProperties } from "react";
import { useNeuroFlowSocket } from "./hooks/useNeuroFlowSocket";
import { LoadGauge } from "./components/LoadGauge";
import { LoadTimeline } from "./components/LoadTimeline";
import { SignalBreakdown } from "./components/SignalBreakdown";
import { EstimateLog } from "./components/EstimateLog";
import { StateDistribution } from "./components/StateDistribution";
import { SessionStats } from "./components/SessionStats";
import { SignalMatrix } from "./components/SignalMatrix";
import { CalibrationFlow } from "./components/CalibrationFlow";
import { CognitiveFingerprint } from "./components/CognitiveFingerprint";
import { FlowStreakBanner } from "./components/FlowStreakBanner";
import { SessionReplayPlayer } from "./components/SessionReplayPlayer";
import { loadColor, loadColorRgba } from "./utils/colors";
import type { LoadEstimate } from "./types";
import { NBackTask } from "./components/NBackTask";
import { FatigueAlert } from "./components/FatigueAlert";
import { SessionCalendar } from "./components/SessionCalendar";
import { CorrelationMatrix } from "./components/CorrelationMatrix";
import { InterventionManager } from "./components/InterventionManager";
import {
  ArchetypeCard,
  classifyArchetype,
  ARCHETYPES,
} from "./components/ArchetypeCard";

type View = "monitor" | "calendar" | "profile" | "calibration" | "about";

const SESSION_ID = (() => {
  const stored = sessionStorage.getItem("nf-dashboard-session");
  if (stored) return stored;
  const id = `dashboard-${crypto.randomUUID().slice(0, 8)}`;
  sessionStorage.setItem("nf-dashboard-session", id);
  return id;
})();

const DOMINANT_SIGNALS = [
  "pause_duration_ms", "error_rate", "mouse_velocity",
  "keystroke_iki_ms", "tab_switches", "scroll_velocity",
  "mouse_acceleration", "mouse_direction_changes", "copy_paste_count",
];

function generateDemoEstimates(count: number): LoadEstimate[] {
  const estimates: LoadEstimate[] = [];
  let load = 0.35;
  const now = Date.now();
  for (let i = count; i >= 0; i--) {
    const drift = (Math.random() - 0.48) * 0.06;
    load = Math.max(0.05, Math.min(0.95, load + drift));
    if (Math.random() < 0.03) load = Math.min(0.95, load + 0.25);
    if (Math.random() < 0.02) load = Math.max(0.1, load - 0.2);
    estimates.push({
      type: "load_estimate",
      load: Math.round(load * 1000) / 1000,
      confidence: 0.4 + Math.random() * 0.3,
      dominant: DOMINANT_SIGNALS[Math.floor(Math.random() * DOMINANT_SIGNALS.length)],
      ts: now - i * 300,
      session_id: "demo-session",
    });
  }
  return estimates;
}

function exportCSV(estimates: LoadEstimate[], sessionId: string) {
  const header = "timestamp,load,confidence,dominant\n";
  const rows = estimates.map(e =>
    `${new Date(e.ts).toISOString()},${e.load},${e.confidence},${e.dominant}`
  ).join("\n");
  const blob = new Blob([header + rows], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `neuroflow-${sessionId}.csv`; a.click();
  URL.revokeObjectURL(url);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function GlowCard({ children, style = {} }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{
      background: "rgba(10,13,20,0.85)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 14,
      backdropFilter: "blur(12px)",
      ...style,
    }}>
      {children}
    </div>
  );
}

function CardHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: "#475569",
        textTransform: "uppercase", letterSpacing: "0.1em",
        fontFamily: "'JetBrains Mono', monospace", marginBottom: 2,
      }}>
        {sub ?? "NeuroFlow"}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8" }}>{title}</div>
    </div>
  );
}

function StatCard({ label, value, color, glow }: {
  label: string; value: string; color?: string; glow?: boolean;
}) {
  const c = color ?? "#f8fafc";
  return (
    <GlowCard style={{ padding: "18px 20px" }}>
      <div style={{
        fontSize: 9, fontWeight: 700, color: "#334155",
        textTransform: "uppercase", letterSpacing: "0.1em",
        fontFamily: "'JetBrains Mono', monospace", marginBottom: 10,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 28, fontWeight: 800, color: c,
        fontFamily: "'JetBrains Mono', monospace",
        letterSpacing: "-0.03em",
        textShadow: glow ? `0 0 20px ${c}80` : "none",
        transition: "all 0.4s ease",
      }}>
        {value}
      </div>
    </GlowCard>
  );
}

const NAV_ITEMS = [
  { id: "monitor",     icon: "◈", label: "Live Monitor" },
  { id: "calendar",    icon: "▦", label: "Session Calendar" },
  { id: "profile",     icon: "◎", label: "Behavioural Profile" },
  { id: "calibration", icon: "◉", label: "Calibration" },
  { id: "about",       icon: "◉", label: "About" },
] as const;

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [sessionId] = useState(SESSION_ID);
  const [view, setView] = useState<View>("monitor");
  const [nBackResult, setNBackResult] = useState<any>(null);

  const { estimates: liveEstimates, currentLoad: liveLoad, isConnected } = useNeuroFlowSocket(sessionId);

  const [showReplay, setShowReplay] = useState(false);

  const [profileData, setProfileData] = useState<{
    features: {
      avg_load: number;
      peak_load: number;
      volatility: number;
      flow_index: number;
      peak_count_per_session: number;
    };
    sessionCount: number;
    loading: boolean;
    error: string | null;
  }>({
    features: {
      avg_load: 0,
      peak_load: 0,
      volatility: 0,
      flow_index: 0,
      peak_count_per_session: 0,
    },
    sessionCount: 0,
    loading: true,
    error: null,
  });

  const [demoMode, setDemoMode] = useState(false);
  const [demoEstimates, setDemoEstimates] = useState<LoadEstimate[]>([]);
  const [fatigueIndex, setFatigueIndex] = useState(0);
  const [fatigueHistory, setFatigueHistory] = useState<number[]>([]);
  const sessionStartRef = useRef<number | null>(null);
  const demoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const demoInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
  const loadProfile = async () => {
    try {
      setProfileData((prev) => ({
        ...prev,
        loading: true,
        error: null,
      }));

      const userId = sessionId;

      // First load the user's session history.
      // This lets us show the "not enough sessions" state
      // without requiring a fingerprint to already exist.
      const sessionsResponse = await fetch(
        `http://127.0.0.1:8000/api/sessions/user/${encodeURIComponent(userId)}`
      );

      if (!sessionsResponse.ok) {
        throw new Error("Could not load session history");
      }

      const sessionsData = await sessionsResponse.json();
      const sessions = sessionsData.sessions ?? [];

      // Sprint 4 requirement: fewer than 3 sessions
      // should show the placeholder state.
      if (sessions.length < 3) {
        setProfileData({
          features: {
            avg_load: 0,
            peak_load: 0,
            volatility: 0,
            flow_index: 0,
            peak_count_per_session: 0,
          },
          sessionCount: sessions.length,
          loading: false,
          error: null,
        });
        return;
      }

      // We have enough sessions, so now load the aggregate fingerprint.
      const fingerprintResponse = await fetch(
        `http://127.0.0.1:8000/api/analytics/users/${encodeURIComponent(userId)}/fingerprint`
      );

      if (!fingerprintResponse.ok) {
        throw new Error("Could not load behavioural fingerprint");
      }

      const fingerprint = await fingerprintResponse.json();

      // Load individual session summaries in batches of 5.
      const summaries: any[] = [];

      for (let i = 0; i < sessions.length; i += 5) {
        const batch = sessions.slice(i, i + 5);

        const results = await Promise.all(
          batch.map(async (session: any) => {
            try {
              const response = await fetch(
                `http://127.0.0.1:8000/api/analytics/sessions/${encodeURIComponent(
                  session.session_id
                )}/summary`
              );

              if (!response.ok) return null;

              return await response.json();
            } catch {
              return null;
            }
          })
        );

        summaries.push(...results.filter(Boolean));
      }

      if (summaries.length === 0) {
        throw new Error("No session summaries were available");
      }

      const average = (values: number[]) =>
        values.length
          ? values.reduce((sum, value) => sum + value, 0) / values.length
          : 0;

      setProfileData({
        features: {
          avg_load:
            fingerprint.avg_load ??
            average(summaries.map((s) => s.avg_load ?? 0)),
          peak_load: average(
            summaries.map((s) => s.peak_load ?? 0)
          ),
          volatility: average(
            summaries.map((s) => s.volatility ?? 0)
          ),
          flow_index: average(
            summaries.map((s) => s.flow_index ?? 0)
          ),
          peak_count_per_session: average(
            summaries.map((s) => s.peak_count ?? 0)
          ),
        },
        sessionCount: summaries.length,
        loading: false,
        error: null,
      });
    } catch (error) {
      setProfileData((prev) => ({
        ...prev,
        loading: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to load behavioural profile",
      }));
    }
  };

  loadProfile();
}, [sessionId]);

  useEffect(() => {
    if (isConnected) {
      setDemoMode(false);
      if (demoTimer.current) clearTimeout(demoTimer.current);
      if (demoInterval.current) clearInterval(demoInterval.current);
      return;
    }
    demoTimer.current = setTimeout(() => {
      setDemoMode(true);
      setDemoEstimates(generateDemoEstimates(120));
      demoInterval.current = setInterval(() => {
        setDemoEstimates(prev => {
          const last = prev[prev.length - 1];
          const prevLoad = last?.load ?? 0.35;
          const drift = (Math.random() - 0.48) * 0.06;
          let newLoad = Math.max(0.05, Math.min(0.95, prevLoad + drift));
          if (Math.random() < 0.03) newLoad = Math.min(0.95, newLoad + 0.25);
          if (Math.random() < 0.02) newLoad = Math.max(0.1, newLoad - 0.2);
          newLoad = Math.round(newLoad * 1000) / 1000;
          const next = [...prev, {
            type: "load_estimate" as const,
            load: newLoad,
            confidence: 0.4 + Math.random() * 0.3,
            dominant: DOMINANT_SIGNALS[Math.floor(Math.random() * DOMINANT_SIGNALS.length)],
            ts: Date.now(),
            session_id: "demo-session",
          }];
          return next.length > 400 ? next.slice(-400) : next;
        });
      }, 300);
    }, 3000);
    return () => {
      if (demoTimer.current) clearTimeout(demoTimer.current);
      if (demoInterval.current) clearInterval(demoInterval.current);
    };
  }, [isConnected]);

  const estimates = isConnected ? liveEstimates : demoEstimates;
  const currentLoad = isConnected ? liveLoad
    : demoEstimates.length > 0 ? demoEstimates[demoEstimates.length - 1].load : null;
    const inFlowEpisode =
      estimates.length > 0 &&
      estimates[estimates.length - 1].load < 0.35;

    const recentLoadsForAnomaly = estimates.slice(-10).map(
      estimate => estimate.load
    );

    const previousLoadForAnomaly =
      recentLoadsForAnomaly.length >= 2
        ? recentLoadsForAnomaly[recentLoadsForAnomaly.length - 2]
        : 0;

    const isAnomaly =
      currentLoad !== null &&
      currentLoad > 0.7 &&
      previousLoadForAnomaly <= 0.7;

  useEffect(() => {
    if (currentLoad === null) return;

    if (sessionStartRef.current === null) {
      sessionStartRef.current = Date.now();
  }

  // Use recent load to represent sustained cognitive demand.
  const recentLoads = estimates.slice(-30).map((estimate) => estimate.load);
  const averageLoad = recentLoads.length > 0
    ? recentLoads.reduce((sum, load) => sum + load, 0) / recentLoads.length
    : currentLoad;

  // Longer sessions contribute gradually to fatigue.
  const elapsedMinutes =
    (Date.now() - sessionStartRef.current) / 60000;
  const durationFactor = Math.min(elapsedMinutes / 30, 1);

  const nextFatigue = Math.min(
    1,
    averageLoad * 0.75 + durationFactor * 0.25
  );

  setFatigueIndex(nextFatigue);
  setFatigueHistory((previous) => [
    ...previous,
    nextFatigue,
  ].slice(-30));
}, [currentLoad, estimates]);

  const avg = estimates.length > 0 ? estimates.reduce((s, e) => s + e.load, 0) / estimates.length : null;
  const peak = estimates.length > 0 ? Math.max(...estimates.map(e => e.load)) : null;

  const cl = currentLoad ?? 0;
  const clColor = loadColor(cl);
  const clGlow = loadColorRgba(cl, 0.2);

  return (
    <div style={{
      minHeight: "100vh",
      background: "#080b12",
      backgroundImage: `
        radial-gradient(circle at 15% 10%, rgba(99,102,241,0.04) 0%, transparent 40%),
        radial-gradient(circle at 85% 90%, ${clGlow} 0%, transparent 40%)
      `,
      fontFamily: "'Inter', system-ui, sans-serif",
      color: "#f8fafc",
      transition: "background-image 1s ease",
    }}>
      {/* ── Header ── */}
      <header style={{
        height: 56,
        background: "rgba(8,11,18,0.92)",
        backdropFilter: "blur(16px)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 24px",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: `linear-gradient(135deg, #6366f1, ${clColor})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: 800, color: "#fff",
            fontFamily: "'JetBrains Mono', monospace",
            boxShadow: `0 0 16px ${clGlow}`,
            transition: "box-shadow 0.5s ease",
          }}>
            N
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#f8fafc", letterSpacing: "0.02em" }}>
              NeuroFlow
            </div>
            <div style={{ fontSize: 10, color: "#334155", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.06em" }}>
              RESEARCH DASHBOARD
            </div>
          </div>
        </div>

        {/* Nav */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {NAV_ITEMS.map(item => {
            const active = view === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setView(item.id as View)}
                style={{
                  display: "flex", alignItems: "center", gap: 7,
                  padding: "7px 14px", borderRadius: 8,
                  border: active ? `1px solid rgba(255,255,255,0.1)` : "1px solid transparent",
                  background: active ? "rgba(255,255,255,0.06)" : "transparent",
                  color: active ? "#f8fafc" : "#475569",
                  cursor: "pointer", fontSize: 12, fontWeight: active ? 600 : 400,
                  transition: "all 0.15s ease",
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                <span style={{ fontSize: 11, opacity: active ? 1 : 0.5 }}>{item.icon}</span>
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Right: session + controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <code style={{
            fontSize: 10, color: "#2d3748",
            fontFamily: "'JetBrains Mono', monospace",
            background: "rgba(255,255,255,0.03)",
            padding: "4px 10px", borderRadius: 6,
            border: "1px solid rgba(255,255,255,0.05)",
          }}>
            {(demoMode ? "demo-session" : sessionId).slice(0, 18)}
          </code>

          {view === "monitor" && (
            <>
              <button
                onClick={() => setShowReplay(true)}
                disabled={estimates.length < 5}
                style={{
                  fontSize: 11, padding: "6px 14px", borderRadius: 7,
                  border: "1px solid rgba(99,102,241,0.25)",
                  background: estimates.length >= 5 ? "rgba(99,102,241,0.1)" : "rgba(255,255,255,0.02)",
                  color: estimates.length >= 5 ? "#a5b4fc" : "#1e293b",
                  cursor: estimates.length >= 5 ? "pointer" : "default",
                  fontFamily: "'Inter', sans-serif", fontWeight: 500,
                }}
              >
                ▶ Replay
              </button>
              <button
                onClick={() => exportCSV(estimates, demoMode ? "demo" : sessionId)}
                disabled={estimates.length === 0}
                style={{
                  fontSize: 11, padding: "6px 14px", borderRadius: 7,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.03)",
                  color: estimates.length === 0 ? "#1e293b" : "#94a3b8",
                  cursor: estimates.length === 0 ? "default" : "pointer",
                  fontFamily: "'Inter', sans-serif", fontWeight: 500,
                }}
              >
                Export CSV
              </button>
            </>
          )}

          {/* Connection pill */}
          <div style={{
            display: "flex", alignItems: "center", gap: 7,
            padding: "5px 12px", borderRadius: 20,
            background: demoMode ? "rgba(245,158,11,0.1)"
              : isConnected ? "rgba(52,211,153,0.1)" : "rgba(239,68,68,0.1)",
            border: `1px solid ${demoMode ? "rgba(245,158,11,0.25)" : isConnected ? "rgba(52,211,153,0.25)" : "rgba(239,68,68,0.25)"}`,
            fontSize: 11, fontWeight: 600,
            color: demoMode ? "#f59e0b" : isConnected ? "#34d399" : "#ef4444",
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: "50%",
              background: demoMode ? "#f59e0b" : isConnected ? "#34d399" : "#ef4444",
              boxShadow: `0 0 6px ${demoMode ? "#f59e0b" : isConnected ? "#34d399" : "#ef4444"}`,
              animation: (demoMode || isConnected) ? "blink 2s infinite" : "none",
            }} />
            {demoMode ? "Demo" : isConnected ? "Live" : "Offline"}
          </div>
        </div>
      </header>

      {/* Demo banner */}
      {demoMode && (
        <div style={{
          background: "rgba(245,158,11,0.07)",
          borderBottom: "1px solid rgba(245,158,11,0.15)",
          padding: "8px 24px",
          fontSize: 11, color: "#92400e",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          fontFamily: "'Inter', sans-serif",
        }}>
          <span style={{ color: "#d97706" }}>
            Demo mode — simulated data.{" "}
            <a href="https://github.com/Aprameya05/neuroflow" style={{ color: "#f59e0b", fontWeight: 600 }}>
              Install the Chrome extension
            </a>{" "}
            to see your real cognitive load.
          </span>
          <span style={{ color: "#78350f", fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>
            LIVE DATA AUTO-CONNECTS
          </span>
        </div>
      )}

      {/* ── Main ── */}
      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "24px 24px 40px" }}>

        <InterventionManager
          load={currentLoad ?? 0}
          fatigueIndex={fatigueIndex}
          inFlowEpisode={inFlowEpisode}
          isAnomaly={isAnomaly}
        />

        <FatigueAlert
          fatigueIndex={fatigueIndex}
          history={fatigueHistory}
        />

        {/* ── Monitor View ── */}
        {view === "monitor" && (
          <>
            {/* Row 1: Gauge + stat cards */}
            <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 16, marginBottom: 16 }}>
              {/* Gauge */}
              <GlowCard style={{
                padding: "20px 16px 14px",
                display: "flex", flexDirection: "column", alignItems: "center",
                border: currentLoad !== null
                  ? `1px solid ${loadColorRgba(cl, 0.25)}`
                  : "1px solid rgba(255,255,255,0.07)",
                boxShadow: currentLoad !== null ? `0 0 30px ${loadColorRgba(cl, 0.08)}` : "none",
                transition: "border 0.5s ease, box-shadow 0.5s ease",
              }}>
                <div style={{
                  fontSize: 9, fontWeight: 700, color: "#334155",
                  textTransform: "uppercase", letterSpacing: "0.1em",
                  fontFamily: "'JetBrains Mono', monospace", marginBottom: 8,
                }}>
                  Cognitive Load
                </div>
                <LoadGauge load={currentLoad} size={210} />
                <div style={{ marginTop: 12 }}>
                  <FlowStreakBanner estimates={estimates} />
                </div>
              </GlowCard>

              {/* Stat cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gridTemplateRows: "1fr 1fr", gap: 12 }}>
                <StatCard
                  label="Estimates received"
                  value={estimates.length.toLocaleString()}
                  color="#6366f1"
                />
                <StatCard
                  label="Session avg"
                  value={avg !== null ? `${Math.round(avg * 100)}%` : "—"}
                  color={avg !== null ? loadColor(avg) : "#334155"}
                  glow={avg !== null && avg >= 0.65}
                />
                <StatCard
                  label="Peak load"
                  value={peak !== null ? `${Math.round(peak * 100)}%` : "—"}
                  color={peak !== null ? loadColor(peak) : "#334155"}
                  glow={peak !== null && peak >= 0.65}
                />
                <StatCard
                  label="Current state"
                  value={currentLoad !== null
                    ? cl < 0.21 ? "Rich" : cl < 0.35 ? "Normal" : cl < 0.65 ? "Reduced" : "Minimal"
                    : "—"
                  }
                  color={currentLoad !== null ? clColor : "#334155"}
                  glow={currentLoad !== null && cl >= 0.65}
                />
                <StatCard
                  label="Active for"
                  value={estimates.length > 0
                    ? (() => {
                        const s = Math.floor((Date.now() - estimates[0].ts) / 1000);
                        return s < 60 ? `${s}s` : `${Math.floor(s/60)}m ${s%60}s`;
                      })()
                    : "—"
                  }
                  color="#94a3b8"
                />
                <StatCard
                  label="Model type"
                  value="HEURISTIC"
                  color="#6366f1"
                />
              </div>
            </div>

            {/* Row 2: Timeline + Signal breakdown */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16, marginBottom: 16 }}>
              <GlowCard style={{ padding: "18px 20px" }}>
                <CardHeader title="Load over time" sub="Timeline" />
                {estimates.length === 0
                  ? <div style={{ height: 240, display: "flex", alignItems: "center", justifyContent: "center", color: "#1e293b", fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
                      waiting for signal data…
                    </div>
                  : <LoadTimeline estimates={estimates} />
                }
              </GlowCard>

              <GlowCard style={{ padding: "18px 20px" }}>
                <CardHeader title="Dominant signals" sub="Breakdown" />
                {estimates.length < 5
                  ? <div style={{ color: "#334155", fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
                      collecting…
                    </div>
                  : <SignalBreakdown estimates={estimates} currentLoad={cl} />
                }
              </GlowCard>
            </div>

            {/* Row 3: State distribution + Cognitive fingerprint + Session stats */}
            <div style={{ display: "grid", gridTemplateColumns: "280px 260px 1fr", gap: 16, marginBottom: 16 }}>
              <GlowCard style={{ padding: "18px 20px" }}>
                <CardHeader title="UI state distribution" sub="States" />
                <StateDistribution estimates={estimates} />
              </GlowCard>

              <GlowCard style={{ padding: "18px 20px" }}>
                <CardHeader title="Behavioral fingerprint" sub="Fingerprint" />
                <CognitiveFingerprint estimates={estimates} />
              </GlowCard>

              <GlowCard style={{ padding: "18px 20px" }}>
                <CardHeader title="Session metrics" sub="Stats" />
                <SessionStats estimates={estimates} currentLoad={currentLoad} />
              </GlowCard>
            </div>

            {/* Row 4: Signal matrix */}
            <GlowCard style={{ padding: "18px 20px", marginBottom: 16 }}>
              <CardHeader title="Signal activity heatmap" sub="Matrix" />
              <SignalMatrix estimates={estimates} />
            </GlowCard>

            {/* Row 5: Live log */}
            <EstimateLog estimates={estimates} />

            {/* Row 6: Signal correlations */}
            {sessionId && (
              <CorrelationMatrix sessionId={sessionId} />
            )}

          </>
        )}

        {/* — Calibration View — */}
        {view === "calibration" && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#6366f1",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  fontFamily: "'JetBrains Mono', monospace",
                  marginBottom: 6,
                }}
              >
                Ground Truth Collection
              </div>

              <h2
                style={{
                  margin: 0,
                  fontSize: 22,
                  fontWeight: 700,
                  color: "#f8fafc",
                }}
              >
                Calibration Protocol
              </h2>

              <p
                style={{
                  margin: "8px 0 0",
                  color: "#475569",
                  fontSize: 13,
                  maxWidth: 480,
                }}
              >
                Three N-back blocks with NASA-TLX self-reports. Your behavioral signals
                during each block become labeled training examples for the cognitive
                load model.
              </p>
            </div>

            <GlowCard style={{ padding: "32px 40px", marginBottom: 16 }}>
              <CalibrationFlow userId={sessionId} />
            </GlowCard>

            <GlowCard style={{ padding: "32px 40px" }}>
              <CardHeader
                title="N-back working memory task"
                sub="Cognitive load calibration"
              />

              <NBackTask
                n={2}
                trials={20}
                onComplete={(result) => {
                  setNBackResult(result);
                  console.log("N-back calibration result:", result);
                }}
              />
            </GlowCard>
                    </div>
                  )}

                  {/* ── Session Calendar View ── */}
                  {view === "calendar" && (
                    <div style={{ maxWidth: 1100 }}>
                      <div style={{ marginBottom: 24 }}>
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: "#475569",
                            textTransform: "uppercase",
                            letterSpacing: "0.12em",
                            fontFamily: "'JetBrains Mono', monospace",
                            marginBottom: 6,
                          }}
                        >
                          Session History
                        </div>

                        <h2
                          style={{
                            margin: 0,
                            fontSize: 22,
                            fontWeight: 700,
                            color: "#f8fafc",
                          }}
                        >
                          Cognitive Load Calendar
                        </h2>

                        <p
                          style={{
                            margin: "8px 0 0",
                            color: "#475569",
                            fontSize: 13,
                            maxWidth: 600,
                          }}
                        >
                          Explore your cognitive load patterns across the last 52 weeks.
                          Each day is coloured by average cognitive load.
                        </p>
                      </div>

                      <SessionCalendar userId={sessionId} />
                    </div>
                  )}

                  {/* ── Behavioural Profile View ── */}
                  {view === "profile" && (
                    <div style={{ maxWidth: 1100 }}>
                      <div style={{ marginBottom: 24 }}>
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: "#6366f1",
                            textTransform: "uppercase",
                            letterSpacing: "0.12em",
                            fontFamily: "'JetBrains Mono', monospace",
                            marginBottom: 6,
                          }}
                        >
                          Behavioural Analysis
                        </div>

                        <h2
                          style={{
                            margin: 0,
                            fontSize: 22,
                            fontWeight: 700,
                            color: "#f8fafc",
                          }}
                        >
                          Behavioural Profile
                        </h2>

                        <p
                          style={{
                            margin: "8px 0 0",
                            color: "#475569",
                            fontSize: 13,
                            maxWidth: 650,
                          }}
                        >
                          Your cognitive work pattern is classified across four behavioural
                          archetypes using load, flow, volatility, and overload patterns.
                        </p>
                      </div>

                      {profileData.loading ? (
                        <GlowCard style={{ padding: 40 }}>
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(2, 1fr)",
                              gap: 16,
                            }}
                          >
                            {[1, 2, 3, 4].map((item) => (
                              <div
                                key={item}
                                style={{
                                  height: 390,
                                  borderRadius: 14,
                                  background: "rgba(255,255,255,0.03)",
                                  border: "1px solid rgba(255,255,255,0.05)",
                                }}
                              />
                            ))}
                          </div>
                        </GlowCard>
                      ) : profileData.error ? (
                        <GlowCard style={{ padding: 40 }}>
                          <div
                            style={{
                              color: "#ef4444",
                              fontSize: 13,
                              fontFamily: "'JetBrains Mono', monospace",
                            }}
                          >
                            {profileData.error}
                          </div>
                        </GlowCard>
                      ) : profileData.sessionCount < 3 ? (
                        <GlowCard
                          style={{
                            padding: "60px 40px",
                            textAlign: "center",
                          }}
                        >
                          <div
                            style={{
                              fontSize: 32,
                              color: "#334155",
                              marginBottom: 16,
                            }}
                          >
                            ◎
                          </div>

                          <div
                            style={{
                              fontSize: 15,
                              fontWeight: 600,
                              color: "#64748b",
                              marginBottom: 8,
                            }}
                          >
                            Not enough session history
                          </div>

                          <div
                            style={{
                              fontSize: 12,
                              color: "#334155",
                              fontFamily: "'JetBrains Mono', monospace",
                            }}
                          >
                            Complete at least 3 sessions to generate your behavioural profile.
                          </div>

                          <div
                            style={{
                              marginTop: 12,
                              fontSize: 10,
                              color: "#1e293b",
                            }}
                          >
                            Sessions analysed: {profileData.sessionCount} / 3
                          </div>
                        </GlowCard>
                      ) : (
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                            gap: 16,
                          }}
                        >
                          {(() => {
                            const classified = classifyArchetype(profileData.features);

                            return ARCHETYPES.map((archetype) => {
                              const isSelected = archetype.name === classified.name;

                            return (
                              <ArchetypeCard
                                key={archetype.name}
                                result={{
                                  ...classified,
                                  name: archetype.name,
                                  centroid: archetype.centroid,
                                  distance: isSelected ? classified.distance : 0,
                                  confidence: isSelected ? classified.confidence : 0,
                                  leastLike: classified.leastLike,
                                }}
                                dimmed={!isSelected}
                                isSelected={isSelected}
                              />
                            );
                          });
                        })()}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── About View ── */}
                  {view === "about" && (
          <div style={{ maxWidth: 760 }}>
            {/* Hero */}
            <div style={{
              marginBottom: 24,
              padding: "36px 40px",
              background: "rgba(10,13,20,0.85)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 18,
              position: "relative",
              overflow: "hidden",
            }}>
              <div style={{
                position: "absolute", inset: 0,
                background: "radial-gradient(circle at 80% 20%, rgba(99,102,241,0.08) 0%, transparent 60%)",
                pointerEvents: "none",
              }} />
              <div style={{
                fontSize: 10, fontWeight: 700, color: "#6366f1",
                letterSpacing: "0.12em", textTransform: "uppercase",
                fontFamily: "'JetBrains Mono', monospace", marginBottom: 10,
              }}>
                CHI 2026 · Research Preview
              </div>
              <h1 style={{ margin: "0 0 12px", fontSize: 28, fontWeight: 800, color: "#f8fafc", lineHeight: 1.2 }}>
                Cognitive Load<br />Adaptive Interfaces
              </h1>
              <p style={{ color: "#64748b", lineHeight: 1.7, margin: "0 0 20px", maxWidth: 520, fontSize: 14 }}>
                NeuroFlow infers cognitive load from behavioral signals — keystroke rhythm,
                mouse entropy, error rate, pause patterns — and dynamically adapts interface
                complexity. No EEG. No wearables. No physiological sensors.
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                {[
                  { href: "https://github.com/Aprameya05/neuroflow", label: "GitHub →", bg: "#f8fafc", color: "#0f172a" },
                  { href: "https://neuroflow-editor.pages.dev", label: "Try editor →", bg: "#6366f1", color: "#fff" },
                  { href: "https://neuroflow-backend-r6rs.onrender.com/docs", label: "API docs →", bg: "transparent", color: "#6366f1", border: "1px solid rgba(99,102,241,0.3)" },
                ].map(link => (
                  <a key={link.label} href={link.href} target="_blank" rel="noreferrer" style={{
                    padding: "9px 20px",
                    background: link.bg,
                    color: link.color,
                    border: link.border ?? "none",
                    borderRadius: 8,
                    textDecoration: "none",
                    fontSize: 13, fontWeight: 600,
                    transition: "opacity 0.15s ease",
                  }}>
                    {link.label}
                  </a>
                ))}
              </div>
            </div>

            {/* Stack */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              {[
                { label: "Backend",     value: "FastAPI + WebSocket",  sub: "Render · /health",   icon: "⚙" },
                { label: "ML Model",    value: "BiLSTM (ONNX)",        sub: "PyTorch trained",     icon: "🧠" },
                { label: "SDK",         value: "@neuroflow/sdk",        sub: "TypeScript · npm",    icon: "📦" },
                { label: "Signals",     value: "9 behavioral",         sub: "100ms sample rate",   icon: "📡" },
                { label: "Extension",   value: "Chrome MV3",           sub: "WebSocket streaming", icon: "🔌" },
                { label: "Target",      value: "CHI 2026",             sub: "N=20 within-subjects",icon: "🎯" },
              ].map(item => (
                <GlowCard key={item.label} style={{ padding: "16px 18px", display: "flex", gap: 14 }}>
                  <div style={{ fontSize: 22, flexShrink: 0, lineHeight: 1 }}>{item.icon}</div>
                  <div>
                    <div style={{ fontSize: 9, color: "#334155", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'JetBrains Mono', monospace", marginBottom: 4 }}>
                      {item.label}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#f8fafc", marginBottom: 2 }}>{item.value}</div>
                    <div style={{ fontSize: 11, color: "#475569" }}>{item.sub}</div>
                  </div>
                </GlowCard>
              ))}
            </div>

            {/* Research pipeline */}
            <GlowCard style={{ padding: "20px 24px", overflow: "hidden" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "'JetBrains Mono', monospace", marginBottom: 16 }}>
                Research Pipeline
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {[
                  { step: "01", title: "Calibration",       desc: "N-back + NASA-TLX ground truth labels", done: true },
                  { step: "02", title: "LSTM Training",     desc: "BiLSTM on A100 (50hr budget)",          done: false },
                  { step: "03", title: "ONNX Deployment",   desc: "Replace heuristic stub in backend",     done: false },
                  { step: "04", title: "User Study",        desc: "N=20 within-subjects, counterbalanced", done: false },
                  { step: "05", title: "Paper Submission",  desc: "CHI 2026 deadline",                     done: false },
                  { step: "06", title: "Open Source",       desc: "@neuroflow/sdk on npm, dataset release",done: false },
                ].map((item, i, arr) => (
                  <div key={item.step} style={{ display: "flex", gap: 16, position: "relative" }}>
                    {/* Vertical line */}
                    {i < arr.length - 1 && (
                      <div style={{
                        position: "absolute",
                        left: 15, top: 28,
                        width: 1, height: "calc(100% - 14px)",
                        background: item.done ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.05)",
                      }} />
                    )}
                    <div style={{
                      width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: item.done ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${item.done ? "rgba(99,102,241,0.5)" : "rgba(255,255,255,0.08)"}`,
                      fontSize: 9, fontWeight: 700,
                      color: item.done ? "#a5b4fc" : "#334155",
                      fontFamily: "'JetBrains Mono', monospace",
                      zIndex: 1,
                    }}>
                      {item.done ? "✓" : item.step}
                    </div>
                    <div style={{ paddingTop: 6, paddingBottom: 18 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: item.done ? "#f8fafc" : "#64748b", marginBottom: 2 }}>
                        {item.title}
                      </div>
                      <div style={{ fontSize: 11, color: "#334155" }}>{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </GlowCard>
          </div>
        )}
      </main>

      {/* Session replay modal */}
      {showReplay && (
        <SessionReplayPlayer estimates={estimates} onClose={() => setShowReplay(false)} />
      )}
    </div>
  );
}
