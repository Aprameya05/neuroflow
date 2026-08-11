/**
 * NasaTLX -- NASA Task Load Index self-report workload questionnaire.
 * 6 subscales, each rated 0–100 via a slider.
 * Used as ground-truth cognitive load labels for LSTM training.
 *
 * Reference: Hart & Staveland (1988). Development of NASA-TLX.
 */
import { useState } from "react";

export interface TLXScores {
  mentalDemand: number;
  physicalDemand: number;
  temporalDemand: number;
  performance: number;
  effort: number;
  frustration: number;
  overallScore: number;   // weighted average (equal weights)
}

interface NasaTLXProps {
  onSubmit: (scores: TLXScores) => void;
  taskLabel?: string;
}

const DIMENSIONS = [
  {
    key: "mentalDemand" as const,
    label: "Mental Demand",
    desc: "How much mental and perceptual activity was required?",
    lowLabel: "Low",
    highLabel: "High",
  },
  {
    key: "physicalDemand" as const,
    label: "Physical Demand",
    desc: "How much physical activity was required?",
    lowLabel: "Low",
    highLabel: "High",
  },
  {
    key: "temporalDemand" as const,
    label: "Temporal Demand",
    desc: "How much time pressure did you feel?",
    lowLabel: "Low",
    highLabel: "High",
  },
  {
    key: "performance" as const,
    label: "Performance",
    desc: "How successful were you in accomplishing the task?",
    lowLabel: "Perfect",
    highLabel: "Failure",
  },
  {
    key: "effort" as const,
    label: "Effort",
    desc: "How hard did you have to work to accomplish your level of performance?",
    lowLabel: "Low",
    highLabel: "High",
  },
  {
    key: "frustration" as const,
    label: "Frustration",
    desc: "How insecure, discouraged, irritated, or annoyed were you?",
    lowLabel: "Low",
    highLabel: "High",
  },
];

const INITIAL_SCORES: Record<string, number> = {
  mentalDemand: 50, physicalDemand: 50, temporalDemand: 50,
  performance: 50, effort: 50, frustration: 50,
};

function overallScore(scores: Record<string, number>): number {
  const vals = Object.values(scores);
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

export function NasaTLX({ onSubmit, taskLabel = "the task" }: NasaTLXProps) {
  const [scores, setScores] = useState(INITIAL_SCORES);

  const handleSubmit = () => {
    const s = scores as Record<string, number>;
    onSubmit({
      mentalDemand: s.mentalDemand,
      physicalDemand: s.physicalDemand,
      temporalDemand: s.temporalDemand,
      performance: s.performance,
      effort: s.effort,
      frustration: s.frustration,
      overallScore: overallScore(s),
    });
  };

  const overall = overallScore(scores);
  const loadColor = overall < 33 ? "#22c55e" : overall < 66 ? "#f59e0b" : "#ef4444";

  return (
    <div style={{ maxWidth: 560, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
        <h2 style={{ margin: "0 0 6px", color: "#1e293b" }}>NASA Task Load Index</h2>
        <p style={{ color: "#64748b", fontSize: 14 }}>
          Rate your workload during {taskLabel} on each scale below.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20, marginBottom: 28 }}>
        {DIMENSIONS.map(dim => (
          <div key={dim.key} style={{
            background: "#f8fafc", border: "1px solid #e2e8f0",
            borderRadius: 12, padding: "16px 20px",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 14, color: "#1e293b" }}>{dim.label}</span>
              <span style={{
                fontSize: 14, fontWeight: 700, color: "#6366f1",
                fontFamily: "monospace", minWidth: 32, textAlign: "right",
              }}>
                {scores[dim.key]}
              </span>
            </div>
            <p style={{ margin: "0 0 12px", fontSize: 12, color: "#64748b" }}>{dim.desc}</p>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 11, color: "#94a3b8", minWidth: 36 }}>{dim.lowLabel}</span>
              <input
                type="range"
                min={0}
                max={100}
                value={scores[dim.key]}
                onChange={e => setScores(prev => ({ ...prev, [dim.key]: Number(e.target.value) }))}
                style={{ flex: 1, accentColor: "#6366f1" }}
              />
              <span style={{ fontSize: 11, color: "#94a3b8", minWidth: 36, textAlign: "right" }}>{dim.highLabel}</span>
            </div>
          </div>
        ))}
      </div>

      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 20px",
        background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12,
        marginBottom: 20,
      }}>
        <span style={{ fontWeight: 600, color: "#374151" }}>Overall workload</span>
        <span style={{ fontSize: 28, fontWeight: 800, color: loadColor, fontFamily: "monospace" }}>
          {overall}
        </span>
      </div>

      <button
        onClick={handleSubmit}
        style={{
          width: "100%", padding: "14px",
          background: "#6366f1", color: "#fff",
          border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: "pointer",
        }}
      >
        Submit workload rating
      </button>
    </div>
  );
}
