import {
  schema,
  table,
  t,
  SenderError,
  type ReducerCtx,
  type InferSchema,
} from "spacetimedb/server";
import { ScheduleAt } from "spacetimedb";
import { WorldRuntime } from "../../spacetimedb/src/runtime/engine";
import {
  validateManifest,
  BUDGETS,
  type Entity,
  type Slot,
  type Package,
} from "../../shared/runtime/contracts";
import {
  copyValue,
  type RecordValue,
  type Value,
  identifier,
} from "../../shared/runtime/values";
import { canonical, sha256 } from "../../shared/runtime/digest";
import {
  BehaviorRegistry,
  type RegistryEntry,
  type Revision,
  type Bundle,
} from "../../shared/runtime/registry";
import type {
  RuntimeStore,
  Delivery,
  Receipt,
  Timer,
} from "../../shared/runtime/store";

// Isolated operator-only development module. Community authorization is deliberately
// not approximated here; no unverified player or agent can use this endpoint.
const authority = table(
  {},
  { key: t.string().primaryKey(), identity: t.identity() },
);
const entity = table(
  {},
  {
    id: t.string().primaryKey(),
    property: t.string().index("btree"),
    room: t.string().index("btree"),
    data: t.string(),
  },
);
const slot = table(
  {},
  {
    id: t.string().primaryKey(),
    entity: t.string().index("btree"),
    data: t.string(),
  },
);
const behaviorPackage = table(
  {},
  { hash: t.string().primaryKey(), data: t.string() },
);
const packageListing = table(
  {},
  { id: t.string().primaryKey(), data: t.string() },
);
const packageRevision = table(
  {},
  {
    key: t.string().primaryKey(),
    hash: t.string().index("btree"),
    data: t.string(),
  },
);
const inbox = table(
  {},
  {
    id: t.string().primaryKey(),
    entity: t.string().index("btree"),
    sequence: t.f64(),
    data: t.string(),
  },
);
const receipt = table(
  {},
  {
    id: t.string().primaryKey(),
    entity: t.string().index("btree"),
    sequence: t.f64(),
    data: t.string(),
  },
);
const timer = table(
  {},
  {
    id: t.string().primaryKey(),
    entity: t.string().index("btree"),
    slot: t.string().index("btree"),
    due: t.f64(),
    data: t.string(),
  },
);
const counter = table({}, { key: t.string().primaryKey(), value: t.f64() });
const wake = table(
  {},
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    entity: t.string().unique(),
    scheduledAt: t.scheduleAt(),
  },
);
const db = schema({
  authority,
  entity,
  slot,
  behaviorPackage,
  packageListing,
  packageRevision,
  inbox,
  receipt,
  timer,
  counter,
  wake,
});
export default db;
type Ctx = ReducerCtx<InferSchema<typeof db>>;
const now = (ctx: Ctx) => Number(ctx.timestamp.microsSinceUnixEpoch) / 1e6;
function requireOperator(ctx: {
  sender: Ctx["sender"];
  db: Pick<Ctx["db"], "authority">;
}) {
  if (!ctx.db.authority.key.find("operator")?.identity.equals(ctx.sender))
    throw new SenderError("Operator-only refactor environment.");
}
function input<T>(text: string): T {
  if (text.length > 100000) throw new SenderError("Input too large.");
  try {
    return JSON.parse(text);
  } catch {
    throw new SenderError("Invalid JSON.");
  }
}
function checked<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    throw new SenderError(e instanceof Error ? e.message : String(e));
  }
}
class TableStore implements RuntimeStore {
  touched = new Set<string>();
  constructor(readonly ctx: Ctx) {}
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
        : Math.min(...timers.map((t) => t.due));
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
function registry(ctx: Ctx) {
  const store = new TableStore(ctx);
  return new BehaviorRegistry({
    entry(id) {
      const row = ctx.db.packageListing.id.find(id);
      return row ? (JSON.parse(row.data) as RegistryEntry) : undefined;
    },
    putEntry(entry) {
      const row = { id: entry.id, data: JSON.stringify(entry) };
      if (ctx.db.packageListing.id.find(entry.id))
        ctx.db.packageListing.id.update(row);
      else ctx.db.packageListing.insert(row);
    },
    revision(key) {
      const row = ctx.db.packageRevision.key.find(key);
      return row ? (JSON.parse(row.data) as Revision) : undefined;
    },
    putRevision(revision) {
      ctx.db.packageRevision.insert({
        key: revision.key,
        hash: revision.hash,
        data: JSON.stringify(revision),
      });
    },
    package: (hash) => store.package(hash),
    install: (pkg) => new WorldRuntime(store, now(ctx)).register(pkg),
  });
}
function requireInstall(ctx: Ctx, hash: string) {
  const row = [...ctx.db.packageRevision.hash.filter(hash)][0];
  if (!row) throw Error("Package unavailable.");
  const revision = JSON.parse(row.data) as Revision;
  registry(ctx).get(
    { id: ctx.sender.toHexString(), community: "development" },
    revision.id,
    revision.version,
    true,
  );
}
export const init = db.init((ctx) => {
  ctx.db.authority.insert({ key: "operator", identity: ctx.sender });
  ctx.db.counter.insert({ key: "sequence", value: 0 });
});
export const publishPackage = db.reducer(
  { bundle: t.string(), visibility: t.string() },
  (ctx, a) => {
    requireOperator(ctx);
    checked(() => {
      registry(ctx).publish(
        { id: ctx.sender.toHexString(), community: "development" },
        input<Bundle>(a.bundle),
        a.visibility as RegistryEntry["visibility"],
      );
    });
  },
);
export const createEntity = db.reducer(
  {
    id: t.string(),
    property: t.string(),
    room: t.string(),
    components: t.string(),
  },
  (ctx, a) => {
    requireOperator(ctx);
    checked(() => {
      identifier(a.property);
      identifier(a.room);
      new WorldRuntime(new TableStore(ctx), now(ctx)).create({
        id: a.id,
        community: "development",
        owner: ctx.sender.toHexString(),
        property: a.property,
        room: a.room,
        generation: 1,
        revision: 1,
        enabled: true,
        components: input(a.components),
        publicState: {},
      });
    });
  },
);
export const attachBehavior = db.reducer(
  {
    entity: t.string(),
    slot: t.string(),
    hash: t.string(),
    config: t.string(),
  },
  (ctx, a) => {
    requireOperator(ctx);
    checked(() => {
      requireInstall(ctx, a.hash);
      const store = new TableStore(ctx);
      new WorldRuntime(store, now(ctx)).attach(
        a.entity,
        a.slot,
        a.hash,
        copyValue(input(a.config)) as RecordValue,
      );
      store.schedule();
    });
  },
);
export const invokeAction = db.reducer(
  { entity: t.string(), name: t.string(), payload: t.string() },
  (ctx, a) => {
    requireOperator(ctx);
    checked(() => {
      const store = new TableStore(ctx);
      new WorldRuntime(store, now(ctx)).action(
        a.entity,
        a.name,
        copyValue(input(a.payload)),
        ctx.sender.toHexString(),
      );
      store.schedule();
    });
  },
);
export const suspendBehavior = db.reducer({ slot: t.string() }, (ctx, a) => {
  requireOperator(ctx);
  checked(() => {
    const store = new TableStore(ctx);
    new WorldRuntime(store, now(ctx)).suspend(a.slot);
    store.schedule();
  });
});
export const resumeBehavior = db.reducer({ slot: t.string() }, (ctx, a) => {
  requireOperator(ctx);
  checked(() => {
    const store = new TableStore(ctx);
    new WorldRuntime(store, now(ctx)).resume(a.slot);
    store.schedule();
  });
});
export const upgradeBehavior = db.reducer(
  { slot: t.string(), hash: t.string(), config: t.string() },
  (ctx, a) => {
    requireOperator(ctx);
    checked(() => {
      requireInstall(ctx, a.hash);
      const store = new TableStore(ctx);
      new WorldRuntime(store, now(ctx)).upgrade(
        a.slot,
        a.hash,
        input(a.config),
      );
      store.schedule();
    });
  },
);
export const dispatch = db.reducer(
  { onSchedule: wake },
  { work: wake.rowType },
  (ctx, { work }) => {
    if (!ctx.sender.equals(ctx.identity) || ctx.connectionId)
      throw new SenderError("Scheduler only.");
    if (ctx.db.wake.entity.find(work.entity)?.scheduledId !== work.scheduledId)
      return;
    ctx.db.wake.scheduledId.delete(work.scheduledId);
    const store = new TableStore(ctx),
      runtime = new WorldRuntime(store, now(ctx));
    store.touched.add(work.entity);
    for (const row of [...ctx.db.timer.entity.filter(work.entity)]
      .filter((t) => t.due <= now(ctx))
      .slice(0, BUDGETS.dispatchBatch)) {
      const t = JSON.parse(row.data) as Timer,
        s = store.slot(t.slot),
        e = store.entity(t.entity);
      if (s?.enabled && e?.enabled && s.generation === t.generation) {
        if (store.pending(e.id).length >= BUDGETS.inbox) continue;
        runtime.enqueue(
          e.id,
          "timer",
          t.name,
          t.payload,
          { kind: "engine", id: "timer" },
          s.id,
          s.generation,
          t.correlation,
          t.depth,
        );
      }
      store.removeTimer(t.id);
    }
    runtime.drain(work.entity);
    store.schedule();
  },
);
export const inspectEntity = db.procedure(
  { id: t.string() },
  t.string(),
  (ctx, a) =>
    ctx.withTx((tx) => {
      requireOperator(tx);
      const e = tx.db.entity.id.find(a.id);
      if (!e) return "null";
      return JSON.stringify({
        entity: JSON.parse(e.data),
        slots: [...tx.db.slot.entity.filter(a.id)].map((s) =>
          JSON.parse(s.data),
        ),
        receipts: [...tx.db.receipt.entity.filter(a.id)].map((r) =>
          JSON.parse(r.data),
        ),
        pending: [...tx.db.inbox.entity.filter(a.id)].length,
      });
    }),
);
