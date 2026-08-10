export interface LoadEstimate {
  type: "load_estimate";
  load: number;
  confidence: number;
  dominant: string;
  ts: number;
  session_id: string;
}

export type UIState = "minimal" | "reduced" | "normal" | "rich";
