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
uniform float uBreath;
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
  float shore = curveAt(vUv.x) * uView.y + uBreath;
  float dy = screen.y - shore;

  float waterTop = max(0.0, (uView.y - uWaterSize.y) * 0.5);
  float sandTop = max(0.0, uView.y - uSandSize.y);
  vec3 water = samplePlate(uWater, uWaterSize, screen, waterTop);
  vec3 sand = samplePlate(uSand, uSandSize, screen, sandTop);
  water = vec3(water.r * 0.82, min(1.0, water.g * 1.06), min(1.0, water.b * 1.16));
  float sandL = dot(sand, vec3(0.299, 0.587, 0.114));
  sandL = mix(sandL, 0.48, smoothstep(0.52, 0.78, sandL));
  vec3 warmSand = vec3(min(1.0, sandL * 1.36 + 0.05), sandL * 1.02, sandL * 0.7);
  sand = mix(sand, warmSand, 0.7);

  float waterSide = smoothstep(8.0, -8.0, dy);
  vec3 color = mix(sand, water, waterSide);

  if (abs(dy) < 26.0) {
    float xpx = screen.x - uView.x * 0.5 + uFoamSize.x * 0.5;
    float lace = 0.0;
    float weight = 0.0;
    for (int k = -4; k <= 4; k++) {
      float col = 0.0;
      for (int i = 0; i < 4; i++) {
        float fy = (float(i) + 0.5) / 4.0 * uFoamSize.y;
        vec3 foam = texture2D(uFoam, clamp(vec2(xpx + float(k) * 8.0, fy) / uFoamSize, vec2(0.001), vec2(0.999))).rgb;
        float hi = max(foam.r, max(foam.g, foam.b));
        float lo = min(foam.r, min(foam.g, foam.b));
        col = max(col, smoothstep(0.5, 0.84, hi) * (1.0 - smoothstep(0.02, 0.28, hi - lo)));
      }
      float wk = 1.0 - abs(float(k)) / 5.0;
      lace += col * wk;
      weight += wk;
    }
    lace /= weight;
    float sigma = mix(10.0, 13.0, lace);
    float band = exp(-dy * dy / (2.0 * sigma * sigma));
    color = mix(color, vec3(0.96, 0.97, 0.95), clamp(band * mix(0.45, 1.0, lace), 0.0, 0.9));
  }

  float warm = uDusk * mix(0.55, 0.14, waterSide);
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
  let waterTex = null;
  let sandTex = null;
  let foamTex = null;
  let waterW = 4032;
  let waterH = 604;
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
      for (const name of ["uView", "uWaterSize", "uSandSize", "uFoamSize", "uBreath", "uDusk"]) {
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
    frame({ w, h, pts, breath, dusk }) {
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
      gl.uniform1f(loc.uBreath, breath);
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
    breathPx(phase) {
      return (shoreBreathReach(phase) - 0.45) * 16;
    },
  };
}
