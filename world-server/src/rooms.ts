import { t, SenderError } from "spacetimedb/server";
import { db, now, type Ctx } from "./schema";
import {
  requirePropertyEdit,
  requirePropertyVisit,
  requireBuilder,
} from "./access";
import { WorldRuntime } from "../../spacetimedb/src/runtime/engine";
import { TableStore } from "./store";
import { sha256 } from "../../shared/runtime/digest";
import { identifier } from "../../shared/runtime/values";
import { navigationScene, type Walker } from "../../shared/runtime/walking";
import { scheduleSpatial } from "./schedule-spatial";
function moveOccupants(
  ctx: Ctx,
  property: string,
  room: string,
  destination: { property: string; room: string },
) {
  const store = new TableStore(ctx),
    nav = navigationScene(
      store.roomEntities(destination.property, destination.room),
    );
  for (const row of ctx.db.walker.property.filter(property))
    if (row.room === room) {
      const w = JSON.parse(row.data) as Walker,
        arrival = ctx.db.walkArrival.walker.find(row.id);
      if (arrival) ctx.db.walkArrival.scheduledId.delete(arrival.scheduledId);
      ctx.db.walker.id.update({
        ...row,
        ...destination,
        data: JSON.stringify({
          ...w,
          ...destination,
          seat: undefined,
          action: undefined,
          walk: { start: nav.spawn, points: [], started: now(ctx), speed: 2.5 },
        }),
      });
    }
  scheduleSpatial(ctx, property, room);
  scheduleSpatial(ctx, destination.property, destination.room);
}
/** Remove incoming native links across the community, including links from other homes. */
function unlinkDestination(
  ctx: Ctx,
  store: TableStore,
  community: string,
  property: string,
  room?: string,
) {
  for (const authority of ctx.db.propertyAuthority.community.filter(community))
    for (const row of ctx.db.entity.property.filter(authority.id)) {
      const entity = store.entity(row.id)!;
      const exit = entity.components.exit as
        { property: string; room: string } | undefined;
      if (
        entity.enabled &&
        exit?.property === property &&
        (room === undefined || exit.room === room)
      ) {
        delete entity.components.exit;
        store.putEntity({ ...entity, revision: entity.revision + 1 });
      }
    }
}
export const deleteRoom = db.reducer(
  { property: t.string(), room: t.string(), destination: t.string() },
  (ctx, a) => {
    const { property } = requirePropertyEdit(ctx, a.property);
    if (
      a.room === a.destination ||
      (property.common && a.room === "welcome") ||
      (!property.common && a.room === "home")
    )
      throw new SenderError(
        "Keep the property's entry room; choose a different destination.",
      );
    const store = new TableStore(ctx),
      entities = store.roomEntities(a.property, a.room);
    if (!entities.some((e) => e.components.walkSurface))
      throw new SenderError("Room unavailable.");
    if (entities.some((e) => ctx.db.homeLink.entrance.find(e.id)))
      throw new SenderError("Move or remove the attached homes first.");
    moveOccupants(ctx, a.property, a.room, {
      property: a.property,
      room: a.destination,
    });
    const runtime = new WorldRuntime(store, now(ctx));
    for (const row of ctx.db.entity.property.filter(a.property)) {
      const e = store.entity(row.id)!,
        exit = e.components.exit as
          { property: string; room: string } | undefined;
      if (e.enabled && e.room === a.room) runtime.destroy(e.id);
      else if (
        e.enabled &&
        exit?.property === a.property &&
        exit.room === a.room
      ) {
        delete e.components.exit;
        store.putEntity({ ...e, revision: e.revision + 1 });
      }
    }
    unlinkDestination(ctx, store, property.community, a.property, a.room);
    store.schedule();
  },
);
export const deleteHome = db.reducer({ property: t.string() }, (ctx, a) => {
  const { property } = requirePropertyEdit(ctx, a.property);
  const link = ctx.db.homeLink.property.find(a.property);
  if (!link) throw new SenderError("Home unavailable.");
  const store = new TableStore(ctx),
    entrance = store.entity(link.entrance);
  if (!entrance?.enabled) throw new SenderError("Home entrance unavailable.");
  const entities = [...ctx.db.entity.property.filter(a.property)].map((r) =>
    store.entity(r.id)!,
  );
  for (const room of new Set(
    entities.filter((e) => e.enabled).map((e) => e.room),
  ))
    moveOccupants(ctx, a.property, room, {
      property: entrance.property,
      room: entrance.room,
    });
  const runtime = new WorldRuntime(store, now(ctx));
  for (const e of entities) if (e.enabled) runtime.destroy(e.id);
  unlinkDestination(ctx, store, property.community, a.property);
  ctx.db.homeLink.entrance.delete(link.entrance);
  ctx.db.propertyAuthority.id.delete(a.property);
  store.schedule();
});

export function roomFloor(
  ctx: Ctx,
  property: string,
  room: string,
  name: string,
  width: number,
  depth: number,
) {
  identifier(room);
  if (
    !name.trim() ||
    name.length > 80 ||
    !Number.isFinite(width) ||
    !Number.isFinite(depth) ||
    width < 4 ||
    depth < 4 ||
    width > 100 ||
    depth > 100
  )
    throw new SenderError("Invalid room definition.");
  const authority = ctx.db.propertyAuthority.id.find(property)!;
  const store = new TableStore(ctx);
  if (store.roomEntities(property, room).some((e) => e.components.walkSurface))
    throw new SenderError("Room already exists.");
  new WorldRuntime(store, now(ctx)).create({
    id: `floor${sha256(`${property}:${room}:${store.nextSequence()}`).slice(0, 40)}`,
    property,
    room,
    community: authority.community,
    owner: authority.owner.toHexString(),
    generation: 1,
    revision: 1,
    enabled: true,
    publicState: { name },
    components: {
      walkSurface: { width, depth, spawn: [0, 0, 0] },
      transform: { position: [0, -0.1, 0], rotation: [0, 0, 0] },
      visual: {
        boxes: [
          {
            position: [0, 0, 0],
            size: [width, 0.2, depth],
            color: "#46525c",
            material: "concrete",
          },
        ],
      },
    },
  });
}
export const createRoom = db.reducer(
  {
    property: t.string(),
    room: t.string(),
    name: t.string(),
    width: t.f64(),
    depth: t.f64(),
  },
  (ctx, a) => {
    requirePropertyEdit(ctx, a.property);
    roomFloor(ctx, a.property, a.room, a.name, a.width, a.depth);
  },
);
export const claimHome = db.reducer(
  { entrance: t.string(), name: t.string() },
  (ctx, a) => {
    const store = new TableStore(ctx),
      entrance = store.entity(a.entrance);
    if (
      !entrance?.enabled ||
      !entrance.components.homeEntrance ||
      !entrance.components.interaction
    )
      throw new SenderError("Home entrance unavailable.");
    const common = requirePropertyVisit(ctx, entrance.property);
    if (!common.common || ctx.db.homeLink.entrance.find(a.entrance))
      throw new SenderError(
        "Entrance is already claimed or not in common space.",
      );
    const member = ctx.db.membership.key.find(
      `${common.community}:${ctx.sender.toHexString()}`,
    );
    if (!member?.active || member.validUntil <= now(ctx))
      throw new SenderError("A member must claim their own home.");
    if (!a.name.trim() || a.name.length > 80)
      throw new SenderError("Invalid home name.");
    if (
      [...ctx.db.homeLink.community.filter(common.community)].some((h) =>
        h.owner.equals(ctx.sender),
      )
    )
      throw new SenderError("You already have a home.");
    const property = `home${sha256(`${common.community}:${ctx.sender.toHexString()}:${store.nextSequence()}`).slice(0, 40)}`;
    ctx.db.propertyAuthority.insert({
      id: property,
      community: common.community,
      owner: ctx.sender,
      common: false,
      revision: 1,
    });
    ctx.db.homeLink.insert({
      entrance: a.entrance,
      property,
      community: common.community,
      owner: ctx.sender,
      name: a.name,
    });
    roomFloor(ctx, property, "home", a.name, 10, 10);
    new WorldRuntime(store, now(ctx)).create({
      id: `return${sha256(property).slice(0, 40)}`,
      property,
      room: "home",
      community: common.community,
      owner: ctx.sender.toHexString(),
      generation: 1,
      revision: 1,
      enabled: true,
      publicState: { name: "Return" },
      components: {
        transform: { position: [0, 0, -4], rotation: [0, 0, 0] },
        visual: {
          boxes: [
            {
              position: [0, 1.2, 0],
              size: [1, 2.4, 0.2],
              color: "#708087",
              material: "metal",
            },
          ],
        },
        interaction: { approach: [0, 0, 1] },
        exit: { property: entrance.property, room: entrance.room },
      },
    });
  },
);
export const renameHome = db.reducer(
  { property: t.string(), name: t.string() },
  (ctx, a) => {
    requirePropertyEdit(ctx, a.property);
    const home = ctx.db.homeLink.property.find(a.property);
    if (!home || !a.name.trim() || a.name.length > 80)
      throw new SenderError("Invalid home.");
    ctx.db.homeLink.entrance.update({ ...home, name: a.name });
  },
);
export const listWorld = db.procedure(
  { community: t.string() },
  t.string(),
  (ctx, a) =>
    ctx.withTx((tx) => {
      requireBuilder(tx, a.community);
      const properties = [
        ...tx.db.propertyAuthority.community.filter(a.community),
      ];
      const rooms = properties.flatMap((p) =>
        [...tx.db.entity.property.filter(p.id)]
          .map((r) => JSON.parse(r.data))
          .filter((e) => e.enabled && e.components.walkSurface)
          .map((e) => ({
            property: p.id,
            room: e.room,
            name: e.publicState.name ?? e.room,
            common: p.common,
          })),
      );
      return JSON.stringify({
        rooms,
        exits: properties.flatMap((p) =>
          [...tx.db.entity.property.filter(p.id)]
            .map((r) => JSON.parse(r.data))
            .filter((e) => e.enabled && e.components.exit)
            .map((e) => ({
              from: { property: p.id, room: e.room },
              to: e.components.exit,
            })),
        ),
        homes: [...tx.db.homeLink.community.filter(a.community)].map((h) => ({
          property: h.property,
          name: h.name,
          entrance: h.entrance,
        })),
        location: tx.db.walker.id.find(tx.sender.toHexString())
          ? JSON.parse(tx.db.walker.id.find(tx.sender.toHexString())!.data)
          : null,
      });
    }),
);
