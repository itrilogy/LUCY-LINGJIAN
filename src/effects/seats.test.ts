import assert from "node:assert/strict";
import { test } from "node:test";
import { planVisual } from "./seats";
import type { MixTrack } from "../../shared/mixSchema";

function track(target: string, kind: "file" | "category" = "category", volume = 0.7): MixTrack {
  return {
    id: "01JZG000000000000000000001",
    kind,
    target_id: target,
    volume,
    muted: false,
    fade_in_ms: 2000,
    fade_out_ms: 2000,
    loop: true,
  };
}

test("rain takes glass and does not also run water", () => {
  const plan = planVisual({ tags: ["rain"], tracks: [track("rain")] });
  assert.equal(plan.glass, "rain");
  assert.equal(plan.water, 0);
});

test("storm uses storm glass plus storm overlay", () => {
  const plan = planVisual({ tags: ["thunder", "storm", "rain"], tracks: [track("thunder"), track("rain")] });
  assert.equal(plan.glass, "storm");
  assert.equal(plan.overlay, "storm");
  assert.ok(plan.overlayIntensity > 0.3);
});

test("stream without rain keeps water ripple", () => {
  const plan = planVisual({ tags: ["stream"], tracks: [track("stream")] });
  assert.equal(plan.glass, null);
  assert.ok(plan.water > 0.5);
});

test("steam without rain uses slow haze overlay", () => {
  const plan = planVisual({ tags: ["steam", "mist"], tracks: [track("steam", "file")] });
  assert.equal(plan.overlay, "haze");
  assert.equal(plan.glass, null);
});

test("snow weather selects snow overlay", () => {
  const plan = planVisual({ tags: ["snow", "cool"] });
  assert.equal(plan.overlay, "snow");
});

test("dawn without rain selects shafts, not a hero grid", () => {
  const plan = planVisual({ tags: ["dawn", "nature"] });
  assert.equal(plan.overlay, "shafts");
});

test("ocean night adds moonlight overlay on water", () => {
  const plan = planVisual({ tags: ["ocean", "night"], tracks: [track("ocean"), track("night")] });
  assert.ok(plan.water > 0.4);
  assert.equal(plan.overlay, "moon");
  assert.equal(plan.particles.includes("fireflies"), false);
});

test("noise selects grain overlay", () => {
  const plan = planVisual({ tags: ["noise", "white"], tracks: [track("noise")] });
  assert.equal(plan.overlay, "grain");
});

test("reduced motion drops animated surfaces", () => {
  const plan = planVisual({ tags: ["rain", "thunder"], reducedMotion: true });
  assert.equal(plan.glass, null);
  assert.equal(plan.water, 0);
  assert.ok(plan.overlay === "none" || plan.overlay === "grain");
});

test("steam file does not open water, uses haze", () => {
  const plan = planVisual({
    tags: ["stream", "steam"],
    tracks: [track("steam", "file", 0.8)],
  });
  assert.equal(plan.overlay, "haze");
  assert.equal(plan.water, 0);
  assert.equal(plan.glass, null);
});

test("snow visual tag on quiet night selects flying snow", () => {
  const plan = planVisual({
    tags: ["quietnight", "night", "snow"],
    tracks: [track("quietnight", "file")],
  });
  assert.equal(plan.overlay, "snow");
});

test("dawn visual tag on stream selects shafts over the water", () => {
  const plan = planVisual({
    tags: ["stream", "dawn"],
    tracks: [track("stream")],
  });
  assert.ok(plan.water > 0.4);
  assert.equal(plan.overlay, "shafts");
});

test("muted tracks do not occupy a seat", () => {
  const quiet: MixTrack = { ...track("rain"), muted: true };
  const plan = planVisual({ tags: ["fire"], tracks: [quiet, track("fire")] });
  assert.equal(plan.glass, null);
  assert.ok(plan.overlay === "heat" || plan.particles.includes("embers"));
});
