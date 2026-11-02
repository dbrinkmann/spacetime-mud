import React, { useEffect, useState } from "react";
import { Viewport, type ViewCommand, type ViewStatus } from "./Viewport";
import { parseDefinition, type Room, type Character } from "./contract";
import { validateNavigation } from "./navigation";
import "./poc.css";
const base = import.meta.env.BASE_URL + "poc/";
export function Workshop() {
  const [room, setRoom] = useState<Room>(),
    [character, setCharacter] = useState<Character>(),
    [guest, setGuest] = useState<Character>();
  const [tab, setTab] = useState<"room" | "character">("character"),
    [roomText, setRoomText] = useState(""),
    [characterText, setCharacterText] = useState("");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [editor, setEditor] = useState(false),
    [anchors, setAnchors] = useState(false),
    [cosmetics, setCosmetics] = useState(true);
  const [command, setCommand] = useState<ViewCommand>({
      id: 0,
      action: "idle",
    }),
    [status, setStatus] = useState<ViewStatus>({
      animation: "idle",
      seat: null,
      selected: null,
      boxes: 0,
      message: "",
    });
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const files = await Promise.all(
          ["room.json", "traveler.json", "wizard.json"].map(async (file) => {
            const r = await fetch(base + "examples/" + file);
            if (!r.ok) throw Error(`Could not load ${file}: ${r.status}`);
            return r.text();
          }),
        );
        const r = parseDefinition(files[0], "room"),
          c = parseDefinition(files[1], "character"),
          g = parseDefinition(files[2], "character");
        validateNavigation(r);
        if (cancelled) return;
        setRoom(r);
        setCharacter(c);
        setGuest(g);
        setRoomText(JSON.stringify(r, null, 2));
        setCharacterText(JSON.stringify(c, null, 2));
        try {
          setSaved(!!localStorage.getItem("box-world-poc-v1"));
        } catch {}
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  function send(action: ViewCommand["action"], value?: boolean) {
    setCommand((c) => ({ id: c.id + 1, action, value }));
  }
  function apply() {
    try {
      if (tab === "room") {
        const r = parseDefinition(roomText, "room");
        validateNavigation(r);
        setRoom(r);
      } else {
        setCharacter(parseDefinition(characterText, "character"));
      }
      setCosmetics(true);
      setAnchors(false);
      setError("");
      setNotice("Definition accepted. The scene was rebuilt from your JSON.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  async function switchCharacter(file: string) {
    try {
      const response = await fetch(base + "examples/" + file);
      if (!response.ok) throw Error("Could not load character.");
      const c = parseDefinition(await response.text(), "character");
      setCharacter(c);
      setCharacterText(JSON.stringify(c, null, 2));
      setCosmetics(true);
      setAnchors(false);
      setError("");
      setNotice("Same pivots and animations. Different authored geometry.");
    } catch (e) {
      setError(String(e));
    }
  }
  function save() {
    try {
      localStorage.setItem(
        "box-world-poc-v1",
        JSON.stringify({ room, character }),
      );
      setSaved(true);
      setNotice("Applied definitions saved in this browser.");
    } catch {
      setError("Browser storage unavailable. Download JSON to keep your work.");
    }
  }
  function restore() {
    try {
      const data = JSON.parse(localStorage.getItem("box-world-poc-v1") ?? "{}"),
        r = parseDefinition(JSON.stringify(data.room), "room"),
        c = parseDefinition(JSON.stringify(data.character), "character");
      validateNavigation(r);
      setRoom(r);
      setCharacter(c);
      setRoomText(JSON.stringify(r, null, 2));
      setCharacterText(JSON.stringify(c, null, 2));
      setAnchors(false);
      setCosmetics(true);
      setError("");
      setNotice("Restored your saved definitions.");
    } catch (e) {
      setError(String(e));
    }
  }
  function download() {
    const content = tab === "room" ? roomText : characterText;
    const url = URL.createObjectURL(
        new Blob([content], { type: "application/json" }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = `${tab}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const selected = room?.objects.find((o) => o.id === status.selected);
  return (
    <div className="poc-app">
      <header className="poc-header">
        <a href="./" className="poc-brand">
          <b>✦</b> SPACETIME
        </a>
        <div className="poc-title">
          {room?.name ?? "Loading workshop…"}
          <small>BOX-BUILT WORLD · PROOF OF CONCEPT</small>
        </div>
        <span className="poc-badge">LOCAL PREVIEW</span>
      </header>
      <div className="poc-layout">
        <main className="poc-stage">
          {room && character && guest && (
            <Viewport
              room={room}
              character={character}
              guest={guest}
              command={command}
              onStatus={setStatus}
              onError={setError}
            />
          )}
          <div className="poc-scene-top">
            <span>◈ {status.boxes} boxes · six animated parts</span>
            <button onClick={() => send("reset")}>Reset camera</button>
          </div>
          <div className="poc-scene-bottom">
            <div>
              <strong>
                {selected?.name ?? "A world made of possibilities."}
              </strong>
              <span>{status.message || "Loading scene…"}</span>
            </div>
            {selected?.seat && !status.seat && (
              <button
                className="poc-primary"
                onClick={() => send("sitSelected")}
              >
                Sit here
              </button>
            )}
            {status.seat && (
              <button className="poc-primary" onClick={() => send("stand")}>
                Stand up
              </button>
            )}
          </div>
        </main>
        <aside className="poc-sidebar">
          <section>
            <p className="poc-eyebrow">CHARACTER LAB</p>
            <h1>
              Simple parts.
              <br />
              Endless personality.
            </h1>
            <p>
              Every character and prop comes from editable JSON. These are
              diagnostic fixtures, not a built-in model catalog.
            </p>
            <label>
              Character definition
              <select
                aria-label="Character definition"
                value={
                  character?.name === "Rowan"
                    ? "traveler.json"
                    : character?.name === "Mira"
                      ? "wizard.json"
                      : "custom"
                }
                onChange={(e) => void switchCharacter(e.target.value)}
              >
                <option value="traveler.json">Rowan · traveler</option>
                <option value="wizard.json">Mira · wizard</option>
                {character?.name !== "Rowan" && character?.name !== "Mira" && (
                  <option value="custom" disabled>
                    {character?.name ?? "Loading…"} · custom
                  </option>
                )}
              </select>
            </label>
            <div className="poc-checks">
              <label>
                <input
                  type="checkbox"
                  checked={cosmetics}
                  onChange={(e) => {
                    setCosmetics(e.target.checked);
                    send("cosmetics", e.target.checked);
                  }}
                />
                Cosmetic attachments
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={anchors}
                  onChange={(e) => {
                    setAnchors(e.target.checked);
                    send("anchors", e.target.checked);
                  }}
                />
                Seat anchors & collision
              </label>
            </div>
          </section>
          <section>
            <p className="poc-eyebrow">SHARED ANIMATION CONTRACT</p>
            <div className="poc-animations">
              {(["idle", "walk", "sit", "wave", "talk"] as const).map((a) => (
                <button
                  key={a}
                  aria-pressed={status.animation === a}
                  className={status.animation === a ? "active" : ""}
                  onClick={() => send(a)}
                >
                  {a}
                </button>
              ))}
            </div>
            <p className="poc-hint">
              Walk previews in place. Click the floor to travel. Select a chair
              to test seating. Cosmetics follow their parent part rigidly.
            </p>
          </section>
          <section>
            <p className="poc-eyebrow">AGENT WORKBENCH</p>
            <button className="poc-wide" onClick={() => setEditor(!editor)}>
              {editor ? "Close definitions" : "Edit definitions"} <span>↗</span>
            </button>
            <div className="poc-small-actions">
              <button onClick={save} disabled={!room}>
                Save locally
              </button>
              <button onClick={restore} disabled={!saved}>
                Restore saved
              </button>
            </div>
            <a href={base + "AUTHORING.md"} target="_blank" rel="noreferrer">
              Authoring contract ↗
            </a>
            <p className="poc-hint">
              Local rendering and authoring prototype. The second character is a
              preview fixture. Multiplayer, live agents, and publication are not
              connected here.
            </p>
          </section>
        </aside>
      </div>
      {error && (
        <div className="poc-error" role="alert">
          <strong>Definition rejected / runtime issue</strong>
          <pre>{error}</pre>
          <button onClick={() => setError("")}>Dismiss</button>
        </div>
      )}
      {notice && (
        <p className="poc-notice" role="status">
          {notice}
        </p>
      )}
      {editor && (
        <section className="poc-editor">
          <div className="poc-editor-heading">
            <nav aria-label="Definition type">
              <button
                className={tab === "character" ? "active" : ""}
                onClick={() => setTab("character")}
              >
                Character JSON
              </button>
              <button
                className={tab === "room" ? "active" : ""}
                onClick={() => setTab("room")}
              >
                Room JSON
              </button>
            </nav>
            <div>
              <label className="poc-import">
                Import JSON
                <input
                  aria-label="Import JSON"
                  type="file"
                  accept=".json,application/json"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 500000) {
                      setError("File exceeds 500 KB.");
                      return;
                    }
                    const text = await file.text();
                    tab === "room" ? setRoomText(text) : setCharacterText(text);
                    setNotice(
                      "Imported into the editor. Validate & apply to preview.",
                    );
                    e.target.value = "";
                  }}
                />
              </label>
              <button onClick={download}>Download JSON</button>
              <button className="poc-primary" onClick={apply}>
                Validate & apply
              </button>
            </div>
          </div>
          <textarea
            aria-label={`${tab} JSON`}
            spellCheck={false}
            value={tab === "room" ? roomText : characterText}
            onChange={(e) =>
              tab === "room"
                ? setRoomText(e.target.value)
                : setCharacterText(e.target.value)
            }
          />
          <p>
            Invalid definitions leave the current scene intact. Applying valid
            definitions resets poses and placement. Positions use meters;
            rotations use degrees; +Y is up and +Z is forward.
          </p>
        </section>
      )}
      <footer className="poc-footer">
        <span>
          Drag to orbit · Scroll / pinch to zoom · Click the floor to walk
        </span>
        <a href="./">Return to the current game ↗</a>
      </footer>
    </div>
  );
}
