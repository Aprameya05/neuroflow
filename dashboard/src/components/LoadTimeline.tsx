/**
 * LoadTimeline — real-time line chart of cognitive load over the last 30 seconds.
 * Uses Recharts. Threshold lines at 30% (flow boundary) and 65% (overload boundary).
 */
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import type { LoadEstimate } from "../types";

interface Props {
  estimates: LoadEstimate[];
}

export function LoadTimeline({ estimates }: Props) {
  const data = estimates.map((e) => ({
    t: new Date(e.ts).toLocaleTimeString("en", { hour12: false }),
    load: Math.round(e.load * 100),
    dominant: e.dominant,
  }));

  return (
    <div style={{ width: "100%", height: 220 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis
            dataKey="t"
            tick={{ fontSize: 10, fill: "#9ca3af" }}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 30, 65, 100]}
            tick={{ fontSize: 10, fill: "#9ca3af" }}
          />
          <Tooltip
            formatter={(value: number, _name: string, props: any) => [
              `${value}% — ${props?.payload?.dominant ?? ""}`,
              "Load",
            ]}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
          />
          <ReferenceLine
            y={30}
            stroke="#22c55e"
            strokeDasharray="5 5"
            label={{ value: "Flow", fontSize: 10, fill: "#22c55e", position: "right" }}
          />
          <ReferenceLine
            y={65}
            stroke="#f59e0b"
            strokeDasharray="5 5"
            label={{ value: "High", fontSize: 10, fill: "#f59e0b", position: "right" }}
          />
          <Line
            type="monotone"
            dataKey="load"
            stroke="#6366f1"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
