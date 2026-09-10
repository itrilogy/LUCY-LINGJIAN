import { compile, coverDraw, decodeBg, QUAD_VERT } from "./glutil";
import type { OverlayKind } from "./seats";

export type VisualBands = {
  bass: number;
  mid: number;
  treble: number;
  rms: number;
  thunder: number;
};

const MODE: Record<OverlayKind, number> = {
  none: 0,
  haze: 1,
  snow: 2,
  shafts: 3,
  storm: 4,
  heat: 5,
  moon: 6,
  grain: 7,
  mist: 8,
};

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D uBg;
uniform vec2 uRes;
uniform float uTime;
uniform vec4 uAudio;
uniform float uIntensity;
uniform int uMode;
uniform float uFlash;
uniform vec2 uLight;
uniform float uRefract;
in vec2 vUv;
out vec4 fragColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
vec2 hash2(vec2 p) {
  return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 r = mat2(0.80, 0.60, -0.60, 0.80);
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = r * p * 2.03 + vec2(17.1, 9.4);
    a *= 0.5;
  }
  return v;
}

vec3 sampleBg(vec2 uv) {
  return texture(uBg, clamp(uv, 0.002, 0.998)).rgb;
}

vec3 blur5(vec2 uv, float rad) {
  vec2 px = rad / max(uRes, vec2(1.0));
  vec3 c = sampleBg(uv) * 0.2;
  c += sampleBg(uv + vec2(px.x, px.y)) * 0.15;
  c += sampleBg(uv + vec2(-px.x, px.y)) * 0.15;
  c += sampleBg(uv + vec2(px.x, -px.y)) * 0.15;
  c += sampleBg(uv + vec2(-px.x, -px.y)) * 0.15;
  c += sampleBg(uv + vec2(px.x * 1.7, 0.0)) * 0.1;
  c += sampleBg(uv + vec2(-px.x * 1.7, 0.0)) * 0.1;
  return c;
}

float flakeLayer(vec2 uv, float t, float dens, float speed, float size) {
  vec2 p = uv * dens + vec2(t * 0.045 * speed, -t * 0.09 * speed);
  p.x += sin(p.y * 0.35 + t * 0.11) * 0.35;
  vec2 id = floor(p);
  vec2 gv = fract(p) - 0.5;
  vec2 rnd = hash2(id);
  float alive = step(0.55, rnd.x);
  vec2 off = (rnd - 0.5) * 0.72;
  float r = mix(0.035, 0.11, rnd.y) * size;
  float d = length(gv - off);
  float core = smoothstep(r, r * 0.18, d);
  return core * alive * mix(0.35, 0.85, rnd.y);
}

float motes(vec2 uv, float t) {
  vec2 p = uv * vec2(14.0, 18.0) + vec2(t * 0.03, t * 0.018);
  vec2 id = floor(p);
  vec2 gv = fract(p) - 0.5;
  vec2 rnd = hash2(id);
  float alive = step(0.82, rnd.x);
  vec2 off = (rnd - 0.5) * 0.7;
  float d = length(gv - off);
  float tw = 0.45 + 0.55 * sin(t * 0.55 + rnd.y * 12.0);
  return smoothstep(0.07, 0.0, d) * alive * tw;
}

float boltPath(vec2 uv, float seed) {
  float along = 1.0 - uv.y;
  float spine = 0.34 + hash(vec2(seed, 2.7)) * 0.32;
  spine += (fbm(vec2(along * 6.2, seed * 4.1)) - 0.5) * 0.2;
  float d = abs(uv.x - spine);
  float vis = smoothstep(0.12, 0.82, uv.y);
  float body = exp(-d * 48.0) * vis;
  float halo = exp(-d * 9.0) * 0.55 * vis;
  float bloom = exp(-d * 3.2) * 0.22 * vis;
  float forkAt = 0.44 + hash(vec2(seed, 8.1)) * 0.16;
  float fork = 0.0;
  if (uv.y < forkAt) {
    float fs = spine + (uv.y - forkAt) * mix(-1.5, 1.7, hash(vec2(seed, 5.5)));
    fs += (fbm(vec2(along * 8.0, seed * 6.2)) - 0.5) * 0.07;
    float fd = abs(uv.x - fs);
    fork = (exp(-fd * 42.0) + exp(-fd * 8.0) * 0.35) * smoothstep(forkAt - 0.32, forkAt - 0.02, uv.y) * 0.85;
  }
  return body * 1.6 + halo + bloom + fork;
}

void main() {
  vec2 uv = vUv;
  float t = uTime;
  float I = clamp(uIntensity, 0.0, 1.2);
  vec4 audio = uAudio;
  vec3 bg = sampleBg(uv);
  vec4 outC = vec4(0.0);

  if (uMode == 1) {
    float height = smoothstep(0.0, 0.16, uv.y) * smoothstep(0.95, 0.22, uv.y);
    float column = exp(-pow((uv.x - 0.5) / 0.26, 2.0));
    vec2 q = uv * vec2(2.4, 3.6) - vec2(sin(t * 0.06) * 0.12, t * 0.09);
    float n1 = fbm(q + vec2(t * 0.02, 0.0));
    float n2 = fbm(q * 1.65 + vec2(n1 * 1.6, t * 0.05));
    float steam = smoothstep(0.28, 0.68, n2) * column * height;
    steam += smoothstep(0.4, 0.82, n1) * column * height * 0.55;
    steam = clamp(steam, 0.0, 1.0);
    vec2 disp = vec2(n1 - 0.5, n2 - 0.5) * 0.016 * I * height;
    vec3 col = sampleBg(uv + disp * uRefract);
    vec3 smoke = vec3(0.84, 0.87, 0.90);
    col = mix(col, mix(col * 1.05, smoke, 0.62), steam * 0.9 * I);
    if (uRefract < 0.5) {
      outC = vec4(smoke, steam * 0.62 * I);
    } else {
      outC = vec4(col, clamp(0.55 + steam * 0.45, 0.55, 1.0) * I);
    }
  } else if (uMode == 2) {
    float snow = 0.0;
    snow += flakeLayer(uv, t, 9.0, 0.55, 1.15);
    snow += flakeLayer(uv + vec2(1.7, 0.4), t, 16.0, 0.9, 0.75) * 0.7;
    snow += flakeLayer(uv + vec2(0.3, 2.1), t, 28.0, 1.25, 0.5) * 0.45;
    snow *= I * (0.75 + audio.z * 0.35);
    float grade = 0.0;
    outC = vec4(vec3(0.86, 0.91, 1.0) * 0.08 * I, 0.08 * I);
    outC.rgb += vec3(0.92, 0.96, 1.0) * snow;
    outC.a = max(outC.a, snow * 0.85);
    outC.a += grade;
  } else if (uMode == 3) {
    vec2 light = vec2(clamp(uLight.x, 0.22, 0.7), 1.1);
    vec2 rel = uv - light;
    float dist = length(rel);
    float ang = atan(rel.x, max(-rel.y, 0.001));
    float lobes = pow(0.5 + 0.5 * sin(ang * 5.0 + t * 0.06), 6.5);
    lobes += pow(0.5 + 0.5 * sin(ang * 8.2 - t * 0.04 + 1.25), 9.0) * 0.7;
    lobes += pow(0.5 + 0.5 * sin(ang * 3.1 + 0.5), 3.5) * 0.4;
    float fall = exp(-dist * 0.48) * smoothstep(1.4, 0.02, dist);
    float beam = lobes * fall * (0.9 + audio.y * 0.35) * I;
    float dust = motes(uv, t) * fall * 1.6;
    vec3 sun = vec3(1.0, 0.88, 0.62) * beam * 1.35 + vec3(1.0, 0.94, 0.78) * dust * 0.9;
    outC = vec4(sun, clamp(beam * 0.82 + dust * 0.5, 0.0, 0.9));
  } else if (uMode == 4) {
    float flash = uFlash;
    float sky = smoothstep(0.38, 1.0, uv.y);
    vec3 wash = vec3(0.78, 0.86, 1.0) * flash * (0.35 + 0.55 * sky);
    float b1 = boltPath(uv, floor(t * 0.05 + 3.0));
    float b2 = boltPath(uv + vec2(0.08, 0.0), floor(t * 0.05 + 8.0));
    float bolts = max(b1, b2 * 0.62) * flash;
    vec3 col = wash + vec3(0.92, 0.96, 1.0) * bolts * 1.7;
    outC = vec4(col, clamp(flash * 0.55 + bolts * 0.8, 0.0, 0.92));
  } else if (uMode == 5) {
    float bottom = smoothstep(0.68, 0.0, uv.y);
    float bands = sin(uv.y * 26.0 - t * 0.9 + fbm(uv * 4.0) * 2.6);
    vec2 wob = vec2(
      bands * 0.014 + (fbm(uv * vec2(2.2, 7.5) + vec2(0.0, t * 0.32)) - 0.5) * 0.022,
      (fbm(uv * 5.5 + t * 0.1) - 0.5) * 0.007
    ) * I * bottom;
    vec3 col = sampleBg(uv + wob * uRefract);
    float breath = 0.68 + 0.32 * sin(t * 0.4) + audio.x * 0.28;
    col += vec3(0.48, 0.16, 0.03) * bottom * breath * I * 0.75;
    if (uRefract < 0.5) {
      outC = vec4(vec3(1.0, 0.4, 0.08) * bottom * breath, bottom * 0.4 * I);
    } else {
      outC = vec4(col, I);
    }
  } else if (uMode == 6) {
    float water = smoothstep(0.55, 0.36, uv.y);
    float cx = 0.58 + sin(uv.y * 5.5 + t * 0.14) * 0.025;
    float road = exp(-pow((uv.x - cx) / 0.12, 2.0));
    float core = exp(-pow((uv.x - cx) / 0.042, 2.0));
    vec2 gp = vec2((uv.x - cx) * 16.0, uv.y * 34.0 - t * 0.1);
    vec2 id = floor(gp);
    vec2 gv = fract(gp) - 0.5;
    vec2 rnd = hash2(id);
    float alive = step(0.32, rnd.x);
    vec2 ell = (gv - (rnd - 0.5) * vec2(0.12, 0.06)) / vec2(1.05, 0.09);
    float dash = smoothstep(1.0, 0.12, length(ell)) * alive;
    float glint = dash * road * water;
    float glow = (road * 0.2 + core * 0.16) * water;
    vec3 add = vec3(0.8, 0.9, 1.0) * (glow + glint * 1.7) * I;
    outC = vec4(add, clamp((glow * 0.9 + glint) * I, 0.0, 0.8));
  } else if (uMode == 7) {
    float ang = 0.4;
    mat2 rot = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
    vec2 p = rot * (uv - 0.5) * (uRes.y / 26.0);
    p += vec2(t * 0.015, 0.0);
    vec2 gv = fract(p) - 0.5;
    float lum = dot(bg, vec3(0.3, 0.59, 0.11));
    float rad = mix(0.38, 0.08, lum) * (0.75 + audio.w * 0.4) * I;
    float d = length(gv);
    float dotv = smoothstep(rad, rad - 0.04, d);
    vec3 ink = mix(vec3(0.07, 0.08, 0.09), vec3(0.92, 0.93, 0.9), lum);
    outC = vec4(ink, dotv * 0.32 * I);
  } else if (uMode == 8) {
    vec2 px = 1.6 / max(uRes, vec2(1.0));
    float n = fbm(uv * 3.0 + t * 0.03);
    vec2 disp = vec2(n - 0.5) * 0.004 * I;
    float r = sampleBg(uv + disp + vec2(px.x, 0.0)).r;
    float g = sampleBg(uv + disp).g;
    float b = sampleBg(uv + disp - vec2(px.x, 0.0)).b;
    vec3 col = mix(blur5(uv, 1.8 * I), vec3(r, g, b), 0.55);
    outC = vec4(col, 0.72 * I);
  } else {
    outC = vec4(0.0);
  }

  fragColor = outC;
}`;

export class OverlayGL {
  private gl: WebGL2RenderingContext | null = null;
  private prog: WebGLProgram | null = null;
  private tex: WebGLTexture | null = null;
  private buf: WebGLBuffer | null = null;
  private loc: Record<string, WebGLUniformLocation | null> = {};
  private raf = 0;
  private t0 = 0;
  private gen = 0;
  private img: HTMLImageElement | null = null;
  private kind: OverlayKind = "none";
  private intensity = 0;
  private refract = 1;
  private bands: VisualBands = { bass: 0, mid: 0, treble: 0, rms: 0, thunder: 0 };
  private light = { x: 0.5, y: 0.78 };
  private flash = 0;
  private flashT = 99;
  private nextFlash = 3200;
  private hasTex = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.canvas.style.opacity = "0";
  }

  setBands(b: VisualBands): void {
    this.bands = b;
  }

  setLight(x: number, y: number): void {
    this.light = { x, y };
  }

  async setScene(
    url: string | null,
    kind: OverlayKind,
    intensity: number,
    opts?: { refract?: boolean },
  ): Promise<boolean> {
    const gen = ++this.gen;
    this.kind = kind;
    this.intensity = intensity;
    this.refract = opts?.refract === false ? 0 : 1;
    if (!url || kind === "none" || intensity < 0.02) {
      this.hide();
      this.stop();
      return false;
    }
    try {
      const img = await decodeBg(url);
      if (gen !== this.gen) return false;
      for (let i = 0; i < 30 && !this.fit(); i++) {
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
      }
      this.fit();
      this.boot();
      this.img = img;
      this.upload(img);
      this.hasTex = true;
      this.t0 = performance.now();
      this.flashT = 8;
      this.nextFlash = 0.45;
      this.start();
      const screen = kind === "shafts" || kind === "storm" || kind === "moon" || kind === "snow" || kind === "grain";
      this.canvas.style.mixBlendMode = screen ? "screen" : "normal";
      this.canvas.style.opacity = "1";
      return true;
    } catch (e) {
      console.warn("OverlayGL unavailable", e);
      this.hide();
      this.stop();
      return false;
    }
  }

  resize(): void {
    if (!this.gl) return;
    if (!this.fit()) return;
    if (this.img) this.upload(this.img);
  }

  destroy(): void {
    this.gen += 1;
    this.stop();
    this.hide();
    const gl = this.gl;
    if (gl) {
      if (this.tex) gl.deleteTexture(this.tex);
      if (this.buf) gl.deleteBuffer(this.buf);
      if (this.prog) gl.deleteProgram(this.prog);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
    this.gl = null;
    this.tex = null;
    this.prog = null;
    this.img = null;
  }

  private hide(): void {
    this.canvas.style.opacity = "0";
    this.canvas.style.mixBlendMode = "normal";
  }

  private fit(): boolean {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const w = Math.max(0, Math.floor(r.width * dpr));
    const h = Math.max(0, Math.floor(r.height * dpr));
    if (w < 8 || h < 8) return false;
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    this.gl?.viewport(0, 0, w, h);
    return true;
  }

  private boot(): void {
    if (this.gl) return;
    const gl = this.canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: false,
      antialias: true,
    });
    if (!gl) throw new Error("webgl2");
    this.gl = gl;
    const vs = compile(gl, gl.VERTEX_SHADER, QUAD_VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, "aPos");
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? "link");
    this.prog = prog;
    this.buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.tex = gl.createTexture();
    this.loc = {
      uBg: gl.getUniformLocation(prog, "uBg"),
      uRes: gl.getUniformLocation(prog, "uRes"),
      uTime: gl.getUniformLocation(prog, "uTime"),
      uAudio: gl.getUniformLocation(prog, "uAudio"),
      uIntensity: gl.getUniformLocation(prog, "uIntensity"),
      uMode: gl.getUniformLocation(prog, "uMode"),
      uFlash: gl.getUniformLocation(prog, "uFlash"),
      uLight: gl.getUniformLocation(prog, "uLight"),
      uRefract: gl.getUniformLocation(prog, "uRefract"),
    };
    this.canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.gl = null;
      this.prog = null;
      this.tex = null;
      this.buf = null;
    });
    this.canvas.addEventListener("webglcontextrestored", () => {
      if (!this.img) return;
      this.boot();
      this.upload(this.img);
    });
  }

  private upload(img: HTMLImageElement): void {
    const gl = this.gl;
    if (!gl || !this.tex) return;
    const cover = coverDraw(img, this.canvas.width, this.canvas.height);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cover);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  private start(): void {
    if (this.raf) return;
    const loop = (now: number) => {
      if (this.gl && this.gl.isContextLost() && this.img) {
        this.gl = null;
        try {
          this.boot();
          this.upload(this.img);
        } catch {
          this.raf = requestAnimationFrame(loop);
          return;
        }
      }
      if (!document.hidden && this.gl) this.draw(now);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private stepFlash(dt: number): void {
    this.flashT += dt;
    const peak = this.bands.thunder;
    if (this.flashT > this.nextFlash || (peak > 0.58 && this.flashT > 1.6)) {
      this.flashT = 0;
      this.nextFlash = 2.4 + Math.random() * 4.2;
    }
    let env = 0;
    const x = this.flashT;
    if (x < 0.06) env = x / 0.06;
    else if (x < 0.11) env = 1.0 - (x - 0.06) / 0.05 * 0.82;
    else if (x >= 0.16 && x < 0.22) env = 0.55 * (1.0 - (x - 0.16) / 0.06);
    else if (x >= 0.22 && x < 0.7) env = 0.12 * (1.0 - (x - 0.22) / 0.48);
    this.flash = env * (0.55 + peak * 0.7);
  }

  private draw(now: number): void {
    const gl = this.gl;
    const prog = this.prog;
    if (!gl || !prog || !this.hasTex) return;
    const t = (now - this.t0) / 1000;
    if (this.kind === "storm") this.stepFlash(1 / 60);
    else this.flash *= 0.9;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(this.loc.uBg, 0);
    gl.uniform2f(this.loc.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.loc.uTime, t);
    gl.uniform4f(this.loc.uAudio, this.bands.bass, this.bands.mid, this.bands.treble, this.bands.rms);
    gl.uniform1f(this.loc.uIntensity, this.intensity);
    gl.uniform1i(this.loc.uMode, MODE[this.kind]);
    gl.uniform1f(this.loc.uFlash, this.flash);
    gl.uniform2f(this.loc.uLight, this.light.x, this.light.y);
    gl.uniform1f(this.loc.uRefract, this.refract);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
