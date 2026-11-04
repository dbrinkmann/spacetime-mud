import {
  operationProgress,
  sampleOperation,
  transformValue,
  type Operation,
} from "../../../shared/runtime/operations";
import { copyValue, type RecordValue } from "../../../shared/runtime/values";
import { copyComponentData } from "../../../shared/runtime/components";
import {
  BUDGETS,
  type Entity,
  type Slot,
  type Event,
  type Effect,
} from "../../../shared/runtime/contracts";
export type OperationNotice = {
  name: "completed" | "cancelled";
  payload: { id: string; resource: string; outcome: string };
};
export function prepareOperations(
  entity: Entity,
  slot: Slot,
  event: Event,
  effects: Effect[],
  existing: Operation[],
  now: number,
) {
  const components = copyComponentData(entity.components) as RecordValue;
  const operations = new Map(existing.map((op) => [op.resource, op]));
  const notices: OperationNotice[] = [];
  const cancel = (resource: string) => {
    const old = operations.get(resource);
    if (!old) return;
    if (old.slot !== slot.id)
      throw Error("Operation resource belongs to another slot.");
    components[resource] = sampleOperation(old, now);
    operations.delete(resource);
    notices.push({
      name: "cancelled",
      payload: { id: old.id, resource, outcome: "cancelled" },
    });
  };
  for (const effect of effects) {
    if (effect.type === "component") {
      cancel(effect.key);
      components[effect.key] = effect.value;
    }
    if (effect.type !== "operation") continue;
    const key = effect.resource,
      old =
        operations.get(key) ??
        (effect.command === "restart"
          ? slot.completedOperations?.find(
              (o) => o.resource === key && o.generation === slot.generation,
            )
          : undefined);
    if (key !== "transform" && !key.startsWith("transform."))
      throw Error("Timed operations currently require a transform resource.");
    if (old && old.slot !== slot.id)
      throw Error("Operation resource belongs to another slot.");
    if (effect.command === "animate") {
      const from = old
        ? sampleOperation(old, now)
        : transformValue(components[key]);
      const to = transformValue(effect.to);
      cancel(key);
      components[key] = from;
      operations.set(key, {
        id: effect.id,
        entity: entity.id,
        slot: slot.id,
        generation: slot.generation,
        resource: key,
        from,
        to,
        started: now,
        duration: effect.duration,
        progress: 0,
        paused: false,
        correlation: event.correlation,
        depth: event.depth,
        ...(effect.path ? { path: effect.path, mode: effect.mode } : {}),
      });
    } else if (effect.command === "cancel") cancel(key);
    else {
      if (!old) throw Error("Operation unavailable.");
      components[key] = sampleOperation(old, now);
      operations.set(key, {
        ...old,
        progress:
          effect.command === "restart" ? 0 : operationProgress(old, now),
        started: now,
        paused:
          effect.command === "pause"
            ? true
            : effect.command === "resume"
              ? false
              : old.paused,
        speed: effect.command === "speed" ? effect.multiplier : old.speed,
      });
    }
  }
  if (
    [...operations.values()].filter((o) => o.slot === slot.id).length >
    BUDGETS.operations
  )
    throw Error("Operation budget exceeded.");
  return { components, operations: [...operations.values()], notices };
}
