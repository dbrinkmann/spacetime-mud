import { test } from "node:test";
import assert from "node:assert/strict";
import { executeScript } from "../spacetimedb/src/scripts.ts";
test("existing interpreter runs functions, loops and game primitives", () => {
  const out: unknown[] = [];
  const result = executeScript(
    'function on_use(ctx){ var n=0; for(var i=0;i<5;i++){n+=i;} ctx.say("total="+n); }',
    "on_use",
    {
      say: (v) => {
        out.push(v);
      },
    },
  );
  assert.deepEqual(out, ["total=10"]);
  assert(result.steps > 0);
});
test("budgets stop loops, recursion and exponential strings", () => {
  for (const source of [
    "function on_use(ctx){while(true){}}",
    "function on_use(ctx){on_use(ctx);}",
    'function on_use(ctx){var s="x";while(true){s=s+s;}}',
    "function on_use(ctx){var a=[];a.length=1000000000;}",
  ])
    assert.throws(() => executeScript(source, "on_use", {}), /limit|budget/i);
});
test("no native escape, dynamic code, network, regex or time", () => {
  for (const source of [
    'eval("1")',
    'Function("return this")()',
    'ctx.say.constructor("return this")()',
    '"a".match("a")',
    "new Date()",
    "Math.random()",
    'fetch("https://example.com")',
    "var r=/x/;",
    "var x={get value(){return 1;}};",
  ])
    assert.throws(
      () => executeScript(source, "on_use", { say: () => {} }),
      source,
    );
});
test("computed constructor names and dangerous native aliases are rejected", () => {
  for (const source of [
    'var s="con"+"structor";ctx.say[s]("return this")();',
    'var f="x".split;f("x");',
    "var a=[];var f=a.join;f();",
  ])
    assert.throws(
      () => executeScript(source, "on_use", { say: () => {} }),
      source,
    );
});

test("top-level var declarations initialize under the sandbox and reset per event", () => {
  const source =
    'var RUMORS = ["Rain tonight", "Market tomorrow"]; var counter = 0; function on_use(ctx){ counter++; ctx.say(RUMORS[1]); ctx.say(counter); }';
  for (let i = 0; i < 2; i++) {
    const out: unknown[] = [];
    executeScript(source, "on_use", {
      say: (v) => {
        out.push(v);
      },
    });
    assert.deepEqual(out, ["Market tomorrow", 1]);
  }
  assert.throws(
    () => executeScript("var RUMORS = []; while(true){}", "on_use", {}),
    /budget/,
  );
});
