import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { DbConnection } from "../world-client/module_bindings/index";
import { validateManifest, BUDGETS } from "../shared/runtime/contracts";
import {
  copyValue,
  assertSchema,
  type RecordValue,
} from "../shared/runtime/values";
import { canonical, sha256 } from "../shared/runtime/digest";
import { WORK_LIMITS } from "../shared/runtime/budgets";
import { counterExample } from "../shared/runtime/examples";
import { cooperationPackages } from "../shared/runtime/cooperation";
import { guidePackage } from "../shared/runtime/guide-example";
import { validateSource } from "../spacetimedb/src/runtime/sandbox";
import { WorldSimulation } from "../spacetimedb/src/runtime/simulation";
import { WorldRuntime } from "../spacetimedb/src/runtime/engine";
import { copyComponentData } from "../shared/runtime/components";
const key = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.:-]{0,79}$/);
const slotRef = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.:-]{1,160}$/);
const packageInput = z.object({
  manifest: z.unknown(),
  source: z.string().max(BUDGETS.source),
  license: z.string().min(1).max(120),
  documentation: z.string().max(8000),
});
export function packageBundle(input: z.infer<typeof packageInput>) {
  const manifest = validateManifest(input.manifest);
  assertSchema(manifest.state, manifest.initialState);
  validateSource(input.source, [
    ...Object.values(manifest.handlers).map((h) => h.handler),
    ...Object.values(manifest.migrations ?? {}),
  ]);
  return {
    format: 2 as const,
    ...input,
    manifest,
    hash: sha256(canonical({ manifest, source: input.source })),
  };
}
const json = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value) }],
});
const guard =
  <T>(fn: (a: T) => Promise<unknown> | unknown) =>
  async (a: T) => {
    try {
      return json(await fn(a));
    } catch (e) {
      return {
        ...json({ error: e instanceof Error ? e.message : String(e) }),
        isError: true,
      };
    }
  };
/** Provider-neutral v2 authoring surface. No live connection is needed for validation or simulation. */
export function createRuntimeMcp(
  connect: () => Promise<DbConnection>,
  options: {
    preview?: (input: Record<string, unknown>) => Promise<string>;
  } = {},
) {
  const server = new McpServer({
    name: "lantern-runtime-builder",
    version: "2.0.0",
  });
  server.registerTool(
    "world_preview",
    {
      description:
        "Render a live room or unpublished RoomPresentation through the hosted game renderer; PNG, no publication. Optional camera focus, zoom, yaw and time offset.",
      inputSchema: {
        community: z.string(),
        property: key,
        room: key,
        source: z.string().max(2000000).optional(),
        focus: z.tuple([z.number(), z.number(), z.number()]).optional(),
        zoom: z.number().min(0.25).max(20).optional(),
        yaw: z.number().min(-360).max(360).optional(),
        time: z.number().min(0).max(3600).optional(),
      },
    },
    async (a) => {
      try {
        if (!options.preview)
          throw Error(
            "Set LANTERN_RUNTIME_SITE to the replacement preview host.",
          );
        const c = await connect();
        const source =
          a.source ??
          (await c.procedures.previewRoom({
            property: a.property,
            room: a.room,
          }));
        const data = await options.preview({
          runtime: true,
          community_id: a.community,
          source,
          focus: a.focus,
          zoom: a.zoom,
          yaw: a.yaw,
          time: a.time,
        });
        return {
          content: [{ type: "image" as const, mimeType: "image/png", data }],
        };
      } catch (e) {
        return { ...json({ error: String(e) }), isError: true };
      }
    },
  );
  server.registerTool(
    "world_guide",
    {
      description:
        "Read the isolated v2 runtime contract and limits. This API is not the current production Activity.",
      inputSchema: {},
    },
    guard(() => ({
      apiVersion: 2,
      status: "development",
      budgets: BUDGETS,
      workLimits: WORK_LIMITS,
      packageExample: counterExample,
      cooperationExamples: cooperationPackages("examples"),
      dialogueExample: guidePackage,
      componentExamples: {
        walkSurface: { width: 10, depth: 8, spawn: [3, 0, 3] },
        collider: { size: [1, 1], center: [0, 0, 0], enabled: true },
        interaction: { approach: [0, 0, 1] },
        visual: {
          boxes: [
            {
              position: [0, 0.5, 0],
              size: [1, 1, 1],
              color: "#667788",
              material: "metal",
            },
          ],
        },
        visibility: true,
        text: "A sign",
        light: { color: "#ffaa00", intensity: 2 },
        transform: { position: [0, 0, 0], rotation: [0, 0, 0] },
      },
      workflow: [
        "Validate a package, then simulate it with fixture entities.",
        "Connect and pair this identity with a verified member in the replacement database.",
        "Publish the immutable bundle, create an entity in an authorized property and attach the exact hash.",
        "Inspect after queued initialization; accepted does not mean the handler has already run.",
      ],
      handlers:
        "Manifest handlers map type:name to {handler: on_function, input: schema}. Source uses bounded ES5 functions. API methods are on ctx.",
      state:
        "ctx.state.get/has/set/delete are slot-private. ctx.variables.get/has/set/delete require reads/writes declarations and writer schemas; variable:key notifications contain {key,exists}. ctx.public.set exports a declared public.key resource.",
      messaging:
        "ctx.messages.send(entity,name,payload) is asynchronous and same-property. ctx.messages.sendToSlot(entity,localSlotName,name,payload) targets one behavior's contract. The provisional ID identifies delivery only after commit. ctx.entities.inspect returns public state and sampled components, not private variables.",
      time: "ctx.timers.after(seconds,name,payload), cancel(name); timer:name subscriptions. ctx.clock.now() is server/virtual time in seconds.",
      spatial:
        "ctx.subscribe(name,{frame:'self'|'room',box:{center:[x,y,z],size:[width,depth],height?:meters},include:['player','tag:car'],hysteresis?:meters}); unsubscribe(name); view(name) returns member IDs. spatial:enter/exit payload {view,entity:{id,kind}}. ctx.entities.query(viewDefinition) returns up to 64 {id,kind,position}; inspect(id) accepts player:IDENTITY. Self-frame sensing requires fixed yaw or path-segment heading. Hidden sources still sense; hidden targets are omitted.",
      reservations:
        "ctx.reservations.claim(name,{center:[x,y,z],size:[width,height,depth]},seconds) atomically reserves a room-space region and returns boolean. Reclaim renews; release(name) frees. Hidden sources retain claims. Four claims per slot, .25..300 second leases. Lifecycle cleanup frees claims. Reservations do not create physics colliders.",
      random:
        "ctx.random() returns deterministic event-seeded values in [0,1). Replaying an event repeats its draws.",
      operations:
        "ctx.operations.animate(resource,{position:[x,y,z],rotation:[x,y,z]},seconds), follow(resource,points,speed,mode), pause/resume/restart/cancel(resource), setSpeed(resource,multiplier), progress(resource). Restart preserves paused state; progress reads event-start state. Path modes once/loop/pingpong; base speed meters/second. Named parts share NAME across visual, transform, light, sign, text, wall and visibility. operation:completed/cancelled payload {id,resource,outcome}.",
      interaction:
        "ctx.say(text) speaks publicly; ctx.tell(text) privately; ctx.dialog(name,prompt,choices) emits dialog:name with {choice}; ctx.prompt(name,prompt,maxLength) emits {text}. ctx.player.get/set stores private per-player memory. Player actions/speech/spatial arrivals carry context; messages do not inherit it. speech:said carries {speaker,text}; script speech does not trigger recursion.",
      lifecycle:
        "world_publish_template stores components and pinned behavior bindings. ctx.world.spawn(hash,position) returns a new entity ID; ctx.world.destroy() removes self from the world; ctx.world.transfer(room,position) moves self within its property, cancels timers/operations and emits bound. Declare world.spawn/world.destroy/world.transfer in writes. Transfer requires an authored destination walk surface. Template/spawn tools support configured behavior reuse; dependency discovery is not implemented.",
      limitations: [
        "The local authorized workshop (?runtime) supports floor walking, static collider routing and approach-before-action. Each room needs one origin-centered walkSurface; collider footprints and interaction approach offsets use the entity yaw. Only null-payload actions are exposed by this UI. Moving obstacle avoidance and Activity integration remain incomplete.",
        "Spatial views, seating, away avatars, character/sign/light parts and home graphs are implemented locally. Replacement Discord deployment and launch verification remain outstanding.",
        "Simulation does not impersonate live memberships or authorize live actions",
      ],
    })),
  );
  server.registerTool(
    "world_validate_package",
    {
      description:
        "Validate a v2 manifest/source without executing it; return a portable content-addressed bundle.",
      inputSchema: { package: packageInput },
    },
    guard(({ package: input }) => packageBundle(input)),
  );
  server.registerTool(
    "world_connect",
    {
      description:
        "Get this agent's identity for pairing. Never returns its private token.",
      inputSchema: {},
    },
    guard(async () => ({
      apiVersion: 2,
      agent_id: (await connect()).identity!.toHexString(),
      status: "identity only; property access is checked by the server",
    })),
  );
  server.registerTool(
    "world_publish_package",
    {
      description:
        "Publish an immutable package owned by the paired player. Existing grants authorize publication; no review queue.",
      inputSchema: {
        community: z.string().max(80),
        visibility: z.enum(["private", "community", "public"]),
        package: packageInput,
      },
    },
    guard(async (a) => {
      const bundle = packageBundle(a.package);
      await (
        await connect()
      ).reducers.publishPackage({
        community: a.community,
        visibility: a.visibility,
        bundle: JSON.stringify(bundle),
      });
      return {
        hash: bundle.hash,
        id: bundle.manifest.id,
        version: bundle.manifest.version,
      };
    }),
  );
  server.registerTool(
    "world_get_package",
    {
      description:
        "Get/export a readable pinned package revision. Private packages require publisher authority.",
      inputSchema: {
        community: z.string().max(80),
        id: key,
        version: z.string().max(40),
      },
    },
    guard(async (a) =>
      JSON.parse(await (await connect()).procedures.getPackage(a)),
    ),
  );
  server.registerTool(
    "world_create_entity",
    {
      description:
        "Create an entity with geometry, signs, lights, characters, navigation and interactions in an authorized property.",
      inputSchema: {
        id: key,
        property: key,
        room: key,
        components: z.record(z.string(), z.unknown()),
      },
    },
    guard(async (a) => {
      await (
        await connect()
      ).reducers.createEntity({
        ...a,
        components: JSON.stringify(copyComponentData(a.components)),
      });
      return { id: a.id };
    }),
  );
  server.registerTool(
    "world_attach_behavior",
    {
      description:
        "Attach a pinned package in a named slot, checking property authority and exclusive resources. Initialization is queued.",
      inputSchema: {
        entity: key,
        slot: key,
        hash: z.string().regex(/^[0-9a-f]{64}$/),
        config: z.record(z.string(), z.unknown()),
      },
    },
    guard(async (a) => {
      await (
        await connect()
      ).reducers.attachBehavior({
        ...a,
        config: JSON.stringify(copyValue(a.config)),
      });
      return { accepted: true, slot: `${a.entity}:${a.slot}` };
    }),
  );
  server.registerTool(
    "world_upgrade_behavior",
    {
      description:
        "Explicitly upgrade a slot. A failed state migration preserves the old installation. Initialization is queued.",
      inputSchema: {
        slot: slotRef,
        hash: z.string().regex(/^[0-9a-f]{64}$/),
        config: z.record(z.string(), z.unknown()),
      },
    },
    guard(async (a) => {
      await (
        await connect()
      ).reducers.upgradeBehavior({
        ...a,
        config: JSON.stringify(copyValue(a.config)),
      });
      return { accepted: true };
    }),
  );
  server.registerTool(
    "world_set_behavior_enabled",
    {
      description:
        "Suspend or resume an authorized installed behavior without resetting its state.",
      inputSchema: { slot: slotRef, enabled: z.boolean() },
    },
    guard(async (a) => {
      const c = await connect();
      if (a.enabled) await c.reducers.resumeBehavior({ slot: a.slot });
      else await c.reducers.suspendBehavior({ slot: a.slot });
      return { accepted: true };
    }),
  );
  server.registerTool(
    "world_inspect",
    {
      description:
        "Inspect an editable entity's private state, queued work and diagnostic receipts. Server-side property authorization is required.",
      inputSchema: { id: key },
    },
    guard(async (a) =>
      JSON.parse(await (await connect()).procedures.inspectEntity(a)),
    ),
  );
  server.registerTool(
    "world_preview_room",
    {
      description:
        "Get an authorized room's render projection and motion anchors (JSON, not PNG). Private script state is omitted. The local runtime workshop renders this same projection.",
      inputSchema: { property: key, room: key },
    },
    guard(async (a) =>
      JSON.parse(await (await connect()).procedures.previewRoom(a)),
    ),
  );
  server.registerTool(
    "world_test_action",
    {
      description:
        "Run an action on an editable live entity as a builder test. Effects are real and initialization must have completed. This does not impersonate a player or test proximity.",
      inputSchema: { entity: key, name: key, payload: z.unknown() },
    },
    guard(async (a) => {
      await (
        await connect()
      ).reducers.testEntityAction({
        ...a,
        payload: JSON.stringify(copyValue(a.payload)),
      });
      return { accepted: true };
    }),
  );
  server.registerTool(
    "world_update_entity",
    {
      description:
        "Patch authored components against an inspected revision. Unchanged motion resources continue running.",
      inputSchema: {
        id: key,
        revision: z.number().int().min(1),
        components: z.record(z.string(), z.unknown()),
      },
    },
    guard(async (a) => {
      await (
        await connect()
      ).reducers.updateEntity({
        ...a,
        components: JSON.stringify(copyComponentData(a.components)),
      });
      return { accepted: true };
    }),
  );
  server.registerTool(
    "world_destroy_entity",
    {
      description:
        "Remove an editable entity from the live world and cancel its queued work, timers and operations.",
      inputSchema: { id: key },
    },
    guard(async (a) => {
      await (await connect()).reducers.destroyEntity(a);
      return { accepted: true };
    }),
  );
  server.registerTool(
    "world_publish_template",
    {
      description:
        "Publish a reusable entity definition with components and pinned configured behavior slots. Return the immutable hash used by scripts or the spawn tool.",
      inputSchema: {
        property: key,
        components: z.record(z.string(), z.unknown()),
        bindings: z
          .array(
            z.object({
              slot: key,
              hash: z.string().regex(/^[a-f0-9]{64}$/),
              config: z.record(z.string(), z.unknown()),
            }),
          )
          .max(8),
      },
    },
    guard(async (a) => {
      const definition = {
        components: copyComponentData(a.components),
        bindings: a.bindings.map((b) => ({
          ...b,
          config: copyValue(b.config),
        })),
      };
      const hash = sha256(canonical({ ...definition, property: a.property }));
      await (
        await connect()
      ).reducers.publishTemplate({
        property: a.property,
        definition: JSON.stringify(definition),
      });
      return { hash };
    }),
  );
  server.registerTool(
    "world_spawn_template",
    {
      description:
        "Instantiate an authorized template and initialize each configured behavior in a room.",
      inputSchema: {
        property: key,
        room: key,
        id: key,
        hash: z.string().regex(/^[a-f0-9]{64}$/),
        position: z.tuple([z.number(), z.number(), z.number()]),
      },
    },
    guard(async (a) => {
      await (
        await connect()
      ).reducers.spawnTemplate({ ...a, position: JSON.stringify(a.position) });
      return { accepted: true, id: a.id };
    }),
  );
  server.registerTool(
    "world_create_room",
    {
      description:
        "Create an origin-centered walkable room and editable floor. Add authored exits to connect rooms; homes have independent expandable room graphs.",
      inputSchema: {
        property: key,
        room: key,
        name: z.string().min(1).max(80),
        width: z.number().min(4).max(100),
        depth: z.number().min(4).max(100),
      },
    },
    guard(async (a) => {
      await (await connect()).reducers.createRoom(a);
      return { accepted: true };
    }),
  );
  server.registerTool(
    "world_list_rooms",
    {
      description:
        "List the community's authored rooms, home entrances and current player location.",
      inputSchema: { community: z.string().max(80) },
    },
    guard(async (a) =>
      JSON.parse(await (await connect()).procedures.listWorld(a)),
    ),
  );
  server.registerTool(
    "world_export_template",
    {
      description:
        "Export a reusable entity template with every pinned behavior, source, license and configuration. No private instance state is exported.",
      inputSchema: { hash: z.string().regex(/^[0-9a-f]{64}$/) },
    },
    guard(async (a) =>
      JSON.parse(await (await connect()).procedures.exportTemplate(a)),
    ),
  );
  server.registerTool(
    "world_import_template",
    {
      description:
        "Import a shared template into your package namespace and property. Explicit reference replacements apply to components/configuration, never source code. Returns the new template hash; does not spawn instances.",
      inputSchema: {
        community: z.string(),
        property: key,
        namespace: key,
        bundle: z.unknown(),
        references: z.record(z.string(), z.string()).optional(),
      },
    },
    guard(async (a) => {
      const bundle = a.bundle as {
        format: number;
        components: RecordValue;
        bindings: Array<{ slot: string; hash: string; config: RecordValue }>;
        packages: Array<Parameters<typeof packageBundle>[0] & { hash: string }>;
      };
      if (
        bundle.format !== 2 ||
        !Array.isArray(bundle.packages) ||
        bundle.packages.length > 8 ||
        !Array.isArray(bundle.bindings) ||
        bundle.bindings.length > 8
      )
        throw Error("Invalid template bundle.");
      const replacements = a.references ?? {};
      const remap = (v: unknown): unknown =>
        typeof v === "string"
          ? (replacements[v] ?? v)
          : Array.isArray(v)
            ? v.map(remap)
            : v && typeof v === "object"
              ? Object.fromEntries(
                  Object.entries(v).map(([k, v]) => [k, remap(v)]),
                )
              : v;
      const packages = bundle.packages.map((p) => {
        const original = packageBundle(p);
        if (original.hash !== p.hash) throw Error("Package hash mismatch.");
        return {
          old: p.hash,
          next: packageBundle({
            ...p,
            manifest: {
              ...original.manifest,
              id: `${a.namespace}.${original.manifest.id}`,
            },
          }),
        };
      });
      const bindings = bundle.bindings.map((b) => {
        const pkg = packages.find((p) => p.old === b.hash);
        if (!pkg) throw Error("Missing pinned dependency.");
        return { ...b, hash: pkg.next.hash, config: remap(b.config) };
      });
      const definition = { components: remap(bundle.components), bindings };
      const c = await connect();
      for (const pkg of packages)
        await c.reducers.publishPackage({
          bundle: JSON.stringify(pkg.next),
          visibility: "community",
          community: a.community,
        });
      await c.reducers.publishTemplate({
        property: a.property,
        definition: JSON.stringify(definition),
      });
      return {
        hash: sha256(canonical({ ...definition, property: a.property })),
        packages: packages.map((p) => p.next.manifest.id),
      };
    }),
  );
  server.registerTool(
    "world_entity_history",
    {
      description:
        "Read recent authored component revisions. Runtime state is not restored by an appearance restore.",
      inputSchema: { id: key },
    },
    guard(async (a) =>
      JSON.parse(await (await connect()).procedures.entityHistory(a)),
    ),
  );
  server.registerTool(
    "world_restore_entity",
    {
      description:
        "Restore components from an authored revision as a new revision; preserves private state and rejects stale edits or removal of bound resources.",
      inputSchema: {
        id: key,
        revision: z.number().int().nonnegative(),
        sourceRevision: z.number().int().nonnegative(),
      },
    },
    guard(async (a) => {
      await (await connect()).reducers.restoreEntity(a);
      return { accepted: true };
    }),
  );
  server.registerTool(
    "world_set_avatar",
    {
      description:
        "Publish the paired member's six-part character and rigid cosmetics. Uses the same character schema and animation rig as placed NPCs.",
      inputSchema: { community: z.string().max(80), definition: z.unknown() },
    },
    guard(async (a) => {
      await (
        await connect()
      ).reducers.setAvatar({
        community: a.community,
        definition: JSON.stringify(a.definition),
      });
      return { accepted: true };
    }),
  );
  server.registerTool(
    "world_simulate",
    {
      description:
        "Execute an isolated bounded fixture using the production interpreter, effect validation, scheduler and virtual clock. No live world is changed.",
      inputSchema: {
        packages: z.array(packageInput).max(8),
        entities: z
          .array(
            z.object({
              id: key,
              components: z.record(z.string(), z.unknown()),
            }),
          )
          .max(8),
        bindings: z
          .array(
            z.object({
              entity: key,
              slot: key,
              packageId: key,
              config: z.record(z.string(), z.unknown()),
            }),
          )
          .max(16),
        timeline: z
          .array(
            z.object({
              advance: z.number().min(0).max(86400),
              action: z
                .object({ entity: key, name: key, payload: z.unknown() })
                .optional(),
            }),
          )
          .max(16),
      },
    },
    guard((a) => {
      const sim = new WorldSimulation(),
        hashes = new Map<string, string>();
      for (const p of a.packages) {
        const bundle = packageBundle(p);
        if (hashes.has(bundle.manifest.id))
          throw Error("Fixture package IDs must be unique.");
        hashes.set(bundle.manifest.id, bundle.hash);
        sim.register(bundle);
      }
      for (const e of a.entities)
        sim.create({
          id: e.id,
          community: "simulation",
          property: "fixture",
          room: "room",
          owner: "author",
          generation: 1,
          revision: 1,
          enabled: true,
          components: copyComponentData(e.components) as RecordValue,
          publicState: {},
        });
      for (const b of a.bindings) {
        const hash = hashes.get(b.packageId);
        if (!hash) throw Error("Fixture package unavailable.");
        sim.attach(b.entity, b.slot, hash, copyValue(b.config) as RecordValue);
      }
      let remaining = 256;
      remaining -= sim.run(0, remaining).steps;
      for (const step of a.timeline) {
        if (remaining <= 0) throw Error("Simulation work budget exhausted.");
        const outcome = sim.run(step.advance, remaining);
        remaining -= outcome.steps;
        if (!outcome.complete)
          throw Error("Simulation work budget exhausted before target time.");
        if (step.action) {
          sim.action(
            step.action.entity,
            step.action.name,
            copyValue(step.action.payload),
            "fixture-player",
          );
          if (remaining > 0) remaining -= sim.run(0, remaining).steps;
        }
      }
      const runtime = new WorldRuntime(sim.store, sim.time);
      return {
        time: sim.time,
        workUsed: 256 - remaining,
        entities: [...sim.entities].map((id) => ({
          entity: runtime.inspect(sim.store.entity(id)!, id),
          slots: sim.store.slots(id),
          operations: sim.store.operations(id),
          pending: sim.store
            .pending(id)
            .map((d) => ({ event: d.event.id, notBefore: d.notBefore })),
        })),
      };
    }),
  );
  return server;
}
