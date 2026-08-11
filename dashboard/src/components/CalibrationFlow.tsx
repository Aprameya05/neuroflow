/**
 * CalibrationFlow -- orchestrates the full calibration session.
 * Runs N-back tasks at difficulty 1, 2, 3 with NASA-TLX rating after each.
 * Submits results to the backend for LSTM training data.
 */
import { useState } from "react";
import { NBackTask, NBackResult } from "./NBackTask";
import { NasaTLX, TLXScores } from "./NasaTLX";

const BACKEND = "https://neuroflow-backend-r6rs.onrender.com";

interface CalibrationFlowProps {
  userId: string;
}

type Phase =
  | { step: "intro" }
  | { step: "nback"; n: 1 | 2 | 3 }
  | { step: "tlx"; n: 1 | 2 | 3; nbackResult: NBackResult }
  | { step: "done" };

interface CalibrationRound {
  n: 1 | 2 | 3;
  nbackResult: NBackResult;
  tlxScores: TLXScores;
}

async function submitCalibration(userId: string, rounds: CalibrationRound[]) {
  const payload = {
    user_id: userId,
    rounds: rounds.map(r => ({
      n: r.n,
      nback_accuracy: r.nbackResult.accuracy,
      nback_avg_rt_ms: r.nbackResult.avgReactionTimeMs,
      nback_hits: r.nbackResult.hits,
      nback_misses: r.nbackResult.misses,
      nback_false_alarms: r.nbackResult.falseAlarms,
      nasa_tlx_overall: r.tlxScores.overallScore,
      nasa_tlx_raw: r.tlxScores,
    })),
  };

  const res = await fetch(`${BACKEND}/api/calibration/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error(`Submission failed: ${res.status}`);
  return res.json();
}

const N_SEQUENCE: (1 | 2 | 3)[] = [1, 2, 3];

const DIFFICULTY_LABEL: Record<number, string> = {
  1: "Easy (1-back)",
  2: "Medium (2-back)",
  3: "Hard (3-back)",
};

export function CalibrationFlow({ userId }: CalibrationFlowProps) {
  const [phase, setPhase] = useState<Phase>({ step: "intro" });
  const [rounds, setRounds] = useState<CalibrationRound[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const currentRoundIdx = rounds.length;
  const totalRounds = N_SEQUENCE.length;

  const handleNBackComplete = (result: NBackResult) => {
    const n = N_SEQUENCE[currentRoundIdx];
    setPhase({ step: "tlx", n, nbackResult: result });
  };

  const handleTLXComplete = async (scores: TLXScores) => {
    const currentN = N_SEQUENCE[currentRoundIdx] as 1 | 2 | 3;
    const currentPhase = phase as { step: "tlx"; n: 1 | 2 | 3; nbackResult: NBackResult };
    const newRounds = [...rounds, { n: currentN, nbackResult: currentPhase.nbackResult, tlxScores: scores }];
    setRounds(newRounds);

    const nextIdx = newRounds.length;
    if (nextIdx < N_SEQUENCE.length) {
      setPhase({ step: "nback", n: N_SEQUENCE[nextIdx] });
    } else {
      // All rounds done — submit
      setSubmitting(true);
      try {
        await submitCalibration(userId, newRounds);
        setPhase({ step: "done" });
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : "Submission failed");
      } finally {
        setSubmitting(false);
      }
    }
  };

  if (phase.step === "intro") {
    return (
      <div style={{ maxWidth: 540, margin: "0 auto", textAlign: "center", padding: "32px 24px" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔬</div>
        <h2 style={{ margin: "0 0 12px", color: "#1e293b", fontSize: 22 }}>
          Cognitive Load Calibration
        </h2>
        <p style={{ color: "#64748b", lineHeight: 1.65, marginBottom: 28 }}>
          This calibration session takes about <strong>6–8 minutes</strong>.
          You'll complete three N-back memory tasks at increasing difficulty,
          then rate your workload after each one. Your data trains the BiLSTM
          model that powers NeuroFlow's adaptive interface.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 28 }}>
          {N_SEQUENCE.map((n, i) => (
            <div key={n} style={{
              background: "#f8fafc", border: "1px solid #e2e8f0",
              borderRadius: 10, padding: "14px 12px", textAlign: "center",
            }}>
              <div style={{ fontSize: 20, marginBottom: 6 }}>{["🟢", "🟡", "🔴"][i]}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{DIFFICULTY_LABEL[n]}</div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>~2 min</div>
            </div>
          ))}
        </div>

        <p style={{ fontSize: 13, color: "#94a3b8", marginBottom: 24 }}>
          Participant ID: <code style={{ background: "#f1f5f9", padding: "2px 8px", borderRadius: 4 }}>{userId}</code>
        </p>

        <button
          onClick={() => setPhase({ step: "nback", n: 1 })}
          style={{
            padding: "14px 40px", background: "#6366f1", color: "#fff",
            border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: "pointer",
          }}
        >
          Begin calibration
        </button>
      </div>
    );
  }

  if (phase.step === "nback") {
    return (
      <div>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 12 }}>
            {N_SEQUENCE.map((n, i) => (
              <div key={n} style={{
                width: 32, height: 4, borderRadius: 2,
                background: i < currentRoundIdx ? "#6366f1"
                  : i === currentRoundIdx ? "#6366f1" : "#e2e8f0",
                opacity: i === currentRoundIdx ? 1 : i < currentRoundIdx ? 0.4 : 0.3,
              }} />
            ))}
          </div>
          <p style={{ fontSize: 12, color: "#9ca3af" }}>
            Round {currentRoundIdx + 1} of {totalRounds} — {DIFFICULTY_LABEL[phase.n]}
          </p>
        </div>
        <NBackTask n={phase.n} trials={20} onComplete={handleNBackComplete} />
      </div>
    );
  }

  if (phase.step === "tlx") {
    return (
      <div>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <p style={{ fontSize: 12, color: "#9ca3af" }}>
            Workload rating — Round {currentRoundIdx + 1} of {totalRounds}
          </p>
        </div>
        <NasaTLX
          taskLabel={`the ${DIFFICULTY_LABEL[phase.n]} task`}
          onSubmit={handleTLXComplete}
        />
      </div>
    );
  }

  if (phase.step === "done") {
    return (
      <div style={{ textAlign: "center", padding: "48px 24px" }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
        <h2 style={{ color: "#1e293b", marginBottom: 12 }}>Calibration complete!</h2>
        <p style={{ color: "#64748b", lineHeight: 1.65, maxWidth: 400, margin: "0 auto 24px" }}>
          Your {totalRounds} calibration rounds have been submitted.
          The BiLSTM model will use this data to learn what cognitive load
          looks like for <em>you</em>.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, maxWidth: 400, margin: "0 auto 28px" }}>
          {rounds.map(r => (
            <div key={r.n} style={{
              background: "#f0fdf4", border: "1px solid #bbf7d0",
              borderRadius: 10, padding: "12px",
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#15803d" }}>{r.n}-back</div>
              <div style={{ fontSize: 12, color: "#166534", marginTop: 4 }}>
                Acc: {Math.round(r.nbackResult.accuracy * 100)}%
              </div>
              <div style={{ fontSize: 12, color: "#166534" }}>
                TLX: {r.tlxScores.overallScore}
              </div>
            </div>
          ))}
        </div>
        {submitError && (
          <p style={{ color: "#ef4444", fontSize: 13 }}>⚠️ {submitError} — results saved locally.</p>
        )}
      </div>
    );
  }

  if (submitting) {
    return (
      <div style={{ textAlign: "center", padding: "48px" }}>
        <p style={{ color: "#6366f1", fontSize: 16 }}>Submitting calibration data…</p>
      </div>
    );
  }

  return null;
}
