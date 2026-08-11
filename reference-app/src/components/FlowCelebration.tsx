/**
 * FlowCelebration — fires a particle burst + ambient glow when the user
 * enters the "rich" (deep flow) UI state.
 *
 * Uses a canvas overlay with requestAnimationFrame.
 * Unmounts cleanly when the animation finishes.
 * Only triggers on state TRANSITION, not on repeated renders in the same state.
 */
import { useEffect, useRef, useState } from "react";
import type { UIState } from "../hooks/useNeuroFlow";

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  alpha: number; size: number;
  color: string;
}

const COLORS = ["#34d399", "#6ee7b7", "#a7f3d0", "#60a5fa", "#818cf8"];
const PARTICLE_COUNT = 60;

function spawnParticles(cx: number, cy: number): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.5 + Math.random() * 3.5;
    return {
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1.5,
      alpha: 0.9 + Math.random() * 0.1,
      size: 2 + Math.random() * 4,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    };
  });
}

interface Props {
  activeUIState: UIState;
}

export function FlowCelebration({ activeUIState }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number | null>(null);
  const prevState = useRef<UIState | null>(null);

  // Show ambient glow for a few seconds when entering flow
  const [showGlow, setShowGlow] = useState(false);
  const glowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (prevState.current !== null && prevState.current !== "rich" && activeUIState === "rich") {
      // Entered flow state — spawn celebration
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 3;
      particlesRef.current = spawnParticles(cx, cy);

      setShowGlow(true);
      if (glowTimer.current) clearTimeout(glowTimer.current);
      glowTimer.current = setTimeout(() => setShowGlow(false), 3500);
    }
    prevState.current = activeUIState;
  }, [activeUIState]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function animate() {
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      let alive = false;
      for (const p of particlesRef.current) {
        if (p.alpha <= 0.01) continue;
        alive = true;

        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.06; // gravity
        p.vx *= 0.99;
        p.alpha *= 0.965;

        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 8;
        ctx.shadowColor = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      if (alive) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }

    // Re-trigger animation when particles are spawned
    if (particlesRef.current.length > 0 && particlesRef.current.some(p => p.alpha > 0.01)) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [activeUIState]); // re-run when state transitions

  return (
    <>
      {/* Particle canvas */}
      <canvas
        ref={canvasRef}
        style={{
          position: "fixed", inset: 0,
          pointerEvents: "none",
          zIndex: 9998,
        }}
      />

      {/* Ambient flow glow overlay */}
      <div style={{
        position: "fixed", inset: 0,
        pointerEvents: "none",
        zIndex: 9997,
        background: "radial-gradient(ellipse at 50% 30%, rgba(52,211,153,0.06) 0%, transparent 65%)",
        opacity: showGlow ? 1 : 0,
        transition: "opacity 0.8s ease",
      }} />

      {/* "Flow state" toast */}
      {showGlow && (
        <div style={{
          position: "fixed",
          top: 80, left: "50%",
          transform: "translateX(-50%)",
          zIndex: 9999,
          background: "rgba(8,13,20,0.92)",
          border: "1px solid rgba(52,211,153,0.35)",
          borderRadius: 12,
          padding: "10px 20px",
          display: "flex", alignItems: "center", gap: 10,
          backdropFilter: "blur(12px)",
          boxShadow: "0 8px 32px rgba(52,211,153,0.15)",
          animation: "slide-in 0.3s cubic-bezier(0.16,1,0.3,1) both",
          pointerEvents: "none",
        }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%",
            background: "#34d399",
            boxShadow: "0 0 10px #34d399",
            animation: "pulse-ring 1.5s infinite",
          }} />
          <span style={{
            fontSize: 13, fontWeight: 600,
            color: "#34d399",
            fontFamily: "'Inter', sans-serif",
            letterSpacing: "0.01em",
          }}>
            Flow state detected
          </span>
          <span style={{ fontSize: 11, color: "#475569", fontFamily: "'JetBrains Mono', monospace" }}>
            UI simplified for clarity
          </span>
        </div>
      )}
    </>
  );
}
