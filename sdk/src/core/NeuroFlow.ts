/**
 * NeuroFlow SDK v2 — Adaptive Cognitive Load Interface Runtime
 *
 * What's new in v2
 * ----------------
 * Hysteresis           — prevents state flickering at boundaries. A transition
 *                        from state A to state B requires the load to cross the
 *                        threshold by HYSTERESIS_BAND before it is committed.
 * Predictive adaptation — when the server forecast indicates load will cross a
 *                        threshold within 3 s, the SDK pre-adapts, giving the UI
 *                        time to transition smoothly before the user notices.
 * Plugin / observer API — nf.use(plugin) lets third-party code subscribe to
 *                        every estimate and respond with their own DOM mutations.
 * --nf-forecast CSS var — continuously updated with the 6s-ahead predicted load.
 * --nf-fatigue CSS var  — fatigue index from the backend.
 * Focus-aware guard     — adaptation is suppressed when the user is in a
 *                        critical input field (input[data-nf-critical]).
 * Reconnect strategy    — exponential backoff (mirrors the extension).
 *
 * Quick start (unchanged)
 * -----------------------
 *   const nf = new NeuroFlow({ sessionId: uid, wsUrl: '...' });
 *   nf.start();
 *
 * CSS usage (new vars)
 * --------------------
 *   .sidebar { opacity: calc(1 - var(--nf-load) * 0.8); }
 *   [data-nf-state="minimal"] .sidebar { display: none; }
 *   .ai-hint { opacity: var(--nf-fatigue); }  /* show more hints when fatigued *\/
 */

export interface LoadEstimate {
  type: string;
  load: number;
  raw_load?: number;
  confidence: number;
  dominant: string;
  ts: number;
  session_id: string;
  fatigue_index?: number;
  is_anomaly?: boolean;
  predicted_load?: number;
  session_pct?: number;
  forecast?: {
    phase: string;
    trend: number;
    intervention: boolean;
    points: number[];
    load_6s: number | null;
  };
}

export type UIState = 'rich' | 'normal' | 'reduced' | 'minimal';

export interface NeuroFlowPlugin {
  name: string;
  onEstimate(estimate: LoadEstimate, state: UIState): void;
  onStateChange?(from: UIState, to: UIState, estimate: LoadEstimate): void;
}

export interface NeuroFlowConfig {
  sessionId: string;
  wsUrl: string;
  sampleRateMs?: number;
  adaptationMode?: 'smooth' | 'threshold';
  thresholds?: { rich: number; normal: number; reduced: number };
  hysteresisMs?: number;
  onError?: (err: Error) => void;
  /** Suppress adaptation while a [data-nf-critical] element has focus */
  respectCriticalInputs?: boolean;
}

type LoadChangeCallback = (estimate: LoadEstimate, uiState: UIState) => void;

// ─── Hysteresis state machine ────────────────────────────────────────────────

const HYSTERESIS_BAND = 0.04;   // must cross threshold by this much before committing

function hysteresisState(
  current: UIState,
  load: number,
  thresholds: { rich: number; normal: number; reduced: number },
): UIState {
  const { rich, normal, reduced } = thresholds;

  // Raw target state without hysteresis
  let raw: UIState;
  if (load < rich) raw = 'rich';
  else if (load < normal) raw = 'normal';
  else if (load < reduced) raw = 'reduced';
  else raw = 'minimal';

  if (raw === current) return current;

  // Only commit if the load has passed the threshold by HYSTERESIS_BAND
  const stateOrder: UIState[] = ['rich', 'normal', 'reduced', 'minimal'];
  const currIdx = stateOrder.indexOf(current);
  const rawIdx  = stateOrder.indexOf(raw);

  if (rawIdx > currIdx) {
    // Moving toward higher load — need to be well above the threshold
    const boundary = rawIdx === 1 ? rich : rawIdx === 2 ? normal : reduced;
    return load > boundary + HYSTERESIS_BAND ? raw : current;
  } else {
    // Moving toward lower load — need to be well below the threshold
    const boundary = currIdx === 1 ? rich : currIdx === 2 ? normal : reduced;
    return load < boundary - HYSTERESIS_BAND ? raw : current;
  }
}

// ─── Main class ──────────────────────────────────────────────────────────────

export class NeuroFlow {
  private ws: WebSocket | null = null;
  private collector: SignalCollector;
  private callbacks: LoadChangeCallback[] = [];
  private plugins: NeuroFlowPlugin[] = [];
  private cfg: Required<NeuroFlowConfig>;

  private connected = false;
  private reconnectDelay = 1000;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  private currentState: UIState = 'normal';
  private criticalFocus = false;

  constructor(config: NeuroFlowConfig) {
    this.cfg = {
      sampleRateMs: 100,
      adaptationMode: 'smooth',
      thresholds: { rich: 0.21, normal: 0.35, reduced: 0.65 },
      hysteresisMs: 2000,
      onError: console.error,
      respectCriticalInputs: true,
      ...config,
    };
    this.collector = new SignalCollector(this.cfg.sampleRateMs);

    if (this.cfg.respectCriticalInputs) {
      document.addEventListener('focusin', (e) => {
        const el = e.target as HTMLElement;
        this.criticalFocus = !!el?.closest('[data-nf-critical]');
      });
      document.addEventListener('focusout', () => {
        this.criticalFocus = false;
      });
    }
  }

  start(): void {
    this.connect();
    this.collector.start((signal) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(signal));
      }
    });
  }

  stop(): void {
    this.collector.stop();
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.ws?.close();
    this.connected = false;
  }

  /** Register a callback for every load estimate */
  onLoadChange(cb: LoadChangeCallback): () => void {
    this.callbacks.push(cb);
    return () => { this.callbacks = this.callbacks.filter((c) => c !== cb); };
  }

  /** Register a plugin (receives every estimate + state changes) */
  use(plugin: NeuroFlowPlugin): this {
    this.plugins.push(plugin);
    return this;
  }

  getCurrentUIState(): UIState {
    return this.currentState;
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private connect(): void {
    const url = `${this.cfg.wsUrl}/${this.cfg.sessionId}`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.connected     = true;
      this.reconnectDelay = 1000;
    };

    this.ws.onmessage = (event) => this.handleMessage(event);

    this.ws.onerror = () => {
      this.cfg.onError(new Error('NeuroFlow WebSocket error'));
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.reconnectTimeout = setTimeout(() => {
        this.reconnectTimeout = null;
        this.connect();
      }, this.reconnectDelay);
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 60_000);
    };
  }

  private handleMessage(event: MessageEvent): void {
    let estimate: LoadEstimate;
    try { estimate = JSON.parse(event.data) as LoadEstimate; } catch { return; }

    if (estimate.type === 'ping') {
      this.ws?.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
      return;
    }
    if (estimate.type !== 'load_estimate') return;

    // Determine if we should pre-adapt based on forecast
    let effectiveLoad = estimate.load;
    const fc = estimate.forecast;
    if (fc?.load_6s != null) {
      const stateOrder: UIState[] = ['rich', 'normal', 'reduced', 'minimal'];
      const currIdx  = stateOrder.indexOf(this.currentState);
      const futureState = this.rawState(fc.load_6s);
      const futureIdx = stateOrder.indexOf(futureState);

      // Pre-adapt if forecast indicates a higher-load state in 6 s
      if (futureIdx > currIdx) {
        effectiveLoad = Math.max(effectiveLoad, fc.load_6s * 0.6 + effectiveLoad * 0.4);
      }
    }

    const prevState    = this.currentState;
    const nextState    = hysteresisState(prevState, effectiveLoad, this.cfg.thresholds);
    this.currentState  = nextState;

    if (!this.criticalFocus) {
      this.applyAdaptation(estimate.load, nextState, estimate);
    }

    this.callbacks.forEach((cb) => cb(estimate, nextState));
    this.plugins.forEach((p) => {
      p.onEstimate(estimate, nextState);
      if (nextState !== prevState) p.onStateChange?.(prevState, nextState, estimate);
    });
  }

  private rawState(load: number): UIState {
    const { rich, normal, reduced } = this.cfg.thresholds;
    if (load < rich) return 'rich';
    if (load < normal) return 'normal';
    if (load < reduced) return 'reduced';
    return 'minimal';
  }

  private applyAdaptation(load: number, state: UIState, estimate: LoadEstimate): void {
    const root = document.documentElement;

    if (this.cfg.adaptationMode === 'smooth') {
      root.style.setProperty('--nf-load',             load.toFixed(3));
      root.style.setProperty('--nf-density',          (1 - load * 0.6).toFixed(3));
      root.style.setProperty('--nf-animation-speed',  `${(0.2 + load * 0.5).toFixed(2)}s`);
      root.style.setProperty('--nf-secondary-opacity', (1 - load * 0.7).toFixed(3));

      // v2 new vars
      if (estimate.fatigue_index != null) {
        root.style.setProperty('--nf-fatigue', estimate.fatigue_index.toFixed(3));
      }
      if (estimate.forecast?.load_6s != null) {
        root.style.setProperty('--nf-forecast', estimate.forecast.load_6s.toFixed(3));
      }
      if (estimate.forecast?.phase) {
        root.setAttribute('data-nf-phase', estimate.forecast.phase);
      }
    }

    root.setAttribute('data-nf-state', state);
  }
}

// ─── Signal Collector ────────────────────────────────────────────────────────
// (Identical to v1; kept in-sync with extension/src/collector.js)

class SignalCollector {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private keyBuffer: number[] = [];
  private mouseTrack: { x: number; y: number; t: number }[] = [];
  private errorCount = 0;
  private totalKeys = 0;
  private tabSwitches = 0;
  private cpCount = 0;
  private scrollVelocityBuffer: number[] = [];
  private lastActivity = Date.now();
  private lastKeyTime = 0;
  private lastScrollY = 0;
  private lastScrollTime = Date.now();

  constructor(private sampleRateMs: number) {
    this.attachListeners();
  }

  private attachListeners(): void {
    document.addEventListener('keydown', (e) => {
      const now = Date.now();
      if (this.lastKeyTime > 0) this.keyBuffer.push(now - this.lastKeyTime);
      this.lastKeyTime = now;
      this.totalKeys++;
      this.lastActivity = now;
      if (e.key === 'Backspace' || e.key === 'Delete') this.errorCount++;
    }, true);

    document.addEventListener('mousemove', (e) => {
      this.mouseTrack.push({ x: e.clientX, y: e.clientY, t: Date.now() });
      if (this.mouseTrack.length > 60) this.mouseTrack.shift();
    });

    window.addEventListener('scroll', () => {
      const now = Date.now();
      const dt = now - this.lastScrollTime;
      if (dt > 0) {
        const dy = Math.abs(window.scrollY - this.lastScrollY);
        this.scrollVelocityBuffer.push(dy / dt);
      }
      this.lastScrollY = window.scrollY;
      this.lastScrollTime = now;
      this.lastActivity = now;
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.tabSwitches++;
    });

    document.addEventListener('copy',  () => this.cpCount++);
    document.addEventListener('paste', () => { this.cpCount++; this.lastActivity = Date.now(); });
  }

  start(emit: (signal: Record<string, number>) => void): void {
    this.intervalId = setInterval(() => emit(this.flush()), this.sampleRateMs);
  }

  stop(): void {
    if (this.intervalId !== null) { clearInterval(this.intervalId); this.intervalId = null; }
  }

  private flush(): Record<string, number> {
    const now = Date.now();
    const ikiAvg = this.keyBuffer.length
      ? this.keyBuffer.reduce((a, b) => a + b, 0) / this.keyBuffer.length
      : 0;
    const { velocity: mv, acceleration: ma } = this.computeMouseVelocity();
    const mdc = this.computeDirectionChanges();
    const sv = this.scrollVelocityBuffer.length
      ? this.scrollVelocityBuffer.reduce((a, b) => a + b, 0) / this.scrollVelocityBuffer.length
      : 0;
    const er = this.totalKeys > 0 ? this.errorCount / this.totalKeys : 0;
    const pause = now - this.lastActivity;

    const snap: Record<string, number> = {
      ts: now, iki: ikiAvg, mv, ma, mdc, sv, er, pause,
      ts_count: this.tabSwitches, cp: this.cpCount,
    };

    this.keyBuffer = []; this.tabSwitches = 0; this.cpCount = 0;
    this.errorCount = 0; this.totalKeys = 0; this.scrollVelocityBuffer = [];

    return snap;
  }

  private computeMouseVelocity(): { velocity: number; acceleration: number } {
    if (this.mouseTrack.length < 2) return { velocity: 0, acceleration: 0 };
    const velocities: number[] = [];
    for (let i = 1; i < this.mouseTrack.length; i++) {
      const dx = this.mouseTrack[i].x - this.mouseTrack[i - 1].x;
      const dy = this.mouseTrack[i].y - this.mouseTrack[i - 1].y;
      const dt = this.mouseTrack[i].t - this.mouseTrack[i - 1].t;
      if (dt > 0) velocities.push(Math.sqrt(dx * dx + dy * dy) / dt);
    }
    if (!velocities.length) return { velocity: 0, acceleration: 0 };
    const v = velocities.reduce((a, b) => a + b, 0) / velocities.length;
    const acc = velocities.length > 1 ? Math.abs(velocities[velocities.length - 1] - velocities[0]) : 0;
    return { velocity: v, acceleration: acc };
  }

  private computeDirectionChanges(): number {
    if (this.mouseTrack.length < 3) return 0;
    let changes = 0, prevAngle: number | null = null;
    for (let i = 1; i < this.mouseTrack.length; i++) {
      const dx = this.mouseTrack[i].x - this.mouseTrack[i - 1].x;
      const dy = this.mouseTrack[i].y - this.mouseTrack[i - 1].y;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      const angle = Math.atan2(dy, dx);
      if (prevAngle !== null && Math.abs(angle - prevAngle) > Math.PI / 4) changes++;
      prevAngle = angle;
    }
    return changes;
  }
}
