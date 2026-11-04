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
import {
  presentEntity,
  bindHomeSigns,
} from "../../shared/runtime/presentation";
import {
  validateTemplate,
  type EntityTemplate,
} from "../../shared/runtime/templates";
import { canonical, sha256 } from "../../shared/runtime/digest";
import {
  validateComponent,
  copyComponentData,
} from "../../shared/runtime/components";
import { validateNavigationEdit } from "../../shared/runtime/navigation-edit";
export default db;
export {
  enterWalkRoom,
  joinWorld,
  walkTo,
  arriveWalk,
  leaveWorld,
} from "./walking";
import { roomFloor } from "./rooms";
import { validate as validateGeometry } from "../../shared/geometry";
export {
  createRoom,
  claimHome,
  renameHome,
  listWorld,
  deleteRoom,
  deleteHome,
} from "./rooms";
export { evaluateSpatial } from "./spatial";
export const runtimeInfo = db.procedure({}, t.string(), () =>
  JSON.stringify({ apiVersion: 2, status: "development" }),
);
export const setPlayerName = db.reducer({ name: t.string() }, (ctx, a) => {
  if (!a.name.trim() || a.name.length > 80)
    throw new SenderError("Invalid player name.");
  const row = ctx.db.walker.id.find(ctx.sender.toHexString());
  if (!row) throw new SenderError("Join first.");
  requirePropertyVisit(ctx, row.property);
  ctx.db.walker.id.update({
    ...row,
    data: JSON.stringify({ ...JSON.parse(row.data), name: a.name.trim() }),
  });
});
export const emote = db.reducer({ animation: t.string() }, (ctx, a) => {
  if (!["wave", "talk"].includes(a.animation))
    throw new SenderError("Unknown emote.");
  const row = ctx.db.walker.id.find(ctx.sender.toHexString());
  if (!row) throw new SenderError("Join first.");
  requirePropertyVisit(ctx, row.property);
  ctx.db.walker.id.update({
    ...row,
    data: JSON.stringify({
      ...JSON.parse(row.data),
      gesture: { animation: a.animation, until: now(ctx) + 3 },
    }),
  });
});
export const previewPrincipal = db.procedure(
  { communityId: t.string() },
  t.string(),
  (ctx, a) => ctx.withTx((tx) => requireBuilder(tx, a.communityId).identity),
);
/** Change notification contains no script/player-private state. Fetch the authorized projection on changes. */
export const liveRoomStamp = db.view(
  { name: "live_room_stamp", public: true },
  t.array(t.object("RoomStamp", { id: t.string(), stamp: t.string() })),
  (ctx) => {
    const walker = ctx.db.walker.id.find(ctx.sender.toHexString());
    if (!walker) return [];
    const property = ctx.db.propertyAuthority.id.find(walker.property);
    if (!property) return [];
    const member = ctx.db.membership.key.find(
      `${property.community}:${ctx.sender.toHexString()}`,
    );
    if (!member?.active) return [];
    const entities = [...ctx.db.entity.property.filter(walker.property)].filter(
      (e) => e.room === walker.room,
    );
    const data = [
      walker.data,
      entities.map((e) => [e.id, JSON.parse(e.data).revision]),
      entities.flatMap((e) =>
        [...ctx.db.slot.entity.filter(e.id)].map((row) => {
          const s = JSON.parse(row.data);
          return [row.id, s.enabled, s.detached, s.packageHash, s.generation];
        }),
      ),
      entities.flatMap((e) =>
        [...ctx.db.operation.entity.filter(e.id)].map((o) => o.data),
      ),
      [...ctx.db.walker.property.filter(walker.property)]
        .filter((w) => w.room === walker.room)
        .map((w) => [w.data, ctx.db.avatar.id.find(w.id)?.data ?? ""]),
      [...ctx.db.interaction.property.filter(walker.property)]
        .filter((r) => {
          const d = JSON.parse(r.data);
          return (
            d.room === walker.room && (!d.player || d.player === walker.id)
          );
        })
        .map((r) => r.data),
      [...ctx.db.homeLink.community.filter(property.community)].map((h) => [
        h.entrance,
        h.name,
      ]),
    ];
    return [{ id: walker.id, stamp: sha256(JSON.stringify(data)) }];
  },
);
export const setAvatar = db.reducer(
  { community: t.string(), definition: t.string() },
  (ctx, a) => {
    const principal = requireBuilder(ctx, a.community);
    const definition = validateGeometry(JSON.parse(a.definition), "character");
    const row = { id: principal.identity, data: JSON.stringify(definition) };
    if (ctx.db.avatar.id.find(row.id)) ctx.db.avatar.id.update(row);
    else ctx.db.avatar.insert(row);
  },
);
export const say = db.reducer({ text: t.string() }, (ctx, a) => {
  if (!a.text.trim() || a.text.length > 1000)
    throw new SenderError("Speech must be 1..1000 characters.");
  const row = ctx.db.walker.id.find(ctx.sender.toHexString());
  if (!row) throw new SenderError("Enter a room first.");
  requirePropertyVisit(ctx, row.property);
  const store = new TableStore(ctx),
    runtime = new WorldRuntime(store, now(ctx));
  const speaker = `player:${row.id}`;
  for (const old of store.interactions(speaker))
    store.removeInteraction(old.id);
  store.putInteraction({
    id: `speech:${store.nextSequence()}`,
    entity: speaker,
    room: row.room,
    property: row.property,
    slot: "",
    generation: 1,
    kind: "speech",
    text: a.text,
    expires: now(ctx) + 8,
  });
  for (const e of store.roomEntities(row.property, row.room))
    if (
      store
        .slots(e.id)
        .some(
          (s) =>
            s.enabled &&
            store.package(s.packageHash)!.manifest.handlers["speech:said"],
        )
    )
      runtime.enqueue(
        e.id,
        "speech",
        "said",
        { speaker: row.id, text: a.text },
        { kind: "player", id: row.id },
      );
  store.schedule();
});
export const publishTemplate = db.reducer(
  { property: t.string(), definition: t.string() },
  (ctx, a) => {
    const { property } = requirePropertyEdit(ctx, a.property);
    const definition = input<Pick<EntityTemplate, "components" | "bindings">>(
      a.definition,
    );
    const value = { ...definition, property: property.id };
    const template = { ...value, hash: sha256(canonical(value)) };
    const store = new TableStore(ctx);
    validateTemplate(template, (hash) => store.package(hash));
    for (const b of template.bindings)
      requireInstall(ctx, b.hash, property.community);
    if (!store.template(template.hash)) store.putTemplate(template);
  },
);
export const exportTemplate = db.procedure(
  { hash: t.string() },
  t.string(),
  (ctx, a) =>
    ctx.withTx((tx) => {
      const store = new TableStore(tx),
        template = store.template(a.hash);
      if (!template) throw new SenderError("Template unavailable.");
      const { property, principal } = requirePropertyEdit(
        tx,
        template.property,
      );
      const packages = [...new Set(template.bindings.map((b) => b.hash))].map(
        (hash) => {
          const pkg = store.package(hash)!;
          return registry(tx).get(
            { id: principal.identity, community: property.community },
            pkg.manifest.id,
            pkg.manifest.version,
          );
        },
      );
      return JSON.stringify({
        format: 2,
        components: template.components,
        bindings: template.bindings,
        packages,
      });
    }),
);
export const spawnTemplate = db.reducer(
  {
    property: t.string(),
    room: t.string(),
    hash: t.string(),
    id: t.string(),
    position: t.string(),
  },
  (ctx, a) => {
    const { property, principal } = requirePropertyEdit(ctx, a.property);
    const position = input<number[]>(a.position);
    validateComponent("transform", { position, rotation: [0, 0, 0] });
    const store = new TableStore(ctx);
    new WorldRuntime(store, now(ctx)).spawn(
      a.hash,
      a.id,
      {
        id: a.id,
        property: a.property,
        room: a.room,
        community: property.community,
        owner: principal.identity,
        generation: 1,
        revision: 1,
        enabled: true,
        components: {},
        publicState: {},
      },
      position,
    );
    store.schedule();
  },
);
function editEntity(
  ctx: Ctx,
  a: { id: string; revision: number; components: string },
  replace = false,
) {
  requireEntityEdit(ctx, a.id);
  const store = new TableStore(ctx),
    runtime = new WorldRuntime(store, now(ctx)),
    entity = runtime.requiredEntity(a.id);
  if (entity.revision !== a.revision)
    throw new SenderError("Entity changed; inspect and retry.");
  const patch = copyComponentData(input(a.components)) as RecordValue;
  for (const [key, value] of Object.entries(patch))
    validateComponent(key, value);
  const components = copyComponentData({
    ...(replace ? {} : entity.components),
    ...patch,
  }) as RecordValue;
  validateNavigationEdit(store, entity, { ...entity, components }, now(ctx));
  for (const slot of store.slots(entity.id))
    for (const resource of store.package(slot.packageHash)!.manifest.writes)
      if (
        !/^(public|variables|world)\./.test(resource) &&
        !(resource in components)
      )
        throw new SenderError(
          "Restore would remove a bound behavior resource.",
        );
  for (const op of store.operations(entity.id))
    if (
      Object.prototype.hasOwnProperty.call(patch, op.resource) &&
      canonical(patch[op.resource]) !==
        canonical(entity.components[op.resource])
    ) {
      store.removeOperation(op.id);
      runtime.enqueue(
        entity.id,
        "operation",
        "cancelled",
        { id: op.id, resource: op.resource, outcome: "cancelled" },
        { kind: "engine", id: "authoring" },
        op.slot,
        op.generation,
      );
    }
  const before = `${entity.id}/${entity.revision}`;
  if (!ctx.db.entityHistory.id.find(before))
    ctx.db.entityHistory.insert({
      id: before,
      entity: entity.id,
      revision: entity.revision,
      data: JSON.stringify(entity.components),
    });
  ctx.db.entityHistory.insert({
    id: `${entity.id}/${entity.revision + 1}`,
    entity: entity.id,
    revision: entity.revision + 1,
    data: JSON.stringify(components),
  });
  store.putEntity({ ...entity, components, revision: entity.revision + 1 });
  store.schedule();
}
export const updateEntity = db.reducer(
  { id: t.string(), revision: t.u32(), components: t.string() },
  editEntity,
);
export const restoreEntity = db.reducer(
  { id: t.string(), revision: t.u32(), sourceRevision: t.u32() },
  (ctx, a) => {
    requireEntityEdit(ctx, a.id);
    const source = ctx.db.entityHistory.id.find(`${a.id}/${a.sourceRevision}`);
    if (!source) throw new SenderError("Authored revision unavailable.");
    editEntity(
      ctx,
      { id: a.id, revision: a.revision, components: source.data },
      true,
    );
  },
);
export const entityHistory = db.procedure(
  { id: t.string() },
  t.string(),
  (ctx, a) =>
    ctx.withTx((tx) => {
      requireEntityEdit(tx, a.id);
      return JSON.stringify(
        [...tx.db.entityHistory.entity.filter(a.id)]
          .sort((a, b) => b.revision - a.revision)
          .slice(0, 50)
          .map((r) => ({
            revision: r.revision,
            components: JSON.parse(r.data),
          })),
      );
    }),
);
export const destroyEntity = db.reducer({ id: t.string() }, (ctx, a) => {
  requireEntityEdit(ctx, a.id);
  const store = new TableStore(ctx);
  new WorldRuntime(store, now(ctx)).destroy(a.id);
  store.schedule();
});
import { resolveTarget } from "../../shared/runtime/targeting";
export const answerDialog = db.reducer(
  { id: t.string(), choice: t.string() },
  (ctx, a) => {
    const row = ctx.db.interaction.id.find(a.id);
    if (!row) throw new SenderError("Dialogue is no longer available.");
    const record = JSON.parse(
      row.data,
    ) as import("../../shared/runtime/store").InteractionRecord;
    const store = new TableStore(ctx),
      slot = store.slot(record.slot);
    const walkerRow = ctx.db.walker.id.find(ctx.sender.toHexString());
    if (
      record.kind !== "dialog" ||
      record.player !== ctx.sender.toHexString() ||
      record.expires <= now(ctx) ||
      (!record.target &&
        (record.maxLength
          ? !a.choice.trim() || a.choice.length > record.maxLength
          : !record.choices?.includes(a.choice))) ||
      !slot?.enabled ||
      slot.generation !== record.generation ||
      walkerRow?.property !== record.property ||
      walkerRow.room !== record.room
    )
      throw new SenderError("Dialogue is no longer available.");
    requirePropertyVisit(ctx, record.property);
    const payload = checked(() =>
      record.target
        ? resolveTarget(store, record, a.choice, now(ctx))
        : record.maxLength
          ? { text: a.choice }
          : { choice: a.choice },
    );
    new WorldRuntime(store, now(ctx)).enqueue(
      record.entity,
      "dialog",
      record.name!,
      payload as import("../../shared/runtime/values").Value,
      { kind: "player", id: ctx.sender.toHexString() },
      slot.id,
      slot.generation,
    );
    store.removeInteraction(record.id);
    store.schedule();
  },
);
import {
  requireOperator,
  requireGateway,
  requireBuilder,
  requirePropertyEdit,
  requirePropertyVisit,
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
    roomFloor(ctx, `common:${a.communityId}`, "welcome", "Welcome", 16, 16);
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
      requirePropertyVisit(tx, a.property);
      const store = new TableStore(tx);
      const entities = [...tx.db.entity.property.filter(a.property)]
        .filter((row) => row.room === a.room)
        .map((row) => store.entity(row.id)!)
        .filter((e) => e.enabled);
      if (entities.length > 256)
        throw new SenderError("Preview supports up to 256 entities.");
      return JSON.stringify({
        serverTime: now(tx),
        interactions: [...tx.db.interaction.property.filter(a.property)]
          .map(
            (r) =>
              JSON.parse(
                r.data,
              ) as import("../../shared/runtime/store").InteractionRecord,
          )
          .filter((r) => r.room === a.room)
          .filter(
            (r) =>
              r.expires > now(tx) &&
              (!r.player || r.player === tx.sender.toHexString()),
          ),
        location: tx.db.walker.id.find(tx.sender.toHexString())
          ? JSON.parse(tx.db.walker.id.find(tx.sender.toHexString())!.data)
          : null,
        walkers: [...tx.db.walker.property.filter(a.property)]
          .filter((w) => w.room === a.room)
          .map((w) => ({
            ...JSON.parse(w.data),
            ...(tx.db.avatar.id.find(w.id)
              ? { character: JSON.parse(tx.db.avatar.id.find(w.id)!.data) }
              : {}),
          })),
        entities: entities
          .map((e) =>
            bindHomeSigns(e, (id) => tx.db.homeLink.entrance.find(id)?.name),
          )
          .map((e) =>
            presentEntity(
              {
                ...e,
                components: {
                  ...e.components,
                  ...(tx.db.homeLink.entrance.find(e.id)
                    ? { label: tx.db.homeLink.entrance.find(e.id)!.name }
                    : {}),
                },
              },
              store.operations(e.id),
              store
                .slots(e.id)
                .filter((s) => s.enabled && !s.lastError)
                .flatMap((s) =>
                  Object.entries(
                    store.package(s.packageHash)!.manifest.handlers,
                  )
                    .filter(
                      ([key, h]) =>
                        key.startsWith("action:") && h.input.type === "null",
                    )
                    .map(([key]) => key.slice(7)),
                )
                .concat(e.components.seat ? ["sit"] : [])
                .concat(
                  e.components.exit || tx.db.homeLink.entrance.find(e.id)
                    ? ["enter"]
                    : [],
                ),
            ),
          ),
      });
    }),
);
export const detachBehavior = db.reducer({ slot: t.string() }, (ctx, a) => {
  requireSlotEdit(ctx, a.slot);
  checked(() => {
    const store = new TableStore(ctx);
    new WorldRuntime(store, now(ctx)).detach(a.slot);
    store.schedule();
  });
});
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
        views: new TableStore(tx).views(a.id),
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

export const searchPackages = db.procedure(
  { community: t.string(), query: t.string(), after: t.string() },
  t.string(),
  (ctx, a) =>
    ctx.withTx((tx) => {
      const principal = requireBuilder(tx, a.community),
        actor = { id: principal.identity, community: a.community };
      if (a.query.length > 80 || a.after.length > 160)
        throw new SenderError("Invalid package search.");
      const accessible = new Set(
        [...tx.db.packageListing.iter()]
          .map((r) => JSON.parse(r.data) as RegistryEntry)
          .filter((entry) => entry.listed && registry(tx).canRead(actor, entry))
          .map((entry) => entry.id),
      );
      const matches = [...tx.db.packageRevision.iter()]
        .map(
          (row) =>
            JSON.parse(
              row.data,
            ) as import("../../shared/runtime/registry").Revision,
        )
        .filter(
          (r) =>
            accessible.has(r.id) &&
            r.key > a.after &&
            (r.id + " " + r.documentation)
              .toLowerCase()
              .includes(a.query.toLowerCase()),
        )
        .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
      const items = matches.slice(0, 50).map((r) => ({
        id: r.id,
        version: r.version,
        hash: r.hash,
        license: r.license,
        summary: r.documentation.slice(0, 300),
      }));
      return JSON.stringify({
        items,
        next: matches.length > 50 ? matches[49].key : null,
      });
    }),
);
