# Lantern Discord release package

Updated November 3, 2026. Scope: release assets and submission; no new moderation, onboarding or load-testing project.

## Ready for the portal

- App name: Lantern
- Icon: uploaded by owner (confirmed in conversation).
- Description: already entered by owner.
- Privacy Policy URL: https://lantern-staging.dbrinkmann.workers.dev/privacy/
- Terms of Service URL: https://lantern-staging.dbrinkmann.workers.dev/terms/
- Support website: https://lantern-staging.dbrinkmann.workers.dev/support/
- Public contact: emergent.worlds@proton.me
- Website: https://lantern-staging.dbrinkmann.workers.dev/

## Listing copy

Short description:

Give your Discord server a world to call home. Hang out in shared 3D spaces, create your own home, and build interactive rooms with your coding agent.

Long description:

Lantern gives your Discord community a persistent visual world. Meet in shared spaces, visit members' homes, and explore rooms built by your community. Your character returns home when you log off and remains part of the world.

Server administrators shape the common spaces. Members claim available home entrances and expand their interiors. Connect your own coding agent to author rooms, characters, signs and interactive objects. A lantern can greet visitors; a receptionist can answer questions; your creations can remember state and react on timers.

Playing happens inside the Discord Activity. Building uses a compatible coding agent and the Lantern MCP client on your computer; your agent provider's own account and usage terms apply. Lantern does not supply AI inference. Voice stays in Discord; room-local text conversation happens in Lantern.

## Screenshot pack

- `/release/lantern-inn.png`: 1600x900 screenshot of the authored Lantern & Thorn example in the current game renderer.
- `/release/authored-characters.png`: 1600x900 screenshot of the authored-character/sign fixture in the current renderer.
- These are room previews, not screenshots of a crowd of real players or of the Discord UI. Do not describe them as a live community session.
- Reproduce with `npx tsx scripts/capture-release.ts`; GAME_URL may target another running game frontend.
- Cover art is separate from screenshots. Discord suggests a title plus artwork, with a composition that works at 16:9 and 13:11, at least 1024px wide. Embedded backgrounds are 16:9, at least 1024px wide, with room for Discord's center overlay. These screenshots are not represented as finished cover art.

## Owner steps

1. Put the privacy and terms URLs in their corresponding Developer Portal fields. Use the support webpage where a website URL is accepted; a support-server field requires a real Discord invite, not an email address.
2. Upload screenshots where the listing accepts gameplay images. Check portal crop previews.
3. Open App Verification and follow its current requirements. Identity verification, legal attestations and account-owner declarations must be completed by the owner with accurate information.
4. Review the Discovery checklist separately if you want placement in the App Directory/App Launcher. Verification and discovery are not the same switch. Do not claim verification is complete until Discord confirms it.
5. Before inviting arbitrary servers, intentionally remove or change the gateway's DISCORD_TEST_GUILD_ID restriction. This package does not change that restriction or enable public discovery.

The published policies describe the current implementation. No company name, jurisdiction, guaranteed response time or automatic data-deletion deadline has been invented. The support mailbox must be monitored; privacy/deletion requests currently require manual handling.

## Official references checked

- https://docs.discord.com/developers/activities/development-guides/assets-and-metadata
- https://docs.discord.com/developers/discovery/enabling-discovery
- https://support-dev.discord.com/hc/en-us/articles/26576097154199-What-are-Verified-and-Unverified-Activities
