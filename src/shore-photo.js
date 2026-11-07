import { shoreBreathReach } from "./shore.js";

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
uniform sampler2D uFoam;
uniform sampler2D uCurve;
uniform vec2 uView;
uniform vec2 uWaterSize;
uniform vec2 uSandSize;
uniform vec2 uFoamSize;
uniform float uReach;
uniform float uWet;
uniform float uDusk;

float curveAt(float x) {
  vec4 e = texture2D(uCurve, vec2(x, 0.5));
  return (e.r * 255.0 * 256.0 + e.g * 255.0) / 65535.0;
}

vec3 samplePlate(sampler2D tex, vec2 size, vec2 screen, float top) {
  vec2 px = vec2(screen.x - uView.x * 0.5 + size.x * 0.5, screen.y - top);
  vec2 uv = clamp(px / size, vec2(0.001), vec2(0.999));
  return texture2D(tex, uv).rgb;
}

void main() {
  vec2 screen = vec2(vUv.x, vUv.y) * uView;
  float curveY = curveAt(vUv.x) * uView.y;
  float reach = clamp(uReach, 0.0, 1.0);
  float floorY = uView.y - 22.0;
  float crest = mix(floorY, curveY, reach);

  float waterTop = uView.y - uWaterSize.y;
  float sandTop = uView.y - uSandSize.y;
  vec3 water = samplePlate(uWater, uWaterSize, screen, waterTop);
  vec3 sand = vec3(0.0);
  for (int i = -3; i <= 3; i++) {
    sand += samplePlate(uSand, uSandSize, screen + vec2(0.0, float(i) * 4.0), sandTop);
  }
  sand /= 7.0;
  water = vec3(water.r * 0.82, min(1.0, water.g * 1.06), min(1.0, water.b * 1.16));
  float sandL = dot(sand, vec3(0.299, 0.587, 0.114));
  vec3 wetSand = vec3(min(1.0, sandL * 1.05 + 0.1), sandL * 0.9 + 0.06, sandL * 0.58 + 0.03);
  sand = mix(sand, wetSand, 0.84);

  vec3 color = water;
  float above = curveY - screen.y;
  float sandBand = smoothstep(18.0, 7.0, above) * smoothstep(-1.0, 5.0, above);
  color = mix(color, sand, sandBand * 0.8);

  float dy = screen.y - crest;
  if (dy >= 0.0 && dy < 24.0) {
    float span = uFoamSize.y;
    vec3 foamAcc = vec3(0.0);
    float laceAcc = 0.0;
    for (int i = -1; i <= 1; i++) {
      float a = clamp(0.28 + dy / 40.0 + float(i) * 0.08, 0.02, 0.98);
      vec2 foamPx = vec2(screen.x - uView.x * 0.5 + uFoamSize.x * 0.5, a * span);
      vec3 foam = texture2D(uFoam, clamp(foamPx / uFoamSize, vec2(0.001), vec2(0.999))).rgb;
      float hi = max(foam.r, max(foam.g, foam.b));
      float lo = min(foam.r, min(foam.g, foam.b));
      foamAcc += foam;
      laceAcc += smoothstep(0.5, 0.82, hi) * (1.0 - smoothstep(0.03, 0.34, hi - lo));
    }
    foamAcc /= 3.0;
    laceAcc /= 3.0;
    float feather = smoothstep(22.0, 3.0, dy) * smoothstep(0.0, 2.5, dy + 0.5);
    color = mix(color, mix(foamAcc, vec3(0.98, 0.98, 0.96), 0.4), clamp(laceAcc * feather * 1.5, 0.0, 0.92));
  }

  float below = screen.y - crest;
  float trail = smoothstep(110.0, 18.0, below) * step(16.0, below);
  color = mix(color, min(vec3(1.0), color + vec3(0.11, 0.15, 0.13)), trail * 0.5);

  float wetCrest = mix(floorY, curveY, clamp(max(uWet, reach), 0.0, 1.0));
  if (crest - wetCrest > 4.0 && screen.y > wetCrest && screen.y < crest) {
    float drying = smoothstep(wetCrest, wetCrest + 18.0, screen.y) * smoothstep(crest, crest - 24.0, screen.y);
    color = mix(color, min(vec3(1.0), color + vec3(0.03, 0.04, 0.035)), drying * 0.45);
  }

  float warm = uDusk * mix(0.16, 0.42, sandBand);
  color *= mix(vec3(1.0), vec3(1.12, 0.9, 0.74), warm);
  gl_FragColor = vec4(color, 1.0);
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

export function createShorePhoto() {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
  });
  let waterTex = null;
  let sandTex = null;
  let foamTex = null;
  let waterW = 2700;
  let waterH = 764;
  let sandW = 4032;
  let sandH = 660;
  let foamW = 2200;
  let foamH = 36;
  let curveTex = null;
  const curveW = 2048;
  const curveBytes = new Uint8Array(curveW * 4);
  let program = null;
  const loc = {};

  const loadImage = (url) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(url));
    img.src = url;
  });

  const base = import.meta.env.BASE_URL || "/";

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
      for (const name of ["uView", "uWaterSize", "uSandSize", "uFoamSize", "uReach", "uWet", "uDusk"]) {
        loc[name] = gl.getUniformLocation(program, name);
      }
      loc.water = gl.getUniformLocation(program, "uWater");
      loc.sand = gl.getUniformLocation(program, "uSand");
      loc.foam = gl.getUniformLocation(program, "uFoam");
      loc.curve = gl.getUniformLocation(program, "uCurve");
      curveTex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, curveTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      Promise.all([
        loadImage(`${base}shore/water.jpg`),
        loadImage(`${base}shore/sand.jpg`),
        loadImage(`${base}shore/foam.jpg`),
      ]).then(([waterImg, sandImg, foamImg]) => {
        waterW = waterImg.width;
        waterH = waterImg.height;
        sandW = sandImg.width;
        sandH = sandImg.height;
        foamW = foamImg.width;
        foamH = foamImg.height;
        gl.activeTexture(gl.TEXTURE0);
        waterTex = makeTexture(gl, waterImg);
        gl.activeTexture(gl.TEXTURE1);
        sandTex = makeTexture(gl, sandImg);
        gl.activeTexture(gl.TEXTURE2);
        foamTex = makeTexture(gl, foamImg);
      }).catch((error) => {
        console.warn(error);
      });
    } catch (error) {
      console.warn(error);
      program = null;
    }
  }

  const columnY = (pts, x) => {
    if (x <= pts[0].x) return pts[0].y;
    const last = pts[pts.length - 1];
    if (x >= last.x) return last.y;
    let lo = 0;
    let hi = pts.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (pts[mid].x <= x) lo = mid;
      else hi = mid;
    }
    const a = pts[lo];
    const b = pts[hi];
    const t = (x - a.x) / Math.max(1, b.x - a.x);
    return a.y + (b.y - a.y) * t;
  };

  return {
    ready() {
      return Boolean(gl && waterTex && sandTex && foamTex && program);
    },
    frame({ w, h, pts, reach, wet, dusk }) {
      if (!this.ready() || w < 2 || h < 2) return null;
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      const bw = Math.max(2, Math.round(w * dpr));
      const bh = Math.max(2, Math.round(h * dpr));
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
      }
      gl.viewport(0, 0, bw, bh);
      gl.useProgram(program);
      for (let i = 0; i < curveW; i += 1) {
        const x = (i / (curveW - 1)) * w;
        const y = Math.min(h, Math.max(0, columnY(pts, x)));
        const v = Math.round((y / h) * 65535);
        const o = i * 4;
        curveBytes[o] = (v >> 8) & 255;
        curveBytes[o + 1] = v & 255;
        curveBytes[o + 2] = 0;
        curveBytes[o + 3] = 255;
      }
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, curveTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, curveW, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, curveBytes);
      gl.uniform2f(loc.uView, w, h);
      gl.uniform2f(loc.uWaterSize, waterW, waterH);
      gl.uniform2f(loc.uSandSize, sandW, sandH);
      gl.uniform2f(loc.uFoamSize, foamW, foamH);
      gl.uniform1f(loc.uReach, Number.isFinite(reach) ? reach : 0);
      gl.uniform1f(loc.uWet, Number.isFinite(wet) ? wet : 0);
      gl.uniform1f(loc.uDusk, dusk);
      gl.uniform1i(loc.water, 0);
      gl.uniform1i(loc.sand, 1);
      gl.uniform1i(loc.foam, 2);
      gl.uniform1i(loc.curve, 3);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, waterTex);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, sandTex);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, foamTex);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      return canvas;
    },
    reach(phase) {
      return shoreBreathReach(phase);
    },
  };
}
