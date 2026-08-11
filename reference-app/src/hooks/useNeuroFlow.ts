/**
 * useNeuroFlow -- core hook for the adaptive editor.
 *
 * Key design decisions:
 * - Warmup runs ONCE per page load, never resets on reconnect
 * - EMA smoothing prevents score bouncing
 * - UI state requires 2s stability before switching
 * - Reconnects are transparent -- UI never flickers on disconnect
 * - Watch mode: connect to /ws/watch/{sessionId} to observe another session
 *   without sending behavioral signals (used by session sharing feature)
 */
import { useState, useEffect, useRef, useCallback } from "react";

const WS_BASE = "wss://neuroflow-backend-r6rs.onrender.com";
const WS_URL = `${WS_BASE}/ws/signal`;
const WS_WATCH_URL = `${WS_BASE}/ws/watch`;
const SAMPLE_RATE_MS = 100;
const WARMUP_MS = 5000;       // 5s warmup, runs once only
const EMA_ALPHA = 0.12;       // gentle smoothing
const STATE_DEBOUNCE_MS = 2000; // 2s stability before UI state switches

export type UIState = "rich" | "normal" | "reduced" | "minimal";

export interface LoadState {
  score: number;
  uiState: UIState;
  dominant: string;
  confidence: number;
  modelType: string;
  isConnected: boolean;
  isWatchMode: boolean;
  history: number[];
}

export interface UseNeuroFlowOptions {
  /** If true, connect to /ws/watch instead of /ws/signal -- no signals emitted */
  watchMode?: boolean;
}

class SignalCollector {
  private keyBuffer: number[] = [];
  private lastKeyTime = 0;
  private errorCount = 0;
  private totalKeys = 0;
  private mouseTrack: { x: number; y: number; t: number }[] = [];
  private scrollVels: number[] = [];
  private lastScrollY = window.scrollY;
  private lastScrollTime = Date.now();
  private tabSwitches = 0;
  private cpCount = 0;
  private lastActivity = Date.now();
  private intervalId: ReturnType<typeof setInterval> | null = null;

  start(emit: (signal: Record<string, number>) => void) {
    document.addEventListener("keydown", (e) => {
      const now = Date.now();
      if (this.lastKeyTime > 0) this.keyBuffer.push(now - this.lastKeyTime);
      this.lastKeyTime = now;
      this.totalKeys++;
      this.lastActivity = now;
      if (e.key === "Backspace" || e.key === "Delete") this.errorCount++;
    }, true);

    document.addEventListener("mousemove", (e) => {
      this.mouseTrack.push({ x: e.clientX, y: e.clientY, t: Date.now() });
      if (this.mouseTrack.length > 60) this.mouseTrack.shift();
    });

    window.addEventListener("scroll", () => {
      const now = Date.now();
      const dt = now - this.lastScrollTime;
      if (dt > 0) this.scrollVels.push(Math.abs(window.scrollY - this.lastScrollY) / dt);
      this.lastScrollY = window.scrollY;
      this.lastScrollTime = now;
      this.lastActivity = now;
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.tabSwitches++;
    });

    document.addEventListener("copy", () => this.cpCount++);
    document.addEventListener("paste", () => {
      this.cpCount++;
      this.lastActivity = Date.now();
    });

    this.intervalId = setInterval(() => emit(this.flush()), SAMPLE_RATE_MS);
  }

  stop() {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  private flush(): Record<string, number> {
    const now = Date.now();
    const iki = this.keyBuffer.length
      ? this.keyBuffer.reduce((a, b) => a + b, 0) / this.keyBuffer.length : 0;
    const mv = this.computeMV();
    const sv = this.scrollVels.length
      ? this.scrollVels.reduce((a, b) => a + b, 0) / this.scrollVels.length : 0;
    const er = this.totalKeys > 0 ? this.errorCount / this.totalKeys : 0;
    const snap = {
      ts: now, iki, mv: mv.v, ma: mv.a, mdc: this.computeDC(),
      sv, er, pause: now - this.lastActivity,
      ts_count: this.tabSwitches, cp: this.cpCount,
    };
    this.keyBuffer = []; this.errorCount = 0; this.totalKeys = 0;
    this.tabSwitches = 0; this.cpCount = 0; this.scrollVels = [];
    return snap;
  }

  private computeMV() {
    if (this.mouseTrack.length < 2) return { v: 0, a: 0 };
    const vels: number[] = [];
    for (let i = 1; i < this.mouseTrack.length; i++) {
      const dx = this.mouseTrack[i].x - this.mouseTrack[i - 1].x;
      const dy = this.mouseTrack[i].y - this.mouseTrack[i - 1].y;
      const dt = this.mouseTrack[i].t - this.mouseTrack[i - 1].t;
      if (dt > 0) vels.push(Math.sqrt(dx * dx + dy * dy) / dt);
    }
    if (!vels.length) return { v: 0, a: 0 };
    return {
      v: vels.reduce((a, b) => a + b, 0) / vels.length,
      a: Math.abs(vels[vels.length - 1] - vels[0]),
    };
  }

  private computeDC() {
    if (this.mouseTrack.length < 3) return 0;
    let changes = 0;
    let prev: number | null = null;
    for (let i = 1; i < this.mouseTrack.length; i++) {
      const dx = this.mouseTrack[i].x - this.mouseTrack[i - 1].x;
      const dy = this.mouseTrack[i].y - this.mouseTrack[i - 1].y;
      const angle = Math.atan2(dy, dx);
      if (prev !== null && Math.abs(angle - prev) > Math.PI / 4) changes++;
      prev = angle;
    }
    return changes;
  }
}

function scoreToUIState(score: number): UIState {
  if (score < 0.21) return "rich";
  if (score < 0.35) return "normal";
  if (score < 0.65) return "reduced";
  return "minimal";
}

export function useNeuroFlow(
  sessionId: string,
  opts: UseNeuroFlowOptions = {}
): LoadState {
  const { watchMode = false } = opts;

  const [state, setState] = useState<LoadState>({
    score: 0.3,
    uiState: "normal",
    dominant: "—",
    confidence: 0,
    modelType: "heuristic",
    isConnected: false,
    isWatchMode: watchMode,
    history: [],
  });

  const wsRef = useRef<WebSocket | null>(null);
  const collectorRef = useRef<SignalCollector | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Warmup: runs ONCE per page load, never resets on reconnect
  const warmupDone = useRef(watchMode); // in watch mode warmup is instant
  const warmupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warmupStarted = useRef(false);

  // Smoothing
  const smoothedScore = useRef(0.3);

  // UI state debounce
  const pendingUIState = useRef<UIState>("normal");
  const stateDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Signal collector is created once, reused across reconnects
  const collectorStarted = useRef(false);

  const connect = useCallback(() => {
    const url = watchMode
      ? `${WS_WATCH_URL}/${sessionId}`
      : `${WS_URL}/${sessionId}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setState(s => ({ ...s, isConnected: true }));

      if (!watchMode) {
        // Start warmup only on the very first connection, never again
        if (!warmupStarted.current) {
          warmupStarted.current = true;
          warmupTimer.current = setTimeout(() => {
            warmupDone.current = true;
          }, WARMUP_MS);
        }

        // Start signal collector only once
        if (!collectorStarted.current) {
          collectorStarted.current = true;
          collectorRef.current = new SignalCollector();
          collectorRef.current.start((signal) => {
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(signal));
          });
        }
      }
    };

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);

      // Watch mode handshake acknowledgement
      if (msg.type === "watch_connected") return;

      if (msg.type !== "load_estimate") return;
      if (!warmupDone.current) return;

      // EMA smoothing
      smoothedScore.current = EMA_ALPHA * msg.load + (1 - EMA_ALPHA) * smoothedScore.current;
      const smoothed = Math.round(smoothedScore.current * 1000) / 1000;
      const newUIState = scoreToUIState(smoothed);

      // Debounce UI state -- only commit after 2s stability
      if (newUIState !== pendingUIState.current) {
        pendingUIState.current = newUIState;
        if (stateDebounceTimer.current) clearTimeout(stateDebounceTimer.current);
        stateDebounceTimer.current = setTimeout(() => {
          setState(s => ({ ...s, uiState: newUIState }));
        }, STATE_DEBOUNCE_MS);
      }

      // Score and history update immediately
      setState(s => ({
        ...s,
        score: smoothed,
        dominant: msg.dominant,
        confidence: msg.confidence,
        modelType: msg.model_type ?? "heuristic",
        isConnected: true,
        history: [...s.history, smoothed].slice(-60),
      }));
    };

    ws.onclose = () => {
      // Only show disconnected -- don't reset warmup or collector
      setState(s => ({ ...s, isConnected: false }));
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => ws.close();
  }, [sessionId, watchMode]);

  useEffect(() => {
    connect();
    return () => {
      reconnectTimer.current && clearTimeout(reconnectTimer.current);
      warmupTimer.current && clearTimeout(warmupTimer.current);
      stateDebounceTimer.current && clearTimeout(stateDebounceTimer.current);
      collectorRef.current?.stop();
      wsRef.current?.close();
    };
  }, [connect]);

  return state;
}
