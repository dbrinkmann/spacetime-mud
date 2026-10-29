import React, { useEffect, useRef, useState } from "react";
import { Identity } from "spacetimedb";
import { useGame } from "./connection";
import { directions } from "../shared/agent";
import { parseCommand } from "../shared/commands";
import "./style.css";

const help =
  'look / l — describe this room\nnorth / n, south / s, east / e, west / w, up / u, down / d — move\nsay <message> or \'<message> — room chat\ntell AIAgent <request> or ask <request> — build with Claude Code\ntell "NPC or player name" <message> — talk privately\nbuild — open the manual builder\nwho — online players · home — return to the Nexus\n↑ / ↓ — command history';
export function App() {
  const { conn, identity, status, data, connectionError } = useGame();
  const me = data.players.find((p) => p.identity.toHexString() === identity),
    room = data.rooms.find((r) => r.id === me?.roomId);
  const [name, setName] = useState(""),
    [command, setCommand] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState<"agent" | "build" | "help">("agent");
  const [history, setHistory] = useState<string[]>([]),
    [historyIndex, setHistoryIndex] = useState(0),
    [local, setLocal] = useState<{ id: number; text: string }[]>([]);
  const [bridge, setBridge] = useState(
      () => new URLSearchParams(location.hash.slice(1)).get("bridge") ?? "",
    ),
    [consented, setConsented] = useState(false);
  const [prompt, setPrompt] = useState(""),
    [direction, setDirection] = useState("north"),
    [buildName, setBuildName] = useState(""),
    [description, setDescription] = useState(""),
    [biography, setBiography] = useState(""),
    [buildKind, setBuildKind] = useState("room");
  const input = useRef<HTMLInputElement>(null),
    scroll = useRef<HTMLDivElement>(null);
  const residents = data.npcs.filter((n) => n.roomId === room?.id),
    playersHere = data.players.filter((p) => p.roomId === room?.id && p.online),
    grant = data.grants[0];
  const jobs = [...data.jobs].sort((a, b) =>
    Number(b.createdAt.microsSinceUnixEpoch - a.createdAt.microsSinceUnixEpoch),
  );
  const active = jobs.find(
    (j) => j.status === "pending" || j.status === "working",
  );
  const chat = data.chat.filter((c) => c.roomId === room?.id);
  const entries = [
    ...chat.map((c) => ({
      key: `chat-${c.id}`,
      time: c.timestamp.microsSinceUnixEpoch,
      author: c.author,
      text: c.text,
      kind: c.kind,
    })),
    ...data.inbox.map((c) => ({
      key: `inbox-${c.id}`,
      time: c.timestamp.microsSinceUnixEpoch,
      author: c.author,
      text: c.text,
      kind: "private",
    })),
  ].sort((a, b) => Number(a.time - b.time));
  useEffect(() => {
    scroll.current?.scrollTo(0, scroll.current.scrollHeight);
  }, [entries.length, local.length, room?.id]);
  useEffect(() => {
    const update = () => {
      setBridge(
        new URLSearchParams(location.hash.slice(1)).get("bridge") ?? "",
      );
      setConsented(false);
    };
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  function log(text: string) {
    setLocal((prev) => [
      ...prev.slice(-29),
      { id: Date.now() + Math.random(), text },
    ]);
  }
  async function action(fn: () => Promise<void>) {
    setNotice("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function execute(raw: string) {
    if (!conn || status !== "Live") return;
    await action(async () => {
      const c = parseCommand(raw);
      setHistory((h) => [...h.slice(-49), raw]);
      setHistoryIndex(0);
      setCommand("");
      switch (c.kind) {
        case "go":
          await conn.reducers.go({ direction: c.direction });
          break;
        case "say":
          await conn.reducers.say({ message: c.message });
          break;
        case "tell":
          await conn.reducers.tell({ target: c.target, message: c.message });
          break;
        case "agent":
          await conn.reducers.requestAgent({ prompt: c.prompt });
          break;
        case "home":
          await conn.reducers.home({});
          break;
        case "look":
          log(`${room?.name}\n${room?.description}`);
          break;
        case "who":
          log(
            `Online: ${data.players
              .filter((p) => p.online)
              .map((p) => p.name)
              .join(", ")}`,
          );
          break;
        case "help":
          setTab("help");
          break;
        case "build":
          setTab("build");
          break;
        case "clear":
          setLocal([]);
          break;
      }
    });
    input.current?.focus();
  }
  const enabled = !!conn && status === "Live" && !busy;
  return (
    <div className="app">
      <header>
        <a className="brand" href="#" onClick={(e) => e.preventDefault()}>
          <span className="sigil">✦</span>
          <span>
            SPACETIME<span className="brand-muted">MUD</span>
            <small>A WORLD WE MAKE TOGETHER</small>
          </span>
        </a>
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
      {connectionError && (
        <div className="notice" role="alert">
          {connectionError}{" "}
          <button onClick={() => location.reload()}>Reconnect</button>
        </div>
      )}
      {notice && (
        <div className="notice" role="alert">
          {notice}
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
          <p className="eyebrow">YOUR NEXT WORLD DOESN’T EXIST. YET.</p>
          <h1>Enter the Nexus.</h1>
          <p>
            A shared text adventure shaped by the people inside it.
            <br />
            Imagine a place. Open a path. Meet someone unexpected.
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
                minLength={2}
                maxLength={24}
                required
                placeholder="Your traveler’s name"
                autoComplete="nickname"
              />
              <button className="primary" disabled={!enabled}>
                Enter world →
              </button>
            </div>
          </form>
          <p className="fine">
            Your character is remembered in this browser. No password needed.
            <br />
            Building is open to everyone. Connecting Claude Code is optional and
            requires consent.
          </p>
          {bridge && (
            <p className="pairing-note">
              Local bridge detected. Enter the world to review and approve
              pairing.
            </p>
          )}
        </main>
      ) : (
        <>
          <div className="world-bar">
            <span>
              THE NEXUS <span className="muted">/ Shared world</span>
            </span>
            <span>
              {data.rooms.length} rooms <b>·</b>{" "}
              {data.players.filter((p) => p.online).length} online <b>·</b>{" "}
              <strong>{me.name}</strong>
            </span>
          </div>
          <main className="game-grid">
            <section className="room-panel panel">
              <p className="eyebrow">
                YOU ARE HERE <span>ROOM {room?.id.toString()}</span>
              </p>
              <div className="room-symbol" aria-hidden="true">
                ◇
              </div>
              <h1>{room?.name ?? "Finding your room…"}</h1>
              <p className="description">{room?.description}</p>
              <div className="section-title">
                PASSAGES <span>{room?.exits.length ?? 0} OPEN</span>
              </div>
              <div className="exits">
                {room?.exits.map((exit) => (
                  <button
                    key={exit.direction}
                    disabled={!enabled}
                    onClick={() => void execute(exit.direction)}
                  >
                    <span>{exit.direction} ↗</span>
                    <small>
                      {data.rooms.find((r) => r.id === exit.destination)?.name}
                    </small>
                  </button>
                ))}
              </div>
              {!room?.exits.length && (
                <div className="empty-path">
                  An unwritten world.
                  <br />
                  <span>Create the first passage with AIAgent or Build.</span>
                </div>
              )}
              <div className="section-title">IN THIS ROOM</div>
              <div className="people">
                <div>
                  <span className="avatar">✧</span>
                  <span>
                    AIAgent
                    <small>World builder · powered by your Claude Code</small>
                  </span>
                  <button onClick={() => setTab("agent")}>Ask</button>
                </div>
                {residents.map((n) => (
                  <div key={n.id.toString()}>
                    <span className="avatar npc">♧</span>
                    <span title={n.description}>
                      {n.name}
                      <small>{n.description}</small>
                    </span>
                    <button
                      onClick={() => {
                        setCommand(`tell "${n.name}" `);
                        input.current?.focus();
                      }}
                    >
                      Talk
                    </button>
                  </div>
                ))}
                {playersHere.map((p) => (
                  <div key={p.identity.toHexString()}>
                    <span className="avatar">○</span>
                    <span>
                      {p.name}
                      {p.identity.toHexString() === identity ? " (you)" : ""}
                      <small>Traveler</small>
                    </span>
                  </div>
                ))}
              </div>
              {room?.id !== 1n && (
                <button
                  className="text-button"
                  disabled={!enabled}
                  onClick={() => void execute("home")}
                >
                  ↶ Return to the Nexus
                </button>
              )}
            </section>
            <section className="journal panel">
              <div className="panel-heading">
                <span>THE CHRONICLE</span>
                <span className="muted">Room chat & private messages</span>
              </div>
              <div
                className="journal-scroll"
                ref={scroll}
                role="log"
                aria-label="Game chronicle"
                aria-live="polite"
              >
                <div className="journal-intro">
                  <span>✦</span>
                  <h2>Every world starts with a word.</h2>
                  <p>
                    Say hello, sketch a new room, or ask your agent to bring an
                    idea to life.
                  </p>
                </div>
                {entries.map((e) => (
                  <div className={`entry ${e.kind}`} key={e.key}>
                    <span className="entry-author">
                      {e.author}
                      {e.kind === "private" ? " · private" : ""}
                    </span>
                    <p>{e.text}</p>
                  </div>
                ))}
                {local.map((e) => (
                  <div className="entry local" key={e.id}>
                    <p>{e.text}</p>
                  </div>
                ))}
              </div>
              <form
                className="command-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void execute(command);
                }}
              >
                <label htmlFor="command" className="sr-only">
                  Game command
                </label>
                <span className="prompt-mark">›</span>
                <input
                  id="command"
                  ref={input}
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="say Hello · tell AIAgent… · help"
                  autoComplete="off"
                  maxLength={2100}
                  disabled={!enabled}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                      e.preventDefault();
                      const next = Math.max(
                        0,
                        Math.min(
                          history.length,
                          historyIndex + (e.key === "ArrowUp" ? 1 : -1),
                        ),
                      );
                      setHistoryIndex(next);
                      setCommand(next ? history[history.length - next] : "");
                    }
                  }}
                />
                <button
                  aria-label="Send command"
                  disabled={!enabled || !command.trim()}
                >
                  ↵
                </button>
              </form>
              <div className="command-hint">
                <span>ENTER to send · ↑↓ history</span>
                <button onClick={() => setTab("help")}>Command guide</button>
              </div>
            </section>
            <aside className="tools-panel panel">
              <nav className="tabs" aria-label="World tools">
                {(["agent", "build", "help"] as const).map((t) => (
                  <button
                    className={tab === t ? "selected" : ""}
                    key={t}
                    onClick={() => setTab(t)}
                  >
                    {t === "agent"
                      ? "AIAgent"
                      : t === "build"
                        ? "Build"
                        : "Guide"}
                  </button>
                ))}
              </nav>
              {tab === "agent" ? (
                <div className="tool-content">
                  <p className="eyebrow">YOUR IMAGINATION, CONNECTED</p>
                  <h2>Give the world an idea.</h2>
                  <p className="muted">
                    Your local Claude Code creates places and characters from
                    your requests.
                  </p>
                  {grant ? (
                    <div className="bridge-card connected">
                      <strong>✦ Claude Code paired</strong>
                      <p>
                        Only your requests use this bridge. Keep its terminal
                        open.
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
                        On your computer, install Node.js 22+ and sign in to
                        Claude Code. Then run:
                      </p>
                      <pre>
                        git clone
                        https://github.com/dbrinkmann/spacetime-mud.git{`\n`}cd
                        spacetime-mud{`\n`}npm ci{`\n`}npm run bridge
                      </pre>
                      <p>
                        Approve the terminal prompt, then open the pairing link
                        it prints.
                      </p>
                      <label htmlFor="bridge">
                        Bridge identity (from the link)
                      </label>
                      <input
                        id="bridge"
                        value={bridge}
                        onChange={(e) => {
                          setBridge(e.target.value);
                          setConsented(false);
                        }}
                        placeholder="64-character bridge identity"
                      />
                      <label className="consent">
                        <input
                          type="checkbox"
                          checked={consented}
                          onChange={(e) => setConsented(e.target.checked)}
                        />
                        I consent to this local bridge using my Claude Code for
                        my game requests. Game context is sent to Claude and
                        counts toward my usage. I can revoke this anytime.
                      </label>
                      <button
                        className="primary"
                        disabled={
                          !enabled ||
                          !consented ||
                          !/^[0-9a-f]{64}$/i.test(bridge)
                        }
                        onClick={() =>
                          void action(async () => {
                            await conn!.reducers.consent({
                              bridge: Identity.fromString(bridge),
                            });
                            window.history.replaceState(
                              null,
                              "",
                              location.pathname + location.search,
                            );
                            setConsented(false);
                          })
                        }
                      >
                        Pair & enable Claude Code
                      </button>
                    </details>
                  )}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void action(async () => {
                        await conn!.reducers.requestAgent({ prompt });
                        setPrompt("");
                      });
                    }}
                  >
                    <label htmlFor="idea">Ask AIAgent</label>
                    <textarea
                      id="idea"
                      rows={4}
                      maxLength={2000}
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="Create a moonlit garden to the north, with a fountain that remembers…"
                      required
                    />
                    <button
                      className="primary wide"
                      disabled={!enabled || !grant || !!active}
                    >
                      ✦ {active ? "Agent is working…" : "Imagine & build"}
                    </button>
                  </form>
                  {!grant && (
                    <p className="fine">
                      You can explore, chat, and use the Build tab without an
                      agent.
                    </p>
                  )}
                  <div className="section-title">YOUR REQUESTS</div>
                  {!jobs.length && (
                    <p className="fine">
                      Your agent’s progress and replies will appear here.
                    </p>
                  )}
                  {jobs.slice(0, 6).map((j) => (
                    <article className="job" key={j.id.toString()}>
                      <div>
                        <span className={`job-status ${j.status}`}>
                          {j.status}
                        </span>
                        {["pending", "working"].includes(j.status) && (
                          <button
                            disabled={!enabled}
                            onClick={() =>
                              void action(() =>
                                conn!.reducers.cancelJob({ id: j.id }),
                              )
                            }
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                      <p>{j.prompt}</p>
                      {j.result && <p className="job-result">{j.result}</p>}
                    </article>
                  ))}
                </div>
              ) : tab === "build" ? (
                <div className="tool-content">
                  <p className="eyebrow">LEAVE SOMETHING BEHIND</p>
                  <h2>Shape this place.</h2>
                  <p className="muted">
                    Build directly. Your creations are shared with everyone,
                    immediately.
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void action(async () => {
                        if (buildKind === "room")
                          await conn!.reducers.buildRoom({
                            direction,
                            name: buildName,
                            description,
                          });
                        else
                          await conn!.reducers.buildNpc({
                            name: buildName,
                            description,
                            biography,
                          });
                        setBuildName("");
                        setDescription("");
                        setBiography("");
                        log(
                          buildKind === "room"
                            ? "Your passage is open. Choose it under Passages to explore."
                            : "Your character has arrived. Use Talk to start a conversation.",
                        );
                      });
                    }}
                  >
                    <label htmlFor="kind">Create a…</label>
                    <select
                      id="kind"
                      value={buildKind}
                      onChange={(e) => setBuildKind(e.target.value)}
                    >
                      <option value="room">Room & two-way passage</option>
                      <option value="npc">Character / NPC</option>
                    </select>
                    {buildKind === "room" && (
                      <>
                        <label htmlFor="direction">Direction from here</label>
                        <select
                          id="direction"
                          value={direction}
                          onChange={(e) => setDirection(e.target.value)}
                        >
                          {directions.map((d) => (
                            <option
                              value={d}
                              key={d}
                              disabled={room?.exits.some(
                                (e) => e.direction === d,
                              )}
                            >
                              {d}
                              {room?.exits.some((e) => e.direction === d)
                                ? " (occupied)"
                                : ""}
                            </option>
                          ))}
                        </select>
                      </>
                    )}
                    <label htmlFor="build-name">Name</label>
                    <input
                      id="build-name"
                      required
                      maxLength={buildKind === "room" ? 80 : 40}
                      value={buildName}
                      onChange={(e) => setBuildName(e.target.value)}
                      placeholder={
                        buildKind === "room"
                          ? "The Glass Orchard"
                          : "The Orchard Keeper"
                      }
                    />
                    <label htmlFor="description">What do travelers see?</label>
                    <textarea
                      id="description"
                      required
                      rows={5}
                      maxLength={buildKind === "room" ? 3000 : 1500}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Give this corner of the world a little life…"
                    />
                    {buildKind === "npc" && (
                      <>
                        <label htmlFor="biography">
                          Personality & backstory
                        </label>
                        <textarea
                          id="biography"
                          required
                          rows={4}
                          maxLength={3000}
                          value={biography}
                          onChange={(e) => setBiography(e.target.value)}
                          placeholder="Who are they? What do they remember?"
                        />
                      </>
                    )}
                    <button className="primary wide" disabled={!enabled}>
                      Create {buildKind === "room" ? "room" : "character"} →
                    </button>
                  </form>
                </div>
              ) : (
                <div className="tool-content">
                  <p className="eyebrow">A FEW WORDS OPEN WORLDS</p>
                  <h2>Traveler’s guide</h2>
                  <p>
                    Start by creating a passage from the Nexus. Ask AIAgent for
                    a room in a free direction, or use Build.
                  </p>
                  <pre className="help">{help}</pre>
                  <h3>Bring a character to life</h3>
                  <p>
                    Create an NPC with a biography, then use Talk. Your paired
                    Claude Code plays that character using the room and your
                    recent conversation.
                  </p>
                  <h3>A world that remembers</h3>
                  <p>
                    Your rooms and characters persist. Your identity stays in
                    this browser. Clearing browser storage creates a new
                    identity.
                  </p>
                  <h3>Your agent, your choice</h3>
                  <p>
                    Consent is required in both the bridge terminal and the
                    game. Disconnecting revokes pending actions. The bridge
                    receives your requests and public game context; Claude
                    receives no computer tools.
                  </p>
                </div>
              )}
            </aside>
          </main>
          <footer>
            <span>Built by travelers. Kept in SpacetimeDB.</span>
            <span>2.13.0 · TypeScript · Local Claude Code</span>
          </footer>
        </>
      )}
    </div>
  );
}
