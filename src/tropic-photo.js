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
uniform float uDusk;

vec3 samplePlate(sampler2D tex, vec2 size, vec2 screen, vec2 drift, vec2 anchor) {
  float cover = max(uView.x / size.x, uView.y / size.y);
  float scale = min(1.0, cover);
  vec2 shown = uView / max(scale, 0.0001);
  vec2 origin = (size - shown) * anchor;
  vec2 px = origin + (screen + drift) / max(scale, 0.0001);
  vec2 uv = clamp(px / size, vec2(0.002), vec2(0.998));
  return texture2D(tex, uv).rgb;
}

void main() {
  vec2 screen = vec2(vUv.x, vUv.y) * uView;
  float xN = screen.x / max(uView.x, 1.0);
  float yN = screen.y / max(uView.y, 1.0);

  float sway = sin(uPhase);
  float glide = cos(uPhase * 0.85);
  vec2 drift = vec2(sway * 5.0, glide * 3.5);
  vec3 waterA = samplePlate(uWater, uWaterSize, screen, drift, vec2(0.5, 0.46));
  vec3 waterB = samplePlate(uWater, uWaterSize, screen, -drift * 0.65, vec2(0.5, 0.46));
  float flick = 0.5 + 0.5 * sin(uPhase * 2.0);
  vec3 water = mix(waterA, waterB, 0.22 + 0.16 * flick);
  water *= 0.985 + 0.03 * sway;

  vec3 sand = samplePlate(uSand, uSandSize, screen, vec2(0.0), vec2(0.62, 0.28));

  float along = xN + (1.0 - yN) * 0.15;
  float sandAmt = smoothstep(0.20, 0.80, along);
  vec3 color = mix(water, sand, sandAmt);

  color *= mix(vec3(1.0), vec3(1.06, 0.94, 0.82), uDusk * 0.5);
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
      for (const name of ["uView", "uWaterSize", "uSandSize", "uPhase", "uDusk"]) {
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
    frame({ w, h, phase, dusk }) {
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
      gl.uniform1f(loc.uDusk, dusk ? 1 : 0);
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
