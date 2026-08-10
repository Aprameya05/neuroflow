/**
 * React hook adapter for the NeuroFlow SDK.
 * Wraps the NeuroFlow class so React components can subscribe cleanly.
 *
 * Usage:
 *   const { load, uiState, isConnected } = useNeuroFlow({ sessionId, wsUrl });
 */
import { useEffect, useRef, useState } from "react";
import { NeuroFlow } from "../core/NeuroFlow";
import type { NeuroFlowConfig, LoadEstimate, UIState } from "../core/NeuroFlow";

interface UseNeuroFlowResult {
  load: number | null;
  uiState: UIState | null;
  lastEstimate: LoadEstimate | null;
  isConnected: boolean;
}

export function useNeuroFlow(config: NeuroFlowConfig): UseNeuroFlowResult {
  const nfRef = useRef<NeuroFlow | null>(null);
  const [load, setLoad] = useState<number | null>(null);
  const [uiState, setUiState] = useState<UIState | null>(null);
  const [lastEstimate, setLastEstimate] = useState<LoadEstimate | null>(null);

  useEffect(() => {
    const nf = new NeuroFlow(config);
    nfRef.current = nf;

    const unsubscribe = nf.onLoadChange((estimate, state) => {
      setLoad(estimate.load);
      setUiState(state);
      setLastEstimate(estimate);
    });

    nf.start();

    return () => {
      unsubscribe();
      nf.stop();
    };
  }, [config.sessionId, config.wsUrl]);

  return {
    load,
    uiState,
    lastEstimate,
    isConnected: true, // TODO: expose from NeuroFlow class
  };
}
