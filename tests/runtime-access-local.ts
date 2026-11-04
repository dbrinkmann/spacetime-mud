import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { DbConnection } from "../world-client/module_bindings/index.ts";
import { canonical, sha256 } from "../shared/runtime/digest.ts";
const cli =
  process.env.SPACETIME_CLI ??
  "D:\\dev\\personal\\scratch\\tools\\spacetimedb\\spacetimedb-cli.exe";
const database = "lantern-runtime-refactor",
  host = "http://127.0.0.1:3030",
  clients: DbConnection[] = [];
function call(name: string, ...args: unknown[]) {
  execFileSync(
    cli,
    [
      "call",
      database,
      name,
      ...args.map((a) => JSON.stringify(a)),
      "--server",
      host,
      "--no-config",
    ],
    { stdio: "pipe" },
  );
}
async function connect() {
  return new Promise<DbConnection>((resolve, reject) => {
    const timer = setTimeout(() => reject(Error("Connection timeout")), 10000);
    DbConnection.builder()
      .withUri(host)
      .withDatabaseName(database)
      .onConnect((c) => {
        clearTimeout(timer);
        clients.push(c);
        resolve(c);
      })
      .onConnectError((_c, e) => {
        clearTimeout(timer);
        reject(e);
      })
      .build();
  });
}
try {
  const [admin, member, agent] = await Promise.all([
    connect(),
    connect(),
    connect(),
  ]);
  const guild = Date.now().toString(),
    property = `common:${guild}`,
    id = `object${guild}`;
  call(
    "provision_community",
    guild,
    "Permission fixture",
    admin.identity!.toHexString(),
    "100",
  );
  call(
    "set_community_member",
    guild,
    member.identity!.toHexString(),
    "200",
    false,
    true,
  );
  const command = {
    id,
    property,
    room: "room",
    components: JSON.stringify({ light: { color: "#ffffff", intensity: 0 } }),
  };
  await assert.rejects(member.reducers.createEntity(command), /denied/i);
  await assert.rejects(
    agent.reducers.createEntity(command),
    /membership|grant/i,
  );
  await admin.reducers.authorizeCommunityAgent({
    communityId: guild,
    agent: agent.identity!,
    commonSpace: false,
  });
  await assert.rejects(agent.reducers.createEntity(command), /denied/i);
  await admin.reducers.authorizeCommunityAgent({
    communityId: guild,
    agent: agent.identity!,
    commonSpace: true,
  });
  await agent.reducers.createEntity(command);
  const manifest = {
    id: `package${guild}`,
    version: "1.0.0",
    apiVersion: 2,
    stateVersion: 1,
    config: { type: "object", properties: {} },
    state: { type: "object", properties: {} },
    initialState: {},
    writes: ["light"],
    handlers: {
      "lifecycle:activated": { handler: "on_start", input: { type: "null" } },
    },
  };
  const source =
      'function on_start(ctx){ctx.components.set("light",{color:"#ff9900",intensity:3});}',
    hash = sha256(canonical({ source, manifest }));
  await agent.reducers.publishPackage({
    community: guild,
    visibility: "private",
    bundle: JSON.stringify({
      format: 2,
      source,
      manifest,
      hash,
      license: "MIT",
      documentation: "Permission fixture",
    }),
  });
  await agent.reducers.attachBehavior({
    entity: id,
    slot: "light",
    hash,
    config: "{}",
  });
  let state: any;
  for (let i = 0; i < 50; i++) {
    state = JSON.parse(await admin.procedures.inspectEntity({ id }));
    if (state.entity.components.light.intensity === 3) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.equal(state.entity.components.light.intensity, 3);
  await assert.rejects(member.procedures.inspectEntity({ id }), /denied/i);
  call(
    "set_community_member",
    guild,
    admin.identity!.toHexString(),
    "100",
    false,
    true,
  );
  await assert.rejects(
    agent.reducers.createEntity({ ...command, id: `denied${guild}` }),
    /denied/i,
  );
  call(
    "set_community_member",
    guild,
    admin.identity!.toHexString(),
    "100",
    true,
    true,
  );
  await admin.reducers.revokeCommunityAgent({
    communityId: guild,
    agent: agent.identity!,
  });
  await assert.rejects(
    agent.reducers.createEntity({ ...command, id: `revoked${guild}` }),
    /membership|grant/i,
  );
  state = JSON.parse(await admin.procedures.inspectEntity({ id }));
  assert.equal(
    state.slots[0].enabled,
    true,
    "Authoring revocation must not stop approved installed execution",
  );
  console.log(
    JSON.stringify({
      guild,
      result:
        "verified member, delegated common-space grant, package ownership, admin downgrade, revocation and installed-grant separation passed",
    }),
  );
} finally {
  clients.forEach((c) => c.disconnect());
}
