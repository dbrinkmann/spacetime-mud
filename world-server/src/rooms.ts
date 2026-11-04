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
    id: `floor${sha256(`${property}:${room}`).slice(0, 40)}`,
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
    const property = `home${sha256(`${common.community}:${ctx.sender.toHexString()}`).slice(0, 40)}`;
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
