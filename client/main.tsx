import React, { useEffect, useRef, useState } from "react";
import { Identity } from "spacetimedb";
import { useGame } from "./connection";
import { WorldMap } from "./WorldMap";
import { Builder } from "./Builder";
import "./style.css";
export function App() {
  const { conn, identity, status, data, connectionError } = useGame();
  const me = data.players.find((p) => p.identity.toHexString() === identity),
    room = data.rooms.find((r) => r.id === me?.roomId),
    zone = data.zones.find((z) => z.id === room?.zoneId);
  const [name, setName] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState<"play" | "build">("play"),
    [message, setMessage] = useState(""),
    [recipient, setRecipient] = useState(""),
    [prompt, setPrompt] = useState("");
  const [bridge, setBridge] = useState(
      () => new URLSearchParams(location.hash.slice(1)).get("bridge") ?? "",
    ),
    [consented, setConsented] = useState(false),
    [agentOpen, setAgentOpen] = useState(!!bridge);
  const journal = useRef<HTMLDivElement>(null),
    inflight = useRef(false);
  const enabled = !!conn && status === "Live" && !busy,
    grant = data.grants[0];
  const jobs = data.jobs.slice().sort((a, b) => Number(b.id - a.id)),
    active = jobs.find((j) => ["pending", "working"].includes(j.status));
  const objects = data.objects.filter((o) => o.roomId === room?.id && o.active),
    players = data.players.filter((p) => p.online && p.roomId === room?.id);
  const entries = [
    ...data.chat.map((c) => ({ ...c, key: `c${c.id}` })),
    ...data.inbox.map((c) => ({ ...c, key: `i${c.id}`, kind: "private" })),
  ].sort((a, b) =>
    Number(a.timestamp.microsSinceUnixEpoch - b.timestamp.microsSinceUnixEpoch),
  );
  async function action(fn: () => Promise<void>) {
    if (inflight.current) return;
    inflight.current = true;
    setNotice("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }
  function move(direction: string) {
    if (enabled) void action(() => conn!.reducers.go({ direction }));
  }
  useEffect(() => {
    const keys: Record<string, string> = {
      w: "north",
      a: "west",
      s: "south",
      d: "east",
      ArrowUp: "north",
      ArrowLeft: "west",
      ArrowDown: "south",
      ArrowRight: "east",
    };
    const handle = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (
        tab !== "play" ||
        !room ||
        !enabled ||
        e.ctrlKey ||
        e.altKey ||
        e.metaKey ||
        e.repeat ||
        el.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(el.tagName)
      )
        return;
      const direction = keys[e.key];
      if (direction) {
        e.preventDefault();
        move(direction);
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [tab, room?.id, enabled]);
  useEffect(() => {
    journal.current?.scrollTo?.(0, journal.current.scrollHeight);
  }, [entries.length, room?.id]);
  useEffect(() => {
    const update = () => {
      setBridge(
        new URLSearchParams(location.hash.slice(1)).get("bridge") ?? "",
      );
      setConsented(false);
      setAgentOpen(true);
    };
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return (
    <div className="app">
      <header>
        <a className="brand" href="#" onClick={(e) => e.preventDefault()}>
          <span className="sigil">✦</span>
          <span>
            SPACETIME <span className="brand-muted">MUD</span>
            <small>A WORLD WE MAKE TOGETHER</small>
          </span>
        </a>
        {me && (
          <nav className="main-tabs" aria-label="Game mode">
            <button
              className={tab === "play" ? "selected" : ""}
              onClick={() => setTab("play")}
            >
              Explore
            </button>
            <button
              className={tab === "build" ? "selected" : ""}
              onClick={() => setTab("build")}
            >
              Build
            </button>
          </nav>
        )}
        <div className="header-right">
          <span className={`status ${status === "Live" ? "live" : ""}`}>
            <i />
            {status}
          </span>
          <a
            href="https://github.com/dbrinkmann/spacetime-mud"
            target="_blank"
            rel="noreferrer"
          >
            Source ↗
          </a>
        </div>
      </header>
      {(notice || connectionError) && (
        <div className="notice" role="alert">
          {notice || connectionError}
          <button aria-label="Dismiss error" onClick={() => setNotice("")}>
            ×
          </button>
        </div>
      )}
      {!me ? (
        <main className="welcome">
          <div className="portal" aria-hidden="true">
            ✦
          </div>
          <p className="eyebrow">OLD MAGIC. NEW WORLDS.</p>
          <h1>
            Every world begins
            <br />
            with a traveler.
          </h1>
          <p>
            Explore forgotten places. Give ordinary things extraordinary
            stories.
            <br />
            Build a realm that remembers you.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void action(() => conn!.reducers.createPlayer({ name }));
            }}
          >
            <label htmlFor="name">What should we call you?</label>
            <div className="input-row">
              <input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
                maxLength={24}
                autoComplete="nickname"
                placeholder="Your traveler’s name"
              />
              <button className="primary" disabled={!enabled}>
                Enter world →
              </button>
            </div>
          </form>
          <p className="fine">
            Your character is remembered in this browser. Everyone can build.
            <br />
            Connecting your own Claude Code is optional and requires consent.
          </p>
        </main>
      ) : (
        <>
          <div className="world-bar">
            <span>
              {zone?.name ?? "The Nexus"}{" "}
              <span className="muted">
                / {tab === "play" ? "Exploration" : "Workshop"}
              </span>
            </span>
            <span>
              {players.length} here <b>·</b> <strong>{me.name}</strong>{" "}
              <button
                className="text-button"
                disabled={!enabled || me.roomId === 1n}
                onClick={() => void action(() => conn!.reducers.home({}))}
              >
                Return to Nexus
              </button>
            </span>
          </div>
          {room &&
            conn &&
            (tab === "build" ? (
              <Builder
                key={String(room.id)}
                conn={conn}
                room={room}
                data={data}
                identity={identity}
                enabled={enabled}
                action={action}
              />
            ) : (
              <main className="play-grid">
                <aside className="atlas-column">
                  <WorldMap
                    rooms={data.rooms}
                    current={room}
                    gates={data.gates}
                    move={move}
                    disabled={!enabled}
                  />
                  <section className="panel inventory">
                    <div className="panel-heading">
                      YOUR SATCHEL{" "}
                      <span>{data.inventory.length} keepsakes</span>
                    </div>
                    {data.inventory.length ? (
                      data.inventory.map((i) => (
                        <div className="inventory-item" key={i.key}>
                          <span>◇ {i.name}</span>
                          <small>× {i.quantity}</small>
                        </div>
                      ))
                    ) : (
                      <p className="muted">
                        Empty, for now. There is a whole world to find.
                      </p>
                    )}
                  </section>
                </aside>
                <section className="room-panel panel">
                  <p className="eyebrow">
                    YOU ARE HERE <span>ROOM {String(room.id)}</span>
                  </p>
                  <div className="room-symbol" aria-hidden="true">
                    ◇
                  </div>
                  <h1>{room.name}</h1>
                  <p className="description">{room.description}</p>
                  {me.roomId === 1n && (
                    <>
                      <div className="section-title">
                        PORTALS TO OTHER WORLDS
                      </div>
                      <div className="portal-list">
                        {data.zones
                          .filter((z) => z.entrance !== 1n)
                          .map((z) => (
                            <button
                              key={String(z.id)}
                              disabled={!enabled}
                              onClick={() =>
                                void action(() =>
                                  conn.reducers.visitZone({ zoneId: z.id }),
                                )
                              }
                            >
                              <span>✧ {z.name}</span>
                              <small>Enter realm →</small>
                            </button>
                          ))}
                      </div>
                      <button
                        className="text-button"
                        onClick={() => setTab("build")}
                      >
                        + Imagine a new realm
                      </button>
                    </>
                  )}
                  {!!room.exits.length && (
                    <>
                      <div className="section-title">PASSAGES</div>
                      <div className="exits">
                        {room.exits.map((e) => {
                          const closed =
                            e.gateId &&
                            !data.gates.find((g) => g.id === e.gateId)?.open;
                          return (
                            <button
                              key={e.direction}
                              disabled={!enabled || !!closed}
                              onClick={() => move(e.direction)}
                            >
                              <span>
                                {e.direction} {closed ? "◇" : "↗"}
                              </span>
                              <small>
                                {closed
                                  ? "Gate closed"
                                  : (data.rooms.find(
                                      (r) => r.id === e.destination,
                                    )?.name ?? "Unexplored passage")}
                              </small>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                  <div className="section-title">
                    THINGS TO DISCOVER <span>{objects.length}</span>
                  </div>
                  <div className="object-list">
                    {objects.map((o) => (
                      <article className="object-card" key={String(o.id)}>
                        <div className="object-icon">
                          {o.kind === "character"
                            ? "♧"
                            : o.kind === "container"
                              ? "▣"
                              : o.kind === "exit"
                                ? "╬"
                                : "✧"}
                        </div>
                        <div>
                          <h3>{o.name}</h3>
                          <p>{o.description}</p>
                          <div className="button-row">
                            {o.actions.map((a) => (
                              <button
                                key={a.id}
                                disabled={!enabled}
                                onClick={() =>
                                  void action(() =>
                                    conn.reducers.interact({
                                      objectId: o.id,
                                      action: a.id,
                                      requestId: crypto.randomUUID(),
                                    }),
                                  )
                                }
                              >
                                {a.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </article>
                    ))}
                    {!objects.length && (
                      <p className="muted">
                        A quiet corner of the world, waiting for a story.
                      </p>
                    )}
                  </div>
                  <div className="section-title">TRAVELERS HERE</div>
                  <div className="travelers">
                    {players.map((p) => (
                      <span key={p.identity.toHexString()}>
                        ○ {p.name}
                        {p.identity.toHexString() === identity ? " (you)" : ""}
                      </span>
                    ))}
                  </div>
                </section>
                <section className="journal panel">
                  <div className="panel-heading">
                    <span>THE CHRONICLE</span>
                    <span>Words leave echoes</span>
                  </div>
                  <div
                    className="journal-scroll"
                    ref={journal}
                    role="log"
                    aria-label="Game chronicle"
                    aria-live="polite"
                  >
                    <div className="journal-intro">
                      <span>✦</span>
                      <h2>The world is listening.</h2>
                      <p>
                        Every footstep, every word, another thread in the tale.
                      </p>
                    </div>
                    {entries.map((e) => (
                      <div className={`entry ${e.kind}`} key={e.key}>
                        <span className="entry-author">
                          {e.author}
                          {e.kind === "private" ? " · whisper" : ""}
                        </span>
                        <p>{e.text}</p>
                      </div>
                    ))}
                  </div>
                  <form
                    className="chat-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void action(async () => {
                        if (recipient)
                          await conn.reducers.tell({
                            target: recipient,
                            message,
                          });
                        else await conn.reducers.say({ message });
                        setMessage("");
                      });
                    }}
                  >
                    <label className="sr-only" htmlFor="recipient">
                      Chat recipient
                    </label>
                    <select
                      id="recipient"
                      value={recipient}
                      onChange={(e) => setRecipient(e.target.value)}
                    >
                      <option value="">Say to the room</option>
                      {players
                        .filter((p) => p.identity.toHexString() !== identity)
                        .map((p) => (
                          <option key={p.name} value={p.name}>
                            Whisper to {p.name}
                          </option>
                        ))}
                    </select>
                    <div className="input-row">
                      <input
                        aria-label="Chat message"
                        value={message}
                        maxLength={1000}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Say something…"
                      />
                      <button
                        aria-label="Send message"
                        disabled={!enabled || !message.trim()}
                      >
                        ↵
                      </button>
                    </div>
                  </form>
                </section>
              </main>
            ))}
          <section className={`agent-dock panel ${agentOpen ? "open" : ""}`}>
            <button
              className="agent-toggle"
              onClick={() => setAgentOpen(!agentOpen)}
            >
              <span>✦ YOUR BUILDER · CLAUDE CODE</span>
              <span>
                {active ? "Working…" : grant ? "Paired" : "Connect your agent"}{" "}
                {agentOpen ? "−" : "+"}
              </span>
            </button>
            {agentOpen && (
              <div className="agent-grid">
                <div>
                  <h2>Tell your agent what you imagine.</h2>
                  <p className="muted">
                    Your own Claude Code drafts scripts and builds rooms.
                    Inspect and publish object drafts in Build.
                  </p>
                  {grant ? (
                    <div className="bridge-card connected">
                      <strong>Claude Code paired</strong>
                      <p>
                        Keep the local bridge running while making requests.
                      </p>
                      <button
                        disabled={!enabled}
                        onClick={() =>
                          void action(() => conn!.reducers.revokeConsent({}))
                        }
                      >
                        Disconnect & revoke consent
                      </button>
                    </div>
                  ) : (
                    <details className="bridge-card" open>
                      <summary>Connect your Claude Code</summary>
                      <p>
                        Install Node.js 22+, sign in to Claude Code, then run:
                      </p>
                      <pre>
                        {
                          "git clone https://github.com/dbrinkmann/spacetime-mud.git\ncd spacetime-mud\nnpm ci\nnpm run bridge"
                        }
                      </pre>
                      <p>
                        Approve the terminal prompt and open its pairing link.
                      </p>
                      <label>
                        Bridge identity
                        <input
                          aria-label="Bridge identity"
                          value={bridge}
                          onChange={(e) => {
                            setBridge(e.target.value);
                            setConsented(false);
                          }}
                        />
                      </label>
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={consented}
                          onChange={(e) => setConsented(e.target.checked)}
                        />
                        I consent to using my Claude Code for my game requests.
                        Game context is sent to Claude and counts toward my
                        usage. I can revoke anytime.
                      </label>
                      <button
                        className="primary"
                        disabled={
                          !enabled ||
                          !consented ||
                          !/^[a-fA-F0-9]{64}$/.test(bridge)
                        }
                        onClick={() =>
                          void action(() =>
                            conn!.reducers.consent({
                              bridge: Identity.fromString(bridge),
                            }),
                          )
                        }
                      >
                        Pair & enable Claude Code
                      </button>
                    </details>
                  )}
                </div>
                <div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void action(async () => {
                        await conn!.reducers.requestAgent({ prompt });
                        setPrompt("");
                      });
                    }}
                  >
                    <label>
                      Describe your idea
                      <textarea
                        aria-label="Agent request"
                        rows={5}
                        value={prompt}
                        maxLength={3000}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Make a fountain that grants each traveler a silver coin once, then whispers a different story on later visits."
                      />
                    </label>
                    <button
                      className="primary"
                      disabled={
                        !enabled || !grant || !!active || !prompt.trim()
                      }
                    >
                      Ask Claude Code
                    </button>
                    {active && (
                      <button
                        disabled={!enabled}
                        onClick={() =>
                          void action(() =>
                            conn!.reducers.cancelJob({ id: active.id }),
                          )
                        }
                        type="button"
                      >
                        Cancel request
                      </button>
                    )}
                  </form>
                  <div className="job-list">
                    {jobs.slice(0, 8).map((j) => (
                      <article key={String(j.id)}>
                        <span className="eyebrow">{j.status}</span>
                        <p>{j.prompt}</p>
                        <pre>{j.result}</pre>
                        {j.status === "done" && (
                          <button onClick={() => setTab("build")}>
                            Open workshop
                          </button>
                        )}
                      </article>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>
          <footer>
            <span>Built by travelers. Kept by the world.</span>
            <span>
              Persistent worlds · Scripted wonders · Local Claude Code
            </span>
          </footer>
        </>
      )}
    </div>
  );
}
