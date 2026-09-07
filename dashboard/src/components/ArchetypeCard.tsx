import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

export type ArchetypeName =
  | "Sprinter"
  | "Marathon"
  | "Deep-worker"
  | "Reactive";

export interface ArchetypeFeatures {
  avg_load: number;
  peak_load: number;
  volatility: number;
  flow_index: number;
  peak_count_per_session: number;
}

export interface ArchetypeResult {
  name: ArchetypeName;
  confidence: number;
  features: ArchetypeFeatures;
  centroid: ArchetypeFeatures;
  distance: number;
  leastLike: ArchetypeName;
}

interface ArchetypeDefinition {
  name: ArchetypeName;
  icon: string;
  description: string;
  signals: string;
  strategy: string;
  centroid: ArchetypeFeatures;
}

const ARCHETYPES: ArchetypeDefinition[] = [
  {
    name: "Sprinter",
    icon: "⚡",
    description:
      "High-intensity bursts of cognitive effort followed by recovery.",
    signals:
      "High peak load, high volatility, frequent overload peaks.",
    strategy:
      "Work in focused bursts and use short recovery periods between demanding tasks.",
    centroid: {
      avg_load: 0.45,
      peak_load: 0.75,
      volatility: 0.75,
      flow_index: 0.45,
      peak_count_per_session: 0.75,
    },
  },
  {
    name: "Marathon",
    icon: "◷",
    description:
      "Sustained cognitive effort with relatively stable load over time.",
    signals:
      "Moderate-to-high average load, moderate peaks, low volatility.",
    strategy:
      "Maintain a steady working rhythm and schedule longer uninterrupted sessions.",
    centroid: {
      avg_load: 0.75,
      peak_load: 0.75,
      volatility: 0.20,
      flow_index: 0.45,
      peak_count_per_session: 0.45,
    },
  },
  {
    name: "Deep-worker",
    icon: "◉",
    description:
      "Low-distraction sessions with strong flow and controlled cognitive demand.",
    signals:
      "High flow index, moderate load, low volatility and few overload peaks.",
    strategy:
      "Protect uninterrupted focus blocks and minimize context switching.",
    centroid: {
      avg_load: 0.45,
      peak_load: 0.45,
      volatility: 0.20,
      flow_index: 0.75,
      peak_count_per_session: 0.20,
    },
  },
  {
    name: "Reactive",
    icon: "↯",
    description:
      "Variable cognitive demand shaped by frequent interruptions and context changes.",
    signals:
      "High volatility, frequent peaks, and lower sustained flow.",
    strategy:
      "Reduce interruptions, batch context switches, and create predictable work blocks.",
    centroid: {
      avg_load: 0.45,
      peak_load: 0.75,
      volatility: 0.75,
      flow_index: 0.20,
      peak_count_per_session: 0.75,
    },
  },
];

const FEATURE_KEYS: Array<keyof ArchetypeFeatures> = [
  "avg_load",
  "peak_load",
  "volatility",
  "flow_index",
  "peak_count_per_session",
];

const FEATURE_LABELS: Record<keyof ArchetypeFeatures, string> = {
  avg_load: "Avg load",
  peak_load: "Peak load",
  volatility: "Volatility",
  flow_index: "Flow",
  peak_count_per_session: "Peak freq.",
};

function distance(
  a: ArchetypeFeatures,
  b: ArchetypeFeatures,
): number {
  return Math.sqrt(
    FEATURE_KEYS.reduce((sum, key) => {
      const difference = a[key] - b[key];
      return sum + difference * difference;
    }, 0),
  );
}

function normaliseFeature(
  value: number,
  key: keyof ArchetypeFeatures,
): number {
  const values = ARCHETYPES.map((archetype) => archetype.centroid[key]);
  const min = Math.min(...values);
  const max = Math.max(...values);

  if (max === min) return 0.5;

  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

export function classifyArchetype(
  features: ArchetypeFeatures
): ArchetypeResult {
  const featureKeys: (keyof ArchetypeFeatures)[] = [
    "avg_load",
    "peak_load",
    "volatility",
    "flow_index",
    "peak_count_per_session",
  ];

  // Normalize each feature to 0–1 using the range
  // represented by the four archetype centroids.
  const ranges = Object.fromEntries(
    featureKeys.map((key) => {
      const values = ARCHETYPES.map((archetype) => archetype.centroid[key]);
      return [
        key,
        {
          min: Math.min(...values),
          max: Math.max(...values),
        },
      ];
    })
  ) as Record<
    keyof ArchetypeFeatures,
    { min: number; max: number }
  >;

  const normalize = (key: keyof ArchetypeFeatures, value: number) => {
    const { min, max } = ranges[key];

    if (max === min) return 0;

    return Math.max(0, Math.min(1, (value - min) / (max - min)));
  };

  const distances = ARCHETYPES.map((archetype) => {
    const distance = Math.sqrt(
      featureKeys.reduce((sum, key) => {
        const userValue = normalize(key, features[key]);
        const centroidValue = normalize(key, archetype.centroid[key]);

        return sum + Math.pow(userValue - centroidValue, 2);
      }, 0)
    );

    return {
      archetype,
      distance,
    };
  });

  distances.sort((a, b) => a.distance - b.distance);

  const closest = distances[0];
  const furthest = distances[distances.length - 1];

  const maxDistance = Math.max(furthest.distance, 0.0001);

  return {
    name: closest.archetype.name,
    centroid: closest.archetype.centroid,
    distance: closest.distance,
    confidence: Math.max(
      0,
      Math.min(1, 1 - closest.distance / maxDistance)
    ),
    leastLike: furthest.archetype.name,
    features,
  };
}

function radarData(
  features: ArchetypeFeatures,
  centroid: ArchetypeFeatures,
) {
  return FEATURE_KEYS.map((key) => ({
    feature: FEATURE_LABELS[key],
    User: normaliseFeature(features[key], key),
    Archetype: normaliseFeature(centroid[key], key),
  }));
}

interface Props {
  result: ArchetypeResult;
  dimmed?: boolean;
  isSelected?: boolean;
}

export function ArchetypeCard({
  result,
  dimmed = false,
  isSelected = false,
}: Props) {
  const definition = ARCHETYPES.find(
    (archetype) => archetype.name === result.name,
  ) ?? ARCHETYPES[0];

  const confidence = Math.round(result.confidence * 100);

  return (
    <div
      style={{
        position: "relative",
        padding: 20,
        minHeight: 390,
        borderRadius: 14,
        background: "rgba(10,13,20,0.85)",
        border: isSelected
            ? "1px solid rgba(99,102,241,0.4)"
            : "1px solid rgba(255,255,255,0.07)",
        opacity: dimmed ? 0.38 : 1,
        transition: "all 0.25s ease",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 4,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(99,102,241,0.1)",
              border: "1px solid rgba(99,102,241,0.2)",
              fontSize: 17,
            }}
          >
            {definition.icon}
          </div>

          <div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "#f8fafc",
              }}
            >
              {definition.name}
            </div>

            <div
              style={{
                fontSize: 9,
                color: "#475569",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              Behavioural archetype
            </div>
          </div>
        </div>

        {isSelected && (
          <div
            style={{
              padding: "4px 8px",
              borderRadius: 6,
              background: "rgba(99,102,241,0.12)",
              border: "1px solid rgba(99,102,241,0.2)",
              color: "#a5b4fc",
              fontSize: 9,
              fontWeight: 700,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            YOUR TYPE
          </div>
        )}
      </div>

      {/* Description */}
      <p
        style={{
          margin: "12px 0 8px",
          color: "#64748b",
          fontSize: 11,
          lineHeight: 1.55,
        }}
      >
        {definition.description}
      </p>

      {/* Radar */}
      <div style={{ width: "100%", height: 190 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={radarData(result.features, result.centroid)}>
            <PolarGrid stroke="rgba(255,255,255,0.07)" />
            <PolarAngleAxis
              dataKey="feature"
              tick={{
                fill: "#475569",
                fontSize: 8,
                fontFamily: "'JetBrains Mono', monospace",
              }}
            />
            <PolarRadiusAxis
              domain={[0, 1]}
              tick={false}
              axisLine={false}
            />
            <Radar
              name="User"
              dataKey="User"
              stroke="#6366f1"
              fill="#6366f1"
              fillOpacity={0.14}
              strokeWidth={1.5}
            />
            <Radar
              name="Archetype"
              dataKey="Archetype"
              stroke="#34d399"
              fill="#34d399"
              fillOpacity={0.05}
              strokeWidth={1}
              strokeDasharray="4 3"
            />
            <Tooltip
              contentStyle={{
                background: "#0a0d14",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8,
                fontSize: 10,
              }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Confidence */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            width: 58,
            height: 58,
            borderRadius: "50%",
            background: `conic-gradient(#6366f1 ${confidence * 3.6}deg, rgba(255,255,255,0.06) 0deg)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: "50%",
              background: "#0a0d14",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#a5b4fc",
              fontSize: 10,
              fontWeight: 700,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {confidence}%
          </div>
        </div>

        <div>
          <div
            style={{
              color: "#475569",
              fontSize: 9,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            Classification confidence
          </div>
        </div>
      </div>

      {/* Strategy */}
      <div
        style={{
          padding: 11,
          borderRadius: 9,
          background: "rgba(255,255,255,0.025)",
          border: "1px solid rgba(255,255,255,0.05)",
          marginBottom: 10,
        }}
      >
        <div
          style={{
            fontSize: 9,
            color: "#6366f1",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            fontFamily: "'JetBrains Mono', monospace",
            marginBottom: 5,
          }}
        >
          Strategy
        </div>

        <div
          style={{
            color: "#64748b",
            fontSize: 10,
            lineHeight: 1.5,
          }}
        >
          {definition.strategy}
        </div>
      </div>

      {/* Least-like */}
      <div
        style={{
          fontSize: 9,
          color: "#334155",
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        Least like:{" "}
        <span style={{ color: "#475569" }}>{result.leastLike}</span>
      </div>
    </div>
  );
}

export { ARCHETYPES };