import { runClaude } from "../bridge/claude.ts";
const result = await runClaude({
  request: "Say hello to a new traveler. Reply only, do not build.",
  room: { name: "Nexus", occupiedDirections: [] },
});
if (result.kind !== "reply") throw new Error("Unexpected action");
console.log("PASS: real Claude Code structured response:", result.message);
