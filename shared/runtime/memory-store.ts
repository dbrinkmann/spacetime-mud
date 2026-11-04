import type { RuntimeStore, Delivery, Receipt, Timer } from "./store";
import type { Entity, Slot, Package } from "./contracts";
import { operationDeadline, type Operation } from "./operations";
const clone = <T>(v: T): T =>
  v === undefined ? v : JSON.parse(JSON.stringify(v));
/** Deterministic simulation store. Production uses table-backed storage. */
export class MemoryStore implements RuntimeStore {
  private entities = new Map<string, Entity>();
  private instances = new Map<string, Slot>();
  private packages = new Map<string, Package>();
  private inbox = new Map<string, Delivery>();
  private receipts = new Map<string, Receipt>();
  private receiptOrder = new Map<string, number>();
  private scheduled = new Map<string, Timer>();
  private sequence = 0;
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
  putEntity(e: Entity) {
    this.entities.set(e.id, clone(e));
  }
  slots(entity: string) {
    return [...this.instances.values()]
      .filter((s) => s.entity === entity)
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
      instances: [...this.instances],
      packages: [...this.packages],
      inbox: [...this.inbox],
      receipts: [...this.receipts],
      receiptOrder: [...this.receiptOrder],
      scheduled: [...this.scheduled],
      sequence: this.sequence,
      animations: [...this.animations],
    });
  }
  static restore(source: string) {
    const data = JSON.parse(source),
      store = new MemoryStore();
    store.entities = new Map(data.entities);
    store.instances = new Map(data.instances);
    store.packages = new Map(data.packages);
    store.inbox = new Map(data.inbox);
    store.receipts = new Map(data.receipts);
    store.receiptOrder = new Map(data.receiptOrder ?? []);
    store.scheduled = new Map(data.scheduled);
    store.sequence = data.sequence;
    store.animations = new Map(data.animations ?? []);
    return store;
  }
}
