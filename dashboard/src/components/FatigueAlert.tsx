import { useEffect, useRef, useState } from "react";

interface FatigueAlertProps {
  fatigueIndex: number;
  onDismiss?: () => void;
  history?: number[];
}

function getFatigueLevel(fatigueIndex: number) {
  if (fatigueIndex >= 0.8) {
    return {
      label: "High Fatigue",
      message: "Your cognitive load has remained elevated. Consider taking a short break.",
    };
  }

  if (fatigueIndex >= 0.6) {
    return {
      label: "Moderate Fatigue",
      message: "Sustained cognitive load detected. A short pause may help.",
    };
  }

  if (fatigueIndex >= 0.3) {
    return {
      label: "Early Fatigue",
      message: "Signs of increasing cognitive fatigue detected.",
    };
  }

  return {
    label: "Low Fatigue",
    message: "",
  };
}

function FatigueTimeline({ history }: { history: number[] }) {
  const readings = history.slice(-30);

  if (readings.length === 0) return null;

  const width = 240;
  const height = 60;

  const points = readings.map((value, index) => {
    const x = readings.length === 1
      ? width / 2
      : (index / (readings.length - 1)) * width;

    const y = height - Math.max(0, Math.min(1, value)) * height;

    return `${x},${y}`;
  }).join(" ");

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-label="Fatigue trend over the last 30 readings"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function FatigueAlert({
  fatigueIndex,
  onDismiss,
  history = [],
}: FatigueAlertProps) {
  const [dismissed, setDismissed] = useState(false);
  const previousFatigue = useRef(fatigueIndex);

  const level = getFatigueLevel(fatigueIndex);

  useEffect(() => {
    if (previousFatigue.current >= 0.3 && fatigueIndex < 0.3) {
      setDismissed(false);
    }

    previousFatigue.current = fatigueIndex;
  }, [fatigueIndex]);

  if (fatigueIndex < 0.3 || dismissed) {
    return null;
  }

  return (
    <div
      style={{
        marginBottom: 16,
        padding: "14px 16px",
        border: "1px solid rgba(245,158,11,0.25)",
        borderRadius: 12,
        background: "rgba(245,158,11,0.07)",
        color: "#f59e0b",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              fontFamily: "'JetBrains Mono', monospace",
              marginBottom: 5,
            }}
          >
            {level.label}
          </div>

          <div
            style={{
              fontSize: 12,
              color: "#cbd5e1",
              lineHeight: 1.5,
            }}
          >
            {level.message}
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setDismissed(true);
            onDismiss?.();
          }}
          aria-label="Dismiss fatigue alert"
          style={{
            border: "none",
            background: "transparent",
            color: "#64748b",
            cursor: "pointer",
            fontSize: 16,
            lineHeight: 1,
            padding: 2,
          }}
        >
          ×
        </button>
      </div>

      <div
        style={{
          marginTop: 10,
          height: 4,
          borderRadius: 4,
          background: "rgba(255,255,255,0.06)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${Math.round(fatigueIndex * 100)}%`,
            height: "100%",
            background: "currentColor",
            transition: "width 0.4s ease",
          }}
        />
      </div>

      <div
        style={{
          marginTop: 10,
          color: "#64748b",
          fontSize: 9,
          fontFamily: "'JetBrains Mono', monospace",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        Fatigue trend
      </div>

      <div style={{ marginTop: 4, color: "#f59e0b" }}>
        <FatigueTimeline history={history} />
      </div>
    </div>
  );
}