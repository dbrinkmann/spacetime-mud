export type DiscordMember = {
  userId: string;
  guildId: string;
  guildName: string;
  name: string;
  admin: boolean;
};
type Fetch = typeof fetch;
const api = "https://discord.com/api/v10";
export async function exchangeDiscordCode(
  clientId: string,
  clientSecret: string,
  code: string,
  request: Fetch = fetch,
) {
  if (!code || code.length > 4096)
    throw new Error("Invalid authorization code.");
  const response = await request(`${api}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    signal: AbortSignal.timeout(10000),
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
    }),
  });
  if (!response.ok) throw new Error("Discord authorization failed.");
  const token = (await response.json()) as { access_token?: string };
  if (!token.access_token) throw new Error("Discord returned no access token.");
  return token.access_token;
}
export async function verifyDiscordMember(
  accessToken: string,
  guildId: string,
  request: Fetch = fetch,
): Promise<DiscordMember> {
  if (
    !accessToken ||
    accessToken.length > 4096 ||
    !/^[0-9]{1,24}$/.test(guildId)
  )
    throw new Error("Invalid Discord credentials.");
  const get = async (path: string) => {
    const r = await request(api + path, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error("Discord membership could not be verified.");
    return r.json();
  };
  const user = (await get("/users/@me")) as {
    id: string;
    username: string;
    global_name?: string;
  };
  const member = (await get(`/users/@me/guilds/${guildId}/member`)) as {
    user?: { id: string };
    nick?: string;
    pending?: boolean;
  };
  if (!user.id || member.user?.id !== user.id || member.pending)
    throw new Error("Active community membership required.");
  let after = "";
  // Discord's guild endpoint is paginated. Never infer administrator status from client role IDs.
  for (let page = 0; page < 10; page++) {
    const guilds = (await get(
      `/users/@me/guilds?limit=200${after ? `&after=${after}` : ""}`,
    )) as Array<{
      id: string;
      name: string;
      permissions: string;
      owner?: boolean;
    }>;
    if (!Array.isArray(guilds))
      throw new Error("Invalid Discord community response.");
    const guild = guilds.find((g) => g.id === guildId);
    if (guild) {
      const permissions = BigInt(guild.permissions);
      return {
        userId: user.id,
        guildId,
        guildName: guild.name,
        name: member.nick || user.global_name || user.username,
        admin: !!guild.owner || (permissions & (8n | 32n)) !== 0n,
      };
    }
    if (guilds.length < 200) break;
    const last = guilds.at(-1)!.id;
    if (!/^[0-9]{1,24}$/.test(last) || last === after) break;
    after = last;
  }
  throw new Error("Community not found in verified Discord memberships.");
}
