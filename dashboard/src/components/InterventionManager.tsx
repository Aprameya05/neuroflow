import { useEffect, useRef, useState } from "react";

type InterventionTrigger =
  | "overload_peak"
  | "sustained_high"
  | "fatigue_spike"
  | "flow_break";

type InterventionSeverity = "low" | "medium" | "high";

interface Intervention {
  id: string;
  trigger: InterventionTrigger;
  title: string;
  body: string;
  action?: string;
  severity: InterventionSeverity;
  cooldownMs: number;
}

interface Toast extends Intervention {
  toastId: string;
  createdAt: number;
}

interface InterventionManagerProps {
  load: number;
  fatigueIndex: number;
  inFlowEpisode: boolean;
  isAnomaly: boolean;
}

const INTERVENTIONS: Intervention[] = [
  {
    id: "overload-1",
    trigger: "overload_peak",
    title: "Finish one small thing",
    body: "Try the 2-minute rule — finish one small thing completely before continuing.",
    action: "Take 2 minutes",
    severity: "medium",
    cooldownMs: 30000,
  },
  {
    id: "overload-2",
    trigger: "overload_peak",
    title: "Step back",
    body: "Your error rate just spiked. Step back: what do you actually need right now?",
    action: "Pause and reassess",
    severity: "medium",
    cooldownMs: 45000,
  },
  {
    id: "overload-3",
    trigger: "overload_peak",
    title: "Reduce visual load",
    body: "Load spike detected. Close one unnecessary browser tab.",
    action: "Close a tab",
    severity: "high",
    cooldownMs: 60000,
  },

  {
    id: "sustained-1",
    trigger: "sustained_high",
    title: "Take a short walk",
    body: "You've been in high load for 8+ minutes. Stand up and walk for 30 seconds.",
    action: "Take a walk",
    severity: "medium",
    cooldownMs: 60000,
  },
  {
    id: "sustained-2",
    trigger: "sustained_high",
    title: "Break the task down",
    body: "Sustained overload. Break the current task into two smaller pieces.",
    action: "Break it down",
    severity: "medium",
    cooldownMs: 90000,
  },
  {
    id: "sustained-3",
    trigger: "sustained_high",
    title: "Check the Pomodoro boundary",
    body: "Consider the Pomodoro boundary — is a 5-minute break due?",
    action: "Take a break",
    severity: "high",
    cooldownMs: 120000,
  },

  {
    id: "fatigue-1",
    trigger: "fatigue_spike",
    title: "Take a longer break",
    body: "Fatigue index is climbing. A 10-minute break now saves 30 minutes of degraded performance.",
    action: "Take 10 minutes",
    severity: "medium",
    cooldownMs: 60000,
  },
  {
    id: "fatigue-2",
    trigger: "fatigue_spike",
    title: "Hydrate",
    body: "Your behavioural baseline is shifting — classic late-session fatigue. Hydrate.",
    action: "Get some water",
    severity: "medium",
    cooldownMs: 90000,
  },
  {
    id: "fatigue-3",
    trigger: "fatigue_spike",
    title: "Choose a simpler task",
    body: "Fatigue detected. Your next task would benefit from being your simplest one.",
    action: "Choose a simpler task",
    severity: "high",
    cooldownMs: 120000,
  },

  {
    id: "flow-1",
    trigger: "flow_break",
    title: "Protect your flow",
    body: "Flow state interrupted. Give it 90 seconds before switching tasks — don't let the interruption compound.",
    action: "Stay with the task",
    severity: "low",
    cooldownMs: 30000,
  },
  {
    id: "flow-2",
    trigger: "flow_break",
    title: "Re-enter focus",
    body: "You were in flow. Try to re-enter: close notifications, set a 15-minute focus block.",
    action: "Start focus block",
    severity: "low",
    cooldownMs: 45000,
  },
  {
    id: "flow-3",
    trigger: "flow_break",
    title: "Allow a short reset",
    body: "Post-flow recovery: the next 2 minutes of seeming unproductivity are normal.",
    action: "Take a reset",
    severity: "low",
    cooldownMs: 60000,
  },
];

const DISMISS_LIMIT = 5;
const ACTION_FAVORITE_LIMIT = 3;

function storageKey(id: string) {
  return `neuroflow-intervention-${id}`;
}

function getCount(id: string, type: "dismiss" | "action"): number {
  try {
    const raw = localStorage.getItem(storageKey(id));
    if (!raw) return 0;

    const parsed = JSON.parse(raw) as {
      dismissCount?: number;
      actionCount?: number;
    };

    return type === "dismiss"
      ? parsed.dismissCount ?? 0
      : parsed.actionCount ?? 0;
  } catch {
    return 0;
  }
}

function isFavorite(id: string): boolean {
  return getCount(id, "action") >= ACTION_FAVORITE_LIMIT;
}

function incrementCount(
  id: string,
  type: "dismiss" | "action"
) {
  try {
    const raw = localStorage.getItem(storageKey(id));
    const parsed = raw
      ? (JSON.parse(raw) as {
          dismissCount?: number;
          actionCount?: number;
        })
      : {};

    if (type === "dismiss") {
      parsed.dismissCount = (parsed.dismissCount ?? 0) + 1;
    } else {
      parsed.actionCount = (parsed.actionCount ?? 0) + 1;
    }

    localStorage.setItem(storageKey(id), JSON.stringify(parsed));
  } catch {
    // Ignore storage failures.
  }
}

function selectLeastRecentlyShown(
  candidates: Intervention[],
  lastFiredAt: Map<string, number>
): Intervention {
  return [...candidates].sort(
    (a, b) =>
      (lastFiredAt.get(a.id) ?? 0) -
      (lastFiredAt.get(b.id) ?? 0)
  )[0];
}

function severityColor(severity: InterventionSeverity) {
  if (severity === "high") return "#ef4444";
  if (severity === "medium") return "#f59e0b";
  return "#6366f1";
}

export function useInterventionManager({
  load,
  fatigueIndex,
  inFlowEpisode,
  isAnomaly,
}: InterventionManagerProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [toastQueue, setToastQueue] = useState<Toast[]>([]);
  const lastFiredAt = useRef<Map<string, number>>(new Map());
  const previousFatigue = useRef(fatigueIndex);
  const previousFlow = useRef(inFlowEpisode);
  const sustainedHighCount = useRef(0);

  const showIntervention = (
    intervention: Intervention
  ) => {
    const now = Date.now();
    const last = lastFiredAt.current.get(intervention.id) ?? 0;

    if (now - last < intervention.cooldownMs) {
      return;
    }

    if (getCount(intervention.id, "dismiss") >= DISMISS_LIMIT) {
      return;
    }

    lastFiredAt.current.set(intervention.id, now);

    const toast: Toast = {
      ...intervention,
      toastId: `${intervention.id}-${now}`,
      createdAt: now,
    };

    setToasts(previous => {
      if (previous.length < 2) {
        return [...previous, toast];
      }

      setToastQueue(queue => [...queue, toast]);
      return previous;
    });
    };

  useEffect(() => {
    if (load > 0.55) {
      sustainedHighCount.current += 1;
    } else {
      sustainedHighCount.current = 0;
    }

    if (isAnomaly && load > 0.7) {
      const candidates = INTERVENTIONS.filter(
        item => item.trigger === "overload_peak"
      );

      const favoriteCandidates = candidates.filter(
        item => isFavorite(item.id)
      );

      const pool =
        favoriteCandidates.length > 0
            ? favoriteCandidates
            : candidates;

            const candidate = selectLeastRecentlyShown(
              pool,
              lastFiredAt.current
            );

            showIntervention(candidate);
        }

        if (sustainedHighCount.current > 80) {
      const candidates = INTERVENTIONS.filter(
        item => item.trigger === "sustained_high"
      );

      const favoriteCandidates = candidates.filter(
        item => isFavorite(item.id)
      );

      const pool =
        favoriteCandidates.length > 0
            ? favoriteCandidates
            : candidates;

      const candidate = selectLeastRecentlyShown(
        pool,
        lastFiredAt.current
      );

      showIntervention(candidate);
      sustainedHighCount.current = 0;
    }

    if (
      previousFatigue.current < 0.6 &&
      fatigueIndex >= 0.6
    ) {
      const candidates = INTERVENTIONS.filter(
        item => item.trigger === "fatigue_spike"
      );

      const favoriteCandidates = candidates.filter(
        item => isFavorite(item.id)
      );

      const pool =
        favoriteCandidates.length > 0
            ? favoriteCandidates
            : candidates;

      const candidate = selectLeastRecentlyShown(
        pool,
        lastFiredAt.current
      );

      showIntervention(candidate);
    }

    if (
      previousFlow.current === true &&
      inFlowEpisode === false
    ) {
      const candidates = INTERVENTIONS.filter(
        item => item.trigger === "flow_break"
      );

      const favoriteCandidates = candidates.filter(
        item => isFavorite(item.id)
      );

      const pool =
        favoriteCandidates.length > 0
            ? favoriteCandidates
            : candidates;

      const candidate = selectLeastRecentlyShown(
        pool,
        lastFiredAt.current
      );

      showIntervention(candidate);
    }

    previousFatigue.current = fatigueIndex;
    previousFlow.current = inFlowEpisode;
  }, [load, fatigueIndex, inFlowEpisode, isAnomaly]);


  useEffect(() => {
    if (toasts.length === 0) return;

    const timer = window.setInterval(() => {
      const now = Date.now();

      setToasts(previous =>
        previous.filter(
          toast => now - toast.createdAt < 12000
        )
      );
    }, 250);

    return () => window.clearInterval(timer);
  }, [toasts.length]);

  useEffect(() => {
  if (toasts.length >= 2 || toastQueue.length === 0) {
    return;
  }

  const slotsAvailable = 2 - toasts.length;

  setToastQueue(queue => {
    const promoted = queue.slice(0, slotsAvailable);

    if (promoted.length === 0) {
      return queue;
    }

    setToasts(previous =>
      [...previous, ...promoted].slice(0, 2)
    );

    return queue.slice(promoted.length);
  });
  }, [toasts.length, toastQueue.length]);

  const dismissToast = (toast: Toast) => {
    incrementCount(toast.id, "dismiss");

    setToasts(previous =>
      previous.filter(item => item.toastId !== toast.toastId)
    );
  };

  const actionToast = (toast: Toast) => {
    incrementCount(toast.id, "action");

    setToasts(previous =>
      previous.filter(item => item.toastId !== toast.toastId)
    );
  };

  return {
    toasts,
    dismissToast,
    actionToast,
  };
}

export function InterventionManager({
  load,
  fatigueIndex,
  inFlowEpisode,
  isAnomaly,
}: InterventionManagerProps) {
  const {
    toasts,
    dismissToast,
    actionToast,
  } = useInterventionManager({
    load,
    fatigueIndex,
    inFlowEpisode,
    isAnomaly,
  });

  return (
    <div
      style={{
        position: "fixed",
        right: 20,
        bottom: 20,
        width: "min(360px, calc(100vw - 40px))",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        zIndex: 1000,
        pointerEvents: "none",
      }}
    >
      {toasts.map(toast => {
        const color = severityColor(toast.severity);

        return (
          <div
            key={toast.toastId}
            style={{
              position: "relative",
              overflow: "hidden",
              padding: "14px 14px 16px",
              background: "rgba(10,13,20,0.96)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderLeft: `4px solid ${color}`,
              borderRadius: 10,
              boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
              animation: "neuroflow-toast-slide 0.25s ease-out",
              pointerEvents: "auto",
            }}
          >
            <button
              type="button"
              onClick={() => dismissToast(toast)}
              aria-label="Dismiss intervention"
              style={{
                position: "absolute",
                top: 7,
                right: 8,
                border: 0,
                background: "transparent",
                color: "#64748b",
                cursor: "pointer",
                fontSize: 16,
                lineHeight: 1,
              }}
            >
              ×
            </button>

            <div
              style={{
                color,
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 5,
              }}
            >
              {toast.severity}
            </div>

            <div
                style={{
                    color: "#f8fafc",
                    fontSize: 13,
                    fontWeight: 700,
                    marginBottom: 5,
                    paddingRight: 20,
                }}
            >
                {isFavorite(toast.id) && "★ "}
                {toast.title}
            </div>

            <div
              style={{
                color: "#94a3b8",
                fontSize: 12,
                lineHeight: 1.45,
              }}
            >
              {toast.body}
            </div>

            {toast.action && (
              <button
                type="button"
                onClick={() => actionToast(toast)}
                style={{
                  marginTop: 10,
                  border: `1px solid ${color}66`,
                  borderRadius: 6,
                  padding: "6px 9px",
                  background: `${color}18`,
                  color,
                  fontSize: 10,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {toast.action}
              </button>
            )}

            <div
              style={{
                position: "absolute",
                left: 0,
                bottom: 0,
                height: 2,
                width: "100%",
                background: color,
                transformOrigin: "left",
                animation:
                  "neuroflow-toast-progress 12s linear forwards",
              }}
            />
          </div>
        );
      })}

      <style>
        {`
          @keyframes neuroflow-toast-slide {
            from {
              opacity: 0;
              transform: translateX(30px);
            }
            to {
              opacity: 1;
              transform: translateX(0);
            }
          }

          @keyframes neuroflow-toast-progress {
            from {
              transform: scaleX(1);
            }
            to {
              transform: scaleX(0);
            }
          }
        `}
      </style>
    </div>
  );
}