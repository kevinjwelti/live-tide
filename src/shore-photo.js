import { shoreBreathReach } from "./shore.js";

/** Foam line in beach.jpg, 0 at the top of the photo. */
export const SHORE_PHOTO_V = 0.0781;

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
uniform sampler2D uBeach;
uniform sampler2D uSand;
uniform sampler2D uCurve;
uniform float uShore;
uniform float uBeachH;
uniform float uViewH;
uniform float uBreath;
uniform float uWet;
uniform float uDusk;

float curveAt(float x) {
  vec4 e = texture2D(uCurve, vec2(x, 0.5));
  return (e.r * 255.0 * 256.0 + e.g * 255.0) / 65535.0;
}

void main() {
  float yTop = vUv.y;
  float curve = curveAt(vUv.x);
  float dy = (yTop - curve) * uViewH;
  float wgt = 1.0 - smoothstep(16.0, 72.0, abs(dy));
  float sampleDy = dy + uBreath * wgt;
  float rel = clamp(uShore + sampleDy / uBeachH, 0.0, 0.995);
  vec3 sea = texture2D(uBeach, vec2(vUv.x, 1.0 - rel)).rgb;

  float up = max(0.0, -dy - 22.0);
  float sandV = abs(mod(up / 58.0, 2.0) - 1.0);
  vec3 dry = texture2D(uSand, vec2(vUv.x, sandV)).rgb;
  float sandMix = smoothstep(-10.0, -36.0, dy);
  vec3 color = mix(sea, dry, sandMix);

  float edge = 1.0 - smoothstep(0.0, 16.0, abs(dy + uBreath * 0.85));
  float hi = max(color.r, max(color.g, color.b));
  float lo = min(color.r, min(color.g, color.b));
  float foam = edge * smoothstep(0.58, 0.86, hi) * (1.0 - smoothstep(0.05, 0.22, hi - lo));
  color = mix(color, vec3(1.0), foam * 0.42);

  float wetBand = smoothstep(4.0, -6.0, dy) * (1.0 - smoothstep(-8.0, -42.0, dy));
  color *= mix(1.0, 0.8, wetBand * uWet);
  color += vec3(1.0, 0.96, 0.88) * wetBand * uWet * 0.06;

  color *= mix(vec3(1.0), vec3(1.16, 0.9, 0.72), uDusk);
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

function makeTexture(gl, image, wrap) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
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
  let beachTex = null;
  let sandTex = null;
  let beachH = 644;
  let curveTex = null;
  let curveW = 256;
  const curveBytes = new Uint8Array(curveW * 4);
  let program = null;
  let buf = null;
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
    gl.useProgram(program);
    buf = gl.createBuffer();
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
    loc.shore = gl.getUniformLocation(program, "uShore");
    loc.beachH = gl.getUniformLocation(program, "uBeachH");
    loc.viewH = gl.getUniformLocation(program, "uViewH");
    loc.breath = gl.getUniformLocation(program, "uBreath");
    loc.wet = gl.getUniformLocation(program, "uWet");
    loc.dusk = gl.getUniformLocation(program, "uDusk");
    loc.beach = gl.getUniformLocation(program, "uBeach");
    loc.sand = gl.getUniformLocation(program, "uSand");
    loc.curve = gl.getUniformLocation(program, "uCurve");
    curveTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, curveTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    Promise.all([
      loadImage(`${base}shore/beach.jpg`),
      loadImage(`${base}shore/sand.jpg`),
    ]).then(([beachImg, sandImg]) => {
      beachH = beachImg.height;
      gl.activeTexture(gl.TEXTURE0);
      beachTex = makeTexture(gl, beachImg, gl.CLAMP_TO_EDGE);
      gl.activeTexture(gl.TEXTURE1);
      sandTex = makeTexture(gl, sandImg, gl.CLAMP_TO_EDGE);
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
      return Boolean(gl && beachTex && sandTex && program);
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
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, curveTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, curveW, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, curveBytes);
      gl.uniform1f(loc.shore, SHORE_PHOTO_V);
      gl.uniform1f(loc.beachH, beachH);
      gl.uniform1f(loc.viewH, h);
      gl.uniform1f(loc.breath, breath);
      gl.uniform1f(loc.wet, wet);
      gl.uniform1f(loc.dusk, dusk);
      gl.uniform1i(loc.beach, 0);
      gl.uniform1i(loc.sand, 1);
      gl.uniform1i(loc.curve, 2);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, beachTex);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, sandTex);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      return canvas;
    },
    breathPx(phase) {
      return (shoreBreathReach(phase) - 0.4) * 26;
    },
  };
}
