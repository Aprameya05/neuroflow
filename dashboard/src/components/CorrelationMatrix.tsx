import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const BACKEND = "http://127.0.0.1:8000";

interface Correlation {
  signal: string;
  pearson_r: number;
  dominance_rate: number;
  n_dominant: number;
}

interface CorrelationResponse {
  session_id: string;
  n_estimates: number;
  correlations: Correlation[];
  top_signal: string | null;
}

interface CorrelationMatrixProps {
  sessionId: string;
}

function correlationColor(value: number): string {

  if (value > 0.4) return "#ef4444";
  if (value > 0.15) return "#f59e0b";
  if (value >= -0.15) return "#64748b";
  return "#22c55e";
}

function correlationLabel(value: number): string {
  if (value > 0.4) return "Strong positive";
  if (value > 0.15) return "Moderate positive";
  if (value >= -0.15) return "Weak / neutral";
  return "Negative";
}

function formatSignal(signal: string): string {
  return signal
    .replace(/_/g, " ")
    .replace(/\b\w/g, character => character.toUpperCase());
}

export function CorrelationMatrix({
  sessionId,
}: CorrelationMatrixProps) {
  const [data, setData] = useState<CorrelationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setData(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadCorrelations() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `${BACKEND}/api/analytics/sessions/${encodeURIComponent(
            sessionId
          )}/correlations`
        );

        if (!response.ok) {
          throw new Error(
            `Unable to load correlations (${response.status})`
          );
        }

        const result = (await response.json()) as CorrelationResponse;

        if (!cancelled) {
          setData(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load signal correlations."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadCorrelations();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const chartData = useMemo(() => {
  if (!data) return [];

  return data.correlations.map(correlation => ({
    signal: formatSignal(correlation.signal),
    correlation: correlation.pearson_r,
    magnitude: Math.abs(correlation.pearson_r),
    rawSignal: correlation.signal,
  }));
}, [data]);

  const summary = useMemo(() => {
    if (!data || data.correlations.length === 0) {
      return "There is not enough signal data to determine meaningful correlations for this session.";
    }

    const strongestPositive = [...data.correlations]
      .filter(item => item.pearson_r > 0)
      .sort((a, b) => b.pearson_r - a.pearson_r)[0];

    const strongestNegative = [...data.correlations]
      .filter(item => item.pearson_r < 0)
      .sort((a, b) => a.pearson_r - b.pearson_r)[0];

    if (strongestPositive && strongestNegative) {
      return `The strongest positive relationship is between cognitive load and ${formatSignal(
        strongestPositive.signal
      )} (r = ${strongestPositive.pearson_r.toFixed(
        2
      )}), while ${formatSignal(
        strongestNegative.signal
      )} shows the strongest negative relationship (r = ${strongestNegative.pearson_r.toFixed(
        2
      )}).`;
    }

    if (strongestPositive) {
      return `The strongest observed relationship is a positive correlation with ${formatSignal(
        strongestPositive.signal
      )} (r = ${strongestPositive.pearson_r.toFixed(2)}).`;
    }

    if (strongestNegative) {
      return `The strongest observed relationship is a negative correlation with ${formatSignal(
        strongestNegative.signal
      )} (r = ${strongestNegative.pearson_r.toFixed(2)}).`;
    }

    return "The signals in this session show mostly weak or neutral relationships with cognitive load.";
  }, [data]);

  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        padding: 20,
        marginTop: 20,
      }}
    >
      <div style={{ marginBottom: 18 }}>
        <h3
          style={{
            margin: 0,
            color: "#1e293b",
            fontSize: 16,
            fontWeight: 700,
          }}
        >
          Signal correlation matrix
        </h3>

        <p
          style={{
            margin: "5px 0 0",
            color: "#94a3b8",
            fontSize: 12,
          }}
        >
          How strongly each behavioural signal relates to cognitive load.
        </p>
      </div>

      {loading ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            minHeight: 240,
          }}
        >
          {[80, 65, 90, 55, 75].map((width, index) => (
            <div
              key={index}
              style={{
                height: 18,
                width: `${width}%`,
                borderRadius: 4,
                background: "#e2e8f0",
              }}
            />
          ))}
        </div>
      ) : error ? (
        <div
          style={{
            padding: "24px 12px",
            textAlign: "center",
            color: "#ef4444",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      ) : !data || data.correlations.length === 0 ? (
        <div
          style={{
            padding: "32px 12px",
            textAlign: "center",
            color: "#94a3b8",
            fontSize: 13,
          }}
        >
          Not enough signal data for correlation analysis.
        </div>
      ) : (
        <>
          <div
            style={{
              width: "100%",
              height: Math.max(220, data.correlations.length * 42),
            }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{
                  top: 5,
                  right: 24,
                  left: 20,
                  bottom: 5,
                }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  horizontal={false}
                />

                <XAxis
                  type="number"
                  domain={[0, 1]}
                  tick={{ fontSize: 10, fill: "#94a3b8" }}
                  tickFormatter={value => Number(value).toFixed(1)}
                />

                <YAxis
                  type="category"
                  dataKey="signal"
                  width={100}
                  tick={{
                    fontSize: 10,
                    fill: "#475569",
                  }}
                />

                <Tooltip
                    formatter={(_value: number, _name: string, item: any) => [
                        item?.payload?.correlation?.toFixed(2) ?? "—",
                        "Pearson r",
                    ]}
                    labelFormatter={label => String(label)}
                />

                <Bar
                    dataKey="magnitude"
                    radius={[3, 3, 3, 3]}
                    maxBarSize={22}
                >
                    {chartData.map((entry, index) => (
                        <Cell
                            key={`cell-${index}`}
                            fill={correlationColor(entry.correlation)}
                        />
                    ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div
            style={{
              marginTop: 12,
              padding: "10px 12px",
              borderRadius: 8,
              background: "#f8fafc",
              color: "#475569",
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            {summary}
          </div>

          <div
            style={{
              marginTop: 18,
              overflowX: "auto",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 11,
              }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "8px 6px",
                      color: "#64748b",
                      borderBottom: "1px solid #e2e8f0",
                    }}
                  >
                    Signal
                  </th>

                  <th
                    style={{
                      textAlign: "right",
                      padding: "8px 6px",
                      color: "#64748b",
                      borderBottom: "1px solid #e2e8f0",
                    }}
                  >
                    Pearson r
                  </th>

                  <th
                    style={{
                      textAlign: "right",
                      padding: "8px 6px",
                      color: "#64748b",
                      borderBottom: "1px solid #e2e8f0",
                    }}
                  >
                    Dominance
                  </th>

                  <th
                    style={{
                      textAlign: "right",
                      padding: "8px 6px",
                      color: "#64748b",
                      borderBottom: "1px solid #e2e8f0",
                    }}
                  >
                    Samples
                  </th>

                  <th
                    style={{
                      textAlign: "left",
                      padding: "8px 6px",
                      color: "#64748b",
                      borderBottom: "1px solid #e2e8f0",
                    }}
                  >
                    Relationship
                  </th>
                </tr>
              </thead>

              <tbody>
                {data.correlations.map(correlation => (
                  <tr key={correlation.signal}>
                    <td
                      style={{
                        padding: "8px 6px",
                        color: "#334155",
                        fontWeight: 600,
                        borderBottom: "1px solid #f1f5f9",
                      }}
                    >
                      {formatSignal(correlation.signal)}
                    </td>

                    <td
                      style={{
                        padding: "8px 6px",
                        textAlign: "right",
                        color: correlationColor(
                          correlation.pearson_r
                        ),
                        fontWeight: 700,
                        borderBottom: "1px solid #f1f5f9",
                      }}
                    >
                      {correlation.pearson_r.toFixed(2)}
                    </td>

                    <td
                      style={{
                        padding: "8px 6px",
                        textAlign: "right",
                        color: "#475569",
                        borderBottom: "1px solid #f1f5f9",
                      }}
                    >
                      {Math.round(
                        correlation.dominance_rate * 100
                      )}
                      %
                    </td>

                    <td
                      style={{
                        padding: "8px 6px",
                        textAlign: "right",
                        color: "#475569",
                        borderBottom: "1px solid #f1f5f9",
                      }}
                    >
                      {correlation.n_dominant}
                    </td>

                    <td
                      style={{
                        padding: "8px 6px",
                        color: correlationColor(
                          correlation.pearson_r
                        ),
                        borderBottom: "1px solid #f1f5f9",
                      }}
                    >
                      {correlationLabel(correlation.pearson_r)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div
            style={{
              marginTop: 12,
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              fontSize: 10,
              color: "#64748b",
            }}
          >
            <span>
              <strong style={{ color: "#ef4444" }}>Red</strong> &gt;
              0.40
            </span>
            <span>
              <strong style={{ color: "#f59e0b" }}>Amber</strong> 0.15
              – 0.40
            </span>
            <span>
              <strong style={{ color: "#64748b" }}>Slate</strong> −0.15
              – 0.15
            </span>
            <span>
              <strong style={{ color: "#22c55e" }}>Green</strong> &lt;
              −0.15
            </span>
          </div>
        </>
      )}
    </div>
  );
}