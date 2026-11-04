import {
  copyValue,
  identifier,
  validateSchema,
  type DataSchema,
  type Value,
  type RecordValue,
} from "./values";
export const RUNTIME_VERSION = 2;
export const BUDGETS = Object.freeze({
  slots: 8,
  inbox: 64,
  effects: 32,
  messages: 8,
  chain: 16,
  dispatchBatch: 16,
  timers: 4,
  timerMin: 0.25,
  timerMax: 86400,
  stateBytes: 8192,
  source: 16000,
  operations: 4,
});
export type Source = {
  kind: "engine" | "player" | "behavior";
  id: string;
  generation?: number;
};
export type Lifecycle =
  | "created"
  | "bound"
  | "activated"
  | "deactivated"
  | "upgraded"
  | "unbound"
  | "destroying";
export type EventType =
  | "lifecycle"
  | "message"
  | "action"
  | "timer"
  | "operation"
  | "spatial"
  | "variable";
export type Event = {
  id: string;
  entity: string;
  generation: number;
  sequence: number;
  type: EventType;
  name: string;
  payload: Value;
  source: Source;
  occurredAt: number;
  correlation: string;
  depth: number;
  slot?: string;
  slotGeneration?: number;
};
export type Entity = {
  id: string;
  community: string;
  property: string;
  room: string;
  owner: string;
  generation: number;
  revision: number;
  enabled: boolean;
  components: Record<string, Value>;
  publicState: RecordValue;
  variables?: RecordValue;
};
export type Handler = { handler: string; input: DataSchema };
export type PackageManifest = {
  id: string;
  version: string;
  apiVersion: 2;
  stateVersion: number;
  config: DataSchema;
  state: DataSchema;
  initialState: RecordValue;
  handlers: Record<string, Handler>;
  writes: string[];
  migrations?: Record<string, string>;
  reads?: string[];
  variables?: Record<string, DataSchema>;
};
export type Package = {
  hash: string;
  manifest: PackageManifest;
  source: string;
};
export type Slot = {
  id: string;
  entity: string;
  packageHash: string;
  generation: number;
  enabled: boolean;
  config: RecordValue;
  state: RecordValue;
  lastError: string;
  created: boolean;
  bound: boolean;
};
export type Effect =
  | { type: "variable"; key: string; value: Value; deleted: boolean }
  | {
      type: "operation";
      command: "animate";
      resource: string;
      id: string;
      to: Value;
      duration: number;
    }
  | {
      type: "operation";
      command: "pause" | "resume" | "cancel";
      resource: string;
    }
  | {
      type: "message";
      target: string;
      name: string;
      payload: Value;
      receipt: string;
    }
  | { type: "component"; key: string; value: Value }
  | { type: "public"; key: string; value: Value }
  | { type: "timer"; name: string; delay: number | null; payload: Value };
export type ExecutionResult = {
  state: RecordValue;
  effects: Effect[];
  stats: { steps: number; calls: number; allocations: number };
};
export function validateManifest(input: unknown): PackageManifest {
  const m = copyValue(input, 32768) as unknown as PackageManifest;
  if (
    !m ||
    typeof m !== "object" ||
    Array.isArray(m) ||
    Object.keys(m).some(
      (k) =>
        ![
          "id",
          "version",
          "apiVersion",
          "stateVersion",
          "config",
          "state",
          "initialState",
          "handlers",
          "writes",
          "migrations",
          "reads",
          "variables",
        ].includes(k),
    )
  )
    throw Error("Unknown manifest field or invalid manifest.");
  identifier(m.id, "package ID");
  if (
    !/^\d+\.\d+\.\d+$/.test(m.version) ||
    m.apiVersion !== 2 ||
    !Number.isInteger(m.stateVersion) ||
    m.stateVersion < 1
  )
    throw Error("Unsupported package version.");
  validateSchema(m.config);
  validateSchema(m.state);
  if (m.config.type !== "object" || m.state.type !== "object")
    throw Error("Configuration and state must be records.");
  if (
    !m.handlers ||
    typeof m.handlers !== "object" ||
    Array.isArray(m.handlers) ||
    Object.keys(m.handlers).length > 32
  )
    throw Error("Invalid handlers.");
  for (const [name, h] of Object.entries(m.handlers)) {
    if (
      !h ||
      typeof h !== "object" ||
      Array.isArray(h) ||
      Object.keys(h).some((k) => !["handler", "input"].includes(k))
    )
      throw Error("Invalid handler declaration.");
    if (
      !/^(lifecycle|message|action|timer|operation|spatial|variable):[a-zA-Z][a-zA-Z0-9_.:-]{0,79}$/.test(
        name,
      )
    )
      throw Error("Invalid event subscription.");
    if (!/^on_[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(h.handler))
      throw Error("Invalid handler name.");
    validateSchema(h.input);
  }
  if (
    !Array.isArray(m.writes) ||
    m.writes.length > 16 ||
    new Set(m.writes).size !== m.writes.length
  )
    throw Error("Invalid resource declarations.");
  m.writes.forEach((k) => identifier(k, "resource"));
  if (m.migrations) {
    if (
      typeof m.migrations !== "object" ||
      Array.isArray(m.migrations) ||
      Object.keys(m.migrations).length > 16
    )
      throw Error("Invalid migrations.");
    for (const [version, handler] of Object.entries(m.migrations))
      if (
        !/^[1-9][0-9]{0,5}$/.test(version) ||
        !/^on_[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(handler)
      )
        throw Error("Invalid migration handler.");
  }
  if (m.reads !== undefined) {
    if (
      !Array.isArray(m.reads) ||
      m.reads.length > 32 ||
      new Set(m.reads).size !== m.reads.length
    )
      throw Error("Invalid read declarations.");
    m.reads.forEach((r) => identifier(r, "read resource"));
  }
  if (m.variables !== undefined) {
    if (
      !m.variables ||
      typeof m.variables !== "object" ||
      Array.isArray(m.variables) ||
      Object.keys(m.variables).length > 16
    )
      throw Error("Invalid variable schemas.");
    for (const [key, schema] of Object.entries(m.variables)) {
      identifier(key);
      validateSchema(schema);
      if (!m.writes.includes(`variables.${key}`))
        throw Error("Variable schema requires exclusive writer declaration.");
    }
  }
  for (const key of m.writes.filter((r) => r.startsWith("variables.")))
    if (!m.variables?.[key.slice(10)])
      throw Error("Variable write requires schema.");
  for (const key of Object.keys(m.handlers).filter((k) =>
    k.startsWith("variable:"),
  )) {
    const read = `variables.${key.slice(9)}`;
    if (!m.writes.includes(read) && !m.reads?.includes(read))
      throw Error("Variable subscription requires read authority.");
  }
  return m;
}
