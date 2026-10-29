import assert from "node:assert/strict";
import { connect, until, host, database } from "./connect.ts";

const clients: Awaited<ReturnType<typeof connect>>[] = [];
const open = async (token?: string) => {
  const x = await connect(token);
  clients.push(x);
  return x;
};
const suffix = Date.now().toString(36);
try {
  const a = await open(),
    b = await open(),
    spy = await open(),
    bridge = await open();
  const ai = a.c.identity!,
    bi = b.c.identity!;
  await assert.rejects(() => a.c.reducers.go({ direction: "north" }));
  await a.c.reducers.createPlayer({ name: `Alice ${suffix}` });
  await b.c.reducers.createPlayer({ name: `Bob ${suffix}` });
  await spy.c.reducers.createPlayer({ name: `Spy ${suffix}` });
  await assert.rejects(() =>
    bridge.c.reducers.createPlayer({ name: `alice ${suffix}` }),
  );
  await until(() => b.c.db.player.identity.find(ai), "replicated player");
  const root = a.c.db.room.id.find(1n)!;
  assert.ok(root);
  const free = ["north", "south", "east", "west", "up", "down"].find(
    (d) => !root.exits.some((e) => e.direction === d),
  );
  assert.ok(
    free,
    "Run tests on a fresh database (all Nexus exits are occupied).",
  );
  await a.c.reducers.buildRoom({
    direction: free,
    name: `Garden ${suffix}`,
    description: "A moonlit garden built during integration testing.",
  });
  await until(
    () => [...b.c.db.room.iter()].find((r) => r.name === `Garden ${suffix}`),
    "room sync",
  );
  const garden = [...a.c.db.room.iter()].find(
    (r) => r.name === `Garden ${suffix}`,
  )!;
  assert.equal(garden.exits[0].destination, 1n);
  const count = a.c.db.room.count();
  await assert.rejects(() =>
    b.c.reducers.buildRoom({
      direction: free,
      name: "Collision",
      description: "Must not exist.",
    }),
  );
  assert.equal(a.c.db.room.count(), count);
  const badDirection = ["north", "south", "east", "west", "up", "down"].find(
    (d) => d !== free && !root.exits.some((e) => e.direction === d),
  );
  if (badDirection) {
    await assert.rejects(() =>
      a.c.reducers.buildRoom({
        direction: badDirection,
        name: "",
        description: "Invalid",
      }),
    );
    assert.equal(a.c.db.room.count(), count);
    assert.ok(
      !a.c.db.room.id.find(1n)!.exits.some((e) => e.direction === badDirection),
    );
  }
  await a.c.reducers.go({ direction: free });
  await until(
    () => b.c.db.player.identity.find(ai)?.roomId === garden.id,
    "movement",
  );
  assert.equal(
    b.c.db.player.identity.find(bi)!.roomId,
    1n,
    "cannot move another player",
  );
  await a.c.reducers.go({ direction: garden.exits[0].direction });
  assert.equal(a.c.db.player.identity.find(ai)!.roomId, 1n);
  await a.c.reducers.say({ message: `Hello ${suffix}` });
  await until(
    () => [...b.c.db.chat.iter()].some((c) => c.text === `Hello ${suffix}`),
    "chat sync",
  );
  await a.c.reducers.tell({
    target: `Bob ${suffix}`,
    message: "Private secret",
  });
  await until(
    () => [...b.c.db.myInbox.iter()].some((m) => m.text === "Private secret"),
    "private message",
  );
  assert.equal(spy.c.db.myInbox.count(), 0n);
  assert.equal(bridge.c.db.myInbox.count(), 0n);
  await assert.rejects(() =>
    a.c.reducers.requestAgent({ prompt: "Create a room north" }),
  );
  await a.c.reducers.consent({ bridge: bridge.c.identity! });
  await a.c.reducers.requestAgent({
    prompt: "Create a character named Keeper",
  });
  await until(
    () => bridge.c.db.agentJobs.count() === 1n,
    "authorized bridge job visibility",
  );
  assert.equal(spy.c.db.agentJobs.count(), 0n);
  assert.equal(spy.c.db.myJobs.count(), 0n);
  const j = [...bridge.c.db.agentJobs.iter()][0];
  await assert.rejects(() => spy.c.reducers.claimJob({ id: j.id }));
  await bridge.c.reducers.claimJob({ id: j.id });
  const proposal = {
    id: j.id,
    kind: "npc",
    direction: "",
    name: `Keeper ${suffix}`,
    description: "A patient traveler.",
    biography: "Remembers every traveler who passes.",
    message: "The keeper arrives.",
  };
  await bridge.c.reducers.completeJob(proposal);
  await until(
    () => [...b.c.db.npc.iter()].some((n) => n.name === proposal.name),
    "NPC sync",
  );
  await assert.rejects(() => bridge.c.reducers.completeJob(proposal));
  await new Promise((r) => setTimeout(r, 2100));
  await a.c.reducers.tell({
    target: proposal.name,
    message: "What do you remember?",
  });
  await until(
    () => [...bridge.c.db.agentJobs.iter()].some((j) => j.status === "pending"),
    "NPC job",
  );
  const npcJob = [...bridge.c.db.agentJobs.iter()].find(
    (j) => j.status === "pending",
  )!;
  await bridge.c.reducers.claimJob({ id: npcJob.id });
  await assert.rejects(() =>
    bridge.c.reducers.completeJob({
      ...proposal,
      id: npcJob.id,
      kind: "room",
      direction: "up",
    }),
  );
  await bridge.c.reducers.completeJob({
    ...proposal,
    id: npcJob.id,
    kind: "reply",
    message: "I remember the first light of the Nexus.",
  });
  await until(
    () => [...a.c.db.myInbox.iter()].some((m) => m.author === proposal.name),
    "NPC reply",
  );
  await new Promise((r) => setTimeout(r, 2100));
  await a.c.reducers.requestAgent({ prompt: "A request to cancel" });
  await until(() =>
    [...bridge.c.db.agentJobs.iter()].some((j) => j.status === "pending"),
  );
  const cancelled = [...bridge.c.db.agentJobs.iter()].find(
    (j) => j.status === "pending",
  )!;
  await bridge.c.reducers.claimJob({ id: cancelled.id });
  await a.c.reducers.revokeConsent({});
  await until(
    () => bridge.c.db.agentJobs.count() === 0n,
    "revocation removes bridge data",
  );
  await assert.rejects(() =>
    bridge.c.reducers.completeJob({ ...proposal, id: cancelled.id }),
  );
  const secondTab = await open(a.token);
  a.c.disconnect();
  await until(
    () => secondTab.c.db.player.identity.find(ai)?.online === true,
    "multi-tab online",
  );
  assert.equal(
    secondTab.c.db.player.identity.find(ai)!.name,
    `Alice ${suffix}`,
  );
  secondTab.c.disconnect();
  await until(
    () => b.c.db.player.identity.find(ai)?.online === false,
    "last-tab disconnect",
  );
  const again = await open(a.token);
  assert.equal(again.c.db.player.identity.find(ai)!.roomId, 1n);
  console.log(
    `PASS: ${host}/${database}: multiplayer, identity, two-way movement, atomic build, duplicate/invalid input, private messages, consent, job ownership, NPC restrictions, revocation, multi-tab presence, reconnect persistence.`,
  );
} finally {
  for (const x of clients) x.c.disconnect();
}
