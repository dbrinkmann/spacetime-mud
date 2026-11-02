import React, { useMemo, useState } from "react";
import type { DbConnection } from "../module_bindings";
import type { Snapshot } from "../connection";
import type { Room as RoomRow } from "../module_bindings/types";
import { parseDefinition, type Character } from "../../shared/geometry";
import { emptyRoom, neutralCharacter } from "../../shared/world";
import {
  Viewport,
  type ViewCommand,
  type ViewStatus,
  type LiveTraveler,
} from "./Viewport";
import "./world.css";
const guest = neutralCharacter("Preview");
const cache = new Map<string, Character>();
export function characterFor(name: string, source?: string) {
  const key = name + "\n" + (source ?? "");
  let c = cache.get(key);
  if (!c) {
    c = source
      ? { ...parseDefinition(source, "character"), name }
      : neutralCharacter(name);
    if (cache.size > 128) cache.clear();
    cache.set(key, c);
  }
  return c;
}
export function LiveRoom({
  conn,
  data,
  room,
  identity,
  enabled,
  action,
}: {
  conn: DbConnection;
  data: Snapshot;
  room: RoomRow;
  identity: string;
  enabled: boolean;
  action: (fn: () => Promise<void>) => Promise<void>;
}) {
  const source = data.scenes?.find((s) => s.roomId === room.id)?.source;
  const scene = useMemo(
    () =>
      source
        ? parseDefinition(source, "room")
        : emptyRoom(room.name, room.description),
    [source, room.id, room.name, room.description],
  );
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
    }),
    [error, setError] = useState("");
  const travelers: LiveTraveler[] = data.players
    .filter((p) => p.roomId === room.id && p.online)
    .map((p) => {
      const id = p.identity.toHexString(),
        motion = data.presence?.find(
          (m) => m.identity.equals(p.identity) && m.roomId === room.id,
        );
      return {
        id,
        name: p.name,
        character: characterFor(
          p.name,
          data.avatars?.find((a) => a.identity.equals(p.identity))?.source,
        ),
        motion: motion
          ? {
              path: JSON.parse(motion.path),
              started: Number(motion.startedAt.microsSinceUnixEpoch / 1000n),
              pose: motion.pose,
              seat: motion.seat,
              yaw: motion.yaw,
            }
          : { path: [scene.spawn], started: 0, pose: "idle", seat: "", yaw: 0 },
      };
    });
  const me = travelers.find((t) => t.id === identity),
    selected = scene.objects.find((o) => o.id === status.selected),
    linked = data.objects.find(
      (o) =>
        String(o.id) === selected?.objectId && o.active && o.roomId === room.id,
    );
  const send = (a: ViewCommand["action"]) =>
    setCommand((c) => ({ id: c.id + 1, action: a }));
  return (
    <div className="live-room">
      <div className="live-toolbar">
        <span>
          {travelers.length} travelers ·{" "}
          {source ? "Player-built room" : "Unshaped space"}
        </span>
        <button onClick={() => send("reset")}>Reset view</button>
      </div>
      <div className="live-stage">
        {me && (
          <Viewport
            room={scene}
            character={me.character}
            guest={guest}
            command={command}
            onStatus={setStatus}
            onError={setError}
            live={{
              identity,
              travelers,
              onMove: (x, z, seat, pose) => {
                if (enabled)
                  void action(() =>
                    conn.reducers.moveWithinRoom({ x, z, seat, pose }),
                  );
              },
            }}
          />
        )}
      </div>
      <div className="live-toolbar">
        <span>
          {selected?.name ?? "Click to walk · Drag to orbit · Scroll to zoom"}
        </span>
        <div className="button-row">
          {selected?.seat && !status.seat && (
            <button disabled={!enabled} onClick={() => send("sitSelected")}>
              Sit here
            </button>
          )}
          {status.seat && (
            <button disabled={!enabled} onClick={() => send("stand")}>
              Stand up
            </button>
          )}
          <button disabled={!enabled} onClick={() => send("wave")}>
            Wave
          </button>
          <button disabled={!enabled} onClick={() => send("talk")}>
            Talk
          </button>
          <button disabled={!enabled} onClick={() => send("idle")}>
            Idle
          </button>
          {linked?.actions.map((a) => (
            <button
              key={a.id}
              disabled={!enabled}
              onClick={() =>
                void action(() =>
                  conn.reducers.interact({
                    objectId: linked.id,
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
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
