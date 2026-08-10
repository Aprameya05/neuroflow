const WS_URL = "ws://localhost:8000/ws/signal";
let ws = null;
let sessionId = null;
let reconnectTimer = null;
let isConnected = false;

chrome.storage.local.get(["sessionId"], (result) => {
  sessionId = result.sessionId ?? crypto.randomUUID();
  chrome.storage.local.set({ sessionId });
  connect();
});

function connect() {
  if (ws?.readyState === WebSocket.OPEN) return;

  ws = new WebSocket(`${WS_URL}/${sessionId}`);

  ws.onopen = () => {
    isConnected = true;
    chrome.action.setBadgeText({ text: "ON" });
    chrome.action.setBadgeBackgroundColor({ color: "#22c55e" });
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  };

  ws.onmessage = (event) => {
    const estimate = JSON.parse(event.data);
    if (estimate.type !== "load_estimate") return;
    chrome.storage.local.set({ latestEstimate: estimate });
    const pct = Math.round(estimate.load * 100);
    chrome.action.setBadgeText({ text: `${pct}%` });
    const color = estimate.load < 0.3 ? "#22c55e" : estimate.load < 0.65 ? "#f59e0b" : "#ef4444";
    chrome.action.setBadgeBackgroundColor({ color });
  };

  ws.onclose = () => {
    isConnected = false;
    chrome.action.setBadgeText({ text: "OFF" });
    chrome.action.setBadgeBackgroundColor({ color: "#6b7280" });
    reconnectTimer = setTimeout(connect, 3000);
  };

  ws.onerror = () => ws.close();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "SIGNAL") {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message.payload));
    }
  }
  if (message.type === "GET_STATUS") {
    sendResponse({ isConnected, sessionId });
  }
});
