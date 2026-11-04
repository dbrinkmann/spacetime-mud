import type { RuntimeStore } from "./store";
import type { Entity, Slot } from "./contracts";
export type WorkMeter = { key: string; window: number; count: number };
export const WORK_LIMITS = Object.freeze({
  slot: 16,
  entity: 64,
  community: 512,
  slotSteps: 80000,
  entitySteps: 160000,
  communitySteps: 400000,
  maxInvocationSteps: 20000,
});
/** Fixed one-second windows bound interpreter work, including failed attempts.
 * Exhaustion delays delivery; it never faults a recipient that was flooded.
 * There is only one row per scope, not an ever-growing row per time window. */
export function admitInvocation(
  store: RuntimeStore,
  entity: Entity,
  slot: Slot,
  now: number,
): number | null {
  const window = Math.floor(now);
  const scopes = [
    { key: `slot:${slot.id}`, limit: WORK_LIMITS.slot, cost: 1 },
    { key: `entity:${entity.id}`, limit: WORK_LIMITS.entity, cost: 1 },
    {
      key: `community:${entity.community}`,
      limit: WORK_LIMITS.community,
      cost: 1,
    },
    {
      key: `steps:slot:${slot.id}`,
      limit: WORK_LIMITS.slotSteps,
      cost: WORK_LIMITS.maxInvocationSteps,
    },
    {
      key: `steps:entity:${entity.id}`,
      limit: WORK_LIMITS.entitySteps,
      cost: WORK_LIMITS.maxInvocationSteps,
    },
    {
      key: `steps:community:${entity.community}`,
      limit: WORK_LIMITS.communitySteps,
      cost: WORK_LIMITS.maxInvocationSteps,
    },
  ];
  const meters = scopes.map((scope) => {
    const previous = store.workMeter(scope.key);
    return {
      ...scope,
      window,
      count: previous?.window === window ? previous.count : 0,
    };
  });
  if (meters.some((m) => m.count + m.cost > m.limit)) return window + 1;
  for (const m of meters)
    store.putWorkMeter({ key: m.key, window, count: m.count + m.cost });
  return null;
}
/** Reserve the maximum before execution; refund unused steps only on normal return.
 * A thrown interpreter/budget error retains its reservation, bounding hostile work. */
export function settleInvocation(
  store: RuntimeStore,
  entity: Entity,
  slot: Slot,
  now: number,
  steps: number,
) {
  if (
    !Number.isInteger(steps) ||
    steps < 0 ||
    steps > WORK_LIMITS.maxInvocationSteps
  )
    throw Error("Invalid interpreter accounting.");
  const window = Math.floor(now),
    refund = WORK_LIMITS.maxInvocationSteps - steps;
  for (const key of [
    `steps:slot:${slot.id}`,
    `steps:entity:${entity.id}`,
    `steps:community:${entity.community}`,
  ]) {
    const meter = store.workMeter(key);
    if (!meter || meter.window !== window || meter.count < refund)
      throw Error("Missing work reservation.");
    store.putWorkMeter({ ...meter, count: meter.count - refund });
  }
}
