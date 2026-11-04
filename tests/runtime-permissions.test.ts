import { test } from "node:test";
import assert from "node:assert/strict";
import {
  builderPrincipal,
  canEditProperty,
  canExecuteInstalled,
  type Membership,
} from "../shared/runtime/permissions.ts";
test("builder delegation follows current membership and cannot manufacture common-space authority", () => {
  let member: Membership = {
    identity: "alice",
    community: "guild",
    active: true,
    admin: false,
    validUntil: 180,
  };
  const read = (id: string) => (id === "alice" ? member : undefined);
  const grant = {
    agent: "agent",
    owner: "alice",
    community: "guild",
    commonSpace: true,
  };
  const common = {
    id: "commons",
    community: "guild",
    owner: "alice",
    common: true,
    revision: 1,
  };
  assert.equal(
    canEditProperty(
      builderPrincipal("agent", "guild", 10, read, grant),
      common,
    ),
    false,
  );
  member = { ...member, admin: true };
  assert.equal(
    canEditProperty(
      builderPrincipal("agent", "guild", 10, read, grant),
      common,
    ),
    true,
  );
  assert.equal(
    canEditProperty(
      builderPrincipal("agent", "guild", 10, read, {
        ...grant,
        commonSpace: false,
      }),
      common,
    ),
    false,
  );
  assert.equal(builderPrincipal("agent", "other", 10, read, grant), undefined);
  assert.equal(builderPrincipal("agent", "guild", 200, read, grant), undefined);
  member = { ...member, active: false };
  assert.equal(builderPrincipal("agent", "guild", 10, read, grant), undefined);
});
test("installed runtime grants are durable property capabilities, independent of builder leases", () => {
  const property = {
    id: "home",
    community: "guild",
    owner: "alice",
    common: false,
    revision: 1,
  };
  const grant = {
    slot: "lamp:light",
    property: "home",
    revision: 1,
    active: true,
    resources: ["light"],
  };
  assert.equal(
    canExecuteInstalled(grant, property, "lamp:light", ["light"]),
    true,
  );
  assert.equal(
    canExecuteInstalled(grant, property, "lamp:light", ["transform"]),
    false,
  );
  assert.equal(
    canExecuteInstalled({ ...grant, active: false }, property, "lamp:light", [
      "light",
    ]),
    false,
  );
  assert.equal(
    canExecuteInstalled(grant, { ...property, revision: 2 }, "lamp:light", [
      "light",
    ]),
    false,
  );
});
