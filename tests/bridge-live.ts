import { spawn } from "node:child_process";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { Identity } from "spacetimedb";
import { connect, until, host, database } from "./connect.ts";
const { c } = await connect();
const suffix = Date.now().toString(36);
await c.reducers.createPlayer({ name: `ClaudeTest ${suffix}` });
const child = spawn(
  process.execPath,
  ["--import", "tsx", "bridge/index.ts", "--accept-consent"],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      SPACETIME_HOST: host,
      SPACETIME_DATABASE: database,
      BRIDGE_STATE_DIR: resolve(".bridge", suffix),
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  },
);
let output = "";
child.stdout.on("data", (d) => {
  output += d;
  process.stdout.write(d);
});
child.stderr.on("data", (d) => process.stderr.write(d));
async function request(prompt: string) {
  await new Promise((r) => setTimeout(r, 2100));
  await c.reducers.requestAgent({ prompt });
  await until(
    () =>
      [...c.db.myJobs.iter()].some(
        (j) => j.prompt === prompt && ["done", "failed"].includes(j.status),
      ),
    "real Claude bridge job",
    150000,
  );
  const j = [...c.db.myJobs.iter()].find((j) => j.prompt === prompt)!;
  assert.equal(j.status, "done", j.result);
  return j;
}
try {
  await until(
    () => /#bridge=([0-9a-f]{64})/i.test(output),
    "bridge pairing link",
    20000,
  );
  await c.reducers.consent({
    bridge: Identity.fromString(output.match(/#bridge=([0-9a-f]{64})/i)![1]),
  });
  const root = c.db.room.id.find(1n)!;
  const free = ["north", "south", "east", "west", "up", "down"].find(
    (d) => !root.exits.some((e) => e.direction === d),
  );
  assert.ok(free);
  await request(
    `Create a room ${free} called Lantern Court ${suffix}, a quiet courtyard lit by paper lanterns.`,
  );
  const exit = c.db.room.id.find(1n)!.exits.find((e) => e.direction === free)!;
  assert.ok(exit);
  await c.reducers.go({ direction: free });
  await request(
    `Create an NPC named Mira ${suffix}, a friendly keeper of the lanterns who remembers their makers.`,
  );
  const n = [...c.db.npc.iter()].find((n) => n.roomId === exit.destination)!;
  assert.ok(n);
  await new Promise((r) => setTimeout(r, 2100));
  await c.reducers.tell({
    target: n.name,
    message: "Who made these lanterns?",
  });
  await until(
    () =>
      [...c.db.myJobs.iter()].some(
        (j) => j.npcId === n.id && ["done", "failed"].includes(j.status),
      ),
    "real NPC conversation",
    150000,
  );
  const conversation = [...c.db.myJobs.iter()].find((j) => j.npcId === n.id)!;
  assert.equal(conversation.status, "done", conversation.result);
  assert.ok([...c.db.myInbox.iter()].some((m) => m.author === n.name));
  await c.reducers.revokeConsent({});
  console.log(
    `PASS: real local Claude Code bridge created a room, created an NPC, and roleplayed a private conversation on ${host}/${database}.`,
  );
} finally {
  child.kill();
  c.disconnect();
}
