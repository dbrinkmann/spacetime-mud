import { executeSandbox, type ScriptApi } from "./sandbox";
import {
  assertSchema,
  copyValue,
  identifier,
  type RecordValue,
  type Value,
} from "../../../shared/runtime/values";
import {
  BUDGETS,
  type Entity,
  type Event,
  type ExecutionResult,
  type Effect,
  type Package,
  type Slot,
} from "../../../shared/runtime/contracts";
export type Inspection = (id: string) => Value;
/** Migrations can read configuration and replace state; no world effects are exposed. */
export function migrateBehavior(
  pkg: Package,
  slot: Slot,
  oldVersion: number,
  config: RecordValue,
): RecordValue {
  const state = copyValue(slot.state) as RecordValue;
  const handler = pkg.manifest.migrations?.[String(oldVersion)];
  if (oldVersion !== pkg.manifest.stateVersion && !handler)
    throw Error("State migration required.");
  if (handler)
    executeSandbox(
      pkg.source,
      handler,
      {
        "state.has": (key: string) =>
          Object.prototype.hasOwnProperty.call(state, identifier(key)),
        "state.get": (key: string) => state[identifier(key)] ?? null,
        "state.set": (key: string, value: Value) => {
          state[identifier(key)] = copyValue(value);
          copyValue(state);
        },
        "state.delete": (key: string) => {
          delete state[identifier(key)];
        },
        "config.get": (key: string) => config[identifier(key)] ?? null,
      },
      [oldVersion],
      { arguments: ["state.set"], results: ["state.get", "config.get"] },
    );
  assertSchema(pkg.manifest.state, state);
  return copyValue(state) as RecordValue;
}
/** Produces data effects only. No state is mutated until the dispatcher validates the complete result. */
export function executeBehavior(
  pkg: Package,
  slot: Slot,
  entity: Entity,
  event: Event,
  now: number,
  inspect: Inspection,
): ExecutionResult {
  const spec = pkg.manifest.handlers[`${event.type}:${event.name}`];
  if (!spec) throw Error("Unsubscribed event.");
  assertSchema(spec.input, event.payload);
  const state = copyValue(slot.state) as RecordValue,
    effects: Effect[] = [];
  const record = (effect: Effect) => {
    if (effects.length >= BUDGETS.effects)
      throw Error("Effect budget exceeded.");
    effects.push(effect);
  };
  const resource = (key: string) => {
    identifier(key);
    if (!pkg.manifest.writes.includes(key))
      throw Error(`Undeclared resource: ${key}`);
  };
  const variable = (key: string) => {
    identifier(key);
    const name = `variables.${key}`;
    if (
      !pkg.manifest.writes.includes(name) &&
      !pkg.manifest.reads?.includes(name)
    )
      throw Error("Undeclared variable read.");
    const staged = effects
      .filter((e) => e.type === "variable" && e.key === key)
      .pop();
    return staged?.type === "variable"
      ? { exists: !staged.deleted, value: staged.value }
      : {
          exists: Object.prototype.hasOwnProperty.call(
            entity.variables ?? {},
            key,
          ),
          value: entity.variables?.[key] ?? null,
        };
  };
  const api: ScriptApi = {
    "variables.has": (key: string) => variable(key).exists,
    "variables.get": (key: string) => {
      const v = variable(key);
      return v.exists ? v.value : null;
    },
    "variables.set": (key: string, value: Value) => {
      identifier(key);
      resource(`variables.${key}`);
      record({
        type: "variable",
        key,
        value: copyValue(value),
        deleted: false,
      });
    },
    "variables.delete": (key: string) => {
      identifier(key);
      resource(`variables.${key}`);
      record({ type: "variable", key, value: null, deleted: true });
    },
    "state.has": (key: string) =>
      Object.prototype.hasOwnProperty.call(state, identifier(key)),
    "state.get": (key: string) => state[identifier(key)] ?? null,
    "state.set": (key: string, value: Value) => {
      state[identifier(key)] = copyValue(value);
      copyValue(state, BUDGETS.stateBytes);
    },
    "state.delete": (key: string) => {
      delete state[identifier(key)];
    },
    "config.get": (key: string) =>
      copyValue(slot.config[identifier(key)] ?? null),
    "self.id": () => entity.id,
    "self.room": () => entity.room,
    "clock.now": () => now,
    "event.source": () => copyValue(event.source),
    "event.id": () => event.id,
    "event.correlation": () => event.correlation,
    "entities.inspect": (id: string) =>
      copyValue(inspect(identifier(id, "entity ID"))),
    "messages.send": (target: string, name: string, payload: Value) => {
      if (
        effects.filter((e) => e.type === "message").length >= BUDGETS.messages
      )
        throw Error("Message budget exceeded.");
      identifier(target);
      identifier(name);
      const receipt = `message:${event.sequence}:${slot.id}:${effects.length}`;
      record({
        type: "message",
        target,
        name,
        payload: copyValue(payload),
        receipt,
      });
      return receipt;
    },
    "components.get": (key: string) => {
      identifier(key);
      const staged = effects
        .filter((e) => e.type === "component" && e.key === key)
        .pop();
      return copyValue(
        staged?.type === "component"
          ? staged.value
          : (entity.components[key] ?? null),
      );
    },
    "components.set": (key: string, value: Value) => {
      resource(key);
      record({ type: "component", key, value: copyValue(value) });
    },
    "operations.animate": (key: string, to: Value, duration: number) => {
      resource(key);
      if (!Number.isFinite(duration) || duration < 0.05 || duration > 3600)
        throw Error("Animation duration must be .05..3600 seconds.");
      const id = `operation:${event.sequence}:${slot.id}:${effects.length}`;
      record({
        type: "operation",
        command: "animate",
        resource: key,
        id,
        to: copyValue(to),
        duration,
      });
      return id;
    },
    "operations.pause": (key: string) => {
      resource(key);
      record({ type: "operation", command: "pause", resource: key });
    },
    "operations.resume": (key: string) => {
      resource(key);
      record({ type: "operation", command: "resume", resource: key });
    },
    "operations.cancel": (key: string) => {
      resource(key);
      record({ type: "operation", command: "cancel", resource: key });
    },
    "public.set": (key: string, value: Value) => {
      identifier(key);
      resource(`public.${key}`);
      record({ type: "public", key, value: copyValue(value) });
    },
    "timers.after": (delay: number, name: string, payload: Value) => {
      if (
        !Number.isFinite(delay) ||
        delay < BUDGETS.timerMin ||
        delay > BUDGETS.timerMax
      )
        throw Error("Timer delay must be .25..86400 seconds.");
      record({
        type: "timer",
        name: identifier(name),
        delay,
        payload: copyValue(payload),
      });
    },
    "timers.cancel": (name: string) =>
      record({
        type: "timer",
        name: identifier(name),
        delay: null,
        payload: null,
      }),
    "math.abs": (n: number) => {
      if (typeof n !== "number") throw Error("Expected number.");
      return Math.abs(n);
    },
    "math.min": (a: number, b: number) => {
      if (typeof a !== "number" || typeof b !== "number")
        throw Error("Expected numbers.");
      return Math.min(a, b);
    },
    "math.max": (a: number, b: number) => {
      if (typeof a !== "number" || typeof b !== "number")
        throw Error("Expected numbers.");
      return Math.max(a, b);
    },
  };
  const stats = executeSandbox(pkg.source, spec.handler, api, [event.payload], {
    arguments: [
      "state.set",
      "variables.set",
      "messages.send",
      "components.set",
      "operations.animate",
      "public.set",
      "timers.after",
    ],
    results: [
      "state.get",
      "variables.get",
      "config.get",
      "event.source",
      "entities.inspect",
      "components.get",
    ],
  });
  assertSchema(pkg.manifest.state, state);
  return { state: copyValue(state) as RecordValue, effects, stats };
}
