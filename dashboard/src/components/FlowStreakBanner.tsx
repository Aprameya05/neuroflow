/**
 * FlowStreakBanner — tracks consecutive flow-state estimates and fires an
 * animated celebration banner at streak milestones (10 / 25 / 50 / 100).
 *
 * Flow = load < 0.35 (Rich + Normal UI states).
 * Banner auto-dismisses after 4 seconds.
 */
import { useEffect, useRef, useState } from "react";
import type { LoadEstimate } from "../types";

interface Props {
  estimates: LoadEstimate[];
}

const MILESTONES = [10, 25, 50, 100];

const MILESTONE_TEXT: Record<number, { label: string; sub: string; color: string }> = {
  10:  { label: "In The Zone",     sub: "10 consecutive flow estimates",   color: "#34d399" },
  25:  { label: "Deep Focus",      sub: "25 estimates in flow state",       color: "#60a5fa" },
  50:  { label: "Hyperfocus",      sub: "50-estimate flow streak",          color: "#a78bfa" },
  100: { label: "Legendary Flow",  sub: "100-estimate streak — incredible", color: "#f59e0b" },
};

function computeStreak(estimates: LoadEstimate[]): number {
  let streak = 0;
  for (let i = estimates.length - 1; i >= 0; i--) {
    if (estimates[i].load < 0.35) streak++;
    else break;
  }
  return streak;
}

export function FlowStreakBanner({ estimates }: Props) {
  const streak = computeStreak(estimates);
  const prevStreak = useRef(0);
  const [banner, setBanner] = useState<{ milestone: number; visible: boolean } | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Fire when we hit a milestone we haven't celebrated yet
    const prev = prevStreak.current;
    prevStreak.current = streak;

    for (const m of MILESTONES) {
      if (streak >= m && prev < m) {
        setBanner({ milestone: m, visible: true });
        if (dismissTimer.current) clearTimeout(dismissTimer.current);
        dismissTimer.current = setTimeout(() => {
          setBanner(b => b ? { ...b, visible: false } : null);
        }, 4000);
        break;
      }
    }
  }, [streak]);

  // Real-time streak counter strip (always visible when in flow)
  const inFlow = streak > 0;
  const meta = banner ? MILESTONE_TEXT[banner.milestone] : null;

  return (
    <>
      {/* Persistent streak counter */}
      {inFlow && (
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 7,
          background: "rgba(52,211,153,0.08)",
          border: "1px solid rgba(52,211,153,0.2)",
          borderRadius: 20, padding: "5px 12px",
          fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
          color: "#34d399",
          transition: "all 0.4s ease",
        }}>
          <div style={{
            width: 6, height: 6, borderRadius: "50%",
            background: "#34d399",
            boxShadow: "0 0 8px #34d399",
            animation: "pulse-ring 1.5s infinite",
          }} />
          FLOW STREAK {streak}
        </div>
      )}

      {/* Milestone celebration banner */}
      {banner && meta && (
        <div style={{
          position: "fixed",
          top: 72, left: "50%",
          transform: "translateX(-50%)",
          zIndex: 999,
          animation: banner.visible ? "slide-in 0.35s cubic-bezier(0.16,1,0.3,1) both" : "none",
          opacity: banner.visible ? 1 : 0,
          transition: "opacity 0.6s ease",
          pointerEvents: "none",
        }}>
          <div style={{
            background: "rgba(8,11,18,0.96)",
            border: `1px solid ${meta.color}40`,
            borderRadius: 14,
            padding: "14px 24px",
            display: "flex", alignItems: "center", gap: 16,
            backdropFilter: "blur(20px)",
            boxShadow: `0 8px 40px ${meta.color}20, 0 0 0 1px ${meta.color}20`,
            minWidth: 300,
          }}>
            {/* Glow ring */}
            <div style={{
              width: 40, height: 40, borderRadius: "50%",
              background: `${meta.color}15`,
              border: `2px solid ${meta.color}60`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18,
              flexShrink: 0,
              boxShadow: `0 0 16px ${meta.color}50`,
            }}>
              {banner.milestone >= 100 ? "🔥" : banner.milestone >= 50 ? "⚡" : banner.milestone >= 25 ? "✦" : "◆"}
            </div>
            <div>
              <div style={{
                fontSize: 13, fontWeight: 700, color: meta.color,
                letterSpacing: "0.02em", marginBottom: 3,
                textShadow: `0 0 12px ${meta.color}80`,
              }}>
                {meta.label}
              </div>
              <div style={{ fontSize: 11, color: "#475569", fontFamily: "'JetBrains Mono', monospace" }}>
                {meta.sub}
              </div>
            </div>
            {/* Streak count badge */}
            <div style={{
              marginLeft: "auto",
              fontSize: 28, fontWeight: 800,
              color: meta.color,
              fontFamily: "'JetBrains Mono', monospace",
              textShadow: `0 0 20px ${meta.color}`,
              flexShrink: 0,
            }}>
              {banner.milestone}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
