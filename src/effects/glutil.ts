export async function decodeBg(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  await img.decode();
  return img;
}

export function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
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

/** Cover-fit an image onto a canvas so UV (0,0)–(1,1) matches CSS background-size: cover. */
export function coverDraw(img: HTMLImageElement, w: number, h: number): HTMLCanvasElement {
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

export const QUAD_VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;
