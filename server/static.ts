import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import type { Context } from "hono";
import { stream } from "hono/streaming";

const MIME: Record<string, string> = {
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".json": "application/json",
};

function mimeOf(file: string): string {
  return MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream";
}

function safeJoin(root: string, rel: string): string | null {
  const resolved = path.resolve(root, rel);
  if (!resolved.startsWith(path.resolve(root))) return null;
  return resolved;
}

export function serveRanged(root: string, urlPrefix: string) {
  return (c: Context) => {
    const raw = decodeURIComponent(c.req.path.slice(urlPrefix.length));
    const file = safeJoin(root, raw);
    if (!file || !existsSync(file) || !statSync(file).isFile()) {
      return c.notFound();
    }
    const st = statSync(file);
    const type = mimeOf(file);
    c.header("Accept-Ranges", "bytes");
    c.header("Content-Type", type);
    const isAudio = type.startsWith("audio/");
    c.header(
      "Cache-Control",
      isAudio ? "public, max-age=31536000, immutable" : "public, max-age=86400",
    );

    const range = c.req.header("range");
    if (range) {
      const m = /^bytes=(\d+)-(\d*)$/.exec(range);
      if (!m) return c.body("Invalid range", 416);
      const start = Number(m[1]);
      const end = m[2] ? Number(m[2]) : st.size - 1;
      if (start >= st.size || end >= st.size || start > end) {
        c.header("Content-Range", `bytes */${st.size}`);
        return c.body(null, 416);
      }
      c.header("Content-Range", `bytes ${start}-${end}/${st.size}`);
      c.header("Content-Length", String(end - start + 1));
      c.status(206);
      return stream(c, async (s) => {
        const rs = createReadStream(file, { start, end });
        for await (const chunk of rs) await s.write(chunk);
      });
    }

    c.header("Content-Length", String(st.size));
    return stream(c, async (s) => {
      const rs = createReadStream(file);
      for await (const chunk of rs) await s.write(chunk);
    });
  };
}
