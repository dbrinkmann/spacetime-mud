import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateObject } from "../spacetimedb/src/community-scripts.ts";
test("object events buffer state, speech and named timers", () => {
  const r = evaluateObject(
    'function on_greet(ctx) { ctx.set("n",ctx.get("n")+1); ctx.tell(ctx.actorName()); ctx.say("hello"); ctx.emote("waves"); ctx.after(5,"tick"); }',
    "on_greet",
    '{"n":2}',
    "123",
    "Alice",
  );
  assert.equal(r.state, '{"n":3}');
  assert.deepEqual(
    r.messages.map((x) => x.kind),
    ["tell", "say", "emote"],
  );
  assert.deepEqual(r.timers, [["tick", 5]]);
  assert.equal(
    evaluateObject(
      'function on_tick(ctx){ctx.tell("secret");}',
      "on_tick",
      "{}",
      "",
      "",
    ).messages.length,
    0,
  );
});
test("object interpreter enforces budgets and fails atomically", () => {
  for (const body of [
    "while(true){}",
    'ctx.after(0,"x");',
    'ctx.set("constructor",1);',
    'for(var i=0;i<9;i++)ctx.say("spam");',
    'ctx.set("x",{});',
  ]) {
    assert.throws(() =>
      evaluateObject(
        'function on_test(ctx){ctx.say("buffered");' + body + "}",
        "on_test",
        "{}",
        "1",
        "Alice",
      ),
    );
  }
  assert.throws(() => evaluateObject("", "on_x);evil()", "{}", "", ""));
});
