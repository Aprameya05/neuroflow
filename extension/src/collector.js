/**
 * NeuroFlow Collector v2 — content script
 *
 * New signals added in v2
 * ----------------------
 * right_clicks     — right-click frequency (cognitive uncertainty proxy)
 * selection_len    — average text selection length (research/reference behaviour)
 * focus_switches   — element focus changes per window (attention fragmentation)
 * idle_quality     — distinguishes deliberate pause (1) from distraction (0)
 *                    based on whether the user returns quickly
 *
 * Sampling rate: 100 ms (unchanged)
 * Transport:     chrome.runtime.sendMessage → background.js → WebSocket
 */
(function () {
  "use strict";

  // ── Signal state ────────────────────────────────────────────────────────
  let keyBuffer       = [];
  let lastKeyTime     = 0;
  let errorCount      = 0;
  let totalKeys       = 0;
  let mouseTrack      = [];
  let scrollVelocities = [];
  let lastScrollY     = window.scrollY;
  let lastScrollTime  = Date.now();
  let tabSwitches     = 0;
  let cpCount         = 0;
  let rightClicks     = 0;
  let selectionLengths = [];
  let focusSwitches   = 0;
  let lastActivity    = Date.now();

  // For idle quality: track whether user returned to activity quickly
  let idleStart       = null;
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

  // New: right-click
  document.addEventListener("contextmenu", () => rightClicks++);

  // New: text selection length
  document.addEventListener("mouseup", () => {
    const sel = window.getSelection();
    if (sel && sel.toString().length > 0) {
      selectionLengths.push(sel.toString().length);
    }
  });

  // New: focus switches between elements
  document.addEventListener("focusin", () => {
    focusSwitches++;
    lastActivity = Date.now();
  }, true);

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
    const v = velocities.reduce((a, b) => a + b, 0) / velocities.length;
    const acc = Math.abs(velocities[velocities.length - 1] - velocities[0]);

    // Direction changes
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
    // 1.0 = deliberate focused pause (quick return), 0.0 = distraction
    const total = quickReturnCount + slowReturnCount;
    if (total === 0) return 0.5;   // neutral: no idle events
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
    const er    = totalKeys > 0 ? errorCount / totalKeys : 0;
    const pause = now - lastActivity;
    const avgSel = selectionLengths.length
      ? selectionLengths.reduce((a, b) => a + b, 0) / selectionLengths.length
      : 0;
    const idleQ = computeIdleQuality();

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
      url:        location.hostname,
    };

    // Reset accumulators
    keyBuffer       = [];
    errorCount      = 0;
    totalKeys       = 0;
    tabSwitches     = 0;
    cpCount         = 0;
    rightClicks     = 0;
    selectionLengths = [];
    focusSwitches   = 0;
    quickReturnCount = 0;
    slowReturnCount  = 0;
    scrollVelocities = [];

    chrome.runtime.sendMessage({ type: "SIGNAL", payload: signal });
  }

  // Track idle start when no activity for > 2s
  setInterval(() => {
    const now = Date.now();
    if (idleStart === null && now - lastActivity > 2000) {
      idleStart = now;
    }
  }, 500);

  setInterval(flush, 100);
  console.log("[NeuroFlow v2] collector active on", location.hostname);
})();
