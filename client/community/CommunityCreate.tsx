import React, { useRef, useState } from "react";
import { Identity } from "spacetimedb";
import type { DbConnection } from "../module_bindings";
import type { CommunityAgentGrant } from "../module_bindings/types";
import { HOST, DATABASE } from "../connection";

export function CommunityCreate({
  conn,
  communityId,
  roomId,
  isAdmin,
  grants,
  busy,
  action,
}: {
  conn: DbConnection;
  communityId: string;
  roomId: bigint;
  isAdmin: boolean;
  grants: CommunityAgentGrant[];
  busy: boolean;
  action: (fn: () => Promise<void>) => Promise<void>;
}) {
  const [agent, setAgent] = useState("");
  const [commonSpace, setCommonSpace] = useState(isAdmin);
  const [copied, setCopied] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const instructions = useRef<HTMLTextAreaElement>(null);
  const copyInstructions = async () => {
    const field = instructions.current;
    if (!field) return;
    field.focus();
    field.select();
    field.setSelectionRange(0, field.value.length);
    setCopied(false);
    setCopyMessage(
      "Instructions selected. Press Ctrl+C (Cmd+C on Mac), or use your device's Copy menu.",
    );
    // Discord's iframe can deny the async Clipboard API. Try selection-based
    // copying synchronously while the button's user gesture is still active.
    let success = false;
    try {
      success = document.execCommand("copy");
    } catch {}
    if (!success) {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(field.value);
          success = true;
        }
      } catch {}
    }
    if (success) {
      setCopied(true);
      setCopyMessage(
        "Copied. Paste these instructions into your coding agent.",
      );
    }
  };
  const prompt = `Help me build in Lantern, a shared 3D world inside Discord.
Read https://lantern-staging.dbrinkmann.workers.dev/agent/COMMUNITY.md.
Download the standalone MCP client from https://lantern-staging.dbrinkmann.workers.dev/agent/lantern-agent.mjs and configure it in your MCP client using Node.js 22 or newer. No repository clone is needed.
Use SPACETIME_HOST=${HOST} and SPACETIME_DATABASE=${DATABASE}.
My community_id is ${communityId}; the room I am viewing is ${roomId}.
Call world_connect and give me the agent_id to paste into the Activity's Create tab. Wait for me to connect it, then call world_guide and world_inspect.
${isAdmin ? "I am a server admin. Once I enable common-space editing, you can build common rooms as well as my home. Inspect editable properties before building." : "Build in my own home; common spaces are managed by server admins."}
Validate your geometry and publish directly with the current base_revision. Keep existing content unless I ask you to replace it. Tell me when the update is live.`;
  return (
    <section className="community-create">
      <h2>Build with your coding agent</h2>
      <p>
        {isAdmin
          ? "As a server admin, you can have your agent shape the common spaces, add connected rooms and choose the welcome room. You can also build your own home."
          : "Your agent can build and expand your home, create your character and add cosmetics."}
      </p>
      <h3>1. Give your agent these instructions</h3>
      <textarea
        ref={instructions}
        aria-label="Agent setup instructions"
        readOnly
        value={prompt}
        rows={9}
        onFocus={(e) => e.target.select()}
      />
      <button onClick={() => void copyInstructions()}>
        {copied ? "Copied" : "Copy instructions"}
      </button>
      <p role="status" aria-live="polite">
        {copyMessage}
      </p>
      <p className="muted">
        If copying is unavailable in Discord, select the text above and copy it.
        Your agent uses your existing coding tools and model subscription.
      </p>
      <h3>2. Connect the agent</h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void action(async () => {
            await conn.reducers.authorizeCommunityAgent({
              communityId,
              agent: Identity.fromString(agent.trim()),
              commonSpace: isAdmin && commonSpace,
            });
            setAgent("");
          });
        }}
      >
        <label>
          Agent pairing ID
          <input
            value={agent}
            onChange={(e) => setAgent(e.target.value)}
            placeholder="Paste the ID returned by world_connect"
            required
            pattern="[a-fA-F0-9]{64}"
            maxLength={64}
          />
        </label>
        {isAdmin && (
          <label className="agent-scope">
            <input
              type="checkbox"
              checked={commonSpace}
              onChange={(e) => setCommonSpace(e.target.checked)}
            />
            Allow editing common spaces
          </label>
        )}
        <p>
          Connecting lets this agent publish changes live to your{" "}
          {isAdmin && commonSpace
            ? "home, character and common spaces"
            : "home and character"}
          . Keep this Activity open while it builds.
        </p>
        <button disabled={busy || !/^[a-fA-F0-9]{64}$/.test(agent.trim())}>
          Connect agent
        </button>
      </form>
      <h3>Connected agents</h3>
      {grants.length ? (
        grants.map((g) => (
          <div className="connected-agent" key={g.key}>
            <code title={g.agent.toHexString()}>
              {g.agent.toHexString().slice(0, 12)}…
            </code>
            <span>
              {isAdmin && g.commonSpace
                ? "Home, character and common spaces"
                : "Home and character"}
            </span>
            <button
              disabled={busy}
              onClick={() =>
                void action(() =>
                  conn.reducers.revokeCommunityAgent({
                    communityId,
                    agent: g.agent,
                  }),
                )
              }
            >
              Disconnect agent
            </button>
          </div>
        ))
      ) : (
        <p>No agents connected yet.</p>
      )}
      <p className="muted">
        Agents use your current permissions. Removing an agent or losing admin
        access stops the corresponding edits immediately.
      </p>
    </section>
  );
}
