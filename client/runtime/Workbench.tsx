import { useEffect, useState } from "react";
import { DbConnection } from "../../world-client/module_bindings";
import type { RoomPresentation } from "../../shared/runtime/presentation";
import { RuntimeScene } from "./Scene";
import "./workbench.css";

export function RuntimeWorkbench() {
  const [connection, setConnection] = useState<DbConnection>();
  const [identity, setIdentity] = useState("");
  const [property, setProperty] = useState(
    new URLSearchParams(location.search).get("property") ?? "",
  );
  const [snapshot, setSnapshot] = useState<RoomPresentation>({
    serverTime: 0,
    entities: [],
  });
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const room = new URLSearchParams(location.search).get("room") ?? "room";
  useEffect(() => {
    let active = true;
    const c = DbConnection.builder()
      .withUri("http://127.0.0.1:3030")
      .withDatabaseName("lantern-runtime-refactor")
      .withToken(localStorage.getItem("lantern-runtime-workbench") ?? undefined)
      .onConnect((c, id, token) => {
        if (!active) return;
        localStorage.setItem("lantern-runtime-workbench", token);
        setIdentity(id.toHexString());
        setConnection(c);
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
    if (!connection || !property) return;
    let active = true,
      timer: ReturnType<typeof setTimeout>;
    setSnapshot({ serverTime: 0, entities: [] });
    const refresh = async () => {
      try {
        const data = JSON.parse(
          await connection.procedures.previewRoom({ property, room }),
        ) as RoomPresentation;
        if (active) {
          setSnapshot(data);
          setError("");
        }
      } catch (e) {
        if (active) {
          setError(String(e));
          setSnapshot({ serverTime: 0, entities: [] });
        }
      }
      if (active) timer = setTimeout(refresh, 250);
    };
    void refresh();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [connection, property, room]);
  const entity = snapshot.entities.find((e) => e.id === selected);
  const act = async (name: string) => {
    if (!connection || !entity) return;
    setPending(true);
    try {
      await connection.reducers.enterWalkRoom({ property, room });
      await connection.reducers.walkTo({
        x: 0,
        z: 0,
        entity: entity.id,
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
        <h1>Runtime workshop</h1>
        <span>Local development · live server behaviors</span>
      </header>
      <section className="runtime-stage">
        <RuntimeScene
          snapshot={snapshot}
          onSelect={setSelected}
          onWalk={(x, z) => void move(x, z)}
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
        {entity?.actions.map((action) => (
          <button
            key={action}
            disabled={pending}
            onClick={() => void act(action)}
          >
            {action}
          </button>
        ))}
        {entity && (
          <pre data-testid="components">
            {JSON.stringify(entity.components, null, 2)}
          </pre>
        )}
        {error && <p role="alert">{error}</p>}
        <p data-testid="walking-state">
          {snapshot.walkers?.find((w) => w.id === identity)?.action
            ? "Approaching object"
            : snapshot.walkers?.find((w) => w.id === identity)?.walk.points
                  .length
              ? "Walking"
              : "Standing"}
        </p>
        <p>
          Development walking preview; Discord sessions and dynamic obstacle
          avoidance are not connected yet.
        </p>
      </aside>
    </main>
  );
}
