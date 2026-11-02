import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";
import { connect, until } from "./connect.ts";
const file = ".bridge/restart-check.json";
if (process.argv.includes("--prepare")) {
  const { c, token } = await connect();
  try {
    await c.reducers.createPlayer({
      name: `Restart ${Date.now().toString(36)}`,
    });
    await c.reducers.createZone({
      name: "Restart verification",
      description: "Durable timer verification.",
    });
    const roomId = c.db.visiblePlayers.identity.find(c.identity!)!.roomId;
    await c.reducers.saveDraft({
      roomId,
      objectId: 0n,
      kind: "scenery",
      name: "Durable clock",
      description: "An enduring clock.",
      actions: [{ id: "start", label: "Start" }],
      source:
        'function on_start(ctx){ctx.schedule("wake",15);}function on_wake(ctx){ctx.say("I survived the restart.");}',
    });
    const v = [...c.db.myVersions.iter()][0];
    await c.reducers.testDraft({ versionId: v.id, event: "on_start" });
    assert(c.db.myVersions.id.find(v.id)?.tested);
    await c.reducers.publishVersion({ versionId: v.id });
    await c.reducers.interact({
      objectId: v.objectId,
      action: "start",
      requestId: crypto.randomUUID(),
    });
    mkdirSync(".bridge", { recursive: true });
    writeFileSync(file, JSON.stringify({ token }));
    console.log("READY: durable timer stored; restart local server now.");
  } finally {
    c.disconnect();
  }
} else {
  const { token } = JSON.parse(readFileSync(file, "utf8"));
  const { c } = await connect(token);
  try {
    await until(
      () =>
        [...c.db.visibleChat.iter()].some(
          (m) => m.text === "I survived the restart.",
        ),
      "timer across server restart",
      25000,
    );
    console.log("PASS persistent timer fired after server process restart.");
  } finally {
    c.disconnect();
  }
}
