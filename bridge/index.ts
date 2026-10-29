import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { homedir } from "node:os";
import { createInterface } from "node:readline/promises";
import { DbConnection } from "../client/module_bindings/index.ts";
import { runClaude, claudeExecutable } from "./claude.ts";

const host = process.env.SPACETIME_HOST ?? "https://maincloud.spacetimedb.com";
const database = process.env.SPACETIME_DATABASE ?? "dbrinkmann-spacetime-mud";
const site =
  process.env.GAME_URL ?? "https://dbrinkmann.github.io/spacetime-mud/";
console.log("SpacetimeMUD · local Claude Code bridge\n");
console.log(
  "This bridge uses your signed-in Claude Code for game requests YOU submit.\nGame context is sent to Claude and counts toward your Claude usage.\nClaude runs with customizations and computer tools disabled.\nPair only with your own character. Revoke consent in the game or press Ctrl+C to stop.\n",
);
if (!process.argv.includes("--accept-consent")) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    "Allow this session to use your Claude Code for the game? [y/N] ",
  );
  rl.close();
  if (answer.trim().toLowerCase() !== "y") process.exit(0);
}
claudeExecutable();
const dir =
  process.env.BRIDGE_STATE_DIR ?? join(homedir(), ".spacetime-mud-bridge");
mkdirSync(dir, { recursive: true, mode: 0o700 });
const file = join(
  dir,
  createHash("sha256")
    .update(`${host}/${database}`)
    .digest("hex")
    .slice(0, 20) + ".json",
);
const token = existsSync(file)
  ? JSON.parse(readFileSync(file, "utf8")).token
  : undefined;
let running: { id: bigint; abort: AbortController } | undefined;
let ready = false;
function saveToken(value: string) {
  writeFileSync(file, JSON.stringify({ token: value }), { mode: 0o600 });
}
const conn = DbConnection.builder()
  .withUri(host)
  .withDatabaseName(database)
  .withToken(token)
  .withAutomaticReconnect()
  .onConnect((c, identity, newToken) => {
    saveToken(newToken);
    console.log(
      `Open this pairing link, then consent in the game:\n${site}#bridge=${identity.toHexString()}\n\nWaiting for your character…`,
    );
    c.subscriptionBuilder()
      .onApplied(() => {
        void resume();
      })
      .onError((ctx) => console.error("Subscription:", ctx.event))
      .subscribe([
        "SELECT * FROM room",
        "SELECT * FROM npc",
        "SELECT * FROM player",
        "SELECT * FROM chat",
        "SELECT * FROM agent_jobs",
      ]);
  })
  .onAutomaticReconnect((_c, _id, t) => {
    saveToken(t);
    console.log("Bridge reconnected.");
  })
  .onConnectError((_ctx, e) => console.error("Connection:", e.message))
  .onDisconnect(() => {
    ready = false;
    running?.abort.abort();
    console.log("Bridge disconnected; reconnecting…");
  })
  .build();

async function resume() {
  // Never rerun a paid inference request after a bridge crash or lost connection.
  for (const j of conn.db.agentJobs.iter())
    if (j.status === "working" && j.id !== running?.id) {
      try {
        await conn.reducers.failJob({
          id: j.id,
          reason:
            "The bridge restarted during this request. Please submit it again.",
        });
      } catch {
        console.log(
          `Request ${j.id} has expired. Cancel it in the game to submit a new request.`,
        );
      }
    }
  ready = true;
  void pump();
}
async function pump() {
  if (!ready || !conn.isActive || running) return;
  const j = [...conn.db.agentJobs.iter()].find((j) => j.status === "pending");
  if (!j) return;
  const abort = new AbortController();
  running = { id: j.id, abort };
  try {
    await conn.reducers.claimJob({ id: j.id });
    const room = conn.db.room.id.find(j.roomId);
    const npc = j.npcId === 0n ? undefined : conn.db.npc.id.find(j.npcId);
    const player = conn.db.player.identity.find(j.owner);
    const recentChat = [...conn.db.chat.iter()]
      .filter((c) => c.roomId === j.roomId)
      .slice(-12)
      .map((c) => ({ author: c.author, text: c.text }));
    const recentDialogue = [...conn.db.agentJobs.iter()]
      .filter((other) => other.npcId === j.npcId && other.status === "done")
      .slice(-6)
      .map((other) => ({ player: other.prompt, reply: other.result }));
    console.log(`Working on request ${j.id}${npc ? ` for ${npc.name}` : ""}…`);
    const proposal = await runClaude(
      {
        player: player?.name,
        request: j.prompt,
        room: room
          ? {
              name: room.name,
              description: room.description,
              occupiedDirections: room.exits.map((e) => e.direction),
            }
          : null,
        npc: npc
          ? {
              name: npc.name,
              description: npc.description,
              biography: npc.biography,
            }
          : null,
        recentChat,
        recentDialogue,
      },
      abort.signal,
    );
    if (abort.signal.aborted) return;
    await conn.reducers.completeJob({ id: j.id, ...proposal });
    console.log(`Request ${j.id} complete (${proposal.kind}).`);
  } catch (e) {
    if (!abort.signal.aborted) {
      const reason = e instanceof Error ? e.message : String(e);
      console.error(reason);
      try {
        await conn.reducers.failJob({ id: j.id, reason: reason.slice(0, 500) });
      } catch {
        console.error("Request cancelled, expired, or consent revoked.");
      }
    }
  } finally {
    running = undefined;
    void pump();
  }
}
function changed() {
  if (running) {
    const current = conn.db.agentJobs.id.find(running.id);
    if (!current || !["pending", "working"].includes(current.status))
      running.abort.abort();
  }
  void pump();
}
conn.db.agentJobs.onInsert(changed);
conn.db.agentJobs.onUpdate(changed);
conn.db.agentJobs.onDelete(changed);
process.on("SIGINT", () => {
  running?.abort.abort();
  conn.disconnect();
  process.exit(0);
});
process.on("SIGTERM", () => {
  running?.abort.abort();
  conn.disconnect();
  process.exit(0);
});
