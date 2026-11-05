import { DiscordSDK, patchUrlMappings } from "@discord/embedded-app-sdk";
import { HOST } from "../connection";
export type DiscordSession = {
  token: string;
  communityId: string;
  name: string;
  renewAfterSeconds: number;
};
export type ActivityAccess = {
  session: DiscordSession;
  renew: () => Promise<DiscordSession>;
};
export async function connectActivity(host = HOST): Promise<ActivityAccess> {
  const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
  if (!clientId)
    throw new Error(
      "This build needs VITE_DISCORD_CLIENT_ID to launch inside Discord.",
    );
  const sdk = new DiscordSDK(clientId);
  await sdk.ready();
  if (!sdk.guildId) throw new Error("Launch this world from a Discord server.");
  patchUrlMappings([{ prefix: "/db", target: new URL(host).host }]);
  const post = async <T>(path: string, body: unknown): Promise<T> => {
    const r = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok)
      throw new Error(
        "Community access could not be verified. Reopen the Activity to sign in again.",
      );
    return r.json();
  };
  const { code } = await sdk.commands.authorize({
    client_id: clientId,
    response_type: "code",
    state: crypto.randomUUID(),
    prompt: "none",
    scope: ["identify", "guilds", "guilds.members.read"],
  });
  const { access_token } = await post<{ access_token: string }>(
    "/api/discord/token",
    { code },
  );
  const auth = await sdk.commands.authenticate({ access_token });
  if (!auth) throw new Error("Discord authentication failed.");
  const renew = () =>
    post<DiscordSession>("/api/discord/session", {
      accessToken: access_token,
      guildId: sdk.guildId,
      apiVersion: import.meta.env.VITE_RUNTIME_DATABASE ? 2 : 1,
    });
  return { session: await renew(), renew };
}
