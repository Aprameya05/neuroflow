/** Shared load-color utilities for the dashboard. */

export function loadColor(load: number): string {
  if (load < 0.30) return "#34d399";
  if (load < 0.65) return "#f59e0b";
  return "#ef4444";
}

export function loadColorRgb(load: number): string {
  if (load < 0.30) return "52,211,153";
  if (load < 0.65) return "245,158,11";
  return "239,68,68";
}

export function loadColorRgba(load: number, alpha: number): string {
  return `rgba(${loadColorRgb(load)},${alpha})`;
}

export function loadLabel(load: number): string {
  if (load < 0.21) return "In Flow";
  if (load < 0.35) return "Focused";
  if (load < 0.65) return "Moderate";
  if (load < 0.80) return "High Load";
  return "Overloaded";
}

export function uiStateName(load: number): "rich" | "normal" | "reduced" | "minimal" {
  if (load < 0.21) return "rich";
  if (load < 0.35) return "normal";
  if (load < 0.65) return "reduced";
  return "minimal";
}

export const STATE_COLORS = {
  rich:    "#34d399",
  normal:  "#60a5fa",
  reduced: "#f59e0b",
  minimal: "#ef4444",
} as const;

export const STATE_LABELS = {
  rich:    "Rich",
  normal:  "Normal",
  reduced: "Reduced",
  minimal: "Minimal",
} as const;
