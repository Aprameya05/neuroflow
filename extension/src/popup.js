const SIGNAL_LABELS = {
  keystroke_iki_ms: "Keystroke rhythm",
  mouse_velocity: "Mouse speed",
  mouse_acceleration: "Mouse jitter",
  mouse_direction_changes: "Direction changes",
  scroll_velocity: "Scroll speed",
  error_rate: "Error rate",
  tab_switches: "Tab switches",
  pause_duration_ms: "Pause duration",
  copy_paste_count: "Copy-paste",
  stub_heuristic: "Heuristic mode",
};

function getColor(load) {
  if (load < 0.3) return { text: "#15803d", bg: "#dcfce7", label: "In flow" };
  if (load < 0.65) return { text: "#92400e", bg: "#fef9c3", label: "Moderate" };
  return { text: "#b91c1c", bg: "#fef2f2", label: "Overloaded" };
}

function update() {
  chrome.storage.local.get(["latestEstimate", "sessionId"], (data) => {
    const e = data.latestEstimate;
    if (!e) return;

    const pct = Math.round(e.load * 100);
    const c = getColor(e.load);

    document.getElementById("load-number").textContent = pct + "%";
    document.getElementById("load-number").style.color = c.text;

    const badge = document.getElementById("state-badge");
    badge.textContent = c.label;
    badge.style.background = c.bg;
    badge.style.color = c.text;

    document.getElementById("signals").innerHTML = `
      <div class="signal-row"><span>Dominant signal</span><span>${SIGNAL_LABELS[e.dominant] ?? e.dominant}</span></div>
      <div class="signal-row"><span>Confidence</span><span>${Math.round(e.confidence * 100)}%</span></div>
      <div class="signal-row"><span>Session</span><span>${(data.sessionId ?? "").slice(0, 8)}…</span></div>
    `;
  });

  chrome.runtime.sendMessage({ type: "GET_STATUS" }, (res) => {
    if (!res) return;
    document.getElementById("status-dot").style.background = res.isConnected ? "#22c55e" : "#ef4444";
    document.getElementById("status-text").textContent = res.isConnected ? "Connected to backend" : "Backend offline";
  });
}

update();
setInterval(update, 500);
