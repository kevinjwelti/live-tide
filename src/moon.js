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

const svgNS = "http://www.w3.org/2000/svg";
let svgSeq = 0;

function add(parent, name, attrs) {
  const el = document.createElementNS(svgNS, name);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  parent.append(el);
  return el;
}

/** Draw a simple lit moon disk into an SVG element. */
export function renderMoon(svg, state, opts = {}) {
  svg.replaceChildren();
  const {
    lit = "currentColor",
    shade = "rgba(243,234,216,0.14)",
    rim = "currentColor",
  } = opts;
  const uid = `m${++svgSeq}`;
  const defs = add(svg, "defs", {});
  const clip = add(defs, "clipPath", { id: `${uid}-disk` });
  add(clip, "circle", { cx: "24", cy: "24", r: "13" });
  add(svg, "circle", {
    cx: "24",
    cy: "24",
    r: "13",
    fill: shade,
    stroke: rim,
    "stroke-width": "1.2",
  });
  const offset = Math.cos(2 * Math.PI * state.phase) * 13;
  add(svg, "circle", {
    cx: String(24 + offset),
    cy: "24",
    r: "13",
    fill: lit,
    "clip-path": `url(#${uid}-disk)`,
    opacity: "0.96",
  });
}

/** Small warm sun disc for the daytime playhead. */
export function renderSun(svg) {
  svg.replaceChildren();
  const uid = `s${++svgSeq}`;
  const defs = add(svg, "defs", {});
  const grad = add(defs, "radialGradient", {
    id: `${uid}-core`,
    cx: "38%",
    cy: "34%",
    r: "62%",
  });
  add(grad, "stop", { offset: "0%", "stop-color": "#fff6c4" });
  add(grad, "stop", { offset: "42%", "stop-color": "#ffd056" });
  add(grad, "stop", { offset: "100%", "stop-color": "#e8941c" });
  add(svg, "circle", {
    cx: "24",
    cy: "24",
    r: "14.5",
    fill: `url(#${uid}-core)`,
  });
}
