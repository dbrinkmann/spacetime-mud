import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { connect, until, host, database } from "./connect.ts";
import { emptyRoom } from "../shared/world.ts";
import { sampleMotion } from "../shared/world.ts";
import { routineMotion } from "../shared/community-motion.ts";

const clients = await Promise.all([connect(), connect(), connect(), connect()]);
const [admin, alice, bob, outsider] = clients.map((x) => x.c);
const tables = [
  "my_communities",
  "my_community_roles",
  "community_properties",
  "community_rooms",
  "community_exits",
  "community_characters",
  "community_history",
];
const op = (name: string, ...args: unknown[]) =>
  execFileSync(
    process.env.SPACETIME_CLI ?? "spacetimedb-cli",
    [
      "call",
      "--no-config",
      database,
      name,
      ...args.map((x) => JSON.stringify(x)),
      "--server",
      host,
    ],
    { encoding: "utf8", stdio: "pipe", windowsHide: true },
  );
const guild = String(Date.now());
const other = String(BigInt(guild) + 1n);
try {
  await Promise.all(
    clients.map(
      ({ c }) =>
        new Promise<void>((resolve, reject) =>
          c
            .subscriptionBuilder()
            .onApplied(() => resolve())
            .onError(reject)
            .subscribe(tables.map((t) => `SELECT * FROM ${t}`)),
        ),
    ),
  );
  await assert.rejects(
    alice.reducers.provisionCommunity({
      communityId: guild,
      name: "Forged",
      admin: alice.identity!,
      discordUserId: "1",
    }),
    /authority/,
  );
  op(
    "provision_community",
    guild,
    "Test village",
    admin.identity!.toHexString(),
    "1",
  );
  op(
    "provision_community",
    other,
    "Other village",
    outsider.identity!.toHexString(),
    "4",
  );
  for (const [c, user] of [
    [alice, "2"],
    [bob, "3"],
  ] as const)
    op(
      "set_community_member",
      guild,
      c.identity!.toHexString(),
      user,
      false,
      true,
    );
  await until(() => alice.db.myCommunities.count() === 1n);
  await until(() => admin.db.myCommunities.count() === 1n);
  assert.equal(outsider.db.myCommunities.id.find(guild), null);
  const welcome = alice.db.myCommunities.id.find(guild)!.welcomeRoom;
  await Promise.all(
    [admin, alice, bob].map((c, i) =>
      c.reducers.enterCommunity({ communityId: guild, name: `Member ${i}` }),
    ),
  );
  await assert.rejects(
    outsider.reducers.enterCommunity({ communityId: guild, name: "Intruder" }),
    /membership/,
  );
  await Promise.all(
    [alice, bob].map((c, i) =>
      c.reducers.claimHome({ commonRoomId: welcome, name: `Home ${i}` }),
    ),
  );
  await until(() => alice.db.communityProperties.count() === 3n);
  const a = [...alice.db.communityProperties.iter()].find(
    (p) => !p.common && p.owner.equals(alice.identity!),
  )!;
  const b = [...alice.db.communityProperties.iter()].find(
    (p) => !p.common && p.owner.equals(bob.identity!),
  )!;
  assert.notEqual(a.id, b.id);
  assert.equal(
    [...alice.db.communityExits.iter()].filter((e) => e.fromRoom === welcome)
      .length,
    2,
  );
  await assert.rejects(
    alice.reducers.claimHome({ commonRoomId: welcome, name: "Second" }),
    /already/,
  );
  await assert.rejects(
    alice.reducers.addPropertyRoom({
      fromRoomId: welcome,
      name: "No",
      label: "No",
      backLabel: "No",
    }),
    /cannot edit/,
  );
  await assert.rejects(
    alice.reducers.addPropertyRoom({
      fromRoomId: b.entrance,
      name: "No",
      label: "No",
      backLabel: "No",
    }),
    /cannot edit/,
  );
  await alice.reducers.addPropertyRoom({
    fromRoomId: a.entrance,
    name: "Study",
    label: "Up to study",
    backLabel: "Down to home",
  });
  await alice.reducers.addPropertyRoom({
    fromRoomId: a.entrance,
    name: "Garden",
    label: "Garden gate",
    backLabel: "Inside",
  });
  await until(
    () =>
      [...alice.db.communityRooms.iter()].filter((r) => r.propertyId === a.id)
        .length === 3,
  );
  const scene = JSON.stringify(emptyRoom("Alice's room"));
  await assert.rejects(
    bob.reducers.publishCommunityRoom({
      roomId: a.entrance,
      source: scene,
      baseRevision: 0,
    }),
    /cannot edit/,
  );
  await alice.reducers.publishCommunityRoom({
    roomId: a.entrance,
    source: scene,
    baseRevision: 0,
  });
  await assert.rejects(
    alice.reducers.publishCommunityRoom({
      roomId: a.entrance,
      source: scene,
      baseRevision: 0,
    }),
    /changed/,
  );
  await until(() => alice.db.communityHistory.count() === 1n);
  await alice.reducers.restoreCommunityRoom({
    revisionId: [...alice.db.communityHistory.iter()][0].id,
    baseRevision: 1,
  });
  await until(
    () => alice.db.communityRooms.id.find(a.entrance)?.revision === 2,
  );
  assert.equal(
    alice.db.communityCharacters.key.find(
      `${guild}:${alice.identity!.toHexString()}`,
    )?.roomId,
    a.entrance,
  );
  await alice.reducers.returnToWelcome({ communityId: guild });
  const bDoor = [...alice.db.communityExits.iter()].find(
    (e) => e.fromRoom === welcome && e.homeProperty === b.id,
  )!;
  await alice.reducers.travelCommunity({ exitId: bDoor.id });
  await assert.rejects(
    alice.reducers.travelCommunity({ exitId: bDoor.id }),
    /at this entrance/,
  );
  const returnDoor = [...alice.db.communityExits.iter()].find(
    (e) => e.id === bDoor.reverseId,
  )!;
  await alice.reducers.travelCommunity({ exitId: returnDoor.id });
  await assert.rejects(
    alice.reducers.setWelcomeRoom({ roomId: a.entrance }),
    /administrator/,
  );
  await assert.rejects(
    admin.reducers.setWelcomeRoom({ roomId: a.entrance }),
    /common space/,
  );
  await admin.reducers.addPropertyRoom({
    fromRoomId: welcome,
    name: "Square",
    label: "Square",
    backLabel: "Welcome",
  });
  await until(() =>
    [...admin.db.communityRooms.iter()].some((r) => r.name === "Square"),
  );
  const square = [...admin.db.communityRooms.iter()].find(
    (r) => r.name === "Square",
  )!;
  await admin.reducers.setWelcomeRoom({ roomId: square.id });
  await alice.reducers.returnToWelcome({ communityId: guild });
  await until(
    () =>
      alice.db.communityCharacters.key.find(
        `${guild}:${alice.identity!.toHexString()}`,
      )?.roomId === square.id,
  );
  op(
    "set_community_member",
    guild,
    alice.identity!.toHexString(),
    "2",
    false,
    false,
  );
  await until(
    () => alice.db.communityRooms.count() === 0n,
    "revocation removes subscriptions",
  );
  assert.equal(alice.db.myCommunities.count(), 0n);
  assert.equal(alice.db.communityHistory.count(), 0n);
  await assert.rejects(
    alice.reducers.returnToWelcome({ communityId: guild }),
    /membership/,
  );
  await assert.rejects(
    alice.reducers.publishCommunityRoom({
      roomId: a.entrance,
      source: scene,
      baseRevision: 2,
    }),
    /membership/,
  );
  assert.throws(
    () =>
      op(
        "set_community_member",
        guild,
        outsider.identity!.toHexString(),
        "2",
        false,
        true,
      ),
    /already has/,
  );
  assert.throws(
    () =>
      op(
        "set_community_member",
        guild,
        alice.identity!.toHexString(),
        "99",
        false,
        true,
      ),
    /bound/,
  );
  await bob.reducers.setHomeRoutine({
    communityId: guild,
    points: JSON.stringify([
      [1, 0, 3],
      [1, 0, 2],
    ]),
  });
  await bob.reducers.returnToWelcome({ communityId: guild });
  bob.disconnect();
  const bobKey = `${guild}:${bob.identity!.toHexString()}`;
  await until(
    () => admin.db.communityCharacters.key.find(bobKey)?.away,
    "away grace and home routine",
    15000,
  );
  const away = admin.db.communityCharacters.key.find(bobKey)!;
  assert.equal(away.roomId, b.entrance);
  assert(JSON.parse(away.path).length > 2);
  const next = await connect(clients[2].token);
  clients.push(next);
  const now = Number(await admin.procedures.serverTime({})) / 1000;
  const expected = sampleMotion(
    routineMotion(
      {
        path: JSON.parse(away.path),
        started: Number(away.startedAt.microsSinceUnixEpoch) / 1000,
        seat: "",
        pose: "idle",
        yaw: 0,
      },
      now,
    ),
    emptyRoom(),
    now,
  ).position;
  await next.c.reducers.enterCommunity({
    communityId: guild,
    name: "Unused existing name",
  });
  await until(() => !admin.db.communityCharacters.key.find(bobKey)?.away);
  const returned = admin.db.communityCharacters.key.find(bobKey)!;
  assert.equal(returned.roomId, away.roomId);
  const actual = JSON.parse(returned.path)[0];
  assert(Math.hypot(expected[0] - actual[0], expected[2] - actual[2]) < 0.5);
  const secondTab = await connect(clients[2].token);
  clients.push(secondTab);
  await secondTab.c.reducers.enterCommunity({
    communityId: guild,
    name: "Unused",
  });
  await assert.rejects(
    next.c.reducers.moveCommunityCharacter({
      communityId: guild,
      x: 0,
      z: 3,
      seat: "",
      pose: "idle",
    }),
    /Another session/,
  );
  secondTab.c.disconnect();
  await until(
    () =>
      admin.db.communityCharacters.key.find(bobKey)?.controller ===
      next.c.connectionId.toHexString(),
  );
  await next.c.reducers.moveCommunityCharacter({
    communityId: guild,
    x: 0,
    z: 3,
    seat: "",
    pose: "idle",
  });
  console.log(
    "Community integration passed: isolation, ownership, concurrent claims, named travel, welcome, restore, revocation, away routine, takeover, multiple tabs.",
  );
} finally {
  for (const { c } of clients) c.disconnect();
}
