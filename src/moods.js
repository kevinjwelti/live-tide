/**
 * Daily wall-art moods. Rotation is America/Managua midnight, never the
 * same mood two days in a row. Preview any mood with ?mood=<id>.
 */
import { startOfZonedDay } from "./time.js";

/** Canvas styles matching the current (pre-mood) Live Tide look. */
export const CLASSIC_CANVAS = {
  mistTop: "rgba(252, 246, 238, 0.10)",
  mistBottom: "rgba(252, 246, 238, 0.02)",
  showMist: true,
  outer: { day: "rgba(44, 38, 34, 0.22)", night: "rgba(8, 10, 16, 0.7)" },
  inner: { day: "rgba(252, 248, 242, 0.94)", night: "rgba(255, 252, 246, 0.98)" },
  outerWidth: { day: 3.2, night: 4.4 },
  innerWidth: { day: 1.55, night: 2.2 },
  twin: null,
  torn: false,
  bleed: false,
  grid: false,
  ticks: false,
  showDots: true,
  dotFill: "#c9a15c",
  dotStroke: "rgba(44, 38, 34, 0.35)",
  dotRadius: 3.8,
  dotWidth: 1.6,
};

export const MOODS = {
  ink: {
    id: "ink",
    name: "Ink & Parchment",
    rotation: true,
    overlay: { color: "#e8d7b0", strength: 0.3, blend: "soft-light" },
    canvas: {
      ...CLASSIC_CANVAS,
      showMist: false,
      outer: { day: "rgba(42, 32, 22, 0.18)", night: "rgba(20, 16, 12, 0.55)" },
      inner: { day: "rgba(36, 26, 16, 0.88)", night: "rgba(236, 226, 208, 0.92)" },
      outerWidth: { day: 1.6, night: 2.2 },
      innerWidth: { day: 1.05, night: 1.2 },
      dotFill: "#2a2016",
      dotStroke: "rgba(42, 32, 22, 0.45)",
      dotRadius: 2.6,
      dotWidth: 1,
    },
  },
  risograph: {
    id: "risograph",
    name: "Risograph",
    rotation: false,
    overlay: { color: "#e36a4a", strength: 0.22, blend: "multiply" },
    canvas: {
      ...CLASSIC_CANVAS,
      showMist: false,
      twin: {
        a: { color: "rgba(232, 92, 68, 0.85)", dx: -1.6, dy: 0.8, width: 2.1 },
        b: { color: "rgba(20, 148, 142, 0.85)", dx: 1.6, dy: -0.8, width: 2.1 },
      },
      outer: { day: "transparent", night: "transparent" },
      inner: { day: "transparent", night: "transparent" },
      outerWidth: { day: 0, night: 0 },
      innerWidth: { day: 0, night: 0 },
      showDots: true,
      dotFill: "#e85c44",
      dotStroke: "rgba(20, 148, 142, 0.7)",
      dotRadius: 3.2,
    },
  },
  blueprint: {
    id: "blueprint",
    name: "Blueprint",
    rotation: false,
    overlay: { color: "#0b3d73", strength: 0.26, blend: "multiply" },
    canvas: {
      ...CLASSIC_CANVAS,
      showMist: false,
      grid: true,
      ticks: true,
      outer: { day: "rgba(180, 220, 255, 0.25)", night: "rgba(160, 210, 255, 0.2)" },
      inner: { day: "rgba(245, 252, 255, 0.96)", night: "rgba(230, 244, 255, 0.95)" },
      outerWidth: { day: 2.2, night: 2.6 },
      innerWidth: { day: 1.35, night: 1.5 },
      dotFill: "#f4fbff",
      dotStroke: "rgba(160, 210, 255, 0.7)",
      dotRadius: 2.4,
    },
  },
  fiesta: {
    id: "fiesta",
    name: "Nicaraguan Fiesta",
    rotation: false,
    overlay: { color: "#d4783a", strength: 0.28, blend: "soft-light", nightScale: 0.35 },
    canvas: {
      ...CLASSIC_CANVAS,
      mistTop: "rgba(232, 140, 70, 0.16)",
      mistBottom: "rgba(196, 64, 72, 0.04)",
      outer: { day: "rgba(120, 40, 36, 0.28)", night: "rgba(20, 12, 14, 0.65)" },
      inner: { day: "rgba(196, 72, 48, 0.92)", night: "rgba(244, 210, 170, 0.92)" },
      outerWidth: { day: 3.4, night: 4 },
      innerWidth: { day: 1.7, night: 1.8 },
      dotFill: "#c44a32",
      dotStroke: "rgba(90, 32, 28, 0.45)",
    },
  },
  swiss: {
    id: "swiss",
    name: "Minimal Swiss",
    rotation: true,
    overlay: { color: "#d0d4d8", strength: 0.2, blend: "soft-light" },
    canvas: {
      ...CLASSIC_CANVAS,
      showMist: false,
      showDots: false,
      outer: { day: "transparent", night: "transparent" },
      inner: { day: "rgba(20, 32, 51, 0.92)", night: "rgba(244, 239, 230, 0.92)" },
      outerWidth: { day: 0, night: 0 },
      innerWidth: { day: 1.15, night: 1.2 },
    },
  },
  watercolor: {
    id: "watercolor",
    name: "Watercolor Bleed",
    rotation: false,
    overlay: { color: "#7eb0d4", strength: 0.24, blend: "soft-light" },
    canvas: {
      ...CLASSIC_CANVAS,
      bleed: true,
      mistTop: "rgba(90, 150, 196, 0.18)",
      mistBottom: "rgba(90, 150, 196, 0.03)",
      outer: { day: "rgba(46, 92, 132, 0.18)", night: "rgba(8, 12, 20, 0.5)" },
      inner: { day: "rgba(36, 82, 124, 0.7)", night: "rgba(210, 226, 240, 0.86)" },
      outerWidth: { day: 6, night: 7 },
      innerWidth: { day: 2.1, night: 2.2 },
      dotFill: "#3a6e96",
      dotStroke: "rgba(36, 82, 124, 0.35)",
      dotRadius: 4.4,
    },
  },
  noir: {
    id: "noir",
    name: "Noir",
    rotation: true,
    overlay: { color: "#101214", strength: 0.32, blend: "saturation" },
    canvas: {
      ...CLASSIC_CANVAS,
      showMist: false,
      outer: { day: "rgba(0, 0, 0, 0.35)", night: "rgba(0, 0, 0, 0.55)" },
      inner: { day: "rgba(214, 218, 224, 0.96)", night: "rgba(228, 232, 236, 0.96)" },
      outerWidth: { day: 2.6, night: 3.2 },
      innerWidth: { day: 1.55, night: 1.7 },
      dotFill: "#d6dae0",
      dotStroke: "rgba(8, 8, 10, 0.7)",
      dotRadius: 2.8,
      dotWidth: 1.2,
    },
  },
  zine: {
    id: "zine",
    name: "Surf Zine",
    rotation: false,
    overlay: { color: "#f2e6c8", strength: 0.26, blend: "multiply" },
    canvas: {
      ...CLASSIC_CANVAS,
      torn: true,
      showMist: false,
      outer: { day: "rgba(24, 24, 24, 0.9)", night: "rgba(245, 240, 230, 0.88)" },
      inner: { day: "rgba(24, 24, 24, 0.95)", night: "rgba(245, 240, 230, 0.95)" },
      outerWidth: { day: 2.8, night: 2.8 },
      innerWidth: { day: 1.4, night: 1.4 },
      dotFill: "#1c1c1c",
      dotStroke: "rgba(24, 24, 24, 0.5)",
      dotRadius: 2.2,
    },
  },
};

export const ROTATION_IDS = Object.values(MOODS)
  .filter((mood) => mood.rotation)
  .map((mood) => mood.id);

let active = MOODS.ink;

function dayNumber(date) {
  return Math.floor(startOfZonedDay(date).getTime() / 86400000);
}

/** Deterministic pick that is never equal to yesterday's pick. */
export function moodIdForDate(date = new Date(), roster = ROTATION_IDS) {
  if (!roster.length) return "ink";
  return roster[((dayNumber(date) % roster.length) + roster.length) % roster.length];
}

export function moodFromQuery(search = "") {
  const raw = new URLSearchParams(search.startsWith("?") ? search : `?${search}`).get("mood");
  if (!raw) return null;
  return MOODS[raw.toLowerCase()] ?? null;
}

export function pickMood(date = new Date(), search = typeof location === "undefined" ? "" : location.search) {
  return moodFromQuery(search) ?? MOODS[moodIdForDate(date)] ?? MOODS.ink;
}

export function applyMood(mood, root = document.documentElement) {
  active = mood ?? pickMood();
  root.dataset.mood = active.id;
  const overlay = active.overlay;
  root.style.setProperty("--mood-overlay", overlay?.color ?? "transparent");
  root.style.setProperty("--mood-strength", String(overlay?.strength ?? 0));
  root.style.setProperty("--mood-blend", overlay?.blend ?? "soft-light");
  root.style.setProperty("--mood-night-scale", String(overlay?.nightScale ?? 0.45));
  window.dispatchEvent(new CustomEvent("livetide-mood", { detail: active.id }));
  return active;
}

export function currentMood() {
  return active;
}

export function canvasStyle() {
  return active.canvas ?? CLASSIC_CANVAS;
}

export function allMoods() {
  return Object.values(MOODS);
}
