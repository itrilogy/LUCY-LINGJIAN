import { serve } from "@hono/node-server";
import { Hono } from "hono";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MixSchema } from "../shared/mixSchema";
import { loadCatalog } from "./catalog";
import { deleteMix, listMixes, readMix, seedPresets, writeMix } from "./mixes";
import { serveRanged } from "./static";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");

const host = process.env.HOST ?? "127.0.0.1";
if (host !== "127.0.0.1" && host !== "localhost" && process.env.VOICESTREAM_BIND_LAN !== "1") {
  console.error("Refuse non-loopback bind without VOICESTREAM_BIND_LAN=1");
  process.exit(1);
}

seedPresets(ROOT);
const catalog = loadCatalog(ROOT);

const app = new Hono();

app.get("/api/health", (c) =>
  c.json({ ok: true, bind: host, catalog_files: catalog.file_count }),
);
app.get("/api/catalog", (c) => c.json(catalog));
app.get("/api/mixes", (c) =>
  c.json({
    mixes: listMixes(ROOT).map((m) => ({
      id: m.id,
      name: m.name,
      updated_at: m.updated_at,
      track_count: m.tracks.length,
    })),
  }),
);
const ULID_RE = /^[0-9A-HJKMNPQRSTVWXYZ]{26}$/i;

app.use("/api/mixes/:id", async (c, next) => {
  const id = c.req.param("id");
  if (!id || !ULID_RE.test(id)) {
    return c.json({ error: "invalid_id" }, 400);
  }
  await next();
});

app.get("/api/mixes/:id", (c) => {
  const mix = readMix(ROOT, c.req.param("id"));
  if (!mix) return c.json({ error: "not_found" }, 404);
  return c.json(mix);
});
app.put("/api/mixes/:id", async (c) => {
  const id = c.req.param("id");
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = MixSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 422);
  if (parsed.data.id !== id) return c.json({ error: "id_mismatch" }, 422);
  return c.json(writeMix(ROOT, { ...parsed.data, updated_at: new Date().toISOString() }));
});
app.delete("/api/mixes/:id", (c) => {
  const ok = deleteMix(ROOT, c.req.param("id"));
  if (!ok) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});

app.get("/sounds/*", serveRanged(path.join(ROOT, "asset/Sounds"), "/sounds/"));
app.get("/backgrounds/*", serveRanged(path.join(ROOT, "asset/Backgrounds"), "/backgrounds/"));
app.get("/poetry/*", serveRanged(path.join(ROOT, "asset/Poetry"), "/poetry/"));

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, hostname: host, port }, (info) => {
  console.log(`VoiceStream api http://${info.address}:${info.port}`);
});
