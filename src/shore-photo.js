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
uniform sampler2D uPhoto;
uniform sampler2D uFoam;
uniform sampler2D uCurve;
uniform vec2 uView;
uniform vec2 uPhotoSize;
uniform float uScale;
uniform float uBreath;
uniform float uWet;
uniform float uDusk;

float curveAt(float x) {
  vec4 e = texture2D(uCurve, vec2(x, 0.5));
  return (e.r * 255.0 * 256.0 + e.g * 255.0) / 65535.0;
}

void main() {
  vec2 screen = vec2(vUv.x, vUv.y) * uView;
  vec2 photoPx = (screen - uView * 0.5) / uScale + uPhotoSize * 0.5;
  vec2 uv = clamp(photoPx / uPhotoSize, vec2(0.001), vec2(0.999));
  vec3 color = texture2D(uPhoto, vec2(uv.x, 1.0 - uv.y)).rgb;

  float waterish = smoothstep(0.0, 0.1, color.g - color.r);
  vec3 turq = vec3(color.r * 0.74, min(1.0, color.g * 1.04), min(1.0, color.b * 1.16));
  turq = mix(turq, vec3(0.05, 0.64, 0.66), 0.16);
  color = mix(color, turq, waterish);

  float curve = curveAt(vUv.x);
  float dy = (vUv.y - curve) * uView.y;
  float across = (dy + uBreath) / 72.0 + 0.5;
  if (across > 0.0 && across < 1.0) {
    vec3 foam = texture2D(uFoam, vec2(uv.x, 1.0 - across)).rgb;
    float hi = max(foam.r, max(foam.g, foam.b));
    float lo = min(foam.r, min(foam.g, foam.b));
    float lace = smoothstep(0.46, 0.8, hi) * (1.0 - smoothstep(0.04, 0.28, hi - lo));
    float fade = smoothstep(0.0, 0.08, across) * (1.0 - smoothstep(0.9, 1.0, across));
    color = mix(color, vec3(1.0), lace * fade);
  }

  float wetBand = smoothstep(2.0, -4.0, dy) * (1.0 - smoothstep(-6.0, -26.0, dy));
  color *= mix(1.0, 0.84, wetBand * uWet);

  float warm = uDusk * mix(0.55, 0.16, waterish);
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
  let photoTex = null;
  let foamTex = null;
  let photoW = 4032;
  let photoH = 1280;
  let curveTex = null;
  const curveW = 256;
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
      for (const name of ["uView", "uPhotoSize", "uScale", "uBreath", "uWet", "uDusk"]) {
        loc[name] = gl.getUniformLocation(program, name);
      }
      loc.photo = gl.getUniformLocation(program, "uPhoto");
      loc.foam = gl.getUniformLocation(program, "uFoam");
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
        loadImage(`${base}shore/foam.jpg`),
      ]).then(([photoImg, foamImg]) => {
        photoW = photoImg.width;
        photoH = photoImg.height;
        gl.activeTexture(gl.TEXTURE0);
        photoTex = makeTexture(gl, photoImg);
        gl.activeTexture(gl.TEXTURE1);
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
      return Boolean(gl && photoTex && foamTex && program);
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
      const cover = Math.min(1, Math.max(w / photoW, h / photoH));
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
      gl.uniform2f(loc.uView, w, h);
      gl.uniform2f(loc.uPhotoSize, photoW, photoH);
      gl.uniform1f(loc.uScale, cover);
      gl.uniform1f(loc.uBreath, breath);
      gl.uniform1f(loc.uWet, wet);
      gl.uniform1f(loc.uDusk, dusk);
      gl.uniform1i(loc.photo, 0);
      gl.uniform1i(loc.foam, 1);
      gl.uniform1i(loc.curve, 2);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, photoTex);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, foamTex);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      return canvas;
    },
    breathPx(phase) {
      return (shoreBreathReach(phase) - 0.45) * 16;
    },
  };
}
