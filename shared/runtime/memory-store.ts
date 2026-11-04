import type {
  RuntimeStore,
  Delivery,
  Receipt,
  Timer,
  InteractionRecord,
  ObjectView,
} from "./store";
import type { RecordValue } from "./values";
import type { Entity, Slot, Package } from "./contracts";
import type { WorkMeter } from "./budgets";
import type { EntityTemplate } from "./templates";
import { operationDeadline, type Operation } from "./operations";
import { walkerTrajectory, type Walker } from "./walking";
const clone = <T>(v: T): T =>
  v === undefined ? v : JSON.parse(JSON.stringify(v));
/** Deterministic simulation store. Production uses table-backed storage. */
export class MemoryStore implements RuntimeStore {
  validateDestroy(_entity: Entity) {}
  private playerRows = new Map<string, Walker>();
  putPlayer(walker: Walker) {
    this.playerRows.set(walker.id, clone(walker));
  }
  removePlayer(id: string) {
    this.playerRows.delete(id);
  }
  private reservationRows = new Map<
    string,
    import("./reservations").Reservation
  >();
  reservations(property: string, room: string) {
    return [...this.reservationRows.values()]
      .filter((r) => r.property === property && r.room === room)
      .map(clone);
  }
  putReservation(value: import("./reservations").Reservation) {
    this.reservationRows.set(value.id, clone(value));
  }
  removeReservation(id: string) {
    this.reservationRows.delete(id);
  }
  players(
    property: string,
    room: string,
    now: number,
  ): import("../intelligent-objects").SensedEntity[] {
    return [...this.playerRows.values()]
      .filter((w) => w.property === property && w.room === room)
      .map((w) => ({
        id: `player:${w.id}`,
        kind: "player",
        name: w.name ?? "Traveler",
        tags: [],
        trajectory: walkerTrajectory(w, now),
      }));
  }
  private viewRows = new Map<string, ObjectView>();
  views(entity: string) {
    return [...this.viewRows.values()]
      .filter((v) => v.entity === entity)
      .map(clone);
  }
  putView(value: ObjectView) {
    this.viewRows.set(value.id, clone(value));
  }
  removeView(id: string) {
    this.viewRows.delete(id);
  }
  private templates = new Map<string, EntityTemplate>();
  template(hash: string) {
    return clone(this.templates.get(hash));
  }
  putTemplate(template: EntityTemplate) {
    if (this.templates.has(template.hash))
      throw Error("Immutable template exists.");
    this.templates.set(template.hash, clone(template));
  }
  installGrant(slot: Slot, _entity: Entity) {
    this.revoked.delete(slot.id);
  }
  private playerStates = new Map<string, RecordValue>();
  clearPlayerState(slot: string) {
    for (const key of this.playerStates.keys())
      if (JSON.parse(key)[0] === slot) this.playerStates.delete(key);
  }
  private interactionRows = new Map<string, InteractionRecord>();
  playerState(slot: string, player: string) {
    return clone(this.playerStates.get(JSON.stringify([slot, player])) ?? {});
  }
  putPlayerState(slot: string, player: string, value: RecordValue) {
    this.playerStates.set(JSON.stringify([slot, player]), clone(value));
  }
  interactions(entity: string) {
    return [...this.interactionRows.values()]
      .filter((r) => r.entity === entity)
      .map(clone);
  }
  putInteraction(value: InteractionRecord) {
    this.interactionRows.set(value.id, clone(value));
  }
  removeInteraction(id: string) {
    this.interactionRows.delete(id);
  }
  private meters = new Map<string, WorkMeter>();
  workMeter(key: string) {
    return clone(this.meters.get(key));
  }
  putWorkMeter(m: WorkMeter) {
    this.meters.set(m.key, clone(m));
  }
  private entities = new Map<string, Entity>();
  private instances = new Map<string, Slot>();
  private packages = new Map<string, Package>();
  private inbox = new Map<string, Delivery>();
  private receipts = new Map<string, Receipt>();
  private receiptOrder = new Map<string, number>();
  private scheduled = new Map<string, Timer>();
  private sequence = 0;
  private revoked = new Set<string>();
  canRun(slot: Slot, _entity: Entity) {
    return !this.revoked.has(slot.id);
  }
  setRuntimeGrant(slot: string, active: boolean) {
    if (active) this.revoked.delete(slot);
    else this.revoked.add(slot);
  }
  private animations = new Map<string, Operation>();
  operations(entity: string) {
    return [...this.animations.values()]
      .filter((o) => o.entity === entity)
      .map(clone);
  }
  putOperation(op: Operation) {
    this.animations.set(op.id, clone(op));
  }
  removeOperation(id: string) {
    this.animations.delete(id);
  }
  dueOperations(now: number, limit: number) {
    return [...this.animations.values()]
      .filter((o) => operationDeadline(o) <= now)
      .sort(
        (a, b) =>
          operationDeadline(a) - operationDeadline(b) ||
          a.id.localeCompare(b.id),
      )
      .slice(0, limit)
      .map(clone);
  }
  entity(id: string) {
    return clone(this.entities.get(id));
  }
  entityIds() {
    return [...this.entities.keys()];
  }
  roomEntities(property: string, room: string) {
    return [...this.entities.values()]
      .filter((e) => e.enabled && e.property === property && e.room === room)
      .map(clone);
  }
  putEntity(e: Entity) {
    this.entities.set(e.id, clone(e));
  }
  slots(entity: string) {
    return [...this.instances.values()]
      .filter((s) => s.entity === entity && !s.detached)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(clone);
  }
  slot(id: string) {
    return clone(this.instances.get(id));
  }
  putSlot(s: Slot) {
    this.instances.set(s.id, clone(s));
  }
  package(hash: string) {
    return clone(this.packages.get(hash));
  }
  putPackage(p: Package) {
    if (this.packages.has(p.hash))
      throw Error("Immutable package already exists.");
    this.packages.set(p.hash, clone(p));
  }
  pending(entity: string) {
    return [...this.inbox.values()]
      .filter((d) => d.event.entity === entity)
      .sort((a, b) => a.event.sequence - b.event.sequence)
      .map(clone);
  }
  putDelivery(d: Delivery) {
    this.inbox.set(d.event.id, clone(d));
  }
  removeDelivery(id: string) {
    this.inbox.delete(id);
  }
  receipt(id: string) {
    return clone(this.receipts.get(id));
  }
  putReceipt(r: Receipt) {
    this.receipts.set(r.id, clone(r));
    this.receiptOrder.set(r.id, this.nextSequence());
    const entity = this.slot(r.slot)?.entity;
    const records = [...this.receipts.values()]
      .filter((x) => this.slot(x.slot)?.entity === entity)
      .sort(
        (a, b) => this.receiptOrder.get(a.id)! - this.receiptOrder.get(b.id)!,
      );
    for (const old of records.slice(0, Math.max(0, records.length - 256))) {
      this.receipts.delete(old.id);
      this.receiptOrder.delete(old.id);
    }
  }
  timers(slot: string) {
    return [...this.scheduled.values()]
      .filter((t) => t.slot === slot)
      .map(clone);
  }
  dueTimers(now: number, limit: number) {
    return [...this.scheduled.values()]
      .filter((t) => t.due <= now)
      .sort((a, b) => a.due - b.due || a.id.localeCompare(b.id))
      .slice(0, limit)
      .map(clone);
  }
  putTimer(t: Timer) {
    this.scheduled.set(t.id, clone(t));
  }
  removeTimer(id: string) {
    this.scheduled.delete(id);
  }
  nextSequence() {
    return ++this.sequence;
  }
  export() {
    return JSON.stringify({
      entities: [...this.entities],
      playerRows: [...this.playerRows],
      reservationRows: [...this.reservationRows],
      instances: [...this.instances],
      packages: [...this.packages],
      inbox: [...this.inbox],
      receipts: [...this.receipts],
      receiptOrder: [...this.receiptOrder],
      scheduled: [...this.scheduled],
      sequence: this.sequence,
      revoked: [...this.revoked],
      animations: [...this.animations],
      meters: [...this.meters],
      templates: [...this.templates],
      viewRows: [...this.viewRows],
      playerStates: [...this.playerStates],
      interactionRows: [...this.interactionRows],
    });
  }
  static restore(source: string) {
    const data = JSON.parse(source),
      store = new MemoryStore();
    store.entities = new Map(data.entities);
    store.playerRows = new Map(data.playerRows ?? []);
    store.reservationRows = new Map(data.reservationRows ?? []);
    store.instances = new Map(data.instances);
    store.packages = new Map(data.packages);
    store.inbox = new Map(data.inbox);
    store.receipts = new Map(data.receipts);
    store.receiptOrder = new Map(data.receiptOrder ?? []);
    store.scheduled = new Map(data.scheduled);
    store.sequence = data.sequence;
    store.revoked = new Set(data.revoked ?? []);
    store.animations = new Map(data.animations ?? []);
    store.meters = new Map(data.meters ?? []);
    store.templates = new Map(data.templates ?? []);
    store.viewRows = new Map(data.viewRows ?? []);
    store.playerStates = new Map(data.playerStates ?? []);
    store.interactionRows = new Map(data.interactionRows ?? []);
    return store;
  }
}
