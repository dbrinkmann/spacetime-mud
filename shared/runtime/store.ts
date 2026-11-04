import type { Entity, Event, Package, Slot } from "./contracts";
import type { Value } from "./values";
import type { Operation } from "./operations";
import type { WorkMeter } from "./budgets";
export type Receipt = {
  id: string;
  event: string;
  slot: string;
  outcome: "handled" | "failed" | "stale" | "rejected";
  error: string;
  trace?: {
    packageHash: string;
    eventType: string;
    name: string;
    source: string;
    occurredAt: number;
    handledAt: number;
    steps: number;
    calls: number;
    allocations: number;
    effects: string[];
  };
};
export type Delivery = {
  event: Event;
  recipients: Array<{ id: string; generation: number }>;
  admitted?: Array<{ id: string; generation: number }>;
  cursor: number;
  started: boolean;
  notBefore?: number;
};
export type Timer = {
  id: string;
  entity: string;
  slot: string;
  generation: number;
  due: number;
  name: string;
  payload: Value;
  correlation: string;
  depth: number;
};
/** All mutation calls occur within the host's transaction. No callbacks perform I/O. */
export interface RuntimeStore {
  workMeter(key: string): WorkMeter | undefined;
  putWorkMeter(meter: WorkMeter): void;
  entity(id: string): Entity | undefined;
  putEntity(entity: Entity): void;
  slots(entity: string): Slot[];
  slot(id: string): Slot | undefined;
  putSlot(slot: Slot): void;
  package(hash: string): Package | undefined;
  putPackage(pkg: Package): void;
  pending(entity: string): Delivery[];
  putDelivery(delivery: Delivery): void;
  removeDelivery(id: string): void;
  receipt(id: string): Receipt | undefined;
  putReceipt(receipt: Receipt): void;
  timers(slot: string): Timer[];
  dueTimers(now: number, limit: number): Timer[];
  putTimer(timer: Timer): void;
  removeTimer(id: string): void;
  nextSequence(): number;
  canRun(slot: Slot, entity: Entity): boolean;
  operations(entity: string): Operation[];
  putOperation(operation: Operation): void;
  removeOperation(id: string): void;
  dueOperations(now: number, limit: number): Operation[];
}
