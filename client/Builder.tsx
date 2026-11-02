import React, { useState } from "react";
import type { DbConnection } from "./module_bindings";
import type { Room } from "./module_bindings/types";
import type { Snapshot } from "./connection";
import { directions, scriptingGuide } from "../shared/agent";
import { templates } from "../shared/templates";
import { WorldMap } from "./WorldMap";
type Props = {
  conn: DbConnection;
  data: Snapshot;
  room: Room;
  identity: string;
  enabled: boolean;
  action: (fn: () => Promise<void>) => Promise<void>;
};
export function Builder({
  conn,
  data,
  room,
  identity,
  enabled,
  action,
}: Props) {
  const [section, setSection] = useState("objects"),
    [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [direction, setDirection] = useState("north");
  const [selected, setSelected] = useState("0"),
    [kind, setKind] = useState("scenery"),
    [objectName, setObjectName] = useState(templates[0].name),
    [objectDescription, setObjectDescription] = useState(
      templates[0].description,
    ),
    [source, setSource] = useState(templates[0].source),
    [actions, setActions] = useState("touch: Touch the stone");
  const [testEvent, setTestEvent] = useState("on_touch"),
    [collaborator, setCollaborator] = useState(""),
    [x, setX] = useState(String(room.x)),
    [y, setY] = useState(String(room.y)),
    [floor, setFloor] = useState(String(room.floor)),
    [destination, setDestination] = useState(""),
    [gate, setGate] = useState("0"),
    [secret, setSecret] = useState(false);
  const zone = data.zones.find((z) => z.id === room.zoneId),
    canEdit =
      zone?.owner.toHexString() === identity ||
      data.members.some(
        (m) =>
          m.zoneId === room.zoneId && m.identity.toHexString() === identity,
      );
  const objects = data.objects.filter((o) => o.zoneId === room.zoneId),
    versions = data.versions
      .filter((v) => String(v.objectId) === selected)
      .sort((a, b) => Number(b.id - a.id));
  const latest = versions[0],
    obj = objects.find((o) => String(o.id) === selected);
  function loadObject(id: string) {
    setSelected(id);
    const o = objects.find((o) => String(o.id) === id),
      v = data.versions
        .filter((v) => String(v.objectId) === id)
        .sort((a, b) => Number(b.id - a.id))[0];
    if (o && v) {
      setKind(o.kind);
      setObjectName(v.name);
      setObjectDescription(v.description);
      setSource(v.source);
      setActions(v.actions.map((a) => `${a.id}: ${a.label}`).join("\n"));
      setTestEvent(`on_${v.actions[0]?.id ?? "enter"}`);
    }
  }
  function loadTemplate(index: number) {
    const t = templates[index];
    setSelected("0");
    setKind(t.kind);
    setObjectName(t.name);
    setObjectDescription(t.description);
    setSource(t.source);
    setActions(t.actions.map((a) => `${a.id}: ${a.label}`).join("\n"));
    setTestEvent(`on_${t.actions[0].id}`);
  }
  return (
    <div className="builder-layout">
      <section className="panel builder-main">
        <div className="panel-heading">
          <span>THE WORKSHOP</span>
          <span>{zone?.name}</span>
        </div>
        <nav className="tabs">
          {["objects", "rooms", "zones", "guide"].map((t) => (
            <button
              key={t}
              className={section === t ? "selected" : ""}
              onClick={() => setSection(t)}
            >
              {t}
            </button>
          ))}
        </nav>
        <div className="tool-content">
          {!canEdit && section !== "zones" && section !== "guide" ? (
            <div className="empty-state">
              <h2>A world of your own.</h2>
              <p>
                This realm belongs to another builder. Create a zone to start
                shaping your own rooms and objects.
              </p>
              <button className="primary" onClick={() => setSection("zones")}>
                Create a zone
              </button>
            </div>
          ) : section === "objects" ? (
            <>
              <div className="two-fields">
                <label>
                  Object
                  <select
                    aria-label="Object"
                    value={selected}
                    onChange={(e) => loadObject(e.target.value)}
                  >
                    <option value="0">New object in this room</option>
                    {objects.map((o) => (
                      <option key={String(o.id)} value={String(o.id)}>
                        #{String(o.id)} {o.name}
                        {o.active ? "" : " · draft"}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Start with a template
                  <select
                    aria-label="Template"
                    defaultValue=""
                    onChange={(e) => loadTemplate(Number(e.target.value))}
                  >
                    <option disabled value="">
                      Choose a template
                    </option>
                    {templates.map((t, i) => (
                      <option key={t.name} value={i}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void action(async () => {
                    const before = new Set(
                      [...conn.db.myVersions.iter()].map((v) => v.id),
                    );
                    await conn.reducers.saveDraft({
                      roomId: obj?.roomId ?? room.id,
                      objectId: BigInt(selected),
                      kind,
                      name: objectName,
                      description: objectDescription,
                      source,
                      actions: actions.trim()
                        ? actions
                            .trim()
                            .split("\n")
                            .map((line) => {
                              const [id, ...label] = line.split(":");
                              return {
                                id: id.trim(),
                                label: label.join(":").trim(),
                              };
                            })
                        : [],
                    });
                    const v = [...conn.db.myVersions.iter()].find(
                      (v) => !before.has(v.id),
                    );
                    if (v) setSelected(String(v.objectId));
                  });
                }}
              >
                <div className="two-fields">
                  <label>
                    Object name
                    <input
                      aria-label="Object name"
                      required
                      value={objectName}
                      maxLength={80}
                      onChange={(e) => setObjectName(e.target.value)}
                    />
                  </label>
                  <label>
                    Type
                    <select
                      value={kind}
                      disabled={selected !== "0"}
                      onChange={(e) => setKind(e.target.value)}
                    >
                      {[
                        "scenery",
                        "item",
                        "container",
                        "character",
                        "exit",
                        "room",
                      ].map((k) => (
                        <option key={k}>{k}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  Description
                  <textarea
                    aria-label="Object description"
                    value={objectDescription}
                    required
                    maxLength={2000}
                    onChange={(e) => setObjectDescription(e.target.value)}
                  />
                </label>
                <label>
                  Actions <small>One per line: action_id: Button label</small>
                  <textarea
                    aria-label="Object actions"
                    rows={2}
                    value={actions}
                    onChange={(e) => setActions(e.target.value)}
                  />
                </label>
                <label>
                  Behavior script <small>JavaScript · ES5</small>
                  <textarea
                    className="code-editor"
                    aria-label="Behavior script"
                    rows={15}
                    value={source}
                    maxLength={16000}
                    spellCheck={false}
                    onChange={(e) => setSource(e.target.value)}
                  />
                </label>
                <button className="primary" disabled={!enabled}>
                  Save new draft
                </button>
                <span className="fine inline-note">
                  Saving never changes a published object.
                </span>
              </form>
              {latest && (
                <section className="draft-card">
                  <h3>
                    Draft #{String(latest.id)}{" "}
                    {obj?.versionId === latest.id ? "· live" : ""}
                  </h3>
                  <p>
                    {latest.name} ·{" "}
                    {latest.actions.map((a) => a.label).join(", ") ||
                      "Event handlers only"}
                  </p>
                  <details>
                    <summary>Inspect saved source</summary>
                    <pre>{latest.source}</pre>
                  </details>
                  <div className="input-row">
                    <label>
                      Preview event
                      <input
                        aria-label="Preview event"
                        value={testEvent}
                        onChange={(e) => setTestEvent(e.target.value)}
                      />
                    </label>
                    <button
                      disabled={!enabled}
                      onClick={() =>
                        void action(() =>
                          conn.reducers.testDraft({
                            versionId: latest.id,
                            event: testEvent,
                          }),
                        )
                      }
                    >
                      Test saved draft
                    </button>
                  </div>
                  <pre className={latest.tested ? "test-pass" : "test-report"}>
                    {latest.report}
                  </pre>
                  <button
                    className="primary"
                    disabled={!enabled || !latest.tested}
                    onClick={() =>
                      void action(() =>
                        conn.reducers.publishVersion({ versionId: latest.id }),
                      )
                    }
                  >
                    Publish tested version
                  </button>
                  <p className="fine">
                    Publishing cancels this object’s existing timers. Earned
                    items and persistent state remain.
                  </p>
                  <details>
                    <summary>
                      Version history & rollback ({versions.length})
                    </summary>
                    {versions.map((v) => (
                      <div className="version-row" key={String(v.id)}>
                        <span>
                          #{String(v.id)} {v.name}
                          {obj?.versionId === v.id ? " · live" : ""}
                        </span>
                        <button
                          disabled={!enabled || !v.tested}
                          onClick={() =>
                            void action(() =>
                              conn.reducers.publishVersion({ versionId: v.id }),
                            )
                          }
                        >
                          Activate
                        </button>
                        <details>
                          <summary>Source</summary>
                          <pre>{v.source}</pre>
                        </details>
                      </div>
                    ))}
                  </details>
                  <button
                    className="danger"
                    disabled={!enabled}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Delete ${obj?.name}? Its scripts and timers will be removed.`,
                        )
                      )
                        void action(async () => {
                          await conn.reducers.deleteObject({
                            objectId: BigInt(selected),
                          });
                          setSelected("0");
                        });
                    }}
                  >
                    Delete object
                  </button>
                </section>
              )}
            </>
          ) : section === "rooms" ? (
            <>
              <h2>Open a new passage.</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void action(async () => {
                    await conn.reducers.buildRoom({
                      direction,
                      name,
                      description,
                    });
                    setName("");
                    setDescription("");
                  });
                }}
              >
                <label>
                  Direction from here
                  <select
                    aria-label="Direction from here"
                    value={direction}
                    onChange={(e) => setDirection(e.target.value)}
                  >
                    {directions.map((d) => (
                      <option
                        key={d}
                        disabled={room.exits.some((e) => e.direction === d)}
                      >
                        {d}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Name
                  <input
                    aria-label="Room name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label>
                  What do travelers see?
                  <textarea
                    aria-label="Room description"
                    required
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </label>
                <button className="primary" disabled={!enabled}>
                  Create room
                </button>
              </form>
              <details>
                <summary>Arrange this room on the map</summary>
                <div className="three-fields">
                  {[
                    ["X", x, setX],
                    ["Y", y, setY],
                    ["Floor", floor, setFloor],
                  ].map(([label, value, set]) => (
                    <label key={String(label)}>
                      {String(label)}
                      <input
                        type="number"
                        value={String(value)}
                        onChange={(e) =>
                          (set as (s: string) => void)(e.target.value)
                        }
                      />
                    </label>
                  ))}
                </div>
                <button
                  disabled={!enabled}
                  onClick={() =>
                    void action(() =>
                      conn.reducers.layoutRoom({
                        roomId: room.id,
                        x: Number(x),
                        y: Number(y),
                        floor: Number(floor),
                      }),
                    )
                  }
                >
                  Save map position
                </button>
              </details>
              <details>
                <summary>Link existing rooms / add a gate</summary>
                <label>
                  Destination
                  <select
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                  >
                    <option value="">Choose a room</option>
                    {data.rooms
                      .filter((r) => r.id !== room.id)
                      .map((r) => (
                        <option key={String(r.id)} value={String(r.id)}>
                          {r.name} · #{String(r.id)}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Direction
                  <select
                    value={direction}
                    onChange={(e) => setDirection(e.target.value)}
                  >
                    {directions.map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Gate object
                  <select
                    value={gate}
                    onChange={(e) => setGate(e.target.value)}
                  >
                    <option value="0">No gate</option>
                    {objects.map((o) => (
                      <option key={String(o.id)} value={String(o.id)}>
                        #{String(o.id)} {o.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={secret}
                    onChange={(e) => setSecret(e.target.checked)}
                  />
                  Secret passage (gate personal state: discovered)
                </label>
                <button
                  disabled={!enabled || !destination}
                  onClick={() =>
                    void action(() =>
                      conn.reducers.linkRooms({
                        source: room.id,
                        destination: BigInt(destination),
                        direction,
                        gateId: BigInt(gate),
                        secret,
                      }),
                    )
                  }
                >
                  Link rooms
                </button>
                <button
                  disabled={
                    !enabled ||
                    !room.exits.some((e) => e.direction === direction)
                  }
                  onClick={() =>
                    void action(() =>
                      conn.reducers.configurePassage({
                        roomId: room.id,
                        direction,
                        gateId: BigInt(gate),
                        secret,
                      }),
                    )
                  }
                >
                  Update existing passage
                </button>
              </details>
            </>
          ) : section === "zones" ? (
            <>
              <h2>Make room for your imagination.</h2>
              <p>
                Every traveler can create a realm. Its portal appears in the
                Nexus.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void action(async () => {
                    await conn.reducers.createZone({ name, description });
                    setName("");
                    setDescription("");
                    setSection("objects");
                  });
                }}
              >
                <label>
                  Zone name
                  <input
                    aria-label="Zone name"
                    required
                    value={name}
                    maxLength={80}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label>
                  Entrance description
                  <textarea
                    aria-label="Entrance description"
                    required
                    value={description}
                    maxLength={3000}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </label>
                <button className="primary" disabled={!enabled}>
                  Create zone
                </button>
              </form>
              {zone?.owner.toHexString() === identity && (
                <details>
                  <summary>Collaborators for {zone.name}</summary>
                  <p>
                    Collaborators can edit rooms and publish behavior throughout
                    this zone.
                  </p>
                  <label>
                    Player name
                    <input
                      value={collaborator}
                      onChange={(e) => setCollaborator(e.target.value)}
                    />
                  </label>
                  <div className="button-row">
                    {[true, false].map((allowed) => (
                      <button
                        key={String(allowed)}
                        disabled={!enabled || !collaborator.trim()}
                        onClick={() =>
                          void action(() =>
                            conn.reducers.setCollaborator({
                              zoneId: zone.id,
                              name: collaborator,
                              allowed,
                            }),
                          )
                        }
                      >
                        {allowed ? "Add collaborator" : "Remove collaborator"}
                      </button>
                    ))}
                  </div>
                </details>
              )}
            </>
          ) : (
            <>
              <h2>The builder’s handbook</h2>
              <p>
                Describe an idea to your local agent, inspect its draft here,
                test a handler in preview, then publish. A published object
                keeps working with your agent offline.
              </p>
              <p>
                Use ordinary JavaScript functions and var declarations. All
                state that should survive an interaction belongs in ctx.get/set
                or ctx.personal/remember.
              </p>
              <pre className="api-guide">{scriptingGuide}</pre>
              <p>
                Preview simulates one event without changing the world. Test
                each important action and timer handler. It does not simulate
                elapsed time or a complete multiplayer session.
              </p>
              <p>
                Room coordinates describe the map; exits describe travel. Gates
                require shared open state. Hidden exits require discovered state
                for that player on the gate object.
              </p>
            </>
          )}
        </div>
      </section>
      <aside>
        <WorldMap
          rooms={data.rooms}
          current={room}
          gates={data.gates}
          move={(direction) =>
            void action(() => conn.reducers.go({ direction }))
          }
          disabled={!enabled}
          expanded
        />
        <section className="panel">
          <div className="panel-heading">EVENT LOG</div>
          <div className="trace-list">
            {data.traces
              .filter((t) => t.zoneId === room.zoneId)
              .slice()
              .reverse()
              .slice(0, 20)
              .map((t) => (
                <div key={String(t.id)}>
                  <strong>
                    #{String(t.objectId)} · {t.event}
                  </strong>
                  <pre>{t.result}</pre>
                </div>
              ))}
            {!data.traces.some((t) => t.zoneId === room.zoneId) && (
              <p className="muted">Published object activity appears here.</p>
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}
