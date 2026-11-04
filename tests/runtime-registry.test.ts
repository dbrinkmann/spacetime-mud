import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BehaviorRegistry,
  type RegistryEntry,
  type Revision,
  type Bundle,
} from "../shared/runtime/registry.ts";
import { sha256, canonical } from "../shared/runtime/digest.ts";
import { WorldSimulation } from "../spacetimedb/src/runtime/simulation.ts";
import type { Entity } from "../shared/runtime/contracts.ts";
test("portable packages enforce integrity, ownership, visibility and pinned state isolation", () => {
  const sim = new WorldSimulation(),
    entries = new Map<string, RegistryEntry>(),
    revisions = new Map<string, Revision>();
  const registry = new BehaviorRegistry({
    entry: (id) => entries.get(id),
    putEntry: (e) => {
      entries.set(e.id, e);
    },
    revision: (key) => revisions.get(key),
    putRevision: (r) => {
      revisions.set(r.key, r);
    },
    package: (hash) => sim.store.package(hash),
    install: (p) => sim.register(p),
  });
  const alice = { id: "alice", community: "one" },
    bob = { id: "bob", community: "two" };
  const bundle: Bundle = {
    format: 2,
    hash: "",
    license: "MIT",
    documentation: "A reusable counter.",
    source:
      'function on_use(ctx){ctx.state.set("count",(ctx.state.get("count")||0)+ctx.config.get("increment"));}',
    manifest: {
      id: "alice.counter",
      version: "1.0.0",
      apiVersion: 2,
      stateVersion: 1,
      config: {
        type: "object",
        properties: { increment: { type: "number", min: 1, max: 10 } },
        required: ["increment"],
      },
      state: { type: "object", properties: { count: { type: "number" } } },
      initialState: {},
      writes: [],
      handlers: {
        "action:use": { handler: "on_use", input: { type: "null" } },
      },
    },
  };
  bundle.hash = sha256(
    canonical({ manifest: bundle.manifest, source: bundle.source }),
  );
  assert.throws(
    () => registry.publish(alice, { ...bundle, hash: "tampered" }, "public"),
    /hash/,
  );
  registry.publish(alice, bundle, "public");
  assert.throws(() => registry.publish(bob, bundle, "public"), /namespace/);
  const exported = registry.get(bob, "alice.counter", "1.0.0", true);
  assert.equal(exported.hash, bundle.hash);
  const make = (id: string): Entity => ({
    id,
    community: "one",
    property: id,
    room: "room",
    owner: id,
    generation: 1,
    revision: 1,
    enabled: true,
    components: {},
    publicState: {},
  });
  sim.create(make("first"));
  sim.create(make("second"));
  sim.attach("first", "counter", exported.hash, { increment: 1 });
  sim.attach("second", "counter", exported.hash, { increment: 3 });
  sim.advance(0);
  sim.action("first", "use", null, "alice");
  sim.action("second", "use", null, "bob");
  sim.advance(0);
  assert.equal(sim.store.slot("first:counter")!.state.count, 1);
  assert.equal(sim.store.slot("second:counter")!.state.count, 3);
  registry.setListing(alice, "alice.counter", false);
  assert.throws(
    () => registry.get(bob, "alice.counter", "1.0.0", true),
    /unavailable/,
  );
  // Unlisting does not revoke installed behavior execution.
  sim.action("second", "use", null, "bob");
  sim.advance(0);
  assert.equal(sim.store.slot("second:counter")!.state.count, 6);
  const privateBundle = {
    ...bundle,
    manifest: { ...bundle.manifest, id: "alice.private" },
  };
  privateBundle.hash = sha256(
    canonical({
      manifest: privateBundle.manifest,
      source: privateBundle.source,
    }),
  );
  registry.publish(alice, privateBundle, "private");
  assert.throws(
    () => registry.get(bob, "alice.private", "1.0.0"),
    /unavailable/,
  );
  assert.equal(
    WorldSimulation.restore(sim.snapshot()).store.slot("second:counter")!.state
      .count,
    6,
  );
});
