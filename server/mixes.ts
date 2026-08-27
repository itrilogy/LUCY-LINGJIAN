import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { MixSchema, type Mix } from "../shared/mixSchema";

export function mixDir(root: string, id: string): string {
  const base = path.resolve(root, "data/mixes");
  const target = path.resolve(base, id);
  if (!target.startsWith(base + path.sep)) {
    throw new Error("Invalid mix path");
  }
  return target;
}

export function ensureMixRoot(root: string): void {
  mkdirSync(path.join(root, "data/mixes"), { recursive: true });
}

export function listMixes(root: string): Mix[] {
  ensureMixRoot(root);
  const dir = path.join(root, "data/mixes");
  const ids = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("."))
    .map((d) => d.name);
  const out: Mix[] = [];
  for (const id of ids) {
    try {
      const file = path.join(dir, id, "mix.json");
      if (!existsSync(file)) continue;
      const parsed = MixSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
      if (parsed.success) out.push(parsed.data);
    } catch {
      /* ignore corrupted item */
    }
  }
  return out.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export function readMix(root: string, id: string): Mix | null {
  try {
    const file = path.join(mixDir(root, id), "mix.json");
    if (!existsSync(file)) return null;
    const parsed = MixSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function writeMix(root: string, mix: Mix): Mix {
  const parsed = MixSchema.parse(mix);
  const dir = mixDir(root, parsed.id);
  mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, "mix.json");
  if (existsSync(dest)) {
    try {
      writeFileSync(path.join(dir, "mix.json.bak"), readFileSync(dest));
    } catch {
      /* ignore backup error */
    }
  }
  const tmp = path.join(dir, `mix.json.tmp.${Date.now()}_${Math.random().toString(36).slice(2)}`);
  writeFileSync(tmp, JSON.stringify(parsed, null, 2) + "\n");
  renameSync(tmp, dest);
  return parsed;
}

export function deleteMix(root: string, id: string): boolean {
  try {
    const dir = mixDir(root, id);
    if (!existsSync(dir)) return false;
    rmSync(dir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

export function seedPresets(root: string): void {
  ensureMixRoot(root);
  const userDir = path.join(root, "data/mixes");
  const existing = readdirSync(userDir, { withFileTypes: true }).filter(
    (d) => d.isDirectory() && !d.name.startsWith("."),
  );
  if (existing.length > 0) return;
  const presets = path.join(root, "data/presets");
  if (!existsSync(presets)) return;
  for (const name of readdirSync(presets)) {
    if (!name.endsWith(".json") || name.startsWith(".")) continue;
    try {
      const mix = MixSchema.parse(JSON.parse(readFileSync(path.join(presets, name), "utf8")));
      writeMix(root, mix);
    } catch (e) {
      console.warn("seedPreset failed for", name, e);
    }
  }
}
