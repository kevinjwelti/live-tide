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
precision mediump float;
varying vec2 vUv;
uniform sampler2D uSand;
uniform sampler2D uWater;
uniform sampler2D uFoam;
uniform sampler2D uCurve;
uniform float uViewH;
uniform float uBreath;
uniform float uWet;
uniform float uDusk;

float curveAt(float x) {
  vec4 e = texture2D(uCurve, vec2(x, 0.5));
  return (e.r * 255.0 * 256.0 + e.g * 255.0) / 65535.0;
}

vec2 mirror(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 m = mod(i, 2.0);
  return mix(f, 1.0 - f, m);
}

void main() {
  float curve = curveAt(vUv.x);
  float dy = (vUv.y - curve) * uViewH;
  float sandV = abs(mod(vUv.y * uViewH / 92.0, 2.0) - 1.0);
  float waterV = abs(mod(vUv.y * uViewH / 240.0, 2.0) - 1.0);
  vec3 sand = texture2D(uSand, vec2(vUv.x, sandV)).rgb;
  vec3 water = texture2D(uWater, vec2(vUv.x, waterV)).rgb;
  water = vec3(water.r * 0.68, min(1.0, water.g * 1.06), min(1.0, water.b * 1.22));
  water = mix(water, vec3(0.04, 0.66, 0.68), 0.2);
  float waterMask = smoothstep(-0.8, 0.8, dy);
  vec3 color = mix(sand, water, waterMask);

  float across = (dy + uBreath) / 78.0 + 0.5;
  if (across > 0.0 && across < 1.0) {
    vec3 foam = texture2D(uFoam, vec2(vUv.x, 1.0 - across)).rgb;
    float hi = max(foam.r, max(foam.g, foam.b));
    float lo = min(foam.r, min(foam.g, foam.b));
    float lace = smoothstep(0.46, 0.8, hi) * (1.0 - smoothstep(0.04, 0.28, hi - lo));
    float fade = smoothstep(0.0, 0.08, across) * (1.0 - smoothstep(0.9, 1.0, across));
    color = mix(color, vec3(1.0), lace * fade);
  }

  float wetBand = smoothstep(2.0, -4.0, dy) * (1.0 - smoothstep(-6.0, -26.0, dy));
  color *= mix(1.0, 0.84, wetBand * uWet);

  float warm = uDusk * mix(0.55, 0.16, waterMask);
  color *= mix(vec3(1.0), vec3(1.14, 0.88, 0.7), warm);
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
  let sandTex = null;
  let waterTex = null;
  let foamTex = null;
  let curveTex = null;
  let curveW = 256;
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
      for (const name of ["uViewH", "uBreath", "uWet", "uDusk"]) {
        loc[name] = gl.getUniformLocation(program, name);
      }
      loc.sand = gl.getUniformLocation(program, "uSand");
      loc.water = gl.getUniformLocation(program, "uWater");
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
        loadImage(`${base}shore/sand.jpg`),
        loadImage(`${base}shore/water.jpg`),
        loadImage(`${base}shore/foam.jpg`),
      ]).then(([sandImg, waterImg, foamImg]) => {
        gl.activeTexture(gl.TEXTURE0);
        sandTex = makeTexture(gl, sandImg);
        gl.activeTexture(gl.TEXTURE1);
        waterTex = makeTexture(gl, waterImg);
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
      return Boolean(gl && sandTex && waterTex && foamTex && program);
    },
    frame({ w, h, pts, breath, wet, dusk }) {
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
      gl.uniform1f(loc.uViewH, h);
      gl.uniform1f(loc.uBreath, breath);
      gl.uniform1f(loc.uWet, wet);
      gl.uniform1f(loc.uDusk, dusk);
      gl.uniform1i(loc.sand, 0);
      gl.uniform1i(loc.water, 1);
      gl.uniform1i(loc.foam, 2);
      gl.uniform1i(loc.curve, 3);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sandTex);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, waterTex);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, foamTex);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      return canvas;
    },
    breathPx(phase) {
      return (shoreBreathReach(phase) - 0.45) * 16;
    },
  };
}
