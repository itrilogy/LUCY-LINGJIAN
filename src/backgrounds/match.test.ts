import assert from "node:assert/strict";
import { test } from "node:test";
import { matchBackground, type BgCatalog } from "./match";

const catalog: BgCatalog = {
  matching: {
    hit_weight: 3,
    extra_penalty: 0.4,
    missing_penalty: 0.2,
    subset_bonus: 1.5,
    fallback_id: "noise-white",
  },
  defaults: { rain: "rain-window", fire: "fire-campfire" },
  images: [
    { id: "noise-white", file: "noise-white.jpg", label_zh: "白雾", tags: ["noise", "white"], effects: ["grain"], light: "cool-fog" },
    { id: "rain-window", file: "rain-window.jpg", label_zh: "雨夜窗", tags: ["rain"], effects: ["raindrops"], light: "city-streak" },
    { id: "fire-campfire", file: "fire-campfire.jpg", label_zh: "林中篝火", tags: ["fire"], effects: ["embers"], light: "fire-pulse" },
    { id: "mix-rain-fire", file: "mix-rain-fire.jpg", label_zh: "雨夜壁炉", tags: ["rain", "fire"], effects: ["embers", "raindrops"], light: "split-warm-cool" },
  ],
};

test("rain+fire prefers the mix still over a single-tag default", () => {
  const img = matchBackground(["rain", "fire"], catalog, { seed: "01JZG000000000000000000099" });
  assert.equal(img.id, "mix-rain-fire");
});

test("flavor tags do not block a core hit", () => {
  const img = matchBackground(["rain", "dawn", "cool"], catalog, { seed: "abc" });
  assert.equal(img.tags.includes("rain"), true);
});

test("empty play list falls back", () => {
  const img = matchBackground([], catalog);
  assert.equal(img.id, "noise-white");
});
