import { startRenewal } from "../session-renewal";
import { useEffect, useState, useRef } from "react";
import { DbConnection } from "../../world-client/module_bindings";
import type { RoomPresentation } from "../../shared/runtime/presentation";
import { RuntimeScene } from "./Scene";
import { RoomMap, type WorldMap } from "./RoomMap";
import "./workbench.css";
import type { ActivityAccess } from "../community/discord";
import { Identity } from "spacetimedb";

export function RuntimeWorkbench({ activity }: { activity?: ActivityAccess }) {
  const community =
    activity?.session.communityId ??
    new URLSearchParams(location.search).get("community") ??
    undefined;
  const [connection, setConnection] = useState<DbConnection>();
  const [identity, setIdentity] = useState("");
  const [property, setProperty] = useState(
    community
      ? `common:${community}`
      : (new URLSearchParams(location.search).get("property") ?? ""),
  );
  const [snapshot, setSnapshot] = useState<RoomPresentation>({
    serverTime: 0,
    entities: [],
  });
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [renewalError, setRenewalError] = useState("");
  const [pending, setPending] = useState(false);
  const [room, setRoom] = useState(
    community
      ? "welcome"
      : (new URLSearchParams(location.search).get("room") ?? "room"),
  );
  const lastLocation = useRef("");
  const [homeName, setHomeName] = useState("My home");
  const [agent, setAgent] = useState("");
  const [world, setWorld] = useState<WorldMap>();
  const [commonSpace, setCommonSpace] = useState(false);
  const [builderStatus, setBuilderStatus] = useState("");
  const instructionsRef = useRef<HTMLTextAreaElement>(null);
  const builderSite = import.meta.env.VITE_RUNTIME_SITE ?? location.origin;
  const instructions = `Build in Lantern using the runtime v2 MCP server. Read ${builderSite}/agent/RUNTIME.md. Download ${builderSite}/agent/lantern-runtime.mjs to your tools directory and configure a stdio MCP server: command node, args [the downloaded file path]. Set LANTERN_RUNTIME_HOST=${import.meta.env.VITE_RUNTIME_HOST ?? "http://127.0.0.1:3030"}, LANTERN_RUNTIME_DATABASE=${import.meta.env.VITE_RUNTIME_DATABASE ?? "lantern-runtime-refactor"}, LANTERN_RUNTIME_SITE=${builderSite}. No repository clone is needed. Call world_connect and give me agent_id to pair below. After pairing, call world_guide, then inspect community ${community ?? ""}, property ${property}, room ${room}. Build live using the published contracts and inspect after queued initialization. Preview before making visual changes.`;
  useEffect(() => {
    let active = true;
    const c = DbConnection.builder()
      .withUri(import.meta.env.VITE_RUNTIME_HOST ?? "http://127.0.0.1:3030")
      .withDatabaseName(
        import.meta.env.VITE_RUNTIME_DATABASE ?? "lantern-runtime-refactor",
      )
      .withToken(
        activity?.session.token ??
          localStorage.getItem("lantern-runtime-workbench") ??
          undefined,
      )
      .onConnect((c, id, token) => {
        if (!active) return;
        if (!activity) localStorage.setItem("lantern-runtime-workbench", token);
        setIdentity(id.toHexString());
        if (community) {
          void c.reducers
            .joinWorld({ community })
            .then(() =>
              activity
                ? c.reducers.setPlayerName({ name: activity.session.name })
                : undefined,
            )
            .then(() => {
              if (active) setConnection(c);
            })
            .catch((e) => setError(String(e)));
        } else setConnection(c);
      })
      .onConnectError((_c, e) => {
        if (active) setError(String(e));
      })
      .onDisconnect(() => {
        if (active) {
          setConnection(undefined);
          setError("Disconnected. Reload to reconnect.");
        }
      })
      .build();
    return () => {
      active = false;
      c.disconnect();
    };
  }, []);
  useEffect(() => {
    if (!activity) return;
    const renewal = startRenewal(
      () => activity.renew(),
      setRenewalError,
      activity.session.renewAfterSeconds,
    );
    const retry = () => {
      if (document.visibilityState === "visible") void renewal.retry();
    };
    window.addEventListener("online", retry);
    document.addEventListener("visibilitychange", retry);
    return () => {
      renewal.stop();
      window.removeEventListener("online", retry);
      document.removeEventListener("visibilitychange", retry);
    };
  }, [activity]);
  useEffect(() => {
    if (!connection || !property) return;
    let active = true,
      timer: ReturnType<typeof setTimeout>,
      busy = false,
      dirty = false;
    setSnapshot({ serverTime: 0, entities: [] });
    const refresh = async () => {
      if (busy) {
        dirty = true;
        return;
      }
      busy = true;
      dirty = false;
      try {
        const data = JSON.parse(
          await connection.procedures.previewRoom({ property, room }),
        ) as RoomPresentation;
        if (community) {
          const map = JSON.parse(
            await connection.procedures.listWorld({ community }),
          );
          if (active) setWorld(map);
        }
        if (active) {
          const location =
            data.location && `${data.location.property}/${data.location.room}`;
          if (
            location &&
            (lastLocation.current || community) &&
            location !== lastLocation.current
          ) {
            setProperty(data.location!.property);
            setRoom(data.location!.room);
            setSelected("");
          }
          if (location) lastLocation.current = location;
          setSnapshot(data);
          setError("");
        }
      } catch (e) {
        if (active) {
          setError(String(e));
          setSnapshot({ serverTime: 0, entities: [] });
        }
      }
      busy = false;
      if (active && (!community || dirty))
        timer = setTimeout(refresh, community ? 0 : 250);
    };
    const changed = () => {
      void refresh();
    };
    let subscription:
      | ReturnType<ReturnType<DbConnection["subscriptionBuilder"]>["subscribe"]>
      | undefined;
    if (community) {
      const table = connection.db.liveRoomStamp;
      table.onInsert(changed);
      table.onUpdate(changed);
      table.onDelete(changed);
      subscription = connection
        .subscriptionBuilder()
        .onApplied(changed)
        .onError((ctx) => setError(String(ctx.event)))
        .subscribe("SELECT * FROM live_room_stamp");
    }
    void refresh();
    return () => {
      active = false;
      clearTimeout(timer);
      if (community) {
        connection.db.liveRoomStamp.removeOnInsert(changed);
        connection.db.liveRoomStamp.removeOnUpdate(changed);
        connection.db.liveRoomStamp.removeOnDelete(changed);
        subscription?.unsubscribe();
      }
    };
  }, [connection, property, room, community]);
  const entity = snapshot.entities.find((e) => e.id === selected);
  const act = async (name: string, id = selected) => {
    const target = snapshot.entities.find((e) => e.id === id);
    if (!connection || !target) return;
    setPending(true);
    try {
      await connection.reducers.enterWalkRoom({ property, room });
      await connection.reducers.walkTo({
        x: 0,
        z: 0,
        entity: target.id,
        action: name,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setPending(false);
    }
  };
  const move = async (x: number, z: number) => {
    if (!connection) return;
    try {
      await connection.reducers.enterWalkRoom({ property, room });
      await connection.reducers.walkTo({ x, z, entity: "", action: "" });
    } catch (e) {
      setError(String(e));
    }
  };
  return (
    <main className="runtime-workbench">
      <header>
        <h1>{activity ? "Lantern" : "Runtime workshop"}</h1>
        <span>
          {activity
            ? "Your community · live world"
            : "Builder workspace · live server behaviors"}
        </span>
      </header>
      <section className="runtime-stage">
        <RuntimeScene
          snapshot={snapshot}
          onSelect={(id) => {
            const request = snapshot.interactions?.find(
              (r) => r.kind === "dialog" && r.target?.kinds.includes("object"),
            );
            if (request) {
              void connection?.reducers
                .answerDialog({ id: request.id, choice: id })
                .catch((e) => setError(String(e)));
              return;
            }
            setSelected(id);
            const target = snapshot.entities.find((e) => e.id === id);
            if (target?.actions.length === 1) void act(target.actions[0], id);
          }}
          onWalk={(x, z) => void move(x, z)}
          self={identity}
          onSay={(text) =>
            void connection?.reducers
              .enterWalkRoom({ property, room })
              .then(() => connection.reducers.say({ text }))
              .catch((e) => setError(String(e)))
          }
        />
      </section>
      <aside>
        <label>
          Property{" "}
          <input
            value={property}
            onChange={(e) => setProperty(e.target.value)}
          />
        </label>
        <p>Room: {room}</p>
        {world && <RoomMap world={world} property={property} room={room} />}
        <button
          onClick={() =>
            void connection?.reducers
              .emote({ animation: "wave" })
              .catch((e) => setError(String(e)))
          }
        >
          Wave
        </button>
        <p>
          Builder identity: <code data-testid="identity">{identity}</code>
        </p>
        <p>
          Click the floor to walk. Select an object and its action to walk over
          and interact. Drag to orbit; scroll to zoom.
        </p>
        <label>
          Object{" "}
          <select
            aria-label="Object"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Select an object</option>
            {snapshot.entities.map((e) => (
              <option key={e.id}>{e.id}</option>
            ))}
          </select>
        </label>
        <h2>{entity?.id ?? "No object selected"}</h2>
        {entity?.components.homeEntrance &&
        !entity.actions.includes("enter") ? (
          <section>
            <label>
              Home name{" "}
              <input
                value={homeName}
                onChange={(e) => setHomeName(e.target.value)}
              />
            </label>
            <button
              onClick={() =>
                void connection?.reducers
                  .claimHome({ entrance: entity.id, name: homeName })
                  .catch((e) => setError(String(e)))
              }
            >
              Claim home
            </button>
          </section>
        ) : null}
        {snapshot.interactions
          ?.filter((r) => r.kind === "dialog")
          .map((dialog) => (
            <section key={dialog.id} aria-label="Object dialogue">
              <p>{dialog.text}</p>
              {dialog.target && (
                <div aria-label="Choose a target">
                  {[
                    ...(dialog.target.kinds.includes("object")
                      ? snapshot.entities
                          .filter((e) => e.components.visibility !== false)
                          .map((e) => ({
                            id: e.id,
                            name: String(e.components.label ?? e.id),
                          }))
                      : []),
                    ...(dialog.target.kinds.includes("player")
                      ? (snapshot.walkers ?? []).map((w) => ({
                          id: `player:${w.id}`,
                          name: w.name ?? "Traveler",
                        }))
                      : []),
                  ].map((target) => (
                    <button
                      key={target.id}
                      onClick={() =>
                        void connection?.reducers
                          .answerDialog({ id: dialog.id, choice: target.id })
                          .catch((e) => setError(String(e)))
                      }
                    >
                      {target.name}
                    </button>
                  ))}
                </div>
              )}
              {dialog.maxLength && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const text = new FormData(e.currentTarget).get(
                      "answer",
                    ) as string;
                    void connection?.reducers
                      .answerDialog({ id: dialog.id, choice: text })
                      .catch((e) => setError(String(e)));
                  }}
                >
                  <input
                    name="answer"
                    aria-label="Your answer"
                    required
                    maxLength={dialog.maxLength}
                  />
                  <button type="submit">Reply</button>
                </form>
              )}
              {dialog.choices?.map((choice) => (
                <button
                  key={choice}
                  onClick={() =>
                    void connection?.reducers
                      .answerDialog({ id: dialog.id, choice })
                      .catch((e) => setError(String(e)))
                  }
                >
                  {choice}
                </button>
              ))}
            </section>
          ))}
        {entity?.actions.map((action) => (
          <button
            key={action}
            disabled={pending}
            onClick={() => void act(action)}
          >
            {action}
          </button>
        ))}
        {entity && !activity && (
          <pre data-testid="components">
            {JSON.stringify(entity.components, null, 2)}
          </pre>
        )}
        {(error || renewalError) && <p role="alert">{error || renewalError}</p>}
        <p data-testid="walking-state">
          {snapshot.walkers?.find((w) => w.id === identity)?.action
            ? "Approaching object"
            : snapshot.walkers?.find((w) => w.id === identity)?.walk.points
                  .length
              ? "Walking"
              : "Standing"}
        </p>
        {activity && (
          <details>
            <summary>Connect a builder</summary>
            <p>
              Start the Lantern runtime MCP client with this database, then
              paste its agent identity here.
            </p>
            <textarea
              ref={instructionsRef}
              aria-label="Builder instructions"
              readOnly
              value={instructions}
              rows={5}
              style={{ width: "100%", boxSizing: "border-box" }}
            />
            <button
              onClick={() =>
                void Promise.resolve()
                  .then(() => navigator.clipboard.writeText(instructions))
                  .then(() => setBuilderStatus("Instructions copied."))
                  .catch(() => {
                    instructionsRef.current?.focus();
                    instructionsRef.current?.select();
                    setBuilderStatus(
                      "Copy is unavailable here. The instructions are selected; press Ctrl+C.",
                    );
                  })
              }
            >
              Copy instructions
            </button>
            {builderStatus && <p role="status">{builderStatus}</p>}
            <label>
              Agent identity
              <input value={agent} onChange={(e) => setAgent(e.target.value)} />
            </label>
            <label>
              <input
                type="checkbox"
                checked={commonSpace}
                onChange={(e) => setCommonSpace(e.target.checked)}
              />
              Edit common space (server admins)
            </label>
            <button
              onClick={() => {
                try {
                  void connection?.reducers
                    .authorizeCommunityAgent({
                      communityId: activity.session.communityId,
                      agent: Identity.fromString(agent.trim()),
                      commonSpace,
                    })
                    .then(() =>
                      setBuilderStatus(
                        "Agent connected. It can now inspect and build in its authorized spaces.",
                      ),
                    )
                    .catch((e) => setError(String(e)));
                } catch (e) {
                  setError(String(e));
                }
              }}
            >
              Connect agent
            </button>
          </details>
        )}
      </aside>
    </main>
  );
}
