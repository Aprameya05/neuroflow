/**
 * NeuroFlow theme utilities.
 * Dynamic color interpolation based on cognitive load score.
 *
 * Color spectrum:
 *   0.0 - 0.35  -> Indigo  (#6366f1) -- low load, in flow
 *   0.35 - 0.65 -> Amber   (#f59e0b) -- moderate load
 *   0.65 - 1.0  -> Red     (#ef4444) -- high load, overwhelmed
 */

interface RGB {
  r: number;
  g: number;
  b: number;
}

const INDIGO: RGB = { r: 99, g: 102, b: 241 };
const AMBER: RGB  = { r: 245, g: 158, b: 11 };
const RED: RGB    = { r: 239, g: 68, b: 68 };

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * Math.max(0, Math.min(1, t)));
}

function interpolateRGB(from: RGB, to: RGB, t: number): RGB {
  return {
    r: lerp(from.r, to.r, t),
    g: lerp(from.g, to.g, t),
    b: lerp(from.b, to.b, t),
  };
}

function scoreToRGB(score: number): RGB {
  const s = Math.max(0, Math.min(1, score));
  if (s <= 0.35) {
    return interpolateRGB(INDIGO, AMBER, s / 0.35);
  }
  return interpolateRGB(AMBER, RED, (s - 0.35) / 0.65);
}

/**
 * Returns a CSS hex color string for the given load score.
 * Smoothly interpolates indigo -> amber -> red.
 */
export function getLoadColor(score: number): string {
  const { r, g, b } = scoreToRGB(score);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Returns a CSS rgba color string with the given alpha.
 * Used for glows, backgrounds, borders.
 */
export function getLoadColorRgba(score: number, alpha: number): string {
  const { r, g, b } = scoreToRGB(score);
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/**
 * Returns a CSS hex string for the given load score.
 * Use when you need a hex value specifically.
 */
export function getLoadColorHex(score: number): string {
  const { r, g, b } = scoreToRGB(score);
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
