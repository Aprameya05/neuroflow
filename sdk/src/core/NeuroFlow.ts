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
 * New in v2.1
 * -----------
 * rAF interpolation     — --nf-load and all load-derived CSS vars are smoothly
 *                         interpolated between server estimates using
 *                         requestAnimationFrame; eliminates step-change jumps.
 * data-nf-sensitivity   — per-element adaptation aggressiveness multiplier
 *                         (0.0 = ignore load changes; 2.0 = double the effect).
 *                         Applied when writing element-level CSS overrides.
 * Focus tunnel          — in minimal state, non-focused elements receive
 *                         data-nf-defocused so they can be dimmed via CSS.
 * data-nf-mode          — set to "reading" | "writing" | "idle" per inferred
 *                         behavioural mode; lets stylesheets differentiate
 *                         reading-flow from active-writing adaptations.
 * Circadian factor      — --nf-circadian CSS var reflects server-side
 *                         time-of-day capacity factor for custom theming.
 * Flow episode state    — data-nf-flow="true/false" and --nf-flow-depth CSS var.
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
 *   .ai-hint { opacity: var(--nf-fatigue); }
 *   [data-nf-defocused] { opacity: 0.35; pointer-events: none; }
 *   [data-nf-mode="reading"] .toolbar { opacity: 0.3; }
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
  circadian_factor?: number;
  in_flow_episode?: boolean;
  flow_episode_depth?: number;
  forecast?: {
    phase: string;
    trend: number;
    intervention: boolean;
    points: number[];
    load_6s: number | null;
  };
}

export type UIState = 'rich' | 'normal' | 'reduced' | 'minimal';
export type BehaviouralMode = 'reading' | 'writing' | 'idle';

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
  /** In "minimal" state, dim non-focused elements with data-nf-defocused */
  focusTunnel?: boolean;
  /** Interpolation speed factor: 1.0 = default (lerp α = 0.08 per frame) */
  interpolationSpeed?: number;
}

type LoadChangeCallback = (estimate: LoadEstimate, uiState: UIState) => void;

// ─── Hysteresis state machine ────────────────────────────────────────────────

const HYSTERESIS_BAND = 0.04;

function hysteresisState(
  current: UIState,
  load: number,
  thresholds: { rich: number; normal: number; reduced: number },
): UIState {
  const { rich, normal, reduced } = thresholds;

  let raw: UIState;
  if (load < rich) raw = 'rich';
  else if (load < normal) raw = 'normal';
  else if (load < reduced) raw = 'reduced';
  else raw = 'minimal';

  if (raw === current) return current;

  const stateOrder: UIState[] = ['rich', 'normal', 'reduced', 'minimal'];
  const currIdx = stateOrder.indexOf(current);
  const rawIdx  = stateOrder.indexOf(raw);

  if (rawIdx > currIdx) {
    const boundary = rawIdx === 1 ? rich : rawIdx === 2 ? normal : reduced;
    return load > boundary + HYSTERESIS_BAND ? raw : current;
  } else {
    const boundary = currIdx === 1 ? rich : currIdx === 2 ? normal : reduced;
    return load < boundary - HYSTERESIS_BAND ? raw : current;
  }
}

// ─── rAF-based CSS interpolator ─────────────────────────────────────────────

/**
 * Smoothly interpolates CSS custom properties on document.documentElement
 * between server estimate arrivals using requestAnimationFrame.
 *
 * Instead of writing --nf-load = 0.82 the instant a WebSocket message lands,
 * the interpolator walks toward the target value at ~60 fps with an exponential
 * lerp, producing buttery-smooth transitions with no janky step changes.
 */
class CSSInterpolator {
  private targets: Map<string, number> = new Map();
  private current: Map<string, number> = new Map();
  private rafId: number | null = null;
  private alpha: number;

  constructor(interpolationSpeed = 1.0) {
    // α controls lerp speed. At 60fps, α=0.08 → ~90% of the way in ~28 frames (~0.47s).
    // Higher interpolationSpeed increases α for faster convergence.
    this.alpha = Math.min(Math.max(0.04 * interpolationSpeed, 0.01), 0.4);
  }

  set(property: string, target: number, immediate = false): void {
    this.targets.set(property, target);
    if (!this.current.has(property) || immediate) {
      this.current.set(property, target);
      document.documentElement.style.setProperty(property, target.toFixed(4));
    }
    this.ensureRunning();
  }

  private ensureRunning(): void {
    if (this.rafId !== null) return;
    const tick = () => {
      let allSettled = true;
      this.targets.forEach((target, prop) => {
        const cur = this.current.get(prop) ?? target;
        const next = cur + (target - cur) * this.alpha;
        const settled = Math.abs(next - target) < 0.0005;
        this.current.set(prop, settled ? target : next);
        document.documentElement.style.setProperty(prop, (settled ? target : next).toFixed(4));
        if (!settled) allSettled = false;
      });
      this.rafId = allSettled ? null : requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  destroy(): void {
    if (this.rafId !== null) { cancelAnimationFrame(this.rafId); this.rafId = null; }
  }
}

// ─── Behavioural mode classifier ────────────────────────────────────────────

/**
 * Infers whether the user is currently reading, writing, or idle from the
 * most recently received estimate.
 *
 * reading — high scroll velocity, low keystroke count, low error rate
 * writing — high keystroke rate, low scroll velocity
 * idle    — very long pause, low all-round activity
 */
function classifyMode(estimate: LoadEstimate, _dominant: string): BehaviouralMode {
  // We don't have raw feature access here, but we can use dominant signal
  // and proxy the mode from semantic signal names.
  const dom = estimate.dominant ?? '';
  if (dom === 'pause_duration_ms' || estimate.load < 0.1) return 'idle';
  if (dom === 'scroll_velocity')                           return 'reading';
  if (dom === 'keystroke_iki_ms' || dom === 'error_rate') return 'writing';
  // Fallback: use load + session percentile as a heuristic
  if ((estimate.session_pct ?? 0.5) < 0.3)               return 'reading';
  return 'writing';
}

// ─── Focus tunnel helper ────────────────────────────────────────────────────

/**
 * In "minimal" state, applies data-nf-defocused to every focusable element
 * that does NOT contain the currently active element. Cleared on state exit.
 */
function applyFocusTunnel(active: boolean): void {
  const all = document.querySelectorAll<HTMLElement>(
    'a, button, input, textarea, select, [tabindex], [data-nf-sensitivity]'
  );
  const focused = document.activeElement;
  all.forEach((el) => {
    if (!active) {
      el.removeAttribute('data-nf-defocused');
      return;
    }
    const isFocused = el === focused || el.contains(focused);
    if (isFocused) {
      el.removeAttribute('data-nf-defocused');
    } else {
      el.setAttribute('data-nf-defocused', 'true');
    }
  });
}

// ─── Sensitivity zone CSS updater ───────────────────────────────────────────

/**
 * Applies per-element CSS custom property overrides based on the element's
 * data-nf-sensitivity attribute.
 *
 * <div data-nf-sensitivity="0.5"> → receives --nf-load at half the global value.
 * <div data-nf-sensitivity="2.0"> → receives --nf-load at double the global value.
 *
 * This lets individual components opt in to heavier or lighter adaptation
 * without the author having to fork CSS selectors per state.
 */
function applySensitivityZones(globalLoad: number): void {
  const zones = document.querySelectorAll<HTMLElement>('[data-nf-sensitivity]');
  zones.forEach((el) => {
    const sens = parseFloat(el.getAttribute('data-nf-sensitivity') ?? '1');
    if (!isFinite(sens)) return;
    const localLoad = Math.min(Math.max(globalLoad * sens, 0), 1);
    el.style.setProperty('--nf-load', localLoad.toFixed(4));
  });
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
  private currentMode: BehaviouralMode = 'writing';
  private criticalFocus = false;

  private interpolator: CSSInterpolator;
  private focusTunnelActive = false;

  // Focus tunnel refreshes on focus change in minimal state
  private _focusListener = () => {
    if (this.focusTunnelActive) applyFocusTunnel(true);
  };

  constructor(config: NeuroFlowConfig) {
    this.cfg = {
      sampleRateMs: 100,
      adaptationMode: 'smooth',
      thresholds: { rich: 0.21, normal: 0.35, reduced: 0.65 },
      hysteresisMs: 2000,
      onError: console.error,
      respectCriticalInputs: true,
      focusTunnel: true,
      interpolationSpeed: 1.0,
      ...config,
    };
    this.collector   = new SignalCollector(this.cfg.sampleRateMs);
    this.interpolator = new CSSInterpolator(this.cfg.interpolationSpeed);

    if (this.cfg.respectCriticalInputs) {
      document.addEventListener('focusin', (e) => {
        const el = e.target as HTMLElement;
        this.criticalFocus = !!el?.closest('[data-nf-critical]');
      });
      document.addEventListener('focusout', () => {
        this.criticalFocus = false;
      });
    }

    if (this.cfg.focusTunnel) {
      document.addEventListener('focusin',  this._focusListener);
      document.addEventListener('focusout', this._focusListener);
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
    this.interpolator.destroy();
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.ws?.close();
    this.connected = false;

    // Clean up focus tunnel
    if (this.cfg.focusTunnel) {
      document.removeEventListener('focusin',  this._focusListener);
      document.removeEventListener('focusout', this._focusListener);
    }
    applyFocusTunnel(false);
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

  getCurrentUIState(): UIState   { return this.currentState; }
  getCurrentMode():    BehaviouralMode { return this.currentMode; }

  // ── Internal ──────────────────────────────────────────────────────────────

  private connect(): void {
    const url = `${this.cfg.wsUrl}/${this.cfg.sessionId}`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.connected      = true;
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

    // Determine effective load (with predictive pre-adaptation)
    let effectiveLoad = estimate.load;
    const fc = estimate.forecast;
    if (fc?.load_6s != null) {
      const stateOrder: UIState[] = ['rich', 'normal', 'reduced', 'minimal'];
      const currIdx    = stateOrder.indexOf(this.currentState);
      const futureState = this.rawState(fc.load_6s);
      const futureIdx  = stateOrder.indexOf(futureState);
      if (futureIdx > currIdx) {
        effectiveLoad = Math.max(effectiveLoad, fc.load_6s * 0.6 + effectiveLoad * 0.4);
      }
    }

    const prevState   = this.currentState;
    const nextState   = hysteresisState(prevState, effectiveLoad, this.cfg.thresholds);
    this.currentState = nextState;

    // Infer behavioural mode
    const newMode    = classifyMode(estimate, estimate.dominant ?? '');
    const modeChanged = newMode !== this.currentMode;
    this.currentMode  = newMode;

    if (!this.criticalFocus) {
      this.applyAdaptation(estimate.load, nextState, estimate);
    }

    // Update sensitivity zones every estimate
    applySensitivityZones(estimate.load);

    // Focus tunnel — activate in minimal, deactivate on exit
    if (this.cfg.focusTunnel) {
      const shouldTunnel = nextState === 'minimal';
      if (shouldTunnel !== this.focusTunnelActive) {
        this.focusTunnelActive = shouldTunnel;
        applyFocusTunnel(shouldTunnel);
      }
    }

    // Behavioural mode attribute
    if (modeChanged) {
      document.documentElement.setAttribute('data-nf-mode', newMode);
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
      // rAF-interpolated vars (smooth between server frames)
      this.interpolator.set('--nf-load',              load);
      this.interpolator.set('--nf-density',           1 - load * 0.6);
      this.interpolator.set('--nf-secondary-opacity', 1 - load * 0.7);

      if (estimate.fatigue_index != null) {
        this.interpolator.set('--nf-fatigue', estimate.fatigue_index);
      }
      if (estimate.forecast?.load_6s != null) {
        this.interpolator.set('--nf-forecast', estimate.forecast.load_6s);
      }
      if (estimate.circadian_factor != null) {
        this.interpolator.set('--nf-circadian', estimate.circadian_factor);
      }
      if (estimate.flow_episode_depth != null) {
        this.interpolator.set('--nf-flow-depth', estimate.flow_episode_depth);
      }

      // animation-speed is a time value — write directly (not a 0–1 number)
      root.style.setProperty('--nf-animation-speed', `${(0.2 + load * 0.5).toFixed(2)}s`);
    }

    root.setAttribute('data-nf-state', state);

    // Flow episode attribute
    if (estimate.in_flow_episode != null) {
      root.setAttribute('data-nf-flow', String(estimate.in_flow_episode));
    }

    // Forecast phase
    if (estimate.forecast?.phase) {
      root.setAttribute('data-nf-phase', estimate.forecast.phase);
    }
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
