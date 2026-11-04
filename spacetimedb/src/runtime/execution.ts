import { executeSandbox, type ScriptApi } from "./sandbox";
import { sha256 } from "../../../shared/runtime/digest";
import {
  reservationBox,
  overlaps,
  type Reservation,
} from "../../../shared/runtime/reservations";
import {
  operationProgress,
  type Operation,
} from "../../../shared/runtime/operations";
import { validateView } from "../../../shared/intelligent-objects";
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
  playerState: RecordValue = {},
  viewMembers: (name: string) => Value = () => [],
  activeOperations: Operation[] = [],
  queryEntities: (
    view: import("../../../shared/intelligent-objects").ViewDefinition,
  ) => Value = () => [],
  reservations: Reservation[] = [],
): ExecutionResult {
  const spec = pkg.manifest.handlers[`${event.type}:${event.name}`];
  if (!spec) throw Error("Unsubscribed event.");
  assertSchema(spec.input, event.payload);
  const state = copyValue(slot.state) as RecordValue,
    effects: Effect[] = [];
  let randomCounter = 0;
  const record = (effect: Effect) => {
    if (effects.length >= BUDGETS.effects)
      throw Error("Effect budget exceeded.");
    effects.push(effect);
  };
  const leases = new Map(
    reservations.filter((r) => r.expires > now).map((r) => [r.id, r]),
  );
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
  const send = (
    target: string,
    name: string,
    payload: Value,
    targetSlot?: string,
  ) => {
    if (effects.filter((e) => e.type === "message").length >= BUDGETS.messages)
      throw Error("Message budget exceeded.");
    identifier(target);
    identifier(name);
    if (targetSlot !== undefined) {
      identifier(targetSlot);
      if (targetSlot.includes(":")) throw Error("Use a local slot name.");
    }
    const receipt = `message:${event.sequence}:${slot.id}:${effects.length}`;
    record({
      type: "message",
      target,
      name,
      payload: copyValue(payload),
      receipt,
      slot: targetSlot === undefined ? undefined : `${target}:${targetSlot}`,
    });
    return receipt;
  };
  const api: ScriptApi = {
    subscribe: (name: string, definition: Value) => {
      identifier(name);
      record({
        type: "view",
        name,
        definition: validateView(copyValue(definition)),
      });
    },
    unsubscribe: (name: string) => {
      record({ type: "view", name: identifier(name), definition: null });
    },
    view: (name: string) => copyValue(viewMembers(identifier(name))),
    "world.spawn": (hash: string, position: Value) => {
      resource("world.spawn");
      if (
        typeof hash !== "string" ||
        !/^[a-f0-9]{64}$/.test(hash) ||
        !Array.isArray(position) ||
        position.length !== 3 ||
        position.some(
          (n) =>
            typeof n !== "number" || !Number.isFinite(n) || Math.abs(n) > 100,
        )
      )
        throw Error("Invalid spawn request.");
      const id = `spawn${sha256(`${event.id}:${slot.id}:${effects.length}`).slice(0, 40)}`;
      record({ type: "spawn", hash, id, position: position as number[] });
      return id;
    },
    "world.destroy": () => {
      resource("world.destroy");
      record({ type: "destroy" });
    },
    "world.transfer": (room: string, position: Value) => {
      resource("world.transfer");
      identifier(room);
      if (
        !Array.isArray(position) ||
        position.length !== 3 ||
        position.some(
          (n) =>
            typeof n !== "number" || !Number.isFinite(n) || Math.abs(n) > 100,
        )
      )
        throw Error("Invalid transfer position.");
      record({ type: "transfer", room, position: position as number[] });
    },
    "player.get": (key: string) => {
      if (event.source.kind !== "player")
        throw Error("This event has no interacting player.");
      return copyValue(playerState[identifier(key)] ?? null);
    },
    "player.set": (key: string, value: Value) => {
      if (event.source.kind !== "player")
        throw Error("This event has no interacting player.");
      playerState[identifier(key)] = copyValue(value);
      const valueCopy = copyValue(playerState) as RecordValue;
      const previous = effects.find((e) => e.type === "playerState");
      if (previous?.type === "playerState") previous.value = valueCopy;
      else
        record({
          type: "playerState",
          player: event.source.id,
          value: valueCopy,
        });
    },
    say: (text: string) => {
      if (typeof text !== "string" || !text.trim() || text.length > 1000)
        throw Error("Speech must be 1..1000 characters.");
      record({ type: "speech", text });
    },
    tell: (text: string) => {
      if (event.source.kind !== "player")
        throw Error("This event has no interacting player.");
      if (typeof text !== "string" || !text.trim() || text.length > 1000)
        throw Error("Speech must be 1..1000 characters.");
      record({ type: "speech", text, player: event.source.id });
    },
    dialog: (name: string, prompt: string, choices: Value) => {
      if (event.source.kind !== "player")
        throw Error("This event has no interacting player.");
      identifier(name);
      if (
        typeof prompt !== "string" ||
        !prompt.trim() ||
        prompt.length > 1000 ||
        !Array.isArray(choices) ||
        choices.length < 1 ||
        choices.length > 8 ||
        choices.some((c) => typeof c !== "string" || !c.trim() || c.length > 80)
      )
        throw Error("Invalid dialogue.");
      const id = `dialog:${event.sequence}:${slot.id}:${effects.length}`;
      record({
        type: "dialog",
        name,
        prompt,
        choices: choices as string[],
        player: event.source.id,
        id,
      });
      return id;
    },
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
    random: () =>
      parseInt(
        sha256(`${event.id}:${slot.id}:${randomCounter++}`).slice(0, 13),
        16,
      ) / 0x10000000000000,
    prompt: (name: string, prompt: string, maxLength: number) => {
      identifier(name);
      if (event.source.kind !== "player")
        throw Error("Prompt requires player context.");
      if (
        typeof prompt !== "string" ||
        !prompt.trim() ||
        prompt.length > 1000 ||
        !Number.isInteger(maxLength) ||
        maxLength < 1 ||
        maxLength > 500
      )
        throw Error("Invalid prompt; maxLength must be 1..500.");
      const id = `dialog:${sha256(`${event.id}:${slot.id}:${effects.length}`).slice(0, 40)}`;
      record({
        type: "dialog",
        name,
        prompt,
        choices: [],
        maxLength,
        player: event.source.id,
        id,
      });
      return id;
    },
    "event.source": () => copyValue(event.source),
    "event.id": () => event.id,
    "event.correlation": () => event.correlation,
    "entities.inspect": (id: string) =>
      copyValue(inspect(identifier(id, "entity ID"))),
    "reservations.claim": (name: string, value: Value, seconds: number) => {
      identifier(name);
      const box = reservationBox(value),
        id = `${slot.id}/${name}`;
      if (!Number.isFinite(seconds) || seconds < 0.25 || seconds > 300)
        throw Error("Reservation lease must be .25..300 seconds.");
      if (
        [...leases.values()].some(
          (r) => r.slot !== slot.id && overlaps(r.box, box),
        )
      )
        return false;
      if (
        !leases.has(id) &&
        [...leases.values()].filter((r) => r.slot === slot.id).length >= 4
      )
        throw Error("At most four reservations per behavior.");
      const lease = {
        id,
        property: entity.property,
        room: entity.room,
        entity: entity.id,
        slot: slot.id,
        name,
        box,
        expires: now + seconds,
      };
      leases.set(id, lease);
      record({ type: "reservation", id, value: lease });
      return true;
    },
    "reservations.release": (name: string) => {
      identifier(name);
      const id = `${slot.id}/${name}`;
      leases.delete(id);
      record({ type: "reservation", id, value: null });
    },
    "entities.query": (view: Value) => queryEntities(validateView(view)),
    "messages.send": (target: string, name: string, payload: Value) =>
      send(target, name, payload),
    "messages.sendToSlot": (
      target: string,
      targetSlot: string,
      name: string,
      payload: Value,
    ) => send(target, name, payload, targetSlot),
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
    "operations.follow": (
      key: string,
      points: Value,
      speed: number,
      mode: string,
    ) => {
      resource(key);
      if (
        !Array.isArray(points) ||
        points.length < 2 ||
        points.length > 32 ||
        points.some(
          (p) =>
            !Array.isArray(p) ||
            p.length !== 3 ||
            p.some(
              (n) =>
                typeof n !== "number" ||
                !Number.isFinite(n) ||
                Math.abs(n) > 100,
            ),
        )
      )
        throw Error("Path requires 2..32 finite three-dimensional points.");
      if (
        !Number.isFinite(speed) ||
        speed <= 0 ||
        speed > 50 ||
        !["once", "loop", "pingpong"].includes(mode)
      )
        throw Error("Invalid path speed or mode.");
      const path = points as number[][];
      const length = path
        .slice(1)
        .reduce(
          (sum, p, i) => sum + Math.hypot(...p.map((v, j) => v - path[i][j])),
          0,
        );
      if (length < 0.01) throw Error("Path must have length.");
      const id = `operation:${event.sequence}:${slot.id}:${effects.length}`;
      record({
        type: "operation",
        command: "animate",
        resource: key,
        id,
        to: { position: path[path.length - 1], rotation: [0, 0, 0] },
        duration: length / speed,
        path,
        mode: mode as "once" | "loop" | "pingpong",
      });
      return id;
    },
    "operations.pause": (key: string) => {
      resource(key);
      record({ type: "operation", command: "pause", resource: key });
    },
    "operations.restart": (key: string) => {
      resource(key);
      record({ type: "operation", command: "restart", resource: key });
    },
    "operations.setSpeed": (key: string, multiplier: number) => {
      resource(key);
      if (!Number.isFinite(multiplier) || multiplier <= 0 || multiplier > 50)
        throw Error(
          "Speed multiplier must be greater than zero and at most 50.",
        );
      record({
        type: "operation",
        command: "speed",
        resource: key,
        multiplier,
      });
    },
    "operations.progress": (key: string) => {
      resource(key);
      const op =
        activeOperations.find(
          (o) => o.resource === key && o.slot === slot.id,
        ) ??
        slot.completedOperations?.find(
          (o) => o.resource === key && o.generation === slot.generation,
        );
      return op ? operationProgress(op, now) : null;
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
      "subscribe",
      "entities.query",
      "reservations.claim",
      "world.spawn",
      "world.transfer",
      "player.set",
      "dialog",
      "variables.set",
      "messages.send",
      "messages.sendToSlot",
      "components.set",
      "operations.animate",
      "operations.follow",
      "public.set",
      "timers.after",
    ],
    results: [
      "state.get",
      "view",
      "player.get",
      "variables.get",
      "config.get",
      "event.source",
      "entities.inspect",
      "entities.query",
      "components.get",
    ],
  });
  assertSchema(pkg.manifest.state, state);
  return { state: copyValue(state) as RecordValue, effects, stats };
}
