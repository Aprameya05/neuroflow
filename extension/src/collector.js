(function () {
  let keyBuffer = [];
  let lastKeyTime = 0;
  let errorCount = 0;
  let totalKeys = 0;
  let mouseTrack = [];
  let scrollVelocities = [];
  let lastScrollY = window.scrollY;
  let lastScrollTime = Date.now();
  let tabSwitches = 0;
  let cpCount = 0;
  let lastActivity = Date.now();

  document.addEventListener("keydown", (e) => {
    const now = Date.now();
    if (lastKeyTime > 0) keyBuffer.push(now - lastKeyTime);
    lastKeyTime = now;
    totalKeys++;
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
    const dt = now - lastScrollTime;
    if (dt > 0) {
      const dy = Math.abs(window.scrollY - lastScrollY);
      scrollVelocities.push(dy / dt);
    }
    lastScrollY = window.scrollY;
    lastScrollTime = now;
    lastActivity = now;
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) tabSwitches++;
  });

  document.addEventListener("copy", () => cpCount++);
  document.addEventListener("paste", () => { cpCount++; lastActivity = Date.now(); });

  function computeMouseVelocity() {
    if (mouseTrack.length < 2) return { velocity: 0, acceleration: 0 };
    const velocities = [];
    for (let i = 1; i < mouseTrack.length; i++) {
      const dx = mouseTrack[i].x - mouseTrack[i-1].x;
      const dy = mouseTrack[i].y - mouseTrack[i-1].y;
      const dt = mouseTrack[i].t - mouseTrack[i-1].t;
      if (dt > 0) velocities.push(Math.sqrt(dx*dx + dy*dy) / dt);
    }
    if (!velocities.length) return { velocity: 0, acceleration: 0 };
    const v = velocities.reduce((a,b) => a+b, 0) / velocities.length;
    const acc = Math.abs(velocities[velocities.length-1] - velocities[0]);
    return { velocity: v, acceleration: acc };
  }

  function computeDirectionChanges() {
    if (mouseTrack.length < 3) return 0;
    let changes = 0, prevAngle = null;
    for (let i = 1; i < mouseTrack.length; i++) {
      const dx = mouseTrack[i].x - mouseTrack[i-1].x;
      const dy = mouseTrack[i].y - mouseTrack[i-1].y;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      const angle = Math.atan2(dy, dx);
      if (prevAngle !== null && Math.abs(angle - prevAngle) > Math.PI / 4) changes++;
      prevAngle = angle;
    }
    return changes;
  }

  function flush() {
    const now = Date.now();
    const iki = keyBuffer.length ? keyBuffer.reduce((a,b) => a+b, 0) / keyBuffer.length : 0;
    const { velocity: mv, acceleration: ma } = computeMouseVelocity();
    const mdc = computeDirectionChanges();
    const sv = scrollVelocities.length ? scrollVelocities.reduce((a,b) => a+b, 0) / scrollVelocities.length : 0;
    const er = totalKeys > 0 ? errorCount / totalKeys : 0;
    const pause = now - lastActivity;

    const signal = { ts: now, iki, mv, ma, mdc, sv, er, pause, ts_count: tabSwitches, cp: cpCount, url: location.hostname };

    keyBuffer = []; errorCount = 0; totalKeys = 0;
    tabSwitches = 0; cpCount = 0; scrollVelocities = [];

    chrome.runtime.sendMessage({ type: "SIGNAL", payload: signal });
  }

  setInterval(flush, 100);
  console.log("[NeuroFlow] collector active on", location.hostname);
})();
