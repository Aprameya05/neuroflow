/**
 * NeuroFlow SDK — Adaptive Cognitive Load Interface Runtime
 *
 * Drop this into any web app to make it cognitively adaptive.
 * The SDK connects to the NeuroFlow backend, receives load estimates,
 * and drives CSS custom properties on :root so your UI can respond.
 *
 * Quick start:
 *   const nf = new NeuroFlow({ sessionId: uid, wsUrl: 'ws://localhost:8000/ws/signal' });
 *   nf.start();
 *   nf.onLoadChange((estimate, uiState) => {
 *     console.log(`Load: ${estimate.load}, UI state: ${uiState}`);
 *   });
 *
 * CSS usage:
 *   [data-nf-state="minimal"] .sidebar { display: none; }
 *   .animation { transition-duration: var(--nf-animation-speed, 0.2s); }
 */

export interface LoadEstimate {
  type: string;
  load: number;           // 0.0 = low cognitive load | 1.0 = overwhelmed
  confidence: number;
  dominant: string;       // name of the signal that drove this estimate
  ts: number;
  session_id: string;
}

/**
 * Discrete UI states derived from continuous load score.
 * Use data-nf-state CSS attribute selectors in your stylesheet.
 *
 * rich     < 21% load — user is in deep focus, show full feature set
 * normal   < 30% load — standard interface density
 * reduced  < 65% load — simplify: hide secondary actions, reduce animations
 * minimal  > 65% load — emergency simplification: core task only
 */
export type UIState = 'rich' | 'normal' | 'reduced' | 'minimal';

export interface NeuroFlowConfig {
  sessionId: string;
  wsUrl: string;
  /** Signal sampling rate (ms). Lower = more responsive, higher CPU. Default: 100 */
  sampleRateMs?: number;
  /** smooth: drives --nf-load CSS var continuously | threshold: stepped data-nf-state only */
  adaptationMode?: 'smooth' | 'threshold';
  /** Load thresholds for UIState transitions */
  thresholds?: { low: number; high: number };
  onError?: (err: Error) => void;
}

type LoadChangeCallback = (estimate: LoadEstimate, uiState: UIState) => void;

export class NeuroFlow {
  private ws: WebSocket | null = null;
  private collector: SignalCollector;
  private callbacks: LoadChangeCallback[] = [];
  private cfg: Required<NeuroFlowConfig>;
  private connected = false;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(config: NeuroFlowConfig) {
    this.cfg = {
      sampleRateMs: 100,
      adaptationMode: 'smooth',
      thresholds: { low: 0.3, high: 0.65 },
      onError: console.error,
      ...config,
    };
    this.collector = new SignalCollector(this.cfg.sampleRateMs);
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

  /** Subscribe to load change events. Returns an unsubscribe function. */
  onLoadChange(cb: LoadChangeCallback): () => void {
    this.callbacks.push(cb);
    return () => {
      this.callbacks = this.callbacks.filter((c) => c !== cb);
    };
  }

  /** Get the current UIState from the DOM attribute (sync, no event needed) */
  getCurrentUIState(): UIState {
    return (document.documentElement.getAttribute('data-nf-state') as UIState) || 'normal';
  }

  private connect(): void {
    const url = `${this.cfg.wsUrl}/${this.cfg.sessionId}`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.connected = true;
    };

    this.ws.onmessage = this.handleMessage.bind(this);

    this.ws.onerror = () => {
      this.cfg.onError(new Error('NeuroFlow WebSocket error'));
    };

    this.ws.onclose = () => {
      this.connected = false;
      // Auto-reconnect after 3 seconds
      this.reconnectTimeout = setTimeout(() => this.connect(), 3000);
    };
  }

  private handleMessage(event: MessageEvent): void {
    let estimate: LoadEstimate;
    try {
      estimate = JSON.parse(event.data) as LoadEstimate;
    } catch {
      return;
    }
    if (estimate.type !== 'load_estimate') return;

    const uiState = this.computeUIState(estimate.load);
    this.applyAdaptation(estimate.load, uiState);
    this.callbacks.forEach((cb) => cb(estimate, uiState));
  }

  private computeUIState(load: number): UIState {
    const { low, high } = this.cfg.thresholds;
    if (load < low * 0.7) return 'rich';
    if (load < low) return 'normal';
    if (load < high) return 'reduced';
    return 'minimal';
  }

  /**
   * Drive CSS custom properties and data attributes.
   * Your CSS can then use:
   *   calc(1 + (1 - var(--nf-load)) * 0.5)  — scale values with load
   *   [data-nf-state="minimal"] .sidebar { display: none; }
   */
  private applyAdaptation(load: number, state: UIState): void {
    const root = document.documentElement;

    if (this.cfg.adaptationMode === 'smooth') {
      root.style.setProperty('--nf-load', load.toFixed(3));
      // density: 1.0 at zero load, 0.4 at maximum load
      root.style.setProperty('--nf-density', (1 - load * 0.6).toFixed(3));
      // animations slow down under high load (less distraction)
      root.style.setProperty('--nf-animation-speed', `${(0.2 + load * 0.5).toFixed(2)}s`);
      // opacity of non-critical secondary elements
      root.style.setProperty('--nf-secondary-opacity', (1 - load * 0.7).toFixed(3));
    }

    // Always set the discrete state for CSS selectors
    root.setAttribute('data-nf-state', state);
  }
}

// ─── Signal Collector ────────────────────────────────────────────────────────

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
    document.addEventListener(
      'keydown',
      (e) => {
        const now = Date.now();
        if (this.lastKeyTime > 0) {
          this.keyBuffer.push(now - this.lastKeyTime);
        }
        this.lastKeyTime = now;
        this.totalKeys++;
        this.lastActivity = now;
        if (e.key === 'Backspace' || e.key === 'Delete') this.errorCount++;
      },
      true
    );

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

    document.addEventListener('copy', () => this.cpCount++);
    document.addEventListener('paste', () => this.cpCount++);
  }

  start(emit: (signal: Record<string, number>) => void): void {
    this.intervalId = setInterval(() => emit(this.flush()), this.sampleRateMs);
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private flush(): Record<string, number> {
    const now = Date.now();

    const ikiAvg =
      this.keyBuffer.length > 0
        ? this.keyBuffer.reduce((a, b) => a + b, 0) / this.keyBuffer.length
        : 0;

    const { velocity: mv, acceleration: ma } = this.computeMouseVelocity();
    const mdc = this.computeDirectionChanges();
    const sv =
      this.scrollVelocityBuffer.length > 0
        ? this.scrollVelocityBuffer.reduce((a, b) => a + b, 0) / this.scrollVelocityBuffer.length
        : 0;
    const er = this.totalKeys > 0 ? this.errorCount / this.totalKeys : 0;
    const pause = now - this.lastActivity;

    const snap: Record<string, number> = {
      ts: now,
      iki: ikiAvg,
      mv,
      ma,
      mdc,
      sv,
      er,
      pause,
      ts_count: this.tabSwitches,
      cp: this.cpCount,
    };

    // Reset accumulators
    this.keyBuffer = [];
    this.tabSwitches = 0;
    this.cpCount = 0;
    this.errorCount = 0;
    this.totalKeys = 0;
    this.scrollVelocityBuffer = [];

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

    if (velocities.length === 0) return { velocity: 0, acceleration: 0 };

    const v = velocities.reduce((a, b) => a + b, 0) / velocities.length;
    const acc =
      velocities.length > 1
        ? Math.abs(velocities[velocities.length - 1] - velocities[0])
        : 0;

    return { velocity: v, acceleration: acc };
  }

  private computeDirectionChanges(): number {
    if (this.mouseTrack.length < 3) return 0;
    let changes = 0;
    let prevAngle: number | null = null;
    for (let i = 1; i < this.mouseTrack.length; i++) {
      const dx = this.mouseTrack[i].x - this.mouseTrack[i - 1].x;
      const dy = this.mouseTrack[i].y - this.mouseTrack[i - 1].y;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      const angle = Math.atan2(dy, dx);
      if (prevAngle !== null && Math.abs(angle - prevAngle) > Math.PI / 4) {
        changes++;
      }
      prevAngle = angle;
    }
    return changes;
  }
}
