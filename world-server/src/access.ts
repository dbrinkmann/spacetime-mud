import { SenderError } from "spacetimedb/server";
import { type Ctx, now } from "./schema";
import {
  builderPrincipal,
  canEditProperty,
  type Membership,
} from "../../shared/runtime/permissions";
type AccessContext = Pick<Ctx, "sender" | "db">;
export function isOperator(ctx: AccessContext) {
  return (
    ctx.db.authority.key.find("operator")?.identity.equals(ctx.sender) ?? false
  );
}
export function requireOperator(ctx: AccessContext) {
  if (!isOperator(ctx)) throw new SenderError("Operator required.");
}
export function requireGateway(ctx: AccessContext) {
  if (
    !isOperator(ctx) &&
    !ctx.db.authority.key.find("gateway")?.identity.equals(ctx.sender)
  )
    throw new SenderError("Authentication authority required.");
}
export const memberKey = (community: string, identity: string) =>
  `${community}:${identity}`;
export function requireBuilder(ctx: Ctx, community: string) {
  if (!ctx.db.community.id.find(community))
    throw new SenderError("Community unavailable.");
  const actor = ctx.sender.toHexString();
  if (isOperator(ctx))
    return {
      identity: actor,
      community,
      admin: true,
      active: true,
      validUntil: now(ctx) + 1,
    } satisfies Membership;
  const paired = ctx.db.builderGrant.key.find(memberKey(community, actor));
  const principal = builderPrincipal(
    actor,
    community,
    now(ctx),
    (id) => {
      const member = ctx.db.membership.key.find(memberKey(community, id));
      return member
        ? { ...member, identity: member.identity.toHexString() }
        : undefined;
    },
    paired
      ? {
          ...paired,
          agent: paired.agent.toHexString(),
          owner: paired.owner.toHexString(),
        }
      : undefined,
  );
  if (!principal)
    throw new SenderError(
      "Verified membership or a current builder grant is required.",
    );
  return principal;
}
export function requirePropertyEdit(ctx: Ctx, id: string) {
  const property = ctx.db.propertyAuthority.id.find(id);
  if (!property) throw new SenderError("Property unavailable.");
  const principal = requireBuilder(ctx, property.community);
  if (
    !isOperator(ctx) &&
    !canEditProperty(principal, {
      ...property,
      owner: property.owner.toHexString(),
    })
  )
    throw new SenderError("Property edit denied.");
  return { property, principal };
}
export function requireEntityEdit(ctx: Ctx, id: string) {
  const entity = ctx.db.entity.id.find(id);
  if (!entity) throw new SenderError("Entity unavailable.");
  return requirePropertyEdit(ctx, entity.property);
}
export function requireSlotEdit(ctx: Ctx, id: string) {
  const slot = ctx.db.slot.id.find(id);
  if (!slot) throw new SenderError("Slot unavailable.");
  return requireEntityEdit(ctx, slot.entity);
}
export function grantInstalled(
  ctx: Ctx,
  slot: string,
  property: string,
  hash: string,
) {
  const authority = ctx.db.propertyAuthority.id.find(property)!;
  const pkg = ctx.db.behaviorPackage.hash.find(hash)!;
  const manifest = JSON.parse(pkg.data).manifest;
  const row = {
    slot,
    property,
    revision: authority.revision,
    active: true,
    resources: JSON.stringify([...manifest.writes, ...(manifest.reads ?? [])]),
  };
  if (ctx.db.installedGrant.slot.find(slot))
    ctx.db.installedGrant.slot.update(row);
  else ctx.db.installedGrant.insert(row);
}
