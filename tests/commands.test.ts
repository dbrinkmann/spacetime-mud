import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCommand } from "../shared/commands.ts";
import { validateProposal } from "../shared/agent.ts";
test("directions, whitespace, speech and quoted multiword recipients", () => {
  assert.deepEqual(parseCommand("  N  "), { kind: "go", direction: "north" });
  assert.deepEqual(parseCommand("go s"), { kind: "go", direction: "south" });
  assert.deepEqual(parseCommand("'hello"), { kind: "say", message: "hello" });
  assert.deepEqual(parseCommand('tell "Orchard Keeper" hello there'), {
    kind: "tell",
    target: "Orchard Keeper",
    message: "hello there",
  });
  assert.deepEqual(parseCommand("ask make a garden"), {
    kind: "agent",
    prompt: "make a garden",
  });
  assert.throws(() => parseCommand("tell Nobody"));
  assert.throws(() => parseCommand(""));
  assert.throws(() => parseCommand("nonsense"));
});
test("agent proposal rejects malformed and unexpected actions", () => {
  const valid = {
    kind: "room",
    direction: "north",
    name: "Garden",
    description: "Moonlight.",
    biography: "",
    message: "A garden awaits.",
  };
  assert.deepEqual(validateProposal(valid), valid);
  assert.throws(() => validateProposal({ ...valid, kind: "shell" }));
  assert.throws(() => validateProposal({ ...valid, direction: "sideways" }));
  assert.throws(() => validateProposal({ ...valid, name: "" }));
  assert.throws(() =>
    validateProposal({ ...valid, kind: "npc", biography: "" }),
  );
});
