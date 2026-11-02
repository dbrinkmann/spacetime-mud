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
  await c.reducers.createZone({
    name: `Claude Realm ${suffix}`,
    description: "A realm built with an agent.",
  });
  await request(
    `Create a room north called Lantern Court ${suffix}, a quiet courtyard lit by paper lanterns.`,
  );
  await c.reducers.go({ direction: "north" });
  await request(
    'Create a scripted scenery object named Singing Lantern. Give it a light action labeled Light the lantern. on_light should say "The lantern awakens." and schedule quiet in 2 seconds. on_quiet should say "The lantern sleeps." Return an object draft.',
  );
  const v = [...c.db.myVersions.iter()].find(
    (v) => v.name === "Singing Lantern",
  );
  assert(v, "Agent authored a draft");
  await c.reducers.testDraft({ versionId: v.id, event: "on_light" });
  assert.equal(
    c.db.myVersions.id.find(v.id)?.tested,
    true,
    c.db.myVersions.id.find(v.id)?.report,
  );
  await c.reducers.publishVersion({ versionId: v.id });
  await c.reducers.interact({
    objectId: v.objectId,
    action: "light",
    requestId: crypto.randomUUID(),
  });
  await until(
    () =>
      [...c.db.visibleChat.iter()].some(
        (m) => m.text === "The lantern awakens.",
      ),
    "script action",
  );
  await until(
    () =>
      [...c.db.visibleChat.iter()].some(
        (m) => m.text === "The lantern sleeps.",
      ),
    "agent-authored timer",
    8000,
  );
  await c.reducers.revokeConsent({});
  console.log(
    `PASS: real local Claude Code bridge created a room and scripted object, previewed/published it, and executed its action and timer on ${host}/${database}.`,
  );
} finally {
  child.kill();
  c.disconnect();
}
