import { t, SenderError } from "spacetimedb/server";
import { db, wake, now, type Ctx } from "./schema";
import { TableStore } from "./store";
import { WorldRuntime } from "../../spacetimedb/src/runtime/engine";
import { BUDGETS } from "../../shared/runtime/contracts";
import {
  copyValue,
  identifier,
  type RecordValue,
} from "../../shared/runtime/values";
import {
  BehaviorRegistry,
  type RegistryEntry,
  type Revision,
  type Bundle,
} from "../../shared/runtime/registry";
import { operationDeadline } from "../../shared/runtime/operations";
import type { Timer } from "../../shared/runtime/store";
import { presentEntity } from "../../shared/runtime/presentation";
export default db;
export { enterWalkRoom, walkTo, arriveWalk } from "./walking";
export const runtimeInfo = db.procedure({}, t.string(), () =>
  JSON.stringify({ apiVersion: 2, status: "development" }),
);
import {
  requireOperator,
  requireGateway,
  requireBuilder,
  requirePropertyEdit,
  requireEntityEdit,
  requireSlotEdit,
  grantInstalled,
  memberKey,
} from "./access";
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
function requireInstall(ctx: Ctx, hash: string, community: string) {
  const row = [...ctx.db.packageRevision.hash.filter(hash)][0];
  if (!row) throw Error("Package unavailable.");
  const revision = JSON.parse(row.data) as Revision;
  registry(ctx).get(
    { id: requireBuilder(ctx, community).identity, community },
    revision.id,
    revision.version,
    true,
  );
}
export const init = db.init((ctx) => {
  ctx.db.authority.insert({ key: "operator", identity: ctx.sender });
  ctx.db.counter.insert({ key: "sequence", value: 0 });
  ctx.db.community.insert({
    id: "development",
    name: "Isolated runtime development",
  });
});
export const createProperty = db.reducer(
  { id: t.string(), community: t.string(), common: t.bool() },
  (ctx, a) => {
    requireOperator(ctx);
    checked(() => {
      identifier(a.id);
      if (!ctx.db.community.id.find(a.community))
        ctx.db.community.insert({ id: a.community, name: a.community });
      ctx.db.propertyAuthority.insert({
        id: a.id,
        community: a.community,
        owner: ctx.sender,
        common: a.common,
        revision: 1,
      });
    });
  },
);
export const setCommunityGateway = db.reducer(
  { identity: t.identity() },
  (ctx, a) => {
    requireOperator(ctx);
    const row = { key: "gateway", identity: a.identity };
    if (ctx.db.authority.key.find("gateway")) ctx.db.authority.key.update(row);
    else ctx.db.authority.insert(row);
  },
);
export const provisionCommunity = db.reducer(
  {
    communityId: t.string(),
    name: t.string(),
    admin: t.identity(),
    discordUserId: t.string(),
  },
  (ctx, a) => {
    requireGateway(ctx);
    if (
      !/^[0-9]{1,24}$/.test(a.communityId) ||
      !/^[0-9]{1,24}$/.test(a.discordUserId) ||
      a.name.length > 80
    )
      throw new SenderError("Invalid community.");
    if (ctx.db.community.id.find(a.communityId))
      throw new SenderError("Community already exists.");
    ctx.db.community.insert({ id: a.communityId, name: a.name });
    ctx.db.propertyAuthority.insert({
      id: `common:${a.communityId}`,
      community: a.communityId,
      owner: a.admin,
      common: true,
      revision: 1,
    });
    ctx.db.membership.insert({
      key: memberKey(a.communityId, a.admin.toHexString()),
      community: a.communityId,
      identity: a.admin,
      discordUserId: a.discordUserId,
      active: true,
      admin: true,
      validUntil: now(ctx) + 180,
    });
  },
);
export const setCommunityMember = db.reducer(
  {
    communityId: t.string(),
    identity: t.identity(),
    discordUserId: t.string(),
    admin: t.bool(),
    active: t.bool(),
  },
  (ctx, a) => {
    requireGateway(ctx);
    if (
      !ctx.db.community.id.find(a.communityId) ||
      !/^[0-9]{1,24}$/.test(a.discordUserId)
    )
      throw new SenderError("Invalid membership.");
    const key = memberKey(a.communityId, a.identity.toHexString()),
      old = ctx.db.membership.key.find(key);
    if (old && old.discordUserId !== a.discordUserId)
      throw new SenderError("Identity already bound.");
    if (
      [...ctx.db.membership.community.filter(a.communityId)].some(
        (m) =>
          m.discordUserId === a.discordUserId && !m.identity.equals(a.identity),
      )
    )
      throw new SenderError("Discord member already has an identity.");
    const row = {
      key,
      community: a.communityId,
      identity: a.identity,
      discordUserId: a.discordUserId,
      active: a.active,
      admin: a.admin,
      validUntil: now(ctx) + 180,
    };
    if (old) ctx.db.membership.key.update(row);
    else ctx.db.membership.insert(row);
  },
);
export const authorizeCommunityAgent = db.reducer(
  { communityId: t.string(), agent: t.identity(), commonSpace: t.bool() },
  (ctx, a) => {
    const actor = ctx.sender.toHexString(),
      member = ctx.db.membership.key.find(memberKey(a.communityId, actor));
    if (
      !member?.active ||
      member.validUntil <= now(ctx) ||
      a.agent.equals(ctx.sender) ||
      (a.commonSpace && !member.admin)
    )
      throw new SenderError("Agent delegation denied.");
    const key = memberKey(a.communityId, a.agent.toHexString()),
      old = ctx.db.builderGrant.key.find(key);
    if (old && !old.owner.equals(ctx.sender))
      throw new SenderError("Agent already paired.");
    const row = {
      key,
      community: a.communityId,
      agent: a.agent,
      owner: ctx.sender,
      commonSpace: a.commonSpace,
    };
    if (old) ctx.db.builderGrant.key.update(row);
    else ctx.db.builderGrant.insert(row);
  },
);
export const revokeCommunityAgent = db.reducer(
  { communityId: t.string(), agent: t.identity() },
  (ctx, a) => {
    const member = ctx.db.membership.key.find(
        memberKey(a.communityId, ctx.sender.toHexString()),
      ),
      key = memberKey(a.communityId, a.agent.toHexString()),
      grant = ctx.db.builderGrant.key.find(key);
    if (
      !member?.active ||
      member.validUntil <= now(ctx) ||
      !grant ||
      (!grant.owner.equals(ctx.sender) && !member.admin)
    )
      throw new SenderError("Agent revocation denied.");
    ctx.db.builderGrant.key.delete(key);
  },
);
export const publishPackage = db.reducer(
  { bundle: t.string(), visibility: t.string(), community: t.string() },
  (ctx, a) => {
    checked(() => {
      const principal = requireBuilder(ctx, a.community);
      registry(ctx).publish(
        { id: principal.identity, community: a.community },
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
    checked(() => {
      const { property } = requirePropertyEdit(ctx, a.property);
      identifier(a.property);
      identifier(a.room);
      new WorldRuntime(new TableStore(ctx), now(ctx)).create({
        id: a.id,
        community: property.community,
        owner: property.owner.toHexString(),
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
    checked(() => {
      const { property } = requireEntityEdit(ctx, a.entity);
      requireInstall(ctx, a.hash, property.community);
      const store = new TableStore(ctx);
      const slot = new WorldRuntime(store, now(ctx)).attach(
        a.entity,
        a.slot,
        a.hash,
        copyValue(input(a.config)) as RecordValue,
      );
      grantInstalled(ctx, slot, property.id, a.hash);
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
/** Builder testing, not a substitute for player proximity/interaction checks. */
export const testEntityAction = db.reducer(
  { entity: t.string(), name: t.string(), payload: t.string() },
  (ctx, a) => {
    requireEntityEdit(ctx, a.entity);
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
export const previewRoom = db.procedure(
  { property: t.string(), room: t.string() },
  t.string(),
  (ctx, a) =>
    ctx.withTx((tx) => {
      requirePropertyEdit(tx, a.property);
      const store = new TableStore(tx);
      const entities = [...tx.db.entity.property.filter(a.property)]
        .filter((row) => row.room === a.room)
        .map((row) => store.entity(row.id)!)
        .filter((e) => e.enabled);
      if (entities.length > 256)
        throw new SenderError("Preview supports up to 256 entities.");
      return JSON.stringify({
        serverTime: now(tx),
        walkers: [...tx.db.walker.property.filter(a.property)]
          .filter((w) => w.room === a.room)
          .map((w) => JSON.parse(w.data)),
        entities: entities.map((e) =>
          presentEntity(
            e,
            store.operations(e.id),
            store
              .slots(e.id)
              .filter((s) => s.enabled && !s.lastError)
              .flatMap((s) =>
                Object.entries(store.package(s.packageHash)!.manifest.handlers)
                  .filter(
                    ([key, h]) =>
                      key.startsWith("action:") && h.input.type === "null",
                  )
                  .map(([key]) => key.slice(7)),
              ),
          ),
        ),
      });
    }),
);
export const suspendBehavior = db.reducer({ slot: t.string() }, (ctx, a) => {
  requireSlotEdit(ctx, a.slot);
  checked(() => {
    const store = new TableStore(ctx);
    new WorldRuntime(store, now(ctx)).suspend(a.slot);
    store.schedule();
  });
});
export const resumeBehavior = db.reducer({ slot: t.string() }, (ctx, a) => {
  requireSlotEdit(ctx, a.slot);
  checked(() => {
    const store = new TableStore(ctx);
    new WorldRuntime(store, now(ctx)).resume(a.slot);
    store.schedule();
  });
});
export const upgradeBehavior = db.reducer(
  { slot: t.string(), hash: t.string(), config: t.string() },
  (ctx, a) => {
    checked(() => {
      const { property } = requireSlotEdit(ctx, a.slot);
      requireInstall(ctx, a.hash, property.community);
      const store = new TableStore(ctx);
      new WorldRuntime(store, now(ctx)).upgrade(
        a.slot,
        a.hash,
        input(a.config),
      );
      grantInstalled(ctx, a.slot, property.id, a.hash);
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
    for (const op of store
      .operations(work.entity)
      .filter((o) => operationDeadline(o) <= now(ctx))
      .slice(0, BUDGETS.dispatchBatch))
      runtime.finishOperation(op.id, work.entity);
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
      requireEntityEdit(tx, a.id);
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
        operations: [...tx.db.operation.entity.filter(a.id)].map((o) =>
          JSON.parse(o.data),
        ),
        work: tx.db.workMeter.key.find(`entity:${a.id}`),
        queue: [...tx.db.inbox.entity.filter(a.id)].map((row) => {
          const d = JSON.parse(row.data);
          return {
            event: d.event.id,
            type: d.event.type,
            name: d.event.name,
            notBefore: d.notBefore ?? null,
          };
        }),
      });
    }),
);
export const getPackage = db.procedure(
  { community: t.string(), id: t.string(), version: t.string() },
  t.string(),
  (ctx, a) =>
    ctx.withTx((tx) => {
      const principal = requireBuilder(tx, a.community);
      return JSON.stringify(
        registry(tx).get(
          { id: principal.identity, community: a.community },
          a.id,
          a.version,
        ),
      );
    }),
);
