/** Visual breath only. Tide heights and times are not shifted by this. */

export function clamp01(value) {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

/** About 8s near low water, about 14s near high water. Mid tide is ~11s. */
export function breathPeriodMs(level) {
  return 8000 + clamp01(level) * 6000;
}

/** A few pixels. Fuller near high water, shallow near low water. */
export function breathAmplitudePx(level) {
  return 2.2 + clamp01(level) * 4.4;
}

/** Eased sine, −1..1 over one period, times the amplitude in pixels. */
export function breathSwell(phase, level) {
  return Math.sin(phase) * breathAmplitudePx(level);
}

/**
 * 0 at low water, 1 at high water. Visual only — heights stay exact.
 * A flat or missing range sits at mid tide.
 */
export function tideBreathLevel(height, low, high) {
  if (!Number.isFinite(height) || !Number.isFinite(low) || !Number.isFinite(high)) return 0.5;
  if (high <= low) return 0.5;
  return clamp01((height - low) / (high - low));
}

/**
 * Brightness of the water light, 0..1.
 * Inhale brightens. A rising tide lifts it a little; a falling tide settles it.
 * `phase` is radians of the breath cycle, the same value passed to breathSwell.
 */
export function breathLight(phase, rising) {
  const inhale = (Math.sin(phase) + 1) / 2;
  const drift = rising ? 0.1 : -0.06;
  return Math.min(1, Math.max(0, 0.42 + inhale * 0.46 + drift));
}
