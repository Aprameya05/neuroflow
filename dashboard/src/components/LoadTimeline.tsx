/**
 * LoadTimeline — animated area chart with gradient fill, zone bands, custom tooltip,
 * and a forward-looking prediction line via linear regression.
 */
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ReferenceArea, ResponsiveContainer,
} from "recharts";
import type { TooltipProps } from "recharts";
import type { LoadEstimate } from "../types";
import { loadColor } from "../utils/colors";

interface Props {
  estimates: LoadEstimate[];
}

/** Ordinary least-squares linear regression. Returns {slope, intercept}. */
function linearRegression(ys: number[]): { slope: number; intercept: number } {
  const n = ys.length;
  if (n < 2) return { slope: 0, intercept: ys[0] ?? 0.3 };
  const xs = ys.map((_, i) => i);
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((a, x, i) => a + x * ys[i], 0);
  const sumXX = xs.reduce((a, x) => a + x * x, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

function CustomTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  if (d.isFuture) {
    const pct = Math.round((d.predicted ?? 0) * 100);
    const color = loadColor((d.predicted ?? 0));
    return (
      <div style={{
        background: "rgba(8,11,18,0.95)",
        border: "1px solid rgba(99,102,241,0.25)",
        borderRadius: 10, padding: "10px 14px", fontSize: 12,
        fontFamily: "'JetBrains Mono', monospace",
        boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
      }}>
        <div style={{ color: "#6366f1", marginBottom: 4, fontSize: 10 }}>FORECAST +{d.offsetSec}s</div>
        <div style={{ color, fontSize: 18, fontWeight: 800 }}>{pct}%</div>
      </div>
    );
  }
  const color = loadColor(d.rawLoad ?? 0);
  return (
    <div style={{
      background: "rgba(8,11,18,0.95)",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 10, padding: "10px 14px", fontSize: 12,
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

const PREDICT_STEPS = 10; // future time buckets to forecast

export function LoadTimeline({ estimates }: Props) {
  const slice = estimates.slice(-120);
  const currentLoad = slice[slice.length - 1]?.load ?? 0.3;
  const topColor = loadColor(currentLoad);

  // Compute linear regression on last 20 points
  const regWindow = slice.slice(-20).map(e => e.load);
  const { slope, intercept } = linearRegression(regWindow);
  const lastIdx = regWindow.length - 1;

  // Build chart data: real points + future prediction points
  const realData = slice.map((e) => ({
    time: new Date(e.ts).toLocaleTimeString("en", { hour12: false }),
    load: Math.round(e.load * 100),
    rawLoad: e.load,
    dominant: e.dominant,
    conf: Math.round(e.confidence * 100),
    isFuture: false,
  }));

  // Connector point: last real point also carries the predicted value so lines join
  if (realData.length > 0) {
    const lastReal = realData[realData.length - 1];
    (lastReal as Record<string, unknown>).predicted = Math.round(
      Math.max(0, Math.min(1, intercept + slope * lastIdx)) * 100
    );
  }

  const avgIntervalMs = slice.length >= 2
    ? (slice[slice.length - 1].ts - slice[0].ts) / (slice.length - 1)
    : 300;

  const futureData = Array.from({ length: PREDICT_STEPS }, (_, i) => {
    const futureIdx = lastIdx + i + 1;
    const predicted = Math.max(0, Math.min(1, intercept + slope * futureIdx));
    const futureTs = (slice[slice.length - 1]?.ts ?? Date.now()) + (i + 1) * avgIntervalMs;
    return {
      time: new Date(futureTs).toLocaleTimeString("en", { hour12: false }),
      load: undefined,
      predicted: Math.round(predicted * 100),
      isFuture: true,
      offsetSec: Math.round(((i + 1) * avgIntervalMs) / 1000),
    };
  });

  const data = [...realData, ...futureData];

  return (
    <div style={{ width: "100%", position: "relative" }}>
      {/* Forecast legend badge */}
      <div style={{
        position: "absolute", top: 0, right: 8, zIndex: 2,
        display: "flex", alignItems: "center", gap: 5,
        fontSize: 9, color: "#6366f1",
        fontFamily: "'JetBrains Mono', monospace",
        letterSpacing: "0.06em",
      }}>
        <svg width={20} height={6}>
          <line x1={0} y1={3} x2={8} y2={3} stroke="#6366f1" strokeWidth={1.5} strokeDasharray="3 2" />
          <line x1={10} y1={3} x2={20} y2={3} stroke="#6366f1" strokeWidth={1.5} strokeDasharray="3 2" />
        </svg>
        FORECAST
      </div>

      <div style={{ height: 240 }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 16, right: 4, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="loadGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={topColor} stopOpacity={0.4} />
                <stop offset="60%" stopColor={topColor} stopOpacity={0.1} />
                <stop offset="100%" stopColor={topColor} stopOpacity={0} />
              </linearGradient>
              {/* Dashed prediction line gradient */}
              <linearGradient id="predictGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.9} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0.3} />
              </linearGradient>
            </defs>

            {/* Zone background bands */}
            <ReferenceArea y1={0}   y2={30}  fill="rgba(52,211,153,0.04)"  ifOverflow="hidden" />
            <ReferenceArea y1={30}  y2={65}  fill="rgba(245,158,11,0.04)"  ifOverflow="hidden" />
            <ReferenceArea y1={65}  y2={100} fill="rgba(239,68,68,0.05)"  ifOverflow="hidden" />

            <CartesianGrid strokeDasharray="3 4" stroke="rgba(255,255,255,0.04)" vertical={false} />

            <XAxis
              dataKey="time"
              tick={{ fontSize: 9, fill: "#334155", fontFamily: "'JetBrains Mono', monospace" }}
              interval="preserveStartEnd"
              axisLine={false} tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 30, 65, 100]}
              tick={{ fontSize: 9, fill: "#334155", fontFamily: "'JetBrains Mono', monospace" }}
              axisLine={false} tickLine={false}
            />

            <Tooltip content={<CustomTooltip />} />

            {/* Threshold lines */}
            <ReferenceLine y={30} stroke="rgba(52,211,153,0.3)" strokeDasharray="4 4"
              label={{ value: "Flow", fontSize: 9, fill: "#34d399", position: "insideTopRight" }} />
            <ReferenceLine y={65} stroke="rgba(245,158,11,0.3)" strokeDasharray="4 4"
              label={{ value: "High", fontSize: 9, fill: "#f59e0b", position: "insideTopRight" }} />

            {/* Actual load area */}
            <Area
              type="monotone"
              dataKey="load"
              stroke={topColor}
              strokeWidth={2}
              fill="url(#loadGradient)"
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
              style={{ filter: `drop-shadow(0 0 6px ${topColor}60)` }}
            />

            {/* Predictive dashed line */}
            <Line
              type="monotone"
              dataKey="predicted"
              stroke="url(#predictGradient)"
              strokeWidth={1.5}
              strokeDasharray="5 4"
              dot={false}
              connectNulls={true}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
