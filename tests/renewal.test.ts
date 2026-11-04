import { test } from "node:test";
import assert from "node:assert/strict";
import { startRenewal } from "../client/session-renewal.ts";
test("renewal retries transient failures, recovers and stops without overlapping", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  const statuses: string[] = [];
  const renewal = startRenewal(
    async () => {
      calls++;
      if (calls === 1) throw Error("temporary");
      return { renewAfterSeconds: 60 };
    },
    (s) => statuses.push(s),
    60,
  );
  t.mock.timers.tick(60000);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(calls, 1);
  assert.match(statuses[0], /Retrying/);
  t.mock.timers.tick(10000);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(calls, 2);
  assert.equal(statuses[1], "");
  renewal.stop();
  t.mock.timers.tick(120000);
  assert.equal(calls, 2);
  let finish!: () => void;
  const pending = startRenewal(
    () =>
      new Promise((resolve) => {
        calls++;
        finish = () => resolve({ renewAfterSeconds: 60 });
      }),
    (s) => statuses.push(s),
    60,
  );
  const first = pending.retry();
  await pending.retry();
  assert.equal(calls, 3);
  pending.stop();
  finish();
  await first;
  assert.equal(statuses.length, 2);
});
