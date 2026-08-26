import { readFileSync } from "node:fs";
import path from "node:path";
import { enrichCatalog, type Catalog } from "../shared/catalog";

let cached: Catalog | null = null;

export function loadCatalog(root: string): Catalog {
  if (cached) return cached;
  const raw = JSON.parse(
    readFileSync(path.join(root, "asset/Sounds/catalog.json"), "utf8"),
  );
  cached = enrichCatalog(raw);
  return cached;
}
