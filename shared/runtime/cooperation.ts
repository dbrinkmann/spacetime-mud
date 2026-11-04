import { validateManifest, type Entity } from "./contracts";
import { canonical, sha256 } from "./digest";
import type { Bundle } from "./registry";
import type { DataSchema } from "./values";
const str: DataSchema = { type: "string" },
  bool: DataSchema = { type: "boolean" };
const empty: DataSchema = { type: "object", properties: {} };
/** Example packages, not built-in object types. All relationships are configuration. */
export function cooperationPackages(namespace: string): Bundle[] {
  const definitions = [
    {
      name: "switch",
      config: {
        type: "object",
        properties: { target: str },
        required: ["target"],
      },
      state: { type: "object", properties: { on: bool }, required: ["on"] },
      initialState: { on: false },
      writes: [],
      handlers: {
        "action:toggle": { handler: "on_toggle", input: { type: "null" } },
      },
      source:
        'function on_toggle(ctx){var on=!ctx.state.get("on");ctx.state.set("on",on);ctx.messages.send(ctx.config.get("target"),"set",on);}',
    },
    {
      name: "door",
      config: {
        type: "object",
        properties: { indicator: str },
        required: ["indicator"],
      },
      state: empty,
      initialState: {},
      writes: ["transform"],
      handlers: { "message:set": { handler: "on_set", input: bool } },
      source:
        'function on_set(ctx,on){var pose=ctx.components.get("transform");pose.rotation[1]=on?90:0;ctx.operations.animate("transform",pose,.8);ctx.messages.send(ctx.config.get("indicator"),"set",on);}',
    },
    {
      name: "lamp",
      config: empty,
      state: empty,
      initialState: {},
      writes: ["light"],
      handlers: { "message:set": { handler: "on_set", input: bool } },
      source:
        'function on_set(ctx,on){ctx.components.set("light",{color:on?"#66ffaa":"#ff7755",intensity:on?12:0});}',
    },
  ];
  return definitions.map((d) => {
    const manifest = validateManifest({
      id: `${namespace}.${d.name}`,
      version: "1.0.0",
      apiVersion: 2,
      stateVersion: 1,
      config: d.config,
      state: d.state,
      initialState: d.initialState,
      writes: d.writes,
      handlers: d.handlers,
    });
    return {
      format: 2,
      manifest,
      source: d.source,
      hash: sha256(canonical({ manifest, source: d.source })),
      license: "MIT",
      documentation:
        "Reusable switch/hinge/indicator cooperation example. Door motion is visual only; collision is not implemented.",
    };
  });
}
export function cooperationEntities(
  prefix: string,
  property: string,
  community: string,
  owner: string,
): Entity[] {
  const specs = [
    {
      id: "floor",
      position: [0, -0.1, 0],
      boxes: [
        {
          position: [0, 0, 0],
          size: [10, 0.2, 8],
          color: "#424c54",
          material: "concrete",
        },
      ],
    },
    {
      id: "switch",
      position: [-2, 0.75, 1],
      boxes: [
        {
          position: [0, 0, 0],
          size: [0.5, 1.5, 0.5],
          color: "#647784",
          material: "metal",
        },
        {
          position: [0, 0.8, 0],
          size: [0.6, 0.15, 0.6],
          color: "#ffaa44",
          emissive: true,
        },
      ],
    },
    {
      id: "door",
      position: [0, 0, 0],
      boxes: [
        {
          position: [1, 1.5, 0],
          size: [2, 3, 0.18],
          color: "#555f69",
          material: "metal",
        },
        {
          position: [1.7, 1.4, 0.15],
          size: [0.12, 0.12, 0.2],
          color: "#ddaa55",
        },
      ],
    },
    {
      id: "lamp",
      position: [3, 2, 0],
      boxes: [
        {
          position: [0, 0, 0],
          size: [0.5, 0.5, 0.5],
          color: "#aaccbb",
          material: "glass",
        },
      ],
    },
  ];
  return specs.map((s) => ({
    id: `${prefix}.${s.id}`,
    property,
    community,
    room: "room",
    owner,
    enabled: true,
    generation: 1,
    revision: 1,
    publicState: {},
    components: {
      transform: { position: s.position, rotation: [0, 0, 0] },
      visual: { boxes: s.boxes },
      ...(s.id === "floor"
        ? { walkSurface: { width: 10, depth: 8, spawn: [3, 0, 3] } }
        : {}),
      ...(s.id === "switch"
        ? {
            collider: { size: [0.5, 0.5], center: [0, 0, 0], enabled: true },
            interaction: { approach: [0, 0, 1] },
          }
        : {}),
      ...(s.id === "door"
        ? { collider: { size: [2, 0.18], center: [1, 0, 0], enabled: true } }
        : {}),
      ...(s.id === "lamp" ? { light: { color: "#66ffaa", intensity: 0 } } : {}),
    },
  })) as Entity[];
}
