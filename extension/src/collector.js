/**
 * NeuroFlow Collector v2.1 — content script
 *
 * New signals added in v2
 * ----------------------
 * right_clicks     — right-click frequency (cognitive uncertainty proxy)
 * selection_len    — average text selection length (research/reference behaviour)
 * focus_switches   — element focus changes per window (attention fragmentation)
 * idle_quality     — distinguishes deliberate pause (1) from distraction (0)
 *                    based on whether the user returns quickly
 *
 * New in v2.1
 * -----------
 * cognitive_recovery_rate — how quickly the user's behaviour recovers after
 *   an overload spike. Computed as the exponential smoothing rate of load
 *   decrease in the post-peak window. A high recovery rate indicates resilience;
 *   a low rate indicates sustained overload.
 *
 * Per-domain calibration — each site gets its own load baseline multiplier
 *   stored in chrome.storage.local under "calibration:<hostname>". The
 *   multiplier is updated every session by comparing the session mean load to
 *   the global baseline (0.40). On the next visit to the same domain, the
 *   collector sends the calibration factor with every signal so the backend
 *   can normalise appropriately.
 *
 * Sampling rate: 100 ms (unchanged)
 * Transport:     chrome.runtime.sendMessage → background.js → WebSocket
 */
(function () {
  "use strict";

  const HOSTNAME = location.hostname;

  // ── Per-domain calibration ────────────────────────────────────────────────

  /**
   * Calibration factor for this domain.
   * 1.0 = no adjustment; > 1.0 = this domain typically produces higher load;
   * < 1.0 = this domain typically produces lower load.
   * Loaded asynchronously from chrome.storage.local on startup.
   */
  let domainCalibration = 1.0;
  let calibrationLoaded = false;

  // Sliding window of load scores received this session (for calibration update)
  const SESSION_LOAD_WINDOW = 200;   // last N load estimates
  let sessionLoads = [];

  function loadDomainCalibration() {
    const key = "calibration:" + HOSTNAME;
    try {
      chrome.storage.local.get(key, (result) => {
        if (chrome.runtime.lastError) return;
        const stored = result[key];
        if (typeof stored === "number" && isFinite(stored) && stored > 0) {
          domainCalibration = stored;
        }
        calibrationLoaded = true;
        console.log("[NeuroFlow v2.1] domain calibration for", HOSTNAME, "→", domainCalibration.toFixed(3));
      });
    } catch (_) {
      calibrationLoaded = true;
    }
  }

  /**
   * Called by background.js when a load estimate arrives back from the server.
   * Accumulates session loads and, at the end of the session, updates the
   * per-domain calibration factor.
   */
  function onLoadEstimate(loadScore) {
    if (!isFinite(loadScore)) return;
    sessionLoads.push(loadScore);
    if (sessionLoads.length > SESSION_LOAD_WINDOW) {
      sessionLoads.shift();
    }
  }

  function saveDomainCalibration() {
    if (sessionLoads.length < 20) return;   // not enough data
    const GLOBAL_BASELINE = 0.40;
    const sessionMean = sessionLoads.reduce((a, b) => a + b, 0) / sessionLoads.length;
    // Blend: 70% old factor, 30% new observation (slow drift)
    const newFactor = domainCalibration * 0.70 + (sessionMean / GLOBAL_BASELINE) * 0.30;
    const clamped   = Math.min(Math.max(newFactor, 0.5), 2.0);
    const key = "calibration:" + HOSTNAME;
    try {
      chrome.storage.local.set({ [key]: clamped }, () => {
        if (!chrome.runtime.lastError) {
          console.log("[NeuroFlow v2.1] saved domain calibration:", HOSTNAME, "→", clamped.toFixed(3));
        }
      });
    } catch (_) {}
  }

  // Save calibration when tab closes or navigates away
  window.addEventListener("beforeunload", saveDomainCalibration);

  // ── Cognitive recovery rate tracker ──────────────────────────────────────

  /**
   * Tracks how quickly the user behaviorally recovers from overload spikes.
   *
   * Algorithm:
   *   1. Detect an overload event: load estimate > 0.65.
   *   2. Watch the next N windows for load to decrease.
   *   3. Compute the slope of the decreasing load curve.
   *   4. Normalise to [0, 1]: 0 = no recovery (flat or still rising),
   *      1 = fast recovery (steep drop back below 0.40 in < 5 windows).
   *
   * The value is updated via onLoadEstimate().
   */
  const RECOVERY_WINDOW = 20;    // windows to observe post-peak
  let inOverload        = false;
  let postPeakLoads     = [];
  let peakLoad          = 0;
  let cognitiveRecoveryRate = 0.5;   // neutral initial value

  function updateRecovery(load) {
    if (!inOverload) {
      if (load > 0.65) {
        inOverload    = true;
        postPeakLoads = [];
        peakLoad      = load;
      }
    } else {
      postPeakLoads.push(load);
      if (postPeakLoads.length >= RECOVERY_WINDOW) {
        // Compute linear regression slope (load ~ window index)
        const n    = postPeakLoads.length;
        const xBar = (n - 1) / 2;
        const yBar = postPeakLoads.reduce((a, b) => a + b, 0) / n;
        let num = 0, den = 0;
        for (let i = 0; i < n; i++) {
          num += (i - xBar) * (postPeakLoads[i] - yBar);
          den += (i - xBar) ** 2;
        }
        const slope = den > 0 ? num / den : 0;
        // Slope is negative when recovering (load decreasing)
        // Normalise: slope of -0.03 per window ≈ full recovery in RECOVERY_WINDOW frames
        const normalised = Math.min(Math.max(-slope / 0.03, 0), 1);
        // Smooth with the previous value
        cognitiveRecoveryRate = cognitiveRecoveryRate * 0.6 + normalised * 0.4;
        inOverload    = false;
        postPeakLoads = [];
      }
      // Give up if load never dropped (user stayed overloaded)
      if (postPeakLoads.length >= RECOVERY_WINDOW * 2) {
        cognitiveRecoveryRate = cognitiveRecoveryRate * 0.6 + 0.0 * 0.4;
        inOverload    = false;
        postPeakLoads = [];
      }
    }
  }

  // ── Signal state ────────────────────────────────────────────────────────
  let keyBuffer        = [];
  let lastKeyTime      = 0;
  let errorCount       = 0;
  let totalKeys        = 0;
  let mouseTrack       = [];
  let scrollVelocities = [];
  let lastScrollY      = window.scrollY;
  let lastScrollTime   = Date.now();
  let tabSwitches      = 0;
  let cpCount          = 0;
  let rightClicks      = 0;
  let selectionLengths = [];
  let focusSwitches    = 0;
  let lastActivity     = Date.now();

  // For idle quality: track whether user returned to activity quickly
  let idleStart        = null;
  let quickReturnCount = 0;
  let slowReturnCount  = 0;

  // ── Event listeners ──────────────────────────────────────────────────────

  document.addEventListener("keydown", (e) => {
    const now = Date.now();
    if (lastKeyTime > 0) keyBuffer.push(now - lastKeyTime);
    lastKeyTime = now;
    totalKeys++;

    if (idleStart !== null) {
      const idleDuration = now - idleStart;
      if (idleDuration < 3000) quickReturnCount++;
      else slowReturnCount++;
      idleStart = null;
    }

    lastActivity = now;
    if (e.key === "Backspace" || e.key === "Delete") errorCount++;
  }, true);

  document.addEventListener("mousemove", (e) => {
    mouseTrack.push({ x: e.clientX, y: e.clientY, t: Date.now() });
    if (mouseTrack.length > 60) mouseTrack.shift();
    lastActivity = Date.now();
  });

  window.addEventListener("scroll", () => {
    const now = Date.now();
    const dt  = now - lastScrollTime;
    if (dt > 0) {
      const dy = Math.abs(window.scrollY - lastScrollY);
      scrollVelocities.push(dy / dt);
    }
    lastScrollY    = window.scrollY;
    lastScrollTime = now;
    lastActivity   = now;
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      tabSwitches++;
      idleStart = Date.now();
    }
  });

  document.addEventListener("copy",  () => { cpCount++; });
  document.addEventListener("paste", () => { cpCount++; lastActivity = Date.now(); });

  document.addEventListener("contextmenu", () => rightClicks++);

  document.addEventListener("mouseup", () => {
    const sel = window.getSelection();
    if (sel && sel.toString().length > 0) {
      selectionLengths.push(sel.toString().length);
    }
  });

  document.addEventListener("focusin", () => {
    focusSwitches++;
    lastActivity = Date.now();
  }, true);

  // Listen for load estimates pushed back from background.js
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "LOAD_ESTIMATE" && typeof msg.load === "number") {
      onLoadEstimate(msg.load);
      updateRecovery(msg.load);
    }
  });

  // ── Compute derived metrics ──────────────────────────────────────────────

  function computeMouseVelocity() {
    if (mouseTrack.length < 2) return { velocity: 0, acceleration: 0, dirChanges: 0 };
    const velocities = [];
    for (let i = 1; i < mouseTrack.length; i++) {
      const dx = mouseTrack[i].x - mouseTrack[i - 1].x;
      const dy = mouseTrack[i].y - mouseTrack[i - 1].y;
      const dt = mouseTrack[i].t - mouseTrack[i - 1].t;
      if (dt > 0) velocities.push(Math.sqrt(dx * dx + dy * dy) / dt);
    }
    if (!velocities.length) return { velocity: 0, acceleration: 0, dirChanges: 0 };
    const v   = velocities.reduce((a, b) => a + b, 0) / velocities.length;
    const acc = Math.abs(velocities[velocities.length - 1] - velocities[0]);

    let changes = 0, prevAngle = null;
    for (let i = 1; i < mouseTrack.length; i++) {
      const dx = mouseTrack[i].x - mouseTrack[i - 1].x;
      const dy = mouseTrack[i].y - mouseTrack[i - 1].y;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      const angle = Math.atan2(dy, dx);
      if (prevAngle !== null && Math.abs(angle - prevAngle) > Math.PI / 4) changes++;
      prevAngle = angle;
    }

    return { velocity: v, acceleration: acc, dirChanges: changes };
  }

  function computeIdleQuality() {
    const total = quickReturnCount + slowReturnCount;
    if (total === 0) return 0.5;
    return quickReturnCount / total;
  }

  // ── Flush interval (100 ms) ──────────────────────────────────────────────

  function flush() {
    const now = Date.now();
    const iki = keyBuffer.length
      ? keyBuffer.reduce((a, b) => a + b, 0) / keyBuffer.length
      : 0;

    const { velocity: mv, acceleration: ma, dirChanges: mdc } = computeMouseVelocity();
    const sv = scrollVelocities.length
      ? scrollVelocities.reduce((a, b) => a + b, 0) / scrollVelocities.length
      : 0;
    const er     = totalKeys > 0 ? errorCount / totalKeys : 0;
    const pause  = now - lastActivity;
    const avgSel = selectionLengths.length
      ? selectionLengths.reduce((a, b) => a + b, 0) / selectionLengths.length
      : 0;
    const idleQ  = computeIdleQuality();

    const signal = {
      ts:         now,
      iki,
      mv,
      ma,
      mdc,
      sv,
      er,
      pause,
      ts_count:   tabSwitches,
      cp:         cpCount,
      // v2 additions
      rc:         rightClicks,
      sel:        Math.round(avgSel),
      fc:         focusSwitches,
      idle_q:     Math.round(idleQ * 100) / 100,
      // v2.1 additions
      recovery_rate:        Math.round(cognitiveRecoveryRate * 1000) / 1000,
      domain_calibration:   Math.round(domainCalibration * 1000) / 1000,
      url:        HOSTNAME,
    };

    // Reset accumulators
    keyBuffer        = [];
    errorCount       = 0;
    totalKeys        = 0;
    tabSwitches      = 0;
    cpCount          = 0;
    rightClicks      = 0;
    selectionLengths = [];
    focusSwitches    = 0;
    quickReturnCount = 0;
    slowReturnCount  = 0;
    scrollVelocities = [];

    chrome.runtime.sendMessage({ type: "SIGNAL", payload: signal });
  }

  // Track idle start when no activity for > 2 s
  setInterval(() => {
    const now = Date.now();
    if (idleStart === null && now - lastActivity > 2000) {
      idleStart = now;
    }
  }, 500);

  loadDomainCalibration();
  setInterval(flush, 100);
  console.log("[NeuroFlow v2.1] collector active on", HOSTNAME);
})();
