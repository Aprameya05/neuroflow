import type { LoadEstimate } from "../types";

export function EstimateLog({ estimates }: { estimates: LoadEstimate[] }) {
  const recent = [...estimates].reverse().slice(0, 12);

  return (
    <div style={{
      background: "#fff", border: "1px solid #e5e7eb",
      borderRadius: 12, padding: "18px 22px"
    }}>
      <p style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 500, color: "#374151" }}>
        Live estimate log
      </p>

      <div style={{ fontFamily: "monospace", fontSize: 11, color: "#6b7280" }}>
        {recent.length === 0 && (
          <p style={{ color: "#9ca3af" }}>Waiting for data...</p>
        )}

        {recent.map((e, i) => (
          <div key={i} style={{
            padding: "4px 0",
            borderBottom: "1px solid #f3f4f6",
            display: "flex", gap: 12
          }}>
            <span style={{ color: "#9ca3af" }}>
              {new Date(e.ts).toLocaleTimeString()}
            </span>

            <span style={{
              fontWeight: 600,
              color: e.load > 0.65 ? "#ef4444" : e.load > 0.3 ? "#f59e0b" : "#22c55e"
            }}>
              {Math.round(e.load * 100)}%
            </span>

            <span>{e.dominant}</span>

            <span style={{ color: "#d1d5db" }}>
              conf {Math.round(e.confidence * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}