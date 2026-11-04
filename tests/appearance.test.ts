import { test } from "node:test";
import assert from "node:assert/strict";
import { assertAppearanceOnly } from "../shared/appearance.ts";
import { builderRoom } from "./builder-fixture.ts";
test("appearance guard allows finishes but rejects structural changes", () => {
  const before = builderRoom(),
    after = structuredClone(before);
  after.floorMaterial = "asphalt";
  after.floorColor = "#222222";
  after.models.door.boxes[0].material = "metal";
  assert.doesNotThrow(() => assertAppearanceOnly(before, after));
  for (const mutate of [
    (r: typeof before) => r.spawn[0]++,
    (r: typeof before) => (r.name = "Changed"),
    (r: typeof before) => r.objects.pop(),
    (r: typeof before) => r.models.door.boxes[0].size[0]++,
    (r: typeof before) => (r.signs![0].text = "changed"),
  ]) {
    const next = structuredClone(before);
    mutate(next);
    assert.throws(() => assertAppearanceOnly(before, next), /Appearance-only/);
  }
  assert.doesNotThrow(() =>
    assertAppearanceOnly(
      before,
      Object.fromEntries(Object.entries(before).reverse()) as typeof before,
    ),
  );
});
