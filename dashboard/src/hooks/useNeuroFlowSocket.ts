/**
 * React hook — connects to the NeuroFlow WebSocket and streams load estimates.
 *
 * Usage:
 *   const { estimates, currentLoad, isConnected } = useNeuroFlowSocket(sessionId);
 */
import { useState, useEffect, useRef, useCallback } from "react";
import type { LoadEstimate } from "../types";

const WS_URL = (import.meta as any).env?.VITE_WS_URL ?? "ws://localhost:8000/ws/signal";
const MAX_HISTORY = 300; // ~30 seconds at 100ms sample rate

interface UseNeuroFlowSocketResult {
  estimates: LoadEstimate[];
  currentLoad: number | null;
  currentDominant: string | null;
  isConnected: boolean;
  reconnect: () => void;
}

export function useNeuroFlowSocket(sessionId: string): UseNeuroFlowSocketResult {
  const [estimates, setEstimates] = useState<LoadEstimate[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(`${WS_URL}/${sessionId}`);
    wsRef.current = ws;

    ws.onopen = () => setIsConnected(true);

    ws.onmessage = (event) => {
      try {
        const estimate: LoadEstimate = JSON.parse(event.data);
        if (estimate.type !== "load_estimate") return;
        setEstimates((prev) => {
          const next = [...prev, estimate];
          return next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next;
        });
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [sessionId]);

  useEffect(() => {
    connect();
    return () => {
      reconnectTimer.current && clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const currentEstimate = estimates[estimates.length - 1] ?? null;

  return {
    estimates,
    currentLoad: currentEstimate?.load ?? null,
    currentDominant: currentEstimate?.dominant ?? null,
    isConnected,
    reconnect: connect,
  };
}
