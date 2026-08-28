const SYNODIC = 29.530588853;
const KNOWN_NEW = Date.UTC(2000, 0, 6, 18, 14);

const NAMES = [
  [0.03, "NEW MOON"],
  [0.22, "WAXING CRESCENT"],
  [0.28, "FIRST QUARTER"],
  [0.47, "WAXING GIBBOUS"],
  [0.53, "FULL MOON"],
  [0.72, "WANING GIBBOUS"],
  [0.78, "LAST QUARTER"],
  [0.97, "WANING CRESCENT"],
  [1, "NEW MOON"],
];

export function moonState(date = new Date()) {
  const days = (date.getTime() - KNOWN_NEW) / 86400000;
  const age = ((days % SYNODIC) + SYNODIC) % SYNODIC;
  const phase = age / SYNODIC;
  const illumination = (1 - Math.cos(2 * Math.PI * phase)) / 2;
  const name = NAMES.find((row) => phase <= row[0])[1];
  return { age, phase, illumination, name };
}

/** Draw a simple lit moon disk into an SVG element. */
export function renderMoon(svg, state) {
  svg.replaceChildren();
  const ns = "http://www.w3.org/2000/svg";
  const add = (name, attrs, parent = svg) => {
    const el = document.createElementNS(ns, name);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
    parent.append(el);
    return el;
  };
  const defs = add("defs", {});
  const clip = add("clipPath", { id: "moon-disk" }, defs);
  add("circle", { cx: "24", cy: "24", r: "13" }, clip);
  add("circle", {
    cx: "24",
    cy: "24",
    r: "13",
    fill: "rgba(243,234,216,0.14)",
    stroke: "currentColor",
    "stroke-width": "1.2",
  });
  const offset = Math.cos(2 * Math.PI * state.phase) * 13;
  add("circle", {
    cx: String(24 + offset),
    cy: "24",
    r: "13",
    fill: "currentColor",
    "clip-path": "url(#moon-disk)",
    opacity: "0.92",
  });
}
