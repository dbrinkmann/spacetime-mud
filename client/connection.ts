import { useEffect, useState } from "react";
import { DbConnection } from "./module_bindings";
import type {
  Player,
  Room,
  Object as WorldObject,
  Chat,
  Inbox,
  Job,
  Grant,
  Zone,
  Version,
  Inventory,
  Trace,
  GateStatus,
  Member,
} from "./module_bindings/types";
export const HOST =
  import.meta.env.VITE_SPACETIME_HOST ?? "https://maincloud.spacetimedb.com";
export const DATABASE =
  import.meta.env.VITE_SPACETIME_DATABASE ?? "dbrinkmann-spacetime-mud";
const tokenKey = `spacetime-mud:${HOST}:${DATABASE}`;
export type Snapshot = {
  players: Player[];
  rooms: Room[];
  objects: WorldObject[];
  chat: Chat[];
  inbox: Inbox[];
  jobs: Job[];
  grants: Grant[];
  zones: Zone[];
  versions: Version[];
  inventory: Inventory[];
  traces: Trace[];
  gates: GateStatus[];
  members: Member[];
};
const empty: Snapshot = {
  players: [],
  rooms: [],
  objects: [],
  chat: [],
  inbox: [],
  jobs: [],
  grants: [],
  zones: [],
  versions: [],
  inventory: [],
  traces: [],
  gates: [],
  members: [],
};
export const subscriptions = [
  "zone",
  "visible_players",
  "visible_rooms",
  "visible_objects",
  "visible_chat",
  "my_inbox",
  "my_jobs",
  "my_grant",
  "my_versions",
  "my_inventory",
  "my_traces",
  "visible_gates",
  "my_members",
].map((n) => `SELECT * FROM ${n}`);
export function useGame() {
  const [conn, setConn] = useState<DbConnection>(),
    [identity, setIdentity] = useState(""),
    [status, setStatus] = useState("Connecting"),
    [data, setData] = useState<Snapshot>(empty),
    [connectionError, setConnectionError] = useState("");
  useEffect(() => {
    let disposed = false;
    let token: string | undefined;
    try {
      token = localStorage.getItem(tokenKey) ?? undefined;
    } catch {}
    const save = (t: string) => {
      try {
        localStorage.setItem(tokenKey, t);
      } catch {
        setConnectionError(
          "Browser storage is disabled; your character will not persist after closing this tab.",
        );
      }
    };
    const c = DbConnection.builder()
      .withUri(HOST)
      .withDatabaseName(DATABASE)
      .withToken(token)
      .withAutomaticReconnect()
      .onConnect((c, id, t) => {
        save(t);
        setIdentity(id.toHexString());
        setStatus("Syncing");
        c.subscriptionBuilder()
          .onApplied(() => {
            if (!disposed) {
              setStatus("Live");
              refresh();
            }
          })
          .onError((ctx) => {
            setStatus("Subscription error");
            setConnectionError(String(ctx.event));
          })
          .subscribe(subscriptions);
      })
      .onAutomaticReconnect((_c, _id, t) => {
        save(t);
        setStatus("Live");
        setConnectionError("");
      })
      .onConnectError((_c, e) => {
        if (!disposed) {
          setStatus("Connection failed");
          setConnectionError(e.message);
        }
      })
      .onDisconnect(() => {
        if (!disposed) setStatus("Reconnecting");
      })
      .build();
    const refresh = () => {
      if (!disposed)
        setData({
          players: [...c.db.visiblePlayers.iter()],
          rooms: [...c.db.visibleRooms.iter()],
          objects: [...c.db.visibleObjects.iter()],
          chat: [...c.db.visibleChat.iter()],
          inbox: [...c.db.myInbox.iter()],
          jobs: [...c.db.myJobs.iter()],
          grants: [...c.db.myGrant.iter()],
          zones: [...c.db.zone.iter()],
          versions: [...c.db.myVersions.iter()],
          inventory: [...c.db.myInventory.iter()],
          traces: [...c.db.myTraces.iter()],
          gates: [...c.db.visibleGates.iter()],
          members: [...c.db.myMembers.iter()],
        });
    };
    for (const table of [
      c.db.visiblePlayers,
      c.db.visibleRooms,
      c.db.visibleObjects,
      c.db.visibleChat,
      c.db.myInbox,
      c.db.myJobs,
      c.db.myGrant,
      c.db.zone,
      c.db.myVersions,
      c.db.myInventory,
      c.db.myTraces,
      c.db.visibleGates,
      c.db.myMembers,
    ]) {
      table.onInsert(refresh);
      table.onUpdate(refresh);
      table.onDelete(refresh);
    }
    setConn(c);
    return () => {
      disposed = true;
      c.disconnect();
    };
  }, []);
  return { conn, identity, status, data, connectionError };
}
