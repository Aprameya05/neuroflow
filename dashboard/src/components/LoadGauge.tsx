/**
 * LoadGauge — semicircular arc gauge showing current cognitive load.
 * Green (low) → Amber (medium) → Red (high), smooth transition.
 */

interface LoadGaugeProps {
  load: number | null;
  size?: number;
}

function getColor(load: number): string {
  if (load < 0.3) return "#22c55e";
  if (load < 0.65) return "#f59e0b";
  return "#ef4444";
}

function getStateLabel(load: number): string {
  if (load < 0.3) return "In flow";
  if (load < 0.65) return "Moderate";
  return "Overloaded";
}

export function LoadGauge({ load, size = 180 }: LoadGaugeProps) {
  const r = (size / 2) * 0.72;
  const cx = size / 2;
  const cy = size * 0.58;
  const circumference = Math.PI * r;

  const filled = load ?? 0;
  const strokeDashoffset = circumference * (1 - filled);
  const color = load !== null ? getColor(load) : "#d1d5db";
  const stateLabel = load !== null ? getStateLabel(load) : "—";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <svg width={size} height={size * 0.62} viewBox={`0 0 ${size} ${size * 0.62}`}>
        {/* Track */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="#f3f4f6"
          strokeWidth={14}
          strokeLinecap="round"
        />
        {/* Filled arc */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={color}
          strokeWidth={14}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{ transition: "stroke-dashoffset 0.5s ease, stroke 0.5s ease" }}
        />
        {/* Percentage */}
        <text
          x={cx}
          y={cy - 8}
          textAnchor="middle"
          dominantBaseline="auto"
          style={{
            fontSize: size * 0.21,
            fontWeight: 600,
            fill: color,
            transition: "fill 0.5s ease",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          {load !== null ? `${Math.round(load * 100)}` : "—"}
        </text>
        {/* State label */}
        <text
          x={cx}
          y={cy + 10}
          textAnchor="middle"
          style={{
            fontSize: size * 0.095,
            fill: "#9ca3af",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          {stateLabel}
        </text>
      </svg>
    </div>
  );
}
