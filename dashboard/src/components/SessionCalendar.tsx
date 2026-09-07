import { useEffect, useMemo, useState } from "react";

const BACKEND = "http://127.0.0.1:8000";

interface DayCell {
  date: string;
  sessionCount: number;
  avgLoad: number;
  flowFraction: number;
  sessionIds: string[];
  stateDistribution: Record<string, number>;
}

interface SessionRecord {
  session_id: string;
  started_at: string;
  ended_at: string | null;
  app_context: string | null;
}

interface SessionSummary {
  session_id: string;
  avg_load: number;
  flow_index: number;
  state_distribution: Record<string, number>;
}

interface SessionCalendarProps {
  userId?: string | null;
}

function formatDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getMonday(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);

  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day;

  result.setDate(result.getDate() + diff);
  return result;
}

function buildCalendarGrid(days: DayCell[]): DayCell[][] {
  const today = new Date();
  const currentMonday = getMonday(today);

  const start = new Date(currentMonday);
  start.setDate(start.getDate() - 51 * 7);

  const byDate = new Map(days.map(day => [day.date, day]));

  const weeks: DayCell[][] = [];

  for (let week = 0; week < 52; week++) {
    const currentWeek: DayCell[] = [];

    for (let day = 0; day < 7; day++) {
      const date = new Date(start);
      date.setDate(start.getDate() + week * 7 + day);

      const dateKey = formatDateKey(date);

      currentWeek.push(
        byDate.get(dateKey) ?? {
          date: dateKey,
          sessionCount: 0,
          avgLoad: 0,
          flowFraction: 0,
          sessionIds: [],
            stateDistribution: {
                minimal: 0,
                reduced: 0,
                normal: 0,
                rich: 0,
            },
        }
      );
    }

    weeks.push(currentWeek);
  }

  return weeks;
}

function loadColor(load: number): string {
  if (load <= 0) return "#1a1f2e";
  if (load <= 0.2) return "#6366f1";
  if (load <= 0.35) return "#22c55e";
  if (load <= 0.65) return "#f59e0b";
  return "#ef4444";
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function SessionCalendar({ userId }: SessionCalendarProps) {
  const [days, setDays] = useState<DayCell[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredDay, setHoveredDay] = useState<DayCell | null>(null);

  const weeks = useMemo(() => buildCalendarGrid(days), [days]);

  useEffect(() => {
    if (!userId) {
      setDays([]);
      setError(null);
      return;
    }

    let cancelled = false;

    async function loadHistory() {
      setLoading(true);
      setError(null);

      try {
        // Fetch the user's aggregate fingerprint first.
        // The fingerprint endpoint does not return session IDs,
        // so the session list is fetched separately below.
        await fetch(
            `${BACKEND}/api/analytics/users/${encodeURIComponent(
                userId!
            )}/fingerprint`
        );

        const sessionsResponse = await fetch(
            `${BACKEND}/api/sessions/user/${encodeURIComponent(userId!)}`
        );

        if (!sessionsResponse.ok) {
          throw new Error(
            `Unable to load sessions (${sessionsResponse.status})`
          );
        }

        const sessionData = await sessionsResponse.json();
        const sessions: SessionRecord[] = sessionData.sessions ?? [];

        const summaries: SessionSummary[] = [];

        for (let i = 0; i < sessions.length; i += 5) {
          const batch = sessions.slice(i, i + 5);

          const batchResults = await Promise.all(
            batch.map(async session => {
              const response = await fetch(
                `${BACKEND}/api/analytics/sessions/${encodeURIComponent(
                  session.session_id
                )}/summary`
              );

              if (!response.ok) {
                return null;
              }

              return (await response.json()) as SessionSummary;
            })
          );

          summaries.push(
            ...batchResults.filter(
              (summary): summary is SessionSummary => summary !== null
            )
          );
        }

        if (cancelled) return;

        const sessionById = new Map(
          sessions.map(session => [session.session_id, session])
        );

        const grouped = new Map<string, SessionSummary[]>();

        summaries.forEach(summary => {
          const session = sessionById.get(summary.session_id);
          if (!session) return;

          const date = new Date(session.started_at);
          const dateKey = formatDateKey(date);

          const existing = grouped.get(dateKey) ?? [];
          existing.push(summary);
          grouped.set(dateKey, existing);
        });

        const calendarDays: DayCell[] = [];

        grouped.forEach((daySummaries, date) => {
          const totalLoad = daySummaries.reduce(
            (sum, summary) => sum + summary.avg_load,
            0
          );

          const totalFlow = daySummaries.reduce(
            (sum, summary) => sum + summary.flow_index,
            0
          );

          const stateTotals = {
            minimal: 0,
            reduced: 0,
            normal: 0,
            rich: 0,
        };

            daySummaries.forEach(summary => {
                stateTotals.minimal += summary.state_distribution?.minimal ?? 0;
                stateTotals.reduced += summary.state_distribution?.reduced ?? 0;
                stateTotals.normal += summary.state_distribution?.normal ?? 0;
                stateTotals.rich += summary.state_distribution?.rich ?? 0;
            });

            const stateCount = daySummaries.length || 1;

            calendarDays.push({
                date,
                sessionCount: daySummaries.length,
                avgLoad: totalLoad / daySummaries.length,
                flowFraction: totalFlow / daySummaries.length,
                sessionIds: daySummaries.map(summary => summary.session_id),
                stateDistribution: {
                    minimal: stateTotals.minimal / stateCount,
                    reduced: stateTotals.reduced / stateCount,
                    normal: stateTotals.normal / stateCount,
                    rich: stateTotals.rich / stateCount,
                },
            });
        });

        setDays(calendarDays);
      } catch (err) {
        if (cancelled) return;

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load session history."
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadHistory();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        padding: 20,
        position: "relative",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 16,
        }}
      >
        <div>
          <h3
            style={{
              margin: 0,
              color: "#1e293b",
              fontSize: 16,
              fontWeight: 700,
            }}
          >
            Session history
          </h3>

          <p
            style={{
              margin: "4px 0 0",
              color: "#94a3b8",
              fontSize: 12,
            }}
          >
            Colour = average cognitive load
          </p>
        </div>

        {loading && (
          <div
            style={{
              width: 80,
              height: 12,
              borderRadius: 6,
              background: "#e2e8f0",
            }}
          />
        )}
      </div>

      {!userId ? (
        <div
          style={{
            minHeight: 180,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            color: "#94a3b8",
            fontSize: 13,
            opacity: 0.5,
          }}
        >
          Connect to see your history
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
      ) : days.length === 0 && !loading ? (
        <div
          style={{
            minHeight: 180,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            color: "#94a3b8",
            fontSize: 13,
          }}
        >
          No session history yet
        </div>
      ) : (
        <>
          <div
            style={{
              display: "flex",
              gap: 2,
              overflowX: "auto",
              paddingBottom: 8,
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateRows: "repeat(7, 14px)",
                gap: 2,
                marginRight: 6,
              }}
            >
              {["Mon", "", "Wed", "", "Fri", "", "Sun"].map((label, i) => (
                <div
                  key={i}
                  style={{
                    height: 14,
                    fontSize: 9,
                    color: "#94a3b8",
                    lineHeight: "14px",
                  }}
                >
                  {label}
                </div>
              ))}
            </div>

            <div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(52, 14px)",
                  gap: 2,
                  marginBottom: 5,
                  height: 12,
                }}
              >
                {weeks.map((week, index) => {
                  const firstDate = new Date(`${week[0].date}T00:00:00`);

                  return (
                    <div
                      key={index}
                      style={{
                        fontSize: 9,
                        color: "#94a3b8",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {firstDate.getDate() <= 7
                        ? firstDate.toLocaleString("en", {
                            month: "short",
                          })
                        : ""}
                    </div>
                  );
                })}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(52, 14px)",
                  gridTemplateRows: "repeat(7, 14px)",
                  gridAutoFlow: "column",
                  gap: 2,
                }}
              >
                {weeks.flatMap(week =>
                  week.map(day => (
                    <div
                      key={day.date}
                      onMouseEnter={() => setHoveredDay(day)}
                      onMouseLeave={() => setHoveredDay(null)}
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: 2,
                        background: loadColor(day.avgLoad),
                        cursor: "default",
                      }}
                      title={`${day.date}: ${day.sessionCount} session${
                        day.sessionCount === 1 ? "" : "s"
                      }`}
                    />
                  ))
                )}
              </div>
            </div>
          </div>

          {hoveredDay && (
            <div
              style={{
                position: "absolute",
                zIndex: 10,
                right: 20,
                top: 70,
                width: 220,
                background: "#0f172a",
                color: "#fff",
                borderRadius: 8,
                padding: 12,
                boxShadow: "0 8px 24px rgba(15, 23, 42, 0.2)",
                pointerEvents: "none",
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  marginBottom: 8,
                }}
              >
                {hoveredDay.date}
              </div>

              <div style={{ fontSize: 11, color: "#cbd5e1", marginBottom: 4 }}>
                Sessions: {hoveredDay.sessionCount}
              </div>

              <div style={{ fontSize: 11, color: "#cbd5e1", marginBottom: 4 }}>
                Average load: {formatPercent(hoveredDay.avgLoad)}
              </div>

              <div style={{ fontSize: 11, color: "#cbd5e1" }}>
                Flow fraction: {formatPercent(hoveredDay.flowFraction)}
              </div>

              <div style={{ marginTop: 10 }}>
                <div
                    style={{
                        fontSize: 10,
                        color: "#94a3b8",
                        marginBottom: 5,
                    }}
                >
                    Load distribution
                </div>

                <div
                    style={{
                        display: "flex",
                        alignItems: "flex-end",
                        gap: 4,
                        height: 42,
                    }}
                >
                    {[
                        {
                            key: "minimal",
                            label: "Minimal",
                            value: hoveredDay.stateDistribution.minimal,
                            load: 0.1,
                        },
                        {
                            key: "reduced",
                            label: "Reduced",
                            value: hoveredDay.stateDistribution.reduced,
                            load: 0.275,
                        },
                        {
                            key: "normal",
                            label: "Normal",
                            value: hoveredDay.stateDistribution.normal,
                            load: 0.5,
                        },
                        {
                            key: "rich",
                            label: "Rich",
                            value: hoveredDay.stateDistribution.rich,
                            load: 0.8,
                        },
                    ].map(state => (
                        <div
                            key={state.key}
                            style={{
                                flex: 1,
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                gap: 3,
                            }}
                            title={`${state.label}: ${formatPercent(state.value)}`}
                        >
                            <div
                                style={{
                                    width: "100%",
                                    height: Math.max(3, Math.round(state.value * 32)),
                                    background: loadColor(state.load),
                                    borderRadius: 2,
                                }}
                            />

                            <span
                                style={{
                                    fontSize: 8,
                                    color: "#94a3b8",
                                }}
                            >
                                {state.label[0]}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
            </div>
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: 5,
              marginTop: 12,
              fontSize: 10,
              color: "#94a3b8",
            }}
          >
            <span>Less</span>

            {[0, 0.2, 0.35, 0.65, 1].map((level, index) => (
              <div
                key={index}
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 2,
                  background: loadColor(level),
                }}
              />
            ))}

            <span>More</span>
          </div>
        </>
      )}
    </div>
  );
}