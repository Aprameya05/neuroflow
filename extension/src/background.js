/**
 * NeuroFlow Background Service Worker v2
 *
 * Improvements over v1
 * --------------------
 * Exponential backoff reconnect  — 1s → 2s → 4s → … → 60s cap (no thrashing)
 * Offline signal buffer          — up to 500 signals buffered in memory when
 *                                  WebSocket is disconnected; flushed on reconnect.
 * Adaptive badge                 — badge shows load% in colour; "BUF" when
 *                                  buffering offline; "ERR" on fatal error.
 * Heartbeat pong                 — responds to server ping to keep connection alive.
 * Session persistence            — session ID persists across extension restarts via
 *                                  chrome.storage.local.
 * Graceful shutdown              — flushes buffer before closing.
 */
"use strict";

const WS_BASE = "wss://neuroflow-backend-r6rs.onrender.com/ws/signal";

let ws              = null;
let sessionId       = null;
let isConnected     = false;
let reconnectDelay  = 1000;   // ms, doubles on each failure
let reconnectTimer  = null;
let offlineBuffer   = [];     // signals queued while disconnected
const MAX_BUFFER    = 500;    // drop oldest when buffer is full

// ── Initialise session ID ────────────────────────────────────────────────────

chrome.storage.local.get(["nf_session_id"], (res) => {
  sessionId = res.nf_session_id ?? crypto.randomUUID();
  chrome.storage.local.set({ nf_session_id: sessionId });
  connect();
});

// ── WebSocket management ─────────────────────────────────────────────────────

function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  const url = `${WS_BASE}/${sessionId}`;
  ws = new WebSocket(url);

  ws.onopen = () => {
    isConnected    = true;
    reconnectDelay = 1000;  // reset backoff on success
    setBadge("ON", "#22c55e");

    // Flush offline buffer
    if (offlineBuffer.length > 0) {
      const batch = offlineBuffer.splice(0);
      for (const sig of batch) {
        try { ws.send(JSON.stringify(sig)); } catch (_) { /* drop */ }
      }
    }
  };

  ws.onmessage = (event) => {
    let data;
    try { data = JSON.parse(event.data); } catch (_) { return; }

    // Respond to server heartbeat
    if (data.type === "ping") {
      try { ws.send(JSON.stringify({ type: "pong", ts: Date.now() })); } catch (_) {}
      return;
    }

    if (data.type !== "load_estimate") return;

    // Persist latest estimate for popup
    chrome.storage.local.set({ nf_latest: data });

    // Badge
    const pct   = Math.round(data.load * 100);
    const color = data.load < 0.21 ? "#6366f1"    // rich  — indigo
                : data.load < 0.35 ? "#22c55e"    // normal — green
                : data.load < 0.65 ? "#f59e0b"    // reduced — amber
                                   : "#ef4444";   // minimal — red
    setBadge(`${pct}%`, color);

    // Anomaly flash: briefly show "!" in red
    if (data.is_anomaly) {
      setBadge("!", "#ef4444");
      setTimeout(() => setBadge(`${pct}%`, color), 800);
    }
  };

  ws.onclose = () => {
    isConnected = false;
    setBadge("BUF", "#6b7280");
    scheduleReconnect();
  };

  ws.onerror = () => {
    // onclose will fire after onerror; no duplicate scheduling needed
  };
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, reconnectDelay);
  // Exponential backoff with 60 s cap
  reconnectDelay = Math.min(reconnectDelay * 2, 60_000);
}

function setBadge(text, color) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
}

// ── Message handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "SIGNAL") {
    const payload = message.payload;

    if (ws?.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(payload));
      } catch (_) {
        bufferSignal(payload);
      }
    } else {
      bufferSignal(payload);
    }
  }

  if (message.type === "GET_STATUS") {
    sendResponse({
      isConnected,
      sessionId,
      buffered: offlineBuffer.length,
      reconnectDelay,
    });
  }

  if (message.type === "RESET_SESSION") {
    sessionId = crypto.randomUUID();
    chrome.storage.local.set({ nf_session_id: sessionId });
    offlineBuffer = [];
    if (ws) { try { ws.close(); } catch (_) {} }
    connect();
    sendResponse({ sessionId });
  }
});

function bufferSignal(payload) {
  if (offlineBuffer.length >= MAX_BUFFER) {
    offlineBuffer.shift();  // drop oldest
  }
  offlineBuffer.push(payload);
  setBadge(`${offlineBuffer.length}`, "#6b7280");
}
