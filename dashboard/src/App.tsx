import { useState, useEffect, useRef } from "react";
import { useNeuroFlowSocket } from "./hooks/useNeuroFlowSocket";
import { LoadGauge } from "./components/LoadGauge";
import { LoadTimeline } from "./components/LoadTimeline";
import { SignalBreakdown } from "./components/SignalBreakdown";
import { EstimateLog } from "./components/EstimateLog";
import type { LoadEstimate } from "./types";

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
];

// Generates realistic simulated load data for demo mode
function generateDemoEstimates(count: number): LoadEstimate[] {
  const estimates: LoadEstimate[] = [];
  let load = 0.35;
  const now = Date.now();

  for (let i = count; i >= 0; i--) {
    // Simulate realistic cognitive load pattern -- gradual changes with occasional spikes
    const drift = (Math.random() - 0.48) * 0.06;
    load = Math.max(0.05, Math.min(0.95, load + drift));
    // Occasional load spikes (simulates a difficult task moment)
    if (Math.random() < 0.03) load = Math.min(0.95, load + 0.25);
    // Occasional recovery (simulates a break)
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

function StatusPill({ on, demo }: { on: boolean; demo: boolean }) {
  if (demo) return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:6, fontSize:12, padding:"3px 10px", borderRadius:99, background:"#fef9c3", color:"#854d0e" }}>
      <span style={{ width:7, height:7, borderRadius:"50%", background:"#f59e0b" }} />
      Demo mode
    </span>
  );
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:6, fontSize:12, padding:"3px 10px", borderRadius:99, background: on?"#dcfce7":"#fef2f2", color: on?"#15803d":"#b91c1c" }}>
      <span style={{ width:7, height:7, borderRadius:"50%", background: on?"#22c55e":"#ef4444" }} />
      {on ? "Live" : "Disconnected"}
    </span>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:12, padding:"18px 22px" }}>
      <p style={{ margin:"0 0 6px", fontSize:12, color:"#9ca3af" }}>{label}</p>
      <p style={{ margin:0, fontSize:26, fontWeight:600, color:"#111827" }}>{value}</p>
    </div>
  );
}

function UIStateBadge({ load }: { load: number | null }) {
  if (load === null) return null;
  const state = load < 0.21 ? "rich" : load < 0.30 ? "normal" : load < 0.65 ? "reduced" : "minimal";
  const styles = {
    rich:    { bg: "#dcfce7", text: "#15803d", label: "Rich UI -- all features visible" },
    normal:  { bg: "#eff6ff", text: "#1d4ed8", label: "Normal UI" },
    reduced: { bg: "#fef9c3", text: "#854d0e", label: "Reduced UI -- simplifying interface" },
    minimal: { bg: "#fef2f2", text: "#b91c1c", label: "Minimal UI -- focus mode active" },
  };
  const s = styles[state];
  return (
    <div style={{ background: s.bg, color: s.text, padding: "10px 16px", borderRadius: 8, fontSize: 13, fontWeight: 500, marginTop: 16 }}>
      Current state: <strong>{state}</strong> -- {s.label}
    </div>
  );
}

function exportCSV(estimates: LoadEstimate[], sessionId: string) {
  const header = "timestamp,load,confidence,dominant\n";
  const rows = estimates.map(e =>
    `${new Date(e.ts).toISOString()},${e.load},${e.confidence},${e.dominant}`
  ).join("\n");
  const blob = new Blob([header + rows], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `neuroflow-${sessionId}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [sessionId] = useState(SESSION_ID);
  const { estimates: liveEstimates, currentLoad: liveLoad, isConnected } = useNeuroFlowSocket(sessionId);

  // Demo mode: active when not connected after 3 seconds
  const [demoMode, setDemoMode] = useState(false);
  const [demoEstimates, setDemoEstimates] = useState<LoadEstimate[]>([]);
  const demoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const demoInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isConnected) {
      // Real connection -- kill demo mode
      setDemoMode(false);
      if (demoTimer.current) clearTimeout(demoTimer.current);
      if (demoInterval.current) clearInterval(demoInterval.current);
      return;
    }

    // Start demo mode after 3 seconds of no connection
    demoTimer.current = setTimeout(() => {
      setDemoMode(true);
      setDemoEstimates(generateDemoEstimates(100));

      // Keep adding new demo estimates every 300ms
      demoInterval.current = setInterval(() => {
        setDemoEstimates(prev => {
          const last = prev[prev.length - 1];
          const prevLoad = last?.load ?? 0.35;
          const drift = (Math.random() - 0.48) * 0.06;
          let newLoad = Math.max(0.05, Math.min(0.95, prevLoad + drift));
          if (Math.random() < 0.03) newLoad = Math.min(0.95, newLoad + 0.25);
          if (Math.random() < 0.02) newLoad = Math.max(0.1, newLoad - 0.2);
          newLoad = Math.round(newLoad * 1000) / 1000;

          const newEstimate: LoadEstimate = {
            type: "load_estimate",
            load: newLoad,
            confidence: 0.4 + Math.random() * 0.3,
            dominant: DOMINANT_SIGNALS[Math.floor(Math.random() * DOMINANT_SIGNALS.length)],
            ts: Date.now(),
            session_id: "demo-session",
          };

          const next = [...prev, newEstimate];
          return next.length > 300 ? next.slice(-300) : next;
        });
      }, 300);
    }, 3000);

    return () => {
      if (demoTimer.current) clearTimeout(demoTimer.current);
      if (demoInterval.current) clearInterval(demoInterval.current);
    };
  }, [isConnected]);

  const estimates = isConnected ? liveEstimates : demoEstimates;
  const currentLoad = isConnected
    ? liveLoad
    : demoEstimates.length > 0 ? demoEstimates[demoEstimates.length - 1].load : null;

  const avg = estimates.length > 0 ? estimates.reduce((s, e) => s + e.load, 0) / estimates.length : null;
  const peak = estimates.length > 0 ? Math.max(...estimates.map(e => e.load)) : null;

  return (
    <div style={{ minHeight:"100vh", background:"#f9fafb", fontFamily:"system-ui,sans-serif" }}>
      <header style={{ background:"#fff", borderBottom:"1px solid #e5e7eb", padding:"13px 24px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:28, height:28, borderRadius:8, background:"#6366f1", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:14, fontWeight:700 }}>N</div>
          <span style={{ fontWeight:600, fontSize:15 }}>NeuroFlow</span>
          <span style={{ color:"#9ca3af", fontSize:13 }}>Research Dashboard</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <code style={{ fontSize:11, color:"#6b7280" }}>{demoMode ? "demo-session" : sessionId}</code>
          <button
            onClick={() => exportCSV(estimates, demoMode ? "demo" : sessionId)}
            disabled={estimates.length === 0}
            style={{ fontSize:12, padding:"6px 14px", borderRadius:6, border:"1px solid #e5e7eb", background:"#fff", cursor:"pointer", opacity: estimates.length === 0 ? 0.4 : 1 }}
          >
            Export CSV
          </button>
          <StatusPill on={isConnected} demo={demoMode} />
        </div>
      </header>

      {demoMode && (
        <div style={{ background:"#fef9c3", borderBottom:"1px solid #fde68a", padding:"8px 24px", fontSize:12, color:"#92400e", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <span>
            Demo mode -- showing simulated cognitive load data.
            Install the <a href="https://github.com/Aprameya05/neuroflow" style={{ color:"#92400e", fontWeight:600 }}>Chrome extension</a> to see your real data.
          </span>
          <span style={{ color:"#a16207" }}>Live data replaces this automatically when extension connects.</span>
        </div>
      )}

      <main style={{ maxWidth:1100, margin:"0 auto", padding:24 }}>
        <div style={{ display:"grid", gridTemplateColumns:"210px 1fr", gap:18, marginBottom:18 }}>
          <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:12, padding:20, display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
            <p style={{ margin:0, fontSize:11, color:"#9ca3af", textTransform:"uppercase", letterSpacing:"0.05em" }}>Current load</p>
            <LoadGauge load={currentLoad} size={158} />
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16 }}>
            <StatCard label="Estimates received" value={estimates.length.toLocaleString()} />
            <StatCard label="Session avg" value={avg !== null ? `${Math.round(avg*100)}%` : "—"} />
            <StatCard label="Peak load" value={peak !== null ? `${Math.round(peak*100)}%` : "—"} />
          </div>
          <UIStateBadge load={currentLoad} />
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 280px", gap:18 }}>
          <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:12, padding:"18px 22px" }}>
            <p style={{ margin:"0 0 14px", fontSize:13, fontWeight:500, color:"#374151" }}>Load over time</p>
            {estimates.length === 0
              ? <div style={{ height:220, display:"flex", alignItems:"center", justifyContent:"center", color:"#9ca3af", fontSize:13 }}>Waiting for signal data…</div>
              : <LoadTimeline estimates={estimates} />}
          </div>
          <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:12, padding:"18px 22px" }}>
            <p style={{ margin:"0 0 14px", fontSize:13, fontWeight:500, color:"#374151" }}>Dominant signals</p>
            {estimates.length < 5
              ? <p style={{ fontSize:13, color:"#9ca3af" }}>Collecting…</p>
              : <SignalBreakdown estimates={estimates} />}
          </div>
        </div>

        <div style={{ marginTop:18 }}>
          <EstimateLog estimates={estimates} />
        </div>
      </main>
    </div>
  );
}
