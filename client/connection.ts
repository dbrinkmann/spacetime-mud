import { useEffect, useState } from "react";
import { DbConnection } from "./module_bindings";
import type {
  Player,
  Room,
  Npc,
  Chat,
  Inbox,
  Job,
  Grant,
} from "./module_bindings/types";
export const HOST =
  import.meta.env.VITE_SPACETIME_HOST ?? "https://maincloud.spacetimedb.com";
export const DATABASE =
  import.meta.env.VITE_SPACETIME_DATABASE ?? "dbrinkmann-spacetime-mud";
const tokenKey = `spacetime-mud:${HOST}:${DATABASE}`;
export type Snapshot = {
  players: Player[];
  rooms: Room[];
  npcs: Npc[];
  chat: Chat[];
  inbox: Inbox[];
  jobs: Job[];
  grants: Grant[];
};
const empty: Snapshot = {
  players: [],
  rooms: [],
  npcs: [],
  chat: [],
  inbox: [],
  jobs: [],
  grants: [],
};
export function useGame() {
  const [conn, setConn] = useState<DbConnection>();
  const [identity, setIdentity] = useState("");
  const [status, setStatus] = useState("Connecting");
  const [data, setData] = useState<Snapshot>(empty);
  const [connectionError, setConnectionError] = useState("");
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
          "Browser storage is disabled. Your character will not persist after closing this tab.",
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
          .subscribe([
            "SELECT * FROM player",
            "SELECT * FROM room",
            "SELECT * FROM npc",
            "SELECT * FROM chat",
            "SELECT * FROM my_inbox",
            "SELECT * FROM my_jobs",
            "SELECT * FROM my_grant",
          ]);
      })
      .onAutomaticReconnect((_c, _id, t) => {
        save(t);
        setConnectionError("");
      })
      .onConnectError((_ctx, e) => {
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
      if (disposed) return;
      setData({
        players: [...c.db.player.iter()],
        rooms: [...c.db.room.iter()],
        npcs: [...c.db.npc.iter()],
        chat: [...c.db.chat.iter()],
        inbox: [...c.db.myInbox.iter()],
        jobs: [...c.db.myJobs.iter()],
        grants: [...c.db.myGrant.iter()],
      });
    };
    for (const table of [
      c.db.player,
      c.db.room,
      c.db.npc,
      c.db.chat,
      c.db.myInbox,
      c.db.myJobs,
      c.db.myGrant,
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
