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
import { validateSource } from "../spacetimedb/src/runtime/sandbox";
import { WorldSimulation } from "../spacetimedb/src/runtime/simulation";
import { WorldRuntime } from "../spacetimedb/src/runtime/engine";
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
export function createRuntimeMcp(connect: () => Promise<DbConnection>) {
  const server = new McpServer({
    name: "lantern-runtime-builder",
    version: "2.0.0",
  });
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
      operations:
        "ctx.operations.animate('transform',{position:[x,y,z],rotation:[x,y,z]},seconds), pause/resume/cancel(resource). operation:completed/cancelled payload is {id,resource,outcome}. Rotation is linear authored degrees.",
      limitations: [
        "The local authorized workshop (?runtime) supports floor walking, static collider routing and approach-before-action. Each room needs one origin-centered walkSurface; collider footprints and interaction approach offsets use the entity yaw. Only null-payload actions are exposed by this UI. Moving obstacle avoidance and Activity integration remain incomplete.",
        "No player dialogs, spawning, spatial views or path operations yet",
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
        "Create a runtime entity within an authorized property. This does not yet author room geometry.",
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
        components: JSON.stringify(copyValue(a.components)),
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
          components: copyValue(e.components) as RecordValue,
          publicState: {},
        });
      for (const b of a.bindings) {
        const hash = hashes.get(b.packageId);
        if (!hash) throw Error("Fixture package unavailable.");
        sim.attach(b.entity, b.slot, hash, copyValue(b.config) as RecordValue);
      }
      let remaining = 256;
      remaining -= sim.advance(0, remaining).steps;
      for (const step of a.timeline) {
        if (remaining <= 0) throw Error("Simulation work budget exhausted.");
        remaining -= sim.advance(step.advance, remaining).steps;
        if (step.action) {
          sim.action(
            step.action.entity,
            step.action.name,
            copyValue(step.action.payload),
            "fixture-player",
          );
          if (remaining > 0) remaining -= sim.advance(0, remaining).steps;
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
