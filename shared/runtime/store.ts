import type { Entity, Event, Package, Slot } from "./contracts";
import type { Value, RecordValue } from "./values";
export type InteractionRecord = {
  id: string;
  entity: string;
  room: string;
  property: string;
  slot: string;
  generation: number;
  kind: "speech" | "dialog";
  player?: string;
  text: string;
  name?: string;
  choices?: string[];
  maxLength?: number;
  target?: { kinds: Array<"object" | "player">; range: number };
  expires: number;
};
import type { Operation } from "./operations";
import type { WorkMeter } from "./budgets";
import type { EntityTemplate } from "./templates";
import type { ViewDefinition } from "../intelligent-objects";
export type ObjectView = {
  id: string;
  entity: string;
  slot: string;
  generation: number;
  name: string;
  definition: ViewDefinition;
  members: string[];
};
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
  reservations(
    property: string,
    room: string,
  ): import("./reservations").Reservation[];
  putReservation(value: import("./reservations").Reservation): void;
  removeReservation(id: string): void;
  players(
    property: string,
    room: string,
    now: number,
  ): import("../intelligent-objects").SensedEntity[];
  views(entity: string): ObjectView[];
  putView(value: ObjectView): void;
  removeView(id: string): void;
  template(hash: string): EntityTemplate | undefined;
  putTemplate(template: EntityTemplate): void;
  installGrant(slot: Slot, entity: Entity): void;
  playerState(slot: string, player: string): RecordValue;
  putPlayerState(slot: string, player: string, value: RecordValue): void;
  clearPlayerState(slot: string): void;
  interactions(entity: string): InteractionRecord[];
  putInteraction(value: InteractionRecord): void;
  removeInteraction(id: string): void;
  workMeter(key: string): WorkMeter | undefined;
  putWorkMeter(meter: WorkMeter): void;
  entity(id: string): Entity | undefined;
  validateDestroy(entity: Entity): void;
  roomEntities(property: string, room: string): Entity[];
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
