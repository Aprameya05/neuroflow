/**
 * NBackTask -- N-back working memory calibration task.
 * Used to induce and measure known levels of cognitive load for LSTM training.
 *
 * Protocol:
 * - 1-back (easy):   remember the previous item
 * - 2-back (medium): remember the item 2 trials ago
 * - 3-back (hard):   remember the item 3 trials ago
 */
import { useState, useEffect, useRef, useCallback } from "react";

interface NBackTaskProps {
  n?: 1 | 2 | 3;
  trials?: number;
  onComplete: (result: NBackResult) => void;
}

export interface NBackResult {
  n: number;
  hits: number;
  misses: number;
  falseAlarms: number;
  correctRejections: number;
  accuracy: number;
  reactionTimes: number[];
  avgReactionTimeMs: number;
}

const LETTERS = "BCDFGHJKLMNPQRSTVWXYZ".split("");
const TRIAL_DURATION_MS = 2500;
const RESPONSE_WINDOW_MS = 2000;

function randomLetter(exclude?: string): string {
  const pool = LETTERS.filter(l => l !== exclude);
  return pool[Math.floor(Math.random() * pool.length)];
}

function generateSequence(trials: number, n: number, targetRate = 0.3): string[] {
  const seq: string[] = [];
  for (let i = 0; i < n; i++) seq.push(randomLetter(seq[seq.length - 1]));
  for (let i = n; i < trials; i++) {
    const isTarget = Math.random() < targetRate;
    seq.push(isTarget ? seq[i - n] : randomLetter(seq[i - n]));
  }
  return seq;
}

export function NBackTask({ n = 2, trials = 20, onComplete }: NBackTaskProps) {
  const [phase, setPhase] = useState<"instructions" | "running" | "done">("instructions");
  const [sequence] = useState(() => generateSequence(trials, n));
  const [currentIdx, setCurrentIdx] = useState(0);
  const [letter, setLetter] = useState<string | null>(null);
  const [responded, setResponded] = useState(false);
  const [feedback, setFeedback] = useState<"hit" | "miss" | "fa" | null>(null);

  const hits = useRef(0);
  const misses = useRef(0);
  const falseAlarms = useRef(0);
  const correctRejections = useRef(0);
  const reactionTimes = useRef<number[]>([]);
  const trialStart = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isTarget = currentIdx >= n && sequence[currentIdx] === sequence[currentIdx - n];

  const finishTrial = useCallback((responded: boolean) => {
    if (responded) {
      if (isTarget) {
        hits.current++;
        const rt = Date.now() - trialStart.current;
        reactionTimes.current.push(rt);
        setFeedback("hit");
      } else {
        falseAlarms.current++;
        setFeedback("fa");
      }
    } else {
      if (isTarget) {
        misses.current++;
        setFeedback("miss");
      } else {
        correctRejections.current++;
      }
    }

    setTimeout(() => {
      setFeedback(null);
      const next = currentIdx + 1;
      if (next >= trials) {
        const total = hits.current + misses.current + falseAlarms.current + correctRejections.current;
        const acc = total > 0 ? (hits.current + correctRejections.current) / total : 0;
        const rts = reactionTimes.current;
        onComplete({
          n,
          hits: hits.current,
          misses: misses.current,
          falseAlarms: falseAlarms.current,
          correctRejections: correctRejections.current,
          accuracy: Math.round(acc * 100) / 100,
          reactionTimes: rts,
          avgReactionTimeMs: rts.length > 0 ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length) : 0,
        });
        setPhase("done");
      } else {
        setCurrentIdx(next);
        setResponded(false);
        setLetter(sequence[next]);
        trialStart.current = Date.now();
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => finishTrial(false), RESPONSE_WINDOW_MS);
      }
    }, 400);
  }, [currentIdx, isTarget, n, trials, onComplete, sequence]);

  useEffect(() => {
    if (phase !== "running") return;
    setLetter(sequence[currentIdx]);
    trialStart.current = Date.now();
    timer.current = setTimeout(() => finishTrial(false), RESPONSE_WINDOW_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMatch = useCallback(() => {
    if (responded || phase !== "running") return;
    setResponded(true);
    if (timer.current) clearTimeout(timer.current);
    finishTrial(true);
  }, [responded, phase, finishTrial]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "Enter") handleMatch();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleMatch]);

  const feedbackColor = feedback === "hit" ? "#34d399"
    : feedback === "miss" ? "#f87171"
    : feedback === "fa" ? "#fbbf24" : "transparent";

  if (phase === "instructions") {
    return (
      <div style={{ textAlign: "center", padding: "40px 32px", maxWidth: 480, margin: "0 auto" }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🧠</div>
        <h2 style={{ margin: "0 0 12px", color: "#1e293b" }}>{n}-Back Task</h2>
        <p style={{ color: "#64748b", lineHeight: 1.6, marginBottom: 24 }}>
          A letter will appear every {TRIAL_DURATION_MS / 1000}s.
          Press <kbd style={{ background: "#f1f5f9", padding: "2px 8px", borderRadius: 4, border: "1px solid #e2e8f0" }}>Space</kbd> or
          <kbd style={{ background: "#f1f5f9", padding: "2px 8px", borderRadius: 4, border: "1px solid #e2e8f0", marginLeft: 4 }}>Enter</kbd> whenever
          the current letter matches the letter <strong>{n}</strong> step{n > 1 ? "s" : ""} ago.
        </p>
        <p style={{ fontSize: 13, color: "#94a3b8", marginBottom: 28 }}>{trials} trials total. Takes about {Math.ceil(trials * TRIAL_DURATION_MS / 60000)} minute.</p>
        <button
          onClick={() => setPhase("running")}
          style={{
            padding: "12px 32px", background: "#6366f1", color: "#fff",
            border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: "pointer",
          }}
        >
          Start {n}-back
        </button>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div style={{ textAlign: "center", padding: "40px 32px" }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>✅</div>
        <h2 style={{ color: "#1e293b" }}>Task complete</h2>
        <p style={{ color: "#64748b" }}>Results submitted for calibration.</p>
      </div>
    );
  }

  return (
    <div style={{ textAlign: "center", padding: "32px 0" }}>
      <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 24, fontFamily: "monospace" }}>
        Trial {currentIdx + 1} / {trials} · {n}-back
      </div>
      <div style={{
        width: 120, height: 120, margin: "0 auto 24px",
        background: feedback ? feedbackColor + "22" : "#f8fafc",
        border: `3px solid ${feedback ? feedbackColor : "#e2e8f0"}`,
        borderRadius: 16,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 56, fontWeight: 800, color: "#1e293b",
        fontFamily: "monospace",
        transition: "all 0.2s ease",
        boxShadow: feedback ? `0 0 24px ${feedbackColor}44` : "none",
      }}>
        {letter}
      </div>
      <p style={{ fontSize: 13, color: "#94a3b8", marginBottom: 20 }}>
        {currentIdx >= n ? `Does this match "${sequence[currentIdx - n]}"?` : "Memorising…"}
      </p>
      <button
        onClick={handleMatch}
        disabled={responded}
        style={{
          padding: "12px 40px", fontSize: 15, fontWeight: 600,
          background: responded ? "#e2e8f0" : "#6366f1",
          color: responded ? "#94a3b8" : "#fff",
          border: "none", borderRadius: 8, cursor: responded ? "default" : "pointer",
          transition: "all 0.2s ease",
        }}
      >
        Match! (Space)
      </button>
      <div style={{ marginTop: 24, display: "flex", justifyContent: "center", gap: 24, fontSize: 13, color: "#94a3b8" }}>
        <span>✅ Hits: {hits.current}</span>
        <span>❌ Misses: {misses.current}</span>
        <span>⚠️ False alarms: {falseAlarms.current}</span>
      </div>
    </div>
  );
}
