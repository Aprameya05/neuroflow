/**
 * LoadTimeline — animated area chart with gradient fill, zone bands, custom tooltip.
 * Green zone (0-30%), amber zone (30-65%), red zone (65-100%).
 */
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ReferenceArea, ResponsiveContainer,
  TooltipProps,
} from "recharts";
import type { LoadEstimate } from "../types";
import { loadColor } from "../utils/colors";

interface Props {
  estimates: LoadEstimate[];
}

function CustomTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const color = loadColor(d.rawLoad);
  return (
    <div style={{
      background: "rgba(8,11,18,0.95)",
      border: `1px solid rgba(255,255,255,0.1)`,
      borderRadius: 10,
      padding: "10px 14px",
      fontSize: 12,
      fontFamily: "'JetBrains Mono', monospace",
      boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
    }}>
      <div style={{ color: "#64748b", marginBottom: 4 }}>{d.time}</div>
      <div style={{ color, fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em" }}>{d.load}%</div>
      <div style={{ color: "#475569", fontSize: 10, marginTop: 4 }}>{d.dominant?.replace(/_/g, " ")}</div>
      <div style={{ color: "#334155", fontSize: 10 }}>conf {d.conf}%</div>
    </div>
  );
}

export function LoadTimeline({ estimates }: Props) {
  // Show last 120 points for smooth rendering
  const slice = estimates.slice(-120);

  const data = slice.map((e) => ({
    time: new Date(e.ts).toLocaleTimeString("en", { hour12: false }),
    load: Math.round(e.load * 100),
    rawLoad: e.load,
    dominant: e.dominant,
    conf: Math.round(e.confidence * 100),
  }));

  // Dynamic gradient stops based on current load
  const currentLoad = slice[slice.length - 1]?.load ?? 0.3;
  const topColor = loadColor(currentLoad);

  return (
    <div style={{ width: "100%", height: 240, position: "relative" }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -20 }}>
          <defs>
            <linearGradient id="loadGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={topColor} stopOpacity={0.4} />
              <stop offset="60%" stopColor={topColor} stopOpacity={0.1} />
              <stop offset="100%" stopColor={topColor} stopOpacity={0} />
            </linearGradient>
          </defs>

          {/* Zone background bands */}
          <ReferenceArea y1={0}  y2={30} fill="rgba(52,211,153,0.04)"  ifOverflow="hidden" />
          <ReferenceArea y1={30} y2={65} fill="rgba(245,158,11,0.04)"  ifOverflow="hidden" />
          <ReferenceArea y1={65} y2={100} fill="rgba(239,68,68,0.05)" ifOverflow="hidden" />

          <CartesianGrid strokeDasharray="3 4" stroke="rgba(255,255,255,0.04)" vertical={false} />

          <XAxis
            dataKey="time"
            tick={{ fontSize: 9, fill: "#334155", fontFamily: "'JetBrains Mono', monospace" }}
            interval="preserveStartEnd"
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 30, 65, 100]}
            tick={{ fontSize: 9, fill: "#334155", fontFamily: "'JetBrains Mono', monospace" }}
            axisLine={false}
            tickLine={false}
          />

          <Tooltip content={<CustomTooltip />} />

          {/* Threshold reference lines */}
          <ReferenceLine y={30} stroke="rgba(52,211,153,0.3)" strokeDasharray="4 4"
            label={{ value: "Flow", fontSize: 9, fill: "#34d399", position: "insideTopRight" }} />
          <ReferenceLine y={65} stroke="rgba(245,158,11,0.3)" strokeDasharray="4 4"
            label={{ value: "High", fontSize: 9, fill: "#f59e0b", position: "insideTopRight" }} />

          <Area
            type="monotone"
            dataKey="load"
            stroke={topColor}
            strokeWidth={2}
            fill="url(#loadGradient)"
            dot={false}
            isAnimationActive={false}
            style={{ filter: `drop-shadow(0 0 6px ${topColor}60)` }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
