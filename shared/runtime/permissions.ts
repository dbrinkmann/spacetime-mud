export type Membership = {
  identity: string;
  community: string;
  active: boolean;
  admin: boolean;
  validUntil: number;
};
export type BuilderGrant = {
  agent: string;
  owner: string;
  community: string;
  commonSpace: boolean;
};
export type PropertyAuthority = {
  id: string;
  community: string;
  owner: string;
  common: boolean;
  revision: number;
};
export type InstalledGrant = {
  slot: string;
  property: string;
  revision: number;
  active: boolean;
  resources: string[];
};
export function builderPrincipal(
  actor: string,
  community: string,
  now: number,
  membership: (identity: string) => Membership | undefined,
  grant?: BuilderGrant,
) {
  const valid = (m: Membership | undefined) =>
    m?.active && m.community === community && m.validUntil > now
      ? m
      : undefined;
  const direct = valid(membership(actor));
  if (direct) return direct;
  if (!grant || grant.agent !== actor || grant.community !== community)
    return undefined;
  const owner = valid(membership(grant.owner));
  return owner
    ? { ...owner, admin: owner.admin && grant.commonSpace }
    : undefined;
}
export function canEditProperty(
  principal: Membership | undefined,
  property: PropertyAuthority,
) {
  return (
    !!principal &&
    principal.community === property.community &&
    (property.common ? principal.admin : principal.identity === property.owner)
  );
}
export function canExecuteInstalled(
  grant: InstalledGrant | undefined,
  property: PropertyAuthority | undefined,
  slot: string,
  resources: string[],
) {
  return (
    !!grant &&
    !!property &&
    grant.active &&
    grant.slot === slot &&
    grant.property === property.id &&
    grant.revision === property.revision &&
    resources.every((r) => grant.resources.includes(r))
  );
}
