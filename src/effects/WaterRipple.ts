async function decodeBg(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  await img.decode();
  return img;
}

const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D uBg;
uniform vec2 uRes;
uniform float uTime;
uniform vec4 uRipples[20];
uniform int uCount;
in vec2 vUv;
out vec4 fragColor;

void main() {
  float aspect = uRes.x / max(uRes.y, 1.0);
  vec2 p = vec2(vUv.x * aspect, vUv.y);
  vec2 deriv = vec2(
    sin(p.x * 5.4 + uTime * 0.28) * 0.55 + sin(p.y * 8.1 - uTime * 0.19) * 0.38,
    cos(p.x * 4.6 - uTime * 0.16) * 0.42 + sin(p.y * 6.8 + uTime * 0.24) * 0.5
  ) * 0.0075;
  for (int i = 0; i < 20; i++) {
    if (i >= uCount) break;
    vec4 rp = uRipples[i];
    float t = uTime - rp.z;
    if (t < 0.0 || t > 6.4) continue;
    vec2 c = vec2(rp.x * aspect, rp.y);
    float d = distance(p, c);
    float env = rp.w * exp(-t * 0.72) * exp(-d * 2.6) * smoothstep(0.0, 0.14, t);
    float phase = d * 42.0 - t * 4.6;
    vec2 dir = (p - c) / max(d, 0.0008);
    deriv += dir * sin(phase) * env * 0.055;
    deriv += dir * sin(phase * 1.7) * env * 0.018;
  }
  deriv = clamp(deriv, vec2(-0.11), vec2(0.11));
  vec2 uv = clamp(mix(vUv, vec2(0.5), 0.035) + deriv, 0.002, 0.998);
  vec3 col = texture(uBg, uv).rgb;
  vec3 n = normalize(vec3(-deriv.x * 18.0, -deriv.y * 18.0, 1.0));
  vec3 L = normalize(vec3(-0.22, 0.58, 0.78));
  float ndl = clamp(dot(n, L), 0.0, 1.0);
  col *= 0.7 + 0.42 * ndl;
  float cau = sin((uv.x + deriv.x) * 36.0 + uTime * 0.38) * sin((uv.y + deriv.y) * 28.0 - uTime * 0.3);
  col += col * cau * (0.07 + 0.08 * ndl);
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(n, H), 0.0), 72.0);
  col += col * spec * 0.16;
  fragColor = vec4(col, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(log ?? "shader");
  }
  return sh;
}

function coverDraw(img: HTMLImageElement, w: number, h: number): HTMLCanvasElement {
  const oc = document.createElement("canvas");
  oc.width = w;
  oc.height = h;
  const ctx = oc.getContext("2d")!;
  const ir = img.naturalWidth / img.naturalHeight;
  const cr = w / h;
  let dw: number;
  let dh: number;
  let ox: number;
  let oy: number;
  if (ir > cr) {
    dh = h;
    dw = h * ir;
    ox = (w - dw) / 2;
    oy = 0;
  } else {
    dw = w;
    dh = w / ir;
    ox = 0;
    oy = (h - dh) / 2;
  }
  ctx.drawImage(img, ox, oy, dw, dh);
  return oc;
}

type Drop = { x: number; y: number; t0: number; amp: number };

function clamp(n: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, n));
}

/** Stronger rings wait longer; gentler rings come more often. Both jitter inside a range. */
export function sampleRippleBeat(): { amp: number; waitSec: number } {
  const weight = Math.random();
  const amp = clamp(0.24 + weight * 0.78 + (Math.random() - 0.5) * 0.1, 0.22, 1.06);
  const waitSec = clamp(0.48 + weight * 2.7 + (Math.random() - 0.5) * 0.45, 0.4, 3.6);
  return { amp, waitSec };
}

export class WaterRipple {
  private gl: WebGL2RenderingContext | null = null;
  private prog: WebGLProgram | null = null;
  private tex: WebGLTexture | null = null;
  private buf: WebGLBuffer | null = null;
  private loc: Record<string, WebGLUniformLocation | null> = {};
  private drops: Drop[] = [];
  private raf = 0;
  private t0 = 0;
  private next = 0;
  private gen = 0;
  private img: HTMLImageElement | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.canvas.style.opacity = "0";
  }

  async setScene(url: string | null): Promise<boolean> {
    const gen = ++this.gen;
    if (!url) {
      this.stop();
      this.canvas.style.opacity = "0";
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
      const first = sampleRippleBeat();
      this.drops = [
        {
          x: 0.22 + Math.random() * 0.56,
          y: 0.32 + Math.random() * 0.4,
          t0: -0.2,
          amp: first.amp,
        },
      ];
      this.t0 = performance.now();
      this.next = first.waitSec;
      this.start();
      this.canvas.style.opacity = "1";
      return true;
    } catch (e) {
      console.warn("WaterRipple unavailable", e);
      this.stop();
      this.canvas.style.opacity = "0";
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
    this.canvas.style.opacity = "0";
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

  private fit(): boolean {
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(0, Math.floor(r.width));
    const h = Math.max(0, Math.floor(r.height));
    if (w < 8 || h < 8) return false;
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    this.gl?.viewport(0, 0, w, h);
    return true;
  }

  private boot(): void {
    if (this.gl) return;
    const gl = this.canvas.getContext("webgl2", { alpha: false, premultipliedAlpha: false, antialias: true });
    if (!gl) throw new Error("webgl2");
    this.gl = gl;
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
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
      uRipples: gl.getUniformLocation(prog, "uRipples") ?? gl.getUniformLocation(prog, "uRipples[0]"),
      uCount: gl.getUniformLocation(prog, "uCount"),
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
      if (this.gl) this.draw(now);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private draw(now: number): void {
    const gl = this.gl;
    const prog = this.prog;
    if (!gl || !prog) return;
    const t = (now - this.t0) / 1000;
    if (t >= this.next) {
      const beat = sampleRippleBeat();
      this.drops.push({
        x: 0.12 + Math.random() * 0.76,
        y: 0.28 + Math.random() * 0.55,
        t0: t,
        amp: beat.amp,
      });
      const cap = beat.amp > 0.78 ? 4 : beat.amp > 0.48 ? 6 : 8;
      if (this.drops.length > cap) this.drops.splice(0, this.drops.length - cap);
      this.next = t + beat.waitSec;
    }
    const data = new Float32Array(80);
    let n = 0;
    for (const d of this.drops) {
      if (t - d.t0 > 3.4 + d.amp * 3.2) continue;
      const i = n * 4;
      data[i] = d.x;
      data[i + 1] = d.y;
      data[i + 2] = d.t0;
      data[i + 3] = d.amp;
      n += 1;
    }
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(this.loc.uBg, 0);
    gl.uniform2f(this.loc.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.loc.uTime, t);
    gl.uniform1i(this.loc.uCount, n);
    gl.uniform4fv(this.loc.uRipples, data);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
