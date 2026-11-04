import { ScheduleAt } from "spacetimedb";
import { type Ctx, now } from "./schema";
import type { Entity, Slot, Package } from "../../shared/runtime/contracts";
import type {
  RuntimeStore,
  Delivery,
  Receipt,
  Timer,
} from "../../shared/runtime/store";
import {
  operationDeadline,
  type Operation,
} from "../../shared/runtime/operations";
import { canExecuteInstalled } from "../../shared/runtime/permissions";
export class TableStore implements RuntimeStore {
  canRun(slot: Slot, entity: Entity) {
    const grant = this.ctx.db.installedGrant.slot.find(slot.id),
      property = this.ctx.db.propertyAuthority.id.find(entity.property);
    const manifest = this.package(slot.packageHash)?.manifest;
    return canExecuteInstalled(
      grant ? { ...grant, resources: JSON.parse(grant.resources) } : undefined,
      property
        ? { ...property, owner: property.owner.toHexString() }
        : undefined,
      slot.id,
      [...(manifest?.writes ?? []), ...(manifest?.reads ?? [])],
    );
  }
  touched = new Set<string>();
  constructor(readonly ctx: Ctx) {}
  operations(entity: string) {
    return [...this.ctx.db.operation.entity.filter(entity)].map(
      (r) => JSON.parse(r.data) as Operation,
    );
  }
  putOperation(op: Operation) {
    const deadline = operationDeadline(op),
      row = {
        id: op.id,
        entity: op.entity,
        due: Number.isFinite(deadline) ? deadline : undefined,
        data: JSON.stringify(op),
      };
    if (this.ctx.db.operation.id.find(op.id))
      this.ctx.db.operation.id.update(row);
    else this.ctx.db.operation.insert(row);
    this.touched.add(op.entity);
  }
  removeOperation(id: string) {
    const row = this.ctx.db.operation.id.find(id);
    if (row) this.touched.add(row.entity);
    this.ctx.db.operation.id.delete(id);
  }
  dueOperations(_now: number, _limit: number): Operation[] {
    throw Error("Use entity-scoped scheduler.");
  }
  entity(id: string) {
    const row = this.ctx.db.entity.id.find(id);
    return row ? (JSON.parse(row.data) as Entity) : undefined;
  }
  putEntity(e: Entity) {
    const row = {
      id: e.id,
      property: e.property,
      room: e.room,
      data: JSON.stringify(e),
    };
    if (this.ctx.db.entity.id.find(e.id)) this.ctx.db.entity.id.update(row);
    else this.ctx.db.entity.insert(row);
  }
  slots(id: string) {
    return [...this.ctx.db.slot.entity.filter(id)]
      .map((r) => JSON.parse(r.data) as Slot)
      .sort((a, b) => a.id.localeCompare(b.id));
  }
  slot(id: string) {
    const r = this.ctx.db.slot.id.find(id);
    return r ? (JSON.parse(r.data) as Slot) : undefined;
  }
  putSlot(s: Slot) {
    const r = { id: s.id, entity: s.entity, data: JSON.stringify(s) };
    if (this.ctx.db.slot.id.find(s.id)) this.ctx.db.slot.id.update(r);
    else this.ctx.db.slot.insert(r);
  }
  package(hash: string) {
    const r = this.ctx.db.behaviorPackage.hash.find(hash);
    return r ? (JSON.parse(r.data) as Package) : undefined;
  }
  putPackage(p: Package) {
    this.ctx.db.behaviorPackage.insert({
      hash: p.hash,
      data: JSON.stringify(p),
    });
  }
  pending(id: string) {
    return [...this.ctx.db.inbox.entity.filter(id)]
      .sort((a, b) => a.sequence - b.sequence)
      .map((r) => JSON.parse(r.data) as Delivery);
  }
  putDelivery(d: Delivery) {
    const r = {
      id: d.event.id,
      entity: d.event.entity,
      sequence: d.event.sequence,
      data: JSON.stringify(d),
    };
    if (this.ctx.db.inbox.id.find(r.id)) this.ctx.db.inbox.id.update(r);
    else this.ctx.db.inbox.insert(r);
    this.touched.add(r.entity);
  }
  removeDelivery(id: string) {
    const r = this.ctx.db.inbox.id.find(id);
    if (r) this.touched.add(r.entity);
    this.ctx.db.inbox.id.delete(id);
  }
  receipt(id: string) {
    const r = this.ctx.db.receipt.id.find(id);
    return r ? (JSON.parse(r.data) as Receipt) : undefined;
  }
  putReceipt(r: Receipt) {
    const entity = this.slot(r.slot)?.entity ?? "deleted";
    const row = {
      id: r.id,
      entity,
      sequence: this.nextSequence(),
      data: JSON.stringify(r),
    };
    if (this.ctx.db.receipt.id.find(r.id)) this.ctx.db.receipt.id.update(row);
    else this.ctx.db.receipt.insert(row);
    // Terminal deliveries have been removed; retaining a bounded diagnostic window
    // cannot cause them to reappear. Active receipts survive the dispatch batch.
    const records = [...this.ctx.db.receipt.entity.filter(entity)].sort(
      (a, b) => a.sequence - b.sequence,
    );
    for (const old of records.slice(0, Math.max(0, records.length - 256)))
      this.ctx.db.receipt.id.delete(old.id);
  }
  timers(id: string) {
    return [...this.ctx.db.timer.slot.filter(id)].map(
      (r) => JSON.parse(r.data) as Timer,
    );
  }
  dueTimers(_now: number, _limit: number): Timer[] {
    throw Error("Use entity-scoped scheduler.");
  }
  putTimer(t: Timer) {
    const r = {
      id: t.id,
      entity: t.entity,
      slot: t.slot,
      due: t.due,
      data: JSON.stringify(t),
    };
    if (this.ctx.db.timer.id.find(r.id)) this.ctx.db.timer.id.update(r);
    else this.ctx.db.timer.insert(r);
    this.touched.add(t.entity);
  }
  removeTimer(id: string) {
    const r = this.ctx.db.timer.id.find(id);
    if (r) this.touched.add(r.entity);
    this.ctx.db.timer.id.delete(id);
  }
  nextSequence() {
    const row = this.ctx.db.counter.key.find("sequence")!;
    const value = row.value + 1;
    if (!Number.isSafeInteger(value)) throw Error("Sequence exhausted.");
    this.ctx.db.counter.key.update({ ...row, value });
    return value;
  }
  schedule() {
    for (const id of this.touched) {
      const pending = this.pending(id).length > 0,
        timers = [...this.ctx.db.timer.entity.filter(id)];
      const due = pending
        ? now(this.ctx) + 0.01
        : Math.min(
            ...timers.map((t) => t.due),
            ...this.operations(id).map(operationDeadline),
          );
      const old = this.ctx.db.wake.entity.find(id);
      if (old) this.ctx.db.wake.scheduledId.delete(old.scheduledId);
      if (Number.isFinite(due))
        this.ctx.db.wake.insert({
          scheduledId: 0n,
          entity: id,
          scheduledAt: ScheduleAt.time(
            BigInt(Math.round(Math.max(now(this.ctx) + 0.01, due) * 1e6)),
          ),
        });
    }
  }
}
