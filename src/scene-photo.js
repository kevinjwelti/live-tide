const VERT = `
attribute vec2 aPos;
attribute vec2 aUv;
varying vec2 vUv;
void main() {
  vUv = aUv;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uWater;
uniform sampler2D uSand;
uniform vec2 uView;
uniform vec2 uWaterSize;
uniform vec2 uSandSize;
uniform float uPhase;
uniform float uGold;
uniform float uMode;
uniform vec2 uAnchor;
uniform vec2 uSandAnchor;
uniform float uSplit;
uniform float uWash;

vec3 samplePlate(sampler2D tex, vec2 size, vec2 screen, vec2 drift, vec2 anchor) {
  float cover = max(uView.x / size.x, uView.y / size.y);
  float scale = max(cover, 0.0001);
  vec2 shown = uView / max(scale, 0.0001);
  vec2 origin = (size - shown) * anchor;
  vec2 px = origin + (screen + drift) / max(scale, 0.0001);
  vec2 uv = clamp(px / size, vec2(0.002), vec2(0.998));
  return texture2D(tex, uv).rgb;
}

float luma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

vec3 warm(vec3 c, float g) {
  float l = luma(c);
  vec3 sun = c * vec3(1.16, 0.9, 0.66);
  sun = mix(sun, vec3(l) * vec3(1.08, 0.72, 0.46), 0.2);
  return mix(c, clamp(sun, 0.0, 1.0), g * 0.78);
}

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

float lagoonLap(float u) {
  if (u < 0.36) return smoothstep(0.0, 1.0, u / 0.36);
  if (u < 0.46) return 1.0;
  if (u < 0.82) return 1.0 - smoothstep(0.0, 1.0, (u - 0.46) / 0.36);
  return 0.0;
}

vec3 lagoonWash(vec3 color, float xN, float yN, float gold, float seconds) {
  float cycle = 7.0;
  float u = fract(seconds / cycle);
  float reach = lagoonLap(u);
  float behind = lagoonLap(fract((seconds - 0.55) / cycle));
  float shore = 0.642 + (yN - 0.9) * 0.05 + sin(yN * 21.0 + seconds * 0.4) * 0.005;
  float travel = 0.05;
  float front = shore + reach * travel;
  float wetFront = shore + max(reach, behind * 0.92) * travel;
  float low = smoothstep(0.68, 0.84, yN);
  float pale = smoothstep(0.34, 0.7, luma(color));
  float onSand = smoothstep(shore - 0.006, shore + 0.016, xN);
  float covered = 1.0 - smoothstep(wetFront - 0.006, wetFront + 0.014, xN);
  float wet = onSand * covered * max(reach * 0.9, behind * 0.38) * low * pale;
  vec3 damp = color * vec3(0.74, 0.82, 0.88);
  color = mix(color, damp, wet * 0.78);
  float foamGate = smoothstep(0.1, 0.42, reach) * low;
  float lace = 0.45 + 0.55 * sin(yN * 46.0 + reach * 2.2 + sin(yN * 13.0 + seconds));
  lace *= 0.75 + 0.25 * sin(yN * 91.0 - seconds * 1.3);
  float frontJ = front + sin(yN * 37.0 + seconds * 0.8) * 0.004;
  float edge = exp(-pow((xN - frontJ) / 0.007, 2.0)) * clamp(lace, 0.15, 1.0);
  float core = exp(-pow((xN - frontJ) / 0.0026, 2.0));
  vec3 foam = mix(vec3(0.96, 0.98, 0.97), vec3(1.0, 0.9, 0.76), gold);
  color = mix(color, foam, clamp((edge * 0.42 + core * 0.28) * foamGate, 0.0, 0.62));
  return color;
}

float causticWeb(vec2 x, float t) {
  vec2 n = floor(x);
  vec2 f = fract(x);
  float f1 = 8.0;
  float f2 = 8.0;
  for (int j = 0; j < 3; j++) {
    for (int i = 0; i < 3; i++) {
      vec2 g = vec2(float(i - 1), float(j - 1));
      vec2 o = hash2(n + g);
      o = 0.5 + 0.46 * sin(t + 6.2831853 * o);
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < f1) { f2 = f1; f1 = d; }
      else if (d < f2) { f2 = d; }
    }
  }
  float edge = sqrt(f2) - sqrt(f1);
  return pow(1.0 - smoothstep(0.0, 0.055, edge), 1.5);
}

void main() {
  vec2 screen = vUv * uView;
  float xN = screen.x / max(uView.x, 1.0);
  float yN = screen.y / max(uView.y, 1.0);
  float gold = clamp(uGold, 0.0, 1.0);
  float t = uPhase;
  vec2 rip = vec2(
    sin(screen.y * 0.04 + t * 1.15) + 0.45 * sin(screen.x * 0.02 - t * 0.55),
    cos(screen.x * 0.034 - t * 0.9) + 0.4 * cos(screen.y * 0.022 + t * 0.48)
  );

  vec3 color = vec3(0.0);
  if (uMode < 0.5) {
    vec3 pool = samplePlate(uWater, uWaterSize, screen, rip * 9.0, vec2(0.48, 0.78));
    vec3 sand = samplePlate(uSand, uSandSize, screen, vec2(0.0), vec2(0.62, 0.28));
    float along = xN + (1.0 - yN) * 0.14;
    float sandAmt = smoothstep(0.22, 0.8, along);
    float sheen = pow(max(0.0, sin(screen.y * 0.018 + t * 0.65)), 10.0);
    pool += vec3(0.9, 0.95, 1.0) * sheen * 0.07;
    color = mix(pool, sand, sandAmt);
  } else if (uMode < 1.5) {
    vec2 uv = screen / vec2(140.0, 120.0);
    float web = causticWeb(uv + rip * 0.15, t * 1.4);
    vec3 reef = samplePlate(uWater, uWaterSize, screen, rip * 5.0, vec2(0.22, 0.82));
    vec2 drift = vec2(sin(t * 0.28) * 28.0, cos(t * 0.19) * 12.0);
    vec3 deep = samplePlate(uSand, uSandSize, screen, drift, vec2(0.55, 0.42));
    float ocean = smoothstep(0.3, 0.72, xN);
    vec3 tint = mix(vec3(0.75, 0.95, 1.0), vec3(1.0, 0.74, 0.42), gold);
    reef += tint * web * 0.16;
    color = mix(reef, deep, ocean);
  } else if (uMode < 2.5) {
    color = samplePlate(uWater, uWaterSize, screen, rip * 4.5, vec2(0.4, 0.96));
    float water = 1.0 - smoothstep(0.34, 0.62, xN);
    float web = causticWeb(screen / vec2(160.0, 140.0), t * 1.1);
    vec3 tint = mix(vec3(0.8, 0.96, 1.0), vec3(1.0, 0.78, 0.5), gold);
    color += tint * web * 0.1 * water;
    color = lagoonWash(color, xN, yN, gold, uWash);
  } else if (uMode < 3.5) {
    vec3 still = samplePlate(uWater, uWaterSize, screen, vec2(0.0), vec2(0.46, 0.5));
    vec2 wash = vec2(sin(t * 0.62) * 22.0, sin(screen.y * 0.01 + t * 0.4) * 6.0);
    vec3 moved = samplePlate(uWater, uWaterSize, screen, wash, vec2(0.46, 0.5));
    float bright = smoothstep(0.45, 0.82, luma(still));
    float sea = 1.0 - smoothstep(0.34, 0.7, xN);
    color = mix(still, moved, bright * sea * 0.85);
    float band = smoothstep(0.22, 0.0, abs(fract(xN * 0.45 - t * 0.045) - 0.5));
    color += vec3(0.95, 0.97, 1.0) * band * bright * sea * 0.16;
  } else if (uMode < 4.5) {
    vec2 uv = screen / vec2(150.0, 128.0);
    float web = causticWeb(uv + rip * 0.12, t * 1.25);
    vec3 reef = samplePlate(uWater, uWaterSize, screen, rip * 4.0, uAnchor);
    vec2 drift = vec2(sin(t * 0.28) * 24.0, cos(t * 0.19) * 10.0);
    vec3 deep = samplePlate(uSand, uSandSize, screen, drift, uSandAnchor);
    float ocean = smoothstep(uSplit, uSplit + 0.32, xN);
    vec3 tint = mix(vec3(0.8, 0.96, 1.0), vec3(1.0, 0.74, 0.46), gold);
    reef += tint * web * 0.1 * (1.0 - ocean);
    color = mix(reef, deep, ocean);
  } else {
    vec3 pool = samplePlate(uWater, uWaterSize, screen, rip * 5.0, uAnchor);
    float web = causticWeb(screen / vec2(170.0, 150.0), t);
    float wet = smoothstep(0.28, 0.62, pool.b - pool.r * 0.25);
    vec3 tint = mix(vec3(0.86, 0.95, 1.0), vec3(1.0, 0.78, 0.5), gold);
    pool += tint * web * 0.07 * wet;
    color = pool;
  }

  gl_FragColor = vec4(warm(color, gold), 1.0);
}
`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(log || "shader");
  }
  return shader;
}

function makeTexture(gl, image) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

const SCENES = {
  tidepool: { mode: 0, water: "scene/tidepool.jpg", sand: "tropic-sand.jpg" },
  tidepool2: { mode: 5, water: "scene/tidepool2.jpg", sand: "scene/tidepool2.jpg", anchor: [0.22, 0.58] },
  tidepool3: { mode: 5, water: "scene/tidepool3.jpg", sand: "scene/tidepool3.jpg", anchor: [0.5, 0.72] },
  tidepool4: { mode: 5, water: "scene/tidepool4.jpg", sand: "scene/tidepool4.jpg", anchor: [0.48, 0.44] },
  reef: { mode: 1, water: "scene/reef.jpg", sand: "scene/ocean.jpg" },
  reef2: { mode: 4, water: "scene/reef2.jpg", sand: "scene/ocean.jpg", anchor: [0.5, 0.7], sandAnchor: [0.55, 0.42], split: 0.74 },
  reef3: { mode: 4, water: "scene/reef3.jpg", sand: "scene/ocean.jpg", anchor: [0.36, 0.84], sandAnchor: [0.5, 0.4], split: 0.7 },
  reef4: { mode: 4, water: "scene/reef4.jpg", sand: "scene/ocean.jpg", anchor: [0.3, 0.9], sandAnchor: [0.55, 0.42], split: 0.58 },
  lagoon: { mode: 2, water: "scene/lagoon.jpg", sand: "scene/lagoon.jpg" },
  blacksand: { mode: 3, water: "scene/blacksand.jpg", sand: "scene/blacksand.jpg" },
};

export function createScenePhoto() {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
  });
  const images = {};
  let program = null;
  const loc = {};
  const base = import.meta.env.BASE_URL || "/";
  const washStarted = performance.now();

  const loadImage = (url) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(url));
    img.src = url;
  });

  if (gl) {
    try {
      const vs = compile(gl, gl.VERTEX_SHADER, VERT);
      const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
      program = gl.createProgram();
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) || "link");
      }
      gl.useProgram(program);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1, 0, 1,
        1, -1, 1, 1,
        -1, 1, 0, 0,
        1, 1, 1, 0,
      ]), gl.STATIC_DRAW);
      const stride = 16;
      const aPos = gl.getAttribLocation(program, "aPos");
      const aUv = gl.getAttribLocation(program, "aUv");
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(aUv);
      gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, stride, 8);
      for (const name of ["uView", "uWaterSize", "uSandSize", "uPhase", "uGold", "uMode", "uAnchor", "uSandAnchor", "uSplit", "uWash"]) {
        loc[name] = gl.getUniformLocation(program, name);
      }
      loc.water = gl.getUniformLocation(program, "uWater");
      loc.sand = gl.getUniformLocation(program, "uSand");
      const files = new Set();
      Object.values(SCENES).forEach((scene) => {
        files.add(scene.water);
        files.add(scene.sand);
      });
      Promise.all([...files].map((file) => loadImage(`${base}shore/${file}`).then((img) => {
        images[file] = { img, tex: makeTexture(gl, img) };
      }))).catch((error) => {
        console.warn(error);
      });
    } catch (error) {
      console.warn(error);
      program = null;
    }
  }

  const plate = (file) => images[file];

  return {
    ready(scene) {
      const spec = SCENES[scene];
      if (!spec || !gl || !program) return false;
      return Boolean(plate(spec.water) && plate(spec.sand));
    },
    frame({ w, h, phase, gold, scene }) {
      const spec = SCENES[scene];
      if (!this.ready(scene) || w < 2 || h < 2) return null;
      const water = plate(spec.water);
      const sand = plate(spec.sand);
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      const bw = Math.max(2, Math.round(w * dpr));
      const bh = Math.max(2, Math.round(h * dpr));
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
      }
      gl.viewport(0, 0, bw, bh);
      gl.useProgram(program);
      gl.uniform2f(loc.uView, w, h);
      gl.uniform2f(loc.uWaterSize, water.img.width, water.img.height);
      gl.uniform2f(loc.uSandSize, sand.img.width, sand.img.height);
      gl.uniform1f(loc.uPhase, Number.isFinite(phase) ? phase : 0);
      gl.uniform1f(loc.uGold, Number.isFinite(gold) ? gold : 0);
      gl.uniform1f(loc.uMode, spec.mode);
      const anchor = spec.anchor || [0.5, 0.5];
      const sandAnchor = spec.sandAnchor || [0.5, 0.5];
      gl.uniform2f(loc.uAnchor, anchor[0], anchor[1]);
      gl.uniform2f(loc.uSandAnchor, sandAnchor[0], sandAnchor[1]);
      gl.uniform1f(loc.uSplit, spec.split ?? 0.5);
      const still = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
      const washSec = still ? 6.3 : (performance.now() - washStarted) / 1000;
      gl.uniform1f(loc.uWash, washSec);
      gl.uniform1i(loc.water, 0);
      gl.uniform1i(loc.sand, 1);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, water.tex);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, sand.tex);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      return canvas;
    },
  };
}
