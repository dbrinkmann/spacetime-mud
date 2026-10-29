import { DbConnection } from "../client/module_bindings/index.ts";
export const host = process.env.SPACETIME_HOST ?? "http://127.0.0.1:3030";
export const database = process.env.SPACETIME_DATABASE ?? "mud-test";
export async function connect(token?: string) {
  return new Promise<{ c: DbConnection; token: string }>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Connection timed out")),
      20000,
    );
    DbConnection.builder()
      .withUri(host)
      .withDatabaseName(database)
      .withToken(token)
      .onConnect((c, _id, newToken) => {
        c.subscriptionBuilder()
          .onApplied(() => {
            clearTimeout(timeout);
            resolve({ c, token: newToken });
          })
          .onError((ctx) => {
            clearTimeout(timeout);
            reject(ctx.event);
          })
          .subscribe([
            "SELECT * FROM player",
            "SELECT * FROM room",
            "SELECT * FROM npc",
            "SELECT * FROM chat",
            "SELECT * FROM my_inbox",
            "SELECT * FROM my_jobs",
            "SELECT * FROM my_grant",
            "SELECT * FROM agent_jobs",
          ]);
      })
      .onConnectError((_ctx, e) => {
        clearTimeout(timeout);
        reject(e);
      })
      .build();
  });
}
export async function until(
  fn: () => unknown,
  label = "condition",
  timeout = 10000,
) {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeout) throw new Error(`Timed out: ${label}`);
    await new Promise((r) => setTimeout(r, 30));
  }
}
