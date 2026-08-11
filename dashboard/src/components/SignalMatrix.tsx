/**
 * SignalMatrix — real-time heatmap of signal dominance over time.
 * Rows = 9 behavioral signals. Columns = time buckets (last 30 windows).
 * Cell intensity = how dominant that signal was in that window.
 */
import type { LoadEstimate } from "../types";

const SIGNALS = [
  { key: "keystroke_iki_ms",        short: "KST", label: "Keystroke" },
  { key: "error_rate",              short: "ERR", label: "Error rate" },
  { key: "mouse_velocity",          short: "MVL", label: "Mouse spd" },
  { key: "mouse_acceleration",      short: "MAC", label: "Mouse jitter" },
  { key: "mouse_direction_changes", short: "MDC", label: "Direction" },
  { key: "pause_duration_ms",       short: "PSE", label: "Pauses" },
  { key: "scroll_velocity",         short: "SCR", label: "Scroll" },
  { key: "tab_switches",            short: "TAB", label: "Tab switch" },
  { key: "copy_paste_count",        short: "CPY", label: "Copy-paste" },
];

const COLS = 30;    // time buckets shown
const BUCKET = 5;   // estimates per bucket

interface Props {
  estimates: LoadEstimate[];
}

export function SignalMatrix({ estimates }: Props) {
  // Bucket the last COLS*BUCKET estimates into COLS windows
  const slice = estimates.slice(-(COLS * BUCKET));
  const buckets: LoadEstimate[][] = [];
  for (let i = 0; i < COLS; i++) {
    buckets.push(slice.slice(i * BUCKET, (i + 1) * BUCKET));
  }

  // For each bucket, count how often each signal was dominant
  const matrix: number[][] = SIGNALS.map(sig =>
    buckets.map(bucket => {
      if (bucket.length === 0) return 0;
      const count = bucket.filter(e => e.dominant === sig.key).length;
      return count / bucket.length;
    })
  );

  const cellW = 12;
  const cellH = 16;
  const labelW = 62;
  const gap = 2;
  const totalW = labelW + COLS * (cellW + gap);
  const totalH = SIGNALS.length * (cellH + gap);

  const hasData = estimates.length > 0;

  return (
    <div>
      {!hasData ? (
        <div style={{ height: totalH, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ color: "#334155", fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
            waiting for data…
          </span>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: gap, width: totalW }}>
            {/* Column time labels (every 5 columns) */}
            <div style={{ display: "flex", marginLeft: labelW + gap }}>
              {buckets.map((bucket, i) => (
                <div key={i} style={{ width: cellW, marginRight: gap, flexShrink: 0 }}>
                  {i % 10 === 0 && bucket.length > 0 ? (
                    <div style={{
                      fontSize: 7, color: "#334155",
                      fontFamily: "'JetBrains Mono', monospace",
                      transform: "rotate(-45deg)",
                      transformOrigin: "left",
                      whiteSpace: "nowrap",
                      marginLeft: 2,
                    }}>
                      {new Date(bucket[0]?.ts ?? 0).toLocaleTimeString("en", { hour12: false, second: "2-digit" }).slice(3)}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            {/* Signal rows */}
            {SIGNALS.map((sig, sIdx) => (
              <div key={sig.key} style={{ display: "flex", alignItems: "center", gap }}>
                {/* Label */}
                <div style={{
                  width: labelW, fontSize: 10, color: "#475569",
                  fontFamily: "'JetBrains Mono', monospace",
                  flexShrink: 0, textAlign: "right", paddingRight: 8,
                  lineHeight: `${cellH}px`,
                }}>
                  {sig.label}
                </div>

                {/* Cells */}
                {buckets.map((bucket, bIdx) => {
                  const intensity = matrix[sIdx][bIdx];
                  const opacity = intensity === 0 ? 0.04 : 0.15 + intensity * 0.85;
                  const isDominant = intensity >= 0.6;

                  return (
                    <div
                      key={bIdx}
                      title={`${sig.label}: ${Math.round(intensity * 100)}% dominant`}
                      style={{
                        width: cellW, height: cellH,
                        borderRadius: 3,
                        background: isDominant
                          ? `rgba(99,102,241,${opacity})`
                          : intensity > 0
                          ? `rgba(148,163,184,${opacity})`
                          : "rgba(255,255,255,0.03)",
                        boxShadow: isDominant ? "0 0 6px rgba(99,102,241,0.5)" : "none",
                        flexShrink: 0,
                        transition: "background 0.3s ease, box-shadow 0.3s ease",
                        cursor: "default",
                      }}
                    />
                  );
                })}
              </div>
            ))}

            {/* Bottom axis label */}
            <div style={{
              marginLeft: labelW + gap,
              fontSize: 9, color: "#1e293b",
              fontFamily: "'JetBrains Mono', monospace",
              marginTop: 2,
            }}>
              ← older · · · · · · · · · · · · · · · · · · · · · · · · · · · newer →
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
