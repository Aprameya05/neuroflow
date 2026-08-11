/**
 * SessionReplayPlayer — scrub through a recorded session's cognitive load timeline.
 *
 * Supports two data sources:
 *   1. Live session data already in memory (passed as `estimates` prop).
 *   2. A fetched session from the API by session ID.
 *
 * The player renders as a modal overlay. A scrubber moves through time,
 * replaying load values with the gauge and minimap updating live.
 */
import { useState, useEffect, useRef, useCallback, type CSSProperties } from "react";
import type { LoadEstimate } from "../types";
import { loadColor, loadColorRgba } from "../utils/colors";

interface Props {
  estimates: LoadEstimate[];
  onClose: () => void;
}

type PlayState = "idle" | "playing" | "paused" | "done";

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m.toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}

function MiniTimeline({ estimates, cursor }: { estimates: LoadEstimate[]; cursor: number }) {
  if (estimates.length === 0) return null;
  const w = 480, h = 60;
  const maxT = estimates[estimates.length - 1].ts - estimates[0].ts || 1;

  const points = estimates.map((e, i) => {
    const x = ((e.ts - estimates[0].ts) / maxT) * w;
    const y = h - e.load * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  const cursorX = ((estimates[cursor]?.ts ?? estimates[0].ts) - estimates[0].ts) / maxT * w;

  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      {/* Zone fills */}
      <rect x={0} y={0}               width={w} height={h * 0.35} fill="rgba(239,68,68,0.04)" />
      <rect x={0} y={h * 0.35}        width={w} height={h * 0.30} fill="rgba(245,158,11,0.04)" />
      <rect x={0} y={h * 0.65}        width={w} height={h * 0.35} fill="rgba(52,211,153,0.04)" />

      {/* Load polyline */}
      <polyline points={points} fill="none" stroke="rgba(148,163,184,0.4)" strokeWidth={1.5} />

      {/* Playhead */}
      <line x1={cursorX} y1={0} x2={cursorX} y2={h}
        stroke="#6366f1" strokeWidth={2}
        style={{ filter: "drop-shadow(0 0 4px #6366f1)" }} />
      <circle cx={cursorX}
        cy={h - (estimates[cursor]?.load ?? 0) * h}
        r={4} fill="#6366f1"
        style={{ filter: "drop-shadow(0 0 6px #6366f1)" }} />
    </svg>
  );
}

export function SessionReplayPlayer({ estimates, onClose }: Props) {
  const [cursor, setCursor] = useState(0);
  const [playState, setPlayState] = useState<PlayState>("idle");
  const [speed, setSpeed] = useState(4); // playback speed multiplier
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const current = estimates[cursor];
  const cl = current?.load ?? 0;
  const clColor = loadColor(cl);
  const totalDuration = estimates.length > 1
    ? estimates[estimates.length - 1].ts - estimates[0].ts
    : 0;
  const elapsed = current && estimates[0]
    ? current.ts - estimates[0].ts
    : 0;

  const stop = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
  }, []);

  const play = useCallback(() => {
    stop();
    setPlayState("playing");
    intervalRef.current = setInterval(() => {
      setCursor(prev => {
        if (prev >= estimates.length - 1) {
          stop();
          setPlayState("done");
          return prev;
        }
        return prev + 1;
      });
    }, Math.max(16, 300 / speed));
  }, [estimates.length, speed, stop]);

  const pause = useCallback(() => {
    stop();
    setPlayState("paused");
  }, [stop]);

  const reset = useCallback(() => {
    stop();
    setCursor(0);
    setPlayState("idle");
  }, [stop]);

  // Restart play when speed changes mid-play
  useEffect(() => {
    if (playState === "playing") play();
  }, [speed]); // eslint-disable-line

  useEffect(() => () => stop(), [stop]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === " ") { e.preventDefault(); playState === "playing" ? pause() : play(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, play, pause, playState]);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 500,
      background: "rgba(4,6,10,0.85)",
      backdropFilter: "blur(16px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      animation: "slide-in 0.25s cubic-bezier(0.16,1,0.3,1) both",
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "#080b12",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 20,
        padding: 28,
        width: 580,
        maxWidth: "95vw",
        boxShadow: `0 24px 80px rgba(0,0,0,0.7), 0 0 0 1px ${clColor}20`,
        transition: "box-shadow 0.5s ease",
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div>
            <div style={{
              fontSize: 10, fontWeight: 700, color: "#475569",
              textTransform: "uppercase", letterSpacing: "0.12em",
              fontFamily: "'JetBrains Mono', monospace", marginBottom: 4,
            }}>
              Session Replay
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#94a3b8" }}>
              {estimates.length} estimates &middot; {formatMs(totalDuration)} total
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 8, padding: "6px 12px",
            color: "#475569", cursor: "pointer", fontSize: 12,
          }}>
            ESC
          </button>
        </div>

        {/* Big load display */}
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{
            fontSize: 64, fontWeight: 900,
            color: clColor,
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: "-0.04em",
            textShadow: `0 0 40px ${loadColorRgba(cl, 0.5)}`,
            transition: "color 0.3s ease, text-shadow 0.3s ease",
            lineHeight: 1,
          }}>
            {Math.round(cl * 100)}
            <span style={{ fontSize: 28, opacity: 0.5 }}>%</span>
          </div>
          <div style={{
            fontSize: 11, color: "#475569", marginTop: 6,
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            {current?.dominant?.replace(/_/g, " ") ?? "—"} &nbsp;&middot;&nbsp; conf {Math.round((current?.confidence ?? 0) * 100)}%
          </div>
        </div>

        {/* Mini timeline + scrubber */}
        <div style={{
          background: "rgba(4,6,10,0.6)",
          border: "1px solid rgba(255,255,255,0.05)",
          borderRadius: 10, padding: 12, marginBottom: 16,
        }}>
          <MiniTimeline estimates={estimates} cursor={cursor} />
          <input
            type="range"
            min={0} max={Math.max(0, estimates.length - 1)}
            value={cursor}
            onChange={e => { pause(); setCursor(Number(e.target.value)); }}
            style={{ width: "100%", marginTop: 8, accentColor: "#6366f1" }}
          />
          <div style={{
            display: "flex", justifyContent: "space-between",
            fontSize: 10, color: "#334155",
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            <span>{formatMs(elapsed)}</span>
            <span>
              {cursor + 1} / {estimates.length}
            </span>
            <span>{formatMs(totalDuration)}</span>
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center" }}>
          <button onClick={reset} style={btnStyle("#334155")}>⟨⟨</button>

          {playState === "playing" ? (
            <button onClick={pause} style={btnStyle("#6366f1", true)}>⏸ Pause</button>
          ) : (
            <button onClick={play} disabled={estimates.length === 0} style={btnStyle("#6366f1", true)}>
              {playState === "done" ? "↺ Replay" : "▶ Play"}
            </button>
          )}

          {/* Speed selector */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 8 }}>
            {[1, 2, 4, 8].map(s => (
              <button key={s} onClick={() => setSpeed(s)} style={{
                padding: "5px 10px",
                background: speed === s ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.04)",
                border: speed === s ? "1px solid rgba(99,102,241,0.4)" : "1px solid rgba(255,255,255,0.06)",
                borderRadius: 6, color: speed === s ? "#a5b4fc" : "#475569",
                cursor: "pointer", fontSize: 11,
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {s}x
              </button>
            ))}
          </div>
        </div>

        {/* Hint */}
        <div style={{ textAlign: "center", marginTop: 14, fontSize: 10, color: "#1e293b",
          fontFamily: "'JetBrains Mono', monospace" }}>
          Space to play/pause &nbsp;·&nbsp; Drag scrubber to jump &nbsp;·&nbsp; Esc to close
        </div>
      </div>
    </div>
  );
}

function btnStyle(color: string, primary = false): CSSProperties {
  return {
    padding: primary ? "8px 20px" : "8px 12px",
    background: primary ? `${color}22` : "rgba(255,255,255,0.04)",
    border: `1px solid ${primary ? color + "50" : "rgba(255,255,255,0.07)"}`,
    borderRadius: 8,
    color: primary ? "#a5b4fc" : "#475569",
    cursor: "pointer",
    fontSize: 13,
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: primary ? 600 : 400,
    letterSpacing: primary ? "0.03em" : 0,
  };
}
