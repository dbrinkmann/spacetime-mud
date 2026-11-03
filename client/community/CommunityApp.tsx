import React, { useEffect, useMemo, useState } from "react";
import { DbConnection } from "../module_bindings";
import type {
  Community,
  CommunityRoom,
  CommunityCharacter,
  CommunityExit,
  Property,
  CommunityMember,
  CommunityAgentGrant,
  CommunityObjectInfo,
  CommunitySpeech,
} from "../module_bindings/types";
import { HOST, DATABASE } from "../connection";
import { parseDefinition } from "../../shared/geometry";
import { neutralCharacter } from "../../shared/world";
import {
  Viewport,
  type ViewStatus,
  type LiveTraveler,
} from "../world/Viewport";
import { syncClock } from "../world/clock";
import "../world/world.css";
import "./community.css";
import type { ActivityAccess } from "./discord";
import { CommunityCreate } from "./CommunityCreate";

const queries = [
  "my_communities",
  "my_community_roles",
  "community_properties",
  "community_rooms",
  "community_exits",
  "community_characters",
  "community_history",
  "my_community_agents",
  "community_objects",
  "my_community_speech",
].map((t) => `SELECT * FROM ${t}`);
type Snapshot = {
  communities: Community[];
  rooms: CommunityRoom[];
  characters: CommunityCharacter[];
  exits: CommunityExit[];
  properties: Property[];
  roles: CommunityMember[];
  agents: CommunityAgentGrant[];
  objects: CommunityObjectInfo[];
  speech: CommunitySpeech[];
};
const empty: Snapshot = {
  communities: [],
  rooms: [],
  characters: [],
  exits: [],
  properties: [],
  roles: [],
  agents: [],
  objects: [],
  speech: [],
};
const silhouette = neutralCharacter("Traveler");
const command = { id: 0, action: "idle" as const };
export function CommunityApp({ activity }: { activity?: ActivityAccess }) {
  const [conn, setConn] = useState<DbConnection>();
  const [identity, setIdentity] = useState("");
  const [data, setData] = useState(empty);
  const [communityId, setCommunityId] = useState(
    activity?.session.communityId ?? "",
  );
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Connecting");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(activity?.session.name ?? "");
  const [homeName, setHomeName] = useState("");
  const [message, setMessage] = useState("");
  const [selectedObject, setSelectedObject] = useState("");
  const [spotId, setSpotId] = useState("");
  const [tab, setTab] = useState("world");
  const [viewStatus, setViewStatus] = useState<ViewStatus>();
  const [connectionEpoch, setConnectionEpoch] = useState(0);
  useEffect(() => {
    let disposed = false;
    const tokenKey = `community-world:${HOST}:${DATABASE}`;
    let token: string | undefined;
    try {
      token = localStorage.getItem(tokenKey) ?? undefined;
    } catch {}
    if (activity) token = activity.session.token;
    const refresh = () => {
      if (!disposed)
        setData({
          communities: [...c.db.myCommunities.iter()],
          rooms: [...c.db.communityRooms.iter()],
          characters: [...c.db.communityCharacters.iter()],
          exits: [...c.db.communityExits.iter()],
          properties: [...c.db.communityProperties.iter()],
          roles: [...c.db.myCommunityRoles.iter()],
          agents: [...c.db.myCommunityAgents.iter()],
          objects: [...c.db.communityObjects.iter()],
          speech: [...c.db.myCommunitySpeech.iter()],
        });
    };
    const c = DbConnection.builder()
      .withUri(HOST)
      .withDatabaseName(DATABASE)
      .withToken(token)
      .withAutomaticReconnect()
      .onConnect((c, id, token) => {
        if (!activity)
          try {
            localStorage.setItem(tokenKey, token);
          } catch {}
        setIdentity(id.toHexString());
        setConnectionEpoch((n) => n + 1);
        const sent = performance.now();
        void c.procedures
          .serverTime({})
          .then((t) => syncClock(t, sent))
          .catch(() => {});
        c.subscriptionBuilder()
          .onApplied(() => {
            setStatus("Connected");
            refresh();
          })
          .onError((ctx) => setError(String(ctx.event)))
          .subscribe(queries);
      })
      .onConnectError((_c, e) => setError(e.message))
      .onDisconnect(() => {
        if (!disposed) setStatus("Reconnecting");
      })
      .onAutomaticReconnect(() => {
        if (!disposed) {
          setStatus("Connected");
          setConnectionEpoch((n) => n + 1);
        }
      })
      .build();
    for (const t of [
      c.db.myCommunities,
      c.db.communityRooms,
      c.db.communityCharacters,
      c.db.communityExits,
      c.db.communityProperties,
      c.db.myCommunityRoles,
      c.db.myCommunityAgents,
      c.db.communityObjects,
      c.db.myCommunitySpeech,
    ]) {
      t.onInsert(refresh);
      t.onUpdate(refresh);
      t.onDelete(refresh);
    }
    setConn(c);
    const renewal = activity
      ? setInterval(() => {
          void activity.renew().catch(() => {
            setError(
              "Community access expired. Reopen the Activity to sign in again.",
            );
            c.disconnect();
          });
        }, 60000)
      : undefined;
    return () => {
      disposed = true;
      clearInterval(renewal);
      c.disconnect();
    };
  }, []);
  const community =
    data.communities.find((c) => c.id === communityId) ??
    (!activity ? data.communities[0] : undefined);
  const me = data.characters.find(
    (c) =>
      c.communityId === community?.id && c.identity.toHexString() === identity,
  );
  useEffect(() => {
    if (conn && me && community)
      void conn.reducers
        .enterCommunity({ communityId: community.id, name: me.name })
        .catch((e) => setError(String(e)));
  }, [conn, me?.key, connectionEpoch]);
  const room = data.rooms.find((r) => r.id === me?.roomId);
  const property = data.properties.find((p) => p.id === room?.propertyId);
  const scene = useMemo(
    () => (room ? parseDefinition(room.source, "room") : undefined),
    [room?.source],
  );
  const ownCharacter = useMemo(
    () =>
      me?.avatarSource
        ? { ...parseDefinition(me.avatarSource, "character"), name: me.name }
        : neutralCharacter(me?.name ?? "Traveler"),
    [me?.avatarSource, me?.name],
  );
  const travelers: LiveTraveler[] = data.characters
    .filter((p) => p.roomId === room?.id && (p.controller || p.away))
    .map((p) => ({
      id: p.identity.toHexString(),
      name: p.name + (p.away ? " · Away / At home" : ""),
      character: p.avatarSource
        ? parseDefinition(p.avatarSource, "character")
        : neutralCharacter(p.name),
      away: p.away,
      motion: {
        path: JSON.parse(p.path),
        started: Number(p.startedAt.microsSinceUnixEpoch / 1000n),
        pose: p.pose,
        seat: p.seat,
        yaw: p.yaw,
      },
    }));
  const exits = data.exits.filter((e) => e.fromRoom === room?.id);
  const spots = scene?.objects.filter((o) => o.homeEntrance) ?? [];
  const interactive =
    scene?.objects.filter((o) => o.homeEntrance || o.exit) ?? [];
  const availableSpots = spots.filter(
    (o) => !exits.some((e) => e.entranceSpot === o.id),
  );
  const chosenSpot =
    availableSpots.find((o) => o.id === spotId) ?? availableSpots[0];
  const mapRooms = data.rooms.filter((r) => r.propertyId === property?.id);
  const act = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="community-app">
      <header>
        <div>
          <span className="eyebrow">A PLACE FOR YOUR PEOPLE</span>
          <h1>{community?.name ?? "Community worlds"}</h1>
        </div>
        <span>{status}</span>
      </header>
      {error && (
        <p role="alert" className="community-error">
          {error}
        </p>
      )}
      {!community && (
        <section>
          <h2>Connect your community</h2>
          <p>
            {activity
              ? "Verifying your community membership…"
              : "This development preview requires an operator-provisioned membership. Launch the Discord Activity for verified sign-in."}
          </p>
          <p>Your development identity:</p>
          <code className="identity">{identity || "Connecting…"}</code>
        </section>
      )}
      {community && !me && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act(() =>
              conn!.reducers.enterCommunity({
                communityId: community.id,
                name,
              }),
            );
          }}
        >
          <h2>Welcome to {community.name}</h2>
          <label>
            Your character's name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={40}
            />
          </label>
          <button disabled={busy || !conn}>Enter community</button>
        </form>
      )}
      {community && me && room && scene && (
        <>
          <nav>
            <button
              aria-pressed={tab === "world"}
              onClick={() => setTab("world")}
            >
              World
            </button>
            <button
              aria-pressed={tab === "create"}
              onClick={() => setTab("create")}
            >
              Create
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void act(() =>
                  conn!.reducers.returnToWelcome({ communityId: community.id }),
                )
              }
            >
              Return to welcome
            </button>
            {!activity && data.communities.length > 1 && (
              <label>
                Development community
                <select
                  value={community.id}
                  onChange={(e) => setCommunityId(e.target.value)}
                >
                  {data.communities.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </nav>
          {tab === "create" ? (
            <CommunityCreate
              key={community.id}
              conn={conn!}
              communityId={community.id}
              roomId={room.id}
              isAdmin={
                !!data.roles.find(
                  (m) =>
                    m.communityId === community.id &&
                    m.identity.toHexString() === identity,
                )?.admin
              }
              grants={data.agents.filter(
                (g) =>
                  g.communityId === community.id &&
                  g.owner.toHexString() === identity,
              )}
              busy={busy}
              action={act}
            />
          ) : (
            <>
              <div className="community-heading">
                <div>
                  <span className="eyebrow">
                    {property?.common
                      ? "COMMON SPACE"
                      : `${property?.name} · HOME INTERIOR`}
                  </span>
                  <h2>{room.name}</h2>
                </div>
                <span>Revision {room.revision}</span>
              </div>
              <div className="community-layout">
                <section className="community-scene">
                  <Viewport
                    room={scene}
                    onObject={setSelectedObject}
                    entrances={Object.fromEntries(
                      interactive.map((o) => {
                        const exit = exits.find((e) =>
                          o.exit
                            ? String(e.id) === o.exit.id
                            : e.entranceSpot === o.id,
                        );
                        return [
                          o.id,
                          {
                            label: exit
                              ? `Enter ${exit.label}`
                              : o.exit
                                ? `${o.name} · Unavailable`
                                : `${o.name} · Available`,
                            onClick: () => {
                              if (exit)
                                void act(() =>
                                  conn!.reducers.travelCommunity({
                                    exitId: exit.id,
                                  }),
                                );
                              else if (o.exit)
                                setError("This exit is no longer available.");
                              else if (!me.homeProperty) {
                                setSpotId(o.id);
                                document
                                  .getElementById("home-claim")
                                  ?.scrollIntoView({
                                    behavior: "smooth",
                                    block: "center",
                                  });
                                document.getElementById("home-name")?.focus();
                              } else
                                setError(
                                  "You already have a home. Expand it from inside your property.",
                                );
                            },
                          },
                        ];
                      }),
                    )}
                    character={ownCharacter}
                    guest={silhouette}
                    command={command}
                    live={{
                      identity,
                      travelers,
                      onMove: (x, z, seat, pose) => {
                        void act(() =>
                          conn!.reducers.moveCommunityCharacter({
                            communityId: community.id,
                            x,
                            z,
                            seat,
                            pose,
                          }),
                        );
                      },
                    }}
                    showGuest={false}
                    onError={setError}
                    onStatus={setViewStatus}
                  />
                  <p>{viewStatus?.message || "Drag to look around."}</p>
                  <section aria-label="Room conversation">
                    <h3>Here in {room.name}</h3>
                    <div
                      className="room-conversation"
                      role="log"
                      aria-live="polite"
                    >
                      {data.speech
                        .filter((m) => m.roomId === room.id)
                        .sort(
                          (a, b) =>
                            Number(
                              a.createdAt.microsSinceUnixEpoch -
                                b.createdAt.microsSinceUnixEpoch,
                            ) || (a.id < b.id ? -1 : 1),
                        )
                        .map((m) => (
                          <p key={String(m.id)}>
                            <strong>{m.speaker}</strong>
                            {m.scripted ? " (object)" : ""}
                            {m.kind === "tell" ? " (to you)" : ""}
                            {m.kind === "emote" ? " " : ": "}
                            {m.message}
                          </p>
                        ))}
                    </div>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const value = message.trim();
                        if (value)
                          void act(async () => {
                            await conn!.reducers.speakCommunity({
                              communityId: community.id,
                              message: value.startsWith("/me ")
                                ? value.slice(4)
                                : value,
                              emote: value.startsWith("/me "),
                            });
                            setMessage("");
                          });
                      }}
                    >
                      <label>
                        Say something here
                        <input
                          aria-label="Room message"
                          value={message}
                          maxLength={1000}
                          onChange={(e) => setMessage(e.target.value)}
                          placeholder="Say hello, or /me waves"
                        />
                      </label>
                      <button disabled={busy || !message.trim()}>Say</button>
                    </form>
                  </section>
                </section>
                <aside>
                  {data.objects.some((o) => o.roomId === room.id) && (
                    <section>
                      <h3>Interact</h3>
                      {data.objects
                        .filter((o) => o.roomId === room.id)
                        .map((o) => (
                          <div key={String(o.id)}>
                            <button
                              aria-pressed={selectedObject === String(o.id)}
                              onClick={() => setSelectedObject(String(o.id))}
                            >
                              {o.name}
                            </button>
                            {selectedObject === String(o.id) &&
                              (
                                JSON.parse(o.actions) as {
                                  id: string;
                                  label: string;
                                }[]
                              ).map((a) => (
                                <button
                                  key={a.id}
                                  disabled={busy}
                                  onClick={() =>
                                    void act(() =>
                                      conn!.reducers.interactCommunityObject({
                                        objectId: o.id,
                                        action: a.id,
                                      }),
                                    )
                                  }
                                >
                                  {a.label}
                                </button>
                              ))}
                          </div>
                        ))}
                    </section>
                  )}
                  <section>
                    <h3>{property?.common ? "Common map" : "Home map"}</h3>
                    <p className="muted">
                      {property?.common
                        ? "Named doorways lead to members' home maps."
                        : "These rooms are shared with every visitor."}
                    </p>
                    <ul className="community-map">
                      {mapRooms.map((r) => {
                        const link = exits.find((e) => e.toRoom === r.id);
                        return (
                          <li
                            key={String(r.id)}
                            aria-current={
                              r.id === room.id ? "location" : undefined
                            }
                          >
                            {link ? (
                              <button
                                disabled={busy}
                                onClick={() =>
                                  void act(() =>
                                    conn!.reducers.travelCommunity({
                                      exitId: link.id,
                                    }),
                                  )
                                }
                              >
                                {r.name}
                              </button>
                            ) : (
                              <span>
                                {r.id === room.id ? "◆ " : "◇ "}
                                {r.name}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                  <section>
                    <h3>Doorways</h3>
                    {exits.length ? (
                      exits.map((e) => (
                        <button
                          className="doorway"
                          key={String(e.id)}
                          disabled={busy}
                          onClick={() =>
                            void act(() =>
                              conn!.reducers.travelCommunity({ exitId: e.id }),
                            )
                          }
                        >
                          {e.label} <span>→</span>
                        </button>
                      ))
                    ) : (
                      <p>No doorways yet.</p>
                    )}
                  </section>
                  {!!property?.common &&
                    !me.homeProperty &&
                    !availableSpots.length && (
                      <section>
                        <h3>No available home entrances</h3>
                        <p>
                          Look in another common room, or ask a server admin to
                          add an entrance here.
                        </p>
                      </section>
                    )}
                  {!!property?.common &&
                    !me.homeProperty &&
                    !!availableSpots.length && (
                      <form
                        id="home-claim"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void act(() =>
                            conn!.reducers.claimHome({
                              commonRoomId: room.id,
                              spotId: chosenSpot!.id,
                              name: homeName,
                            }),
                          );
                        }}
                      >
                        <h3>Make your home here</h3>
                        <p>Choose an available entrance in {room.name}.</p>
                        <label>
                          Entrance
                          <select
                            aria-label="Home entrance"
                            value={chosenSpot?.id ?? ""}
                            onChange={(e) => setSpotId(e.target.value)}
                          >
                            {availableSpots.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Home name
                          <input
                            required
                            maxLength={80}
                            value={homeName}
                            onChange={(e) => setHomeName(e.target.value)}
                            id="home-name"
                            placeholder="The Cloudglass Study"
                          />
                        </label>
                        <button disabled={busy}>Create home</button>
                      </form>
                    )}
                </aside>
              </div>
            </>
          )}
        </>
      )}
    </main>
  );
}
