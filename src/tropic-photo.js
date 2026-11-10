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

vec3 gradeWater(vec3 c, float g) {
  float l = luma(c);
  float hi = smoothstep(0.5, 0.88, l);
  vec3 grain = c - vec3(l);
  vec3 body = vec3(l * 0.4 + 0.02, l * 0.64 + 0.035, l * 0.74 + 0.04) + grain * vec3(0.32, 0.72, 0.9);
  vec3 spark = vec3(l * 0.82 + 0.34, l * 0.55 + 0.16, l * 0.5 + 0.12) + grain * vec3(0.4, 0.28, 0.32);
  vec3 graded = mix(body, spark, hi) * 0.9;
  return mix(c, clamp(graded, 0.0, 1.0), g);
}

vec3 gradeSand(vec3 c, float g) {
  float l = luma(c);
  float hi = smoothstep(0.48, 0.86, l);
  float sh = 1.0 - smoothstep(0.06, 0.4, l);
  vec3 grain = c - vec3(l);
  vec3 body = vec3(l * 1.05 + 0.12, l * 0.78 + 0.07, l * 0.5 + 0.04) + grain * vec3(0.72, 0.55, 0.38);
  body = mix(body, body * vec3(0.86, 0.7, 0.58), sh * 0.45);
  vec3 crest = vec3(l * 0.98 + 0.2, l * 0.8 + 0.1, l * 0.55 + 0.06) + grain * vec3(0.42, 0.32, 0.22);
  vec3 graded = mix(body, crest, hi) * 0.93;
  return mix(c, clamp(graded, 0.0, 1.0), g);
}

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

// Cells orbit in place. x = border brightness, yz = offset toward the nearest site.
vec3 causticCell(vec2 x, float t) {
  vec2 n = floor(x);
  vec2 f = fract(x);
  float f1 = 8.0;
  float f2 = 8.0;
  vec2 near = vec2(0.0);
  for (int j = 0; j < 3; j++) {
    for (int i = 0; i < 3; i++) {
      vec2 g = vec2(float(i - 1), float(j - 1));
      vec2 o = hash2(n + g);
      o = 0.5 + 0.46 * sin(t + 6.2831853 * o);
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        near = r;
      } else if (d < f2) {
        f2 = d;
      }
    }
  }
  float edge = sqrt(f2) - sqrt(f1);
  float line = pow(1.0 - smoothstep(0.0, 0.05, edge), 1.6);
  return vec3(line, near);
}

void main() {
  vec2 screen = vec2(vUv.x, vUv.y) * uView;
  float xN = screen.x / max(uView.x, 1.0);
  float yN = screen.y / max(uView.y, 1.0);
  float gold = clamp(uGold, 0.0, 1.0);

  // Two webs, different scales and phases. Points move inside their cells,
  // so the lines split and close without the picture sliding.
  float t = uPhase * 1.7;
  vec2 uv = screen / vec2(112.0, 96.0);
  vec2 bend = vec2(
    sin(uv.y * 2.2 + t * 0.37) + 0.55 * sin(uv.x * 1.6 - t * 0.21),
    cos(uv.x * 1.9 - t * 0.29) + 0.55 * cos(uv.y * 2.5 + t * 0.24)
  ) * 0.22;
  vec3 a = causticCell(uv + bend, t);
  vec2 rot = vec2(uv.x * 0.8 + uv.y * 0.6, -uv.x * 0.6 + uv.y * 0.8);
  vec3 b = causticCell(rot * 1.85 - bend.yx, t * 1.35 + 2.4);
  float web = max(a.x, b.x * 0.82);
  float knot = a.x * b.x;
  vec2 refr = a.yz * 4.2 + b.yz * 2.4;

  vec3 water = samplePlate(uWater, uWaterSize, screen, refr, vec2(0.5, 0.46));
  vec3 sand = samplePlate(uSand, uSandSize, screen, vec2(0.0), vec2(0.62, 0.28));
  water = gradeWater(water, gold);
  sand = gradeSand(sand, gold);

  float along = xN + (1.0 - yN) * 0.15;
  float sandAmt = smoothstep(0.20, 0.80, along);
  float waterSide = 1.0 - sandAmt;
  float hi = smoothstep(0.28, 0.82, luma(water));
  vec3 causTint = mix(vec3(0.78, 0.96, 1.0), vec3(1.0, 0.72, 0.42), gold);
  water += causTint * web * (0.14 + hi * 0.16) * waterSide;
  water += causTint * knot * 0.28 * waterSide;

  // 1–3px hard flashes on the bright ridges. On for a couple of frames, then off.
  vec2 gid = floor(screen / 18.0);
  vec2 gf = fract(screen / 18.0) - 0.5;
  float seed = fract(sin(dot(gid, vec2(127.1, 311.7))) * 43758.5453);
  float ph = fract(uPhase * 4.6 + seed * 19.0);
  float burst = step(ph, 0.2);
  float dot = step(length(gf) * 18.0, 1.6);
  float gate = step(0.78, seed) * step(0.42, max(web, knot * 2.5));
  vec3 glintTint = mix(vec3(1.0), vec3(1.0, 0.8, 0.48), gold);
  water += glintTint * burst * dot * gate * 1.15 * waterSide;

  vec3 color = mix(clamp(water, 0.0, 1.0), sand, sandAmt);
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

export function createTropicPhoto() {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
  });
  let waterTex = null;
  let sandTex = null;
  let waterW = 4096;
  let waterH = 2200;
  let sandW = 3024;
  let sandH = 2200;
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
      for (const name of ["uView", "uWaterSize", "uSandSize", "uPhase", "uGold"]) {
        loc[name] = gl.getUniformLocation(program, name);
      }
      loc.water = gl.getUniformLocation(program, "uWater");
      loc.sand = gl.getUniformLocation(program, "uSand");
      Promise.all([
        loadImage(`${base}shore/tropic-water.jpg`),
        loadImage(`${base}shore/tropic-sand.jpg`),
      ]).then(([waterImg, sandImg]) => {
        waterW = waterImg.width;
        waterH = waterImg.height;
        sandW = sandImg.width;
        sandH = sandImg.height;
        gl.activeTexture(gl.TEXTURE0);
        waterTex = makeTexture(gl, waterImg);
        gl.activeTexture(gl.TEXTURE1);
        sandTex = makeTexture(gl, sandImg);
      }).catch((error) => {
        console.warn(error);
      });
    } catch (error) {
      console.warn(error);
      program = null;
    }
  }

  return {
    ready() {
      return Boolean(gl && waterTex && sandTex && program);
    },
    frame({ w, h, phase, gold }) {
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
      gl.uniform2f(loc.uView, w, h);
      gl.uniform2f(loc.uWaterSize, waterW, waterH);
      gl.uniform2f(loc.uSandSize, sandW, sandH);
      gl.uniform1f(loc.uPhase, Number.isFinite(phase) ? phase : 0);
      gl.uniform1f(loc.uGold, Number.isFinite(gold) ? gold : 0);
      gl.uniform1i(loc.water, 0);
      gl.uniform1i(loc.sand, 1);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, waterTex);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, sandTex);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      return canvas;
    },
  };
}
