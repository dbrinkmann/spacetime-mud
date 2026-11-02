import React, { useEffect, useState } from "react";
import { Identity } from "spacetimedb";
import type { DbConnection } from "./module_bindings";
import type { Snapshot } from "./connection";
export function CreateGuide({
  conn,
  data,
  enabled,
  action,
}: {
  conn: DbConnection;
  data: Snapshot;
  enabled: boolean;
  action: (fn: () => Promise<void>) => Promise<void>;
}) {
  const read = () => {
    const p = new URLSearchParams(location.hash.slice(1));
    return p.get("agent") ?? p.get("bridge") ?? "";
  };
  const [agent, setAgent] = useState(read),
    [consent, setConsent] = useState(false);
  useEffect(() => {
    const changed = () => {
      setAgent(read());
      setConsent(false);
    };
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);
  return (
    <main className="create-guide panel">
      <p className="eyebrow">YOUR IMAGINATION. YOUR AGENT.</p>
      <h1>Teach your agent to build.</h1>
      <p>
        Use Claude Code, Codex, or any agent that supports MCP. Talk to it
        wherever you already work. Come back here to explore what you made.
      </p>
      <ol>
        <li>
          <h2>Connect its tools</h2>
          <p>Install Node.js 22+ and download the game’s building tools:</p>
          <pre>
            {
              "git clone https://github.com/dbrinkmann/spacetime-mud.git\ncd spacetime-mud\nnpm ci\nnpm run --silent agent:config"
            }
          </pre>
          <p>
            Add the generated MCP server configuration to your agent client. For
            clients using TOML or another format, use the same command and
            arguments. No model API key is needed by the game.
          </p>
          <p>
            For agent screenshot previews, also run{" "}
            <code>npx playwright install chromium</code>.
          </p>
        </li>
        <li>
          <h2>Teach it the world</h2>
          <p>
            <a href="./agent/SKILL.md" download="SKILL.md">
              Download the building skill
            </a>{" "}
            and give it to your agent, or ask it to call{" "}
            <code>world_guide</code>.
          </p>
          <blockquote>
            Read the Spacetime building guide, connect to my player, and help me
            create a place of my own.
          </blockquote>
          <p>
            Your agent calls <code>world_connect</code> and gives you a pairing
            link. Open that link in this browser.
          </p>
        </li>
        <li>
          <h2>Imagine something</h2>
          <blockquote>
            Make me a cozy floating wizard’s study, with plants, warm lighting,
            and three chairs around a table. Create a new place if I don’t have
            one.
          </blockquote>
          <p>
            Your agent builds, tests, and publishes directly into the world.
            Watch changes appear in Explore. Ask for revisions in the same
            agent conversation; there is no review or Keep it step required.
          </p>
        </li>
      </ol>
      <section className="agent-pairing">
        <h2>
          {data.grants.length ? "Your agent is connected" : "Pair your agent"}
        </h2>
        {data.grants.length ? (
          <>
            <p>
              This agent can build and publish live in your own or shared zones
              and for your character. Disconnect it here to revoke access.
            </p>
            <button
              disabled={!enabled}
              onClick={() => void action(() => conn.reducers.revokeConsent({}))}
            >
              Disconnect agent
            </button>
          </>
        ) : (
          <>
            <p>
              Open the pairing link from your agent. If needed, paste its
              connection identity below.
            </p>
            <label>
              Agent connection
              <input
                aria-label="Agent connection"
                value={agent}
                onChange={(e) => {
                  setAgent(e.target.value);
                  setConsent(false);
                }}
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              Allow this agent to read my game context, create places, and
              publish changes live to my character and editable rooms. I can revoke
              access anytime.
            </label>
            <button
              disabled={
                !enabled || !consent || !/^[a-fA-F0-9]{64}$/.test(agent)
              }
              onClick={() =>
                void action(() =>
                  conn.reducers.consent({ bridge: Identity.fromString(agent) }),
                )
              }
            >
              Connect agent
            </button>
          </>
        )}
      </section>
    </main>
  );
}
