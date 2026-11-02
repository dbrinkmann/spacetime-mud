import React, { useMemo, useState } from "react";
import type { DbConnection } from "../module_bindings";
import type { Room as RoomRow } from "../module_bindings/types";
import type { Snapshot } from "../connection";
import {
  parseDefinition,
  type Room,
  type Character,
} from "../../shared/geometry";
import { validateNavigation } from "../../shared/navigation";
import { emptyRoom, neutralCharacter } from "../../shared/world";
import { Viewport, type ViewCommand } from "./Viewport";
import "./world.css";
const mannequin = neutralCharacter("Preview companion");
export function VisualBuilder({
  conn,
  data,
  room,
  identity,
  enabled,
  canEdit,
}: {
  conn: DbConnection;
  data: Snapshot;
  room: RoomRow;
  identity: string;
  enabled: boolean;
  canEdit: boolean;
}) {
  const [kind, setKind] = useState<"scene" | "avatar">("scene"),
    [source, setSource] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{
      room: Room;
      character: Character;
    }>(),
    [command, setCommand] = useState<ViewCommand>({ id: 0, action: "idle" }),
    [reviewed, setReviewed] = useState("");
  const liveSource = data.scenes?.find((s) => s.roomId === room.id)?.source,
    avatarSource = data.avatars?.find(
      (a) => a.identity.toHexString() === identity,
    )?.source;
  const live = useMemo(
    () => ({
      room: liveSource
        ? parseDefinition(liveSource, "room")
        : emptyRoom(room.name, room.description),
      character: avatarSource
        ? parseDefinition(avatarSource, "character")
        : neutralCharacter("Your character"),
    }),
    [liveSource, avatarSource, room.name, room.description],
  );
  const draft = data.visualDrafts?.find(
    (d) => d.kind === kind && (kind === "avatar" || d.roomId === room.id),
  );
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  function inspect(text = source) {
    try {
      const next = { ...live };
      if (kind === "scene") {
        next.room = parseDefinition(text, "room");
        validateNavigation(next.room);
      } else next.character = parseDefinition(text, "character");
      setPreview(next);
      setError("");
      setNotice("Local preview. Publish a saved draft to share it.");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  }
  const editable = enabled && !busy && (kind === "avatar" || canEdit);
  return (
    <section className="visual-builder panel">
      <h2>Shape your world</h2>
      <p>
        Define rooms and characters with boxes. Preview locally, save a private
        draft, then publish it for everyone here.
      </p>
      <div className="button-row">
        <button
          onClick={() => {
            setKind("scene");
            setSource("");
            setReviewed("");
          }}
        >
          Room geometry
        </button>
        <button
          onClick={() => {
            setKind("avatar");
            setSource("");
            setReviewed("");
          }}
        >
          My character
        </button>
        <a href="./poc/AUTHORING.md" target="_blank" rel="noreferrer">
          Authoring guide ↗
        </a>
      </div>
      <p>
        Editing:{" "}
        <strong>{kind === "scene" ? room.name : "Your character"}</strong>
        {!canEdit && kind === "scene"
          ? " — create your own zone to build here."
          : ""}
      </p>
      <div className="button-row">
        <button
          onClick={() => {
            setSource(
              JSON.stringify(
                kind === "scene" ? live.room : live.character,
                null,
                2,
              ),
            );
            setReviewed("");
          }}
        >
          Load published
        </button>
        <button
          disabled={!source}
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob([source], { type: "application/json" }),
            );
            const link = document.createElement("a");
            link.href = url;
            link.download = `${kind}.json`;
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          Download JSON
        </button>
        <button
          disabled={!draft}
          onClick={() => {
            if (draft) {
              setSource(draft.source);
              if (inspect(draft.source))
                setReviewed(`${draft.key}:${draft.revision}`);
            }
          }}
        >
          Preview saved draft
        </button>
        <label>
          Import JSON
          <input
            aria-label="Import geometry JSON"
            type="file"
            accept=".json,application/json"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > 500000) {
                setError("Maximum 500 KB.");
                return;
              }
              setSource(await f.text());
              setReviewed("");
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <textarea
        aria-label="Geometry JSON"
        value={source}
        onChange={(e) => {
          setSource(e.target.value);
          setReviewed("");
        }}
        spellCheck={false}
      />
      <div className="button-row">
        <button disabled={!source} onClick={() => inspect()}>
          Preview JSON
        </button>
        <button
          disabled={!editable || !source}
          onClick={() =>
            void run(async () => {
              if (!inspect()) return;
              await conn.reducers.saveVisualDraft({
                roomId: room.id,
                kind,
                source,
              });
              setReviewed("");
              setNotice(
                "Draft saved. Preview the saved revision before publishing.",
              );
            })
          }
        >
          Save visual draft
        </button>
        <button
          disabled={
            !editable ||
            !draft ||
            reviewed !== `${draft.key}:${draft.revision}` ||
            source !== draft.source
          }
          onClick={() =>
            void run(async () => {
              await conn.reducers.publishVisual({
                key: draft!.key,
                revision: draft!.revision,
              });
              setReviewed("");
              setNotice(
                "Published. Everyone in the room now sees this definition.",
              );
            })
          }
        >
          Publish visual
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {preview && (
        <>
          <div className="live-stage">
            <Viewport
              room={preview.room}
              character={preview.character}
              guest={mannequin}
              command={command}
              onStatus={() => {}}
              onError={setError}
            />
          </div>
          <div className="button-row">
            {(
              [
                "idle",
                "walk",
                "sit",
                "wave",
                "talk",
                "anchors",
                "reset",
              ] as const
            ).map((a) => (
              <button
                key={a}
                onClick={() => setCommand((c) => ({ id: c.id + 1, action: a }))}
              >
                {a}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
