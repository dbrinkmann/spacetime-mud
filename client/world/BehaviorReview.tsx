import React, { useState } from "react";
import type { Snapshot } from "../connection";
import type { DbConnection } from "../module_bindings";
export function BehaviorReview({
  data,
  conn,
  roomId,
  identity,
  enabled,
  action,
}: {
  data: Snapshot;
  conn: DbConnection;
  roomId: bigint;
  identity: string;
  enabled: boolean;
  action: (fn: () => Promise<void>) => Promise<void>;
}) {
  const [selected, setSelected] = useState<bigint>(),
    [changes, setChanges] = useState(false);
  const drafts = data.objects
    .filter((o) => o.roomId === roomId)
    .flatMap((o) => {
      const v = data.versions
        .filter(
          (v) =>
            v.objectId === o.id &&
            v.author.toHexString() === identity &&
            v.id > o.versionId,
        )
        .sort((a, b) => Number(b.id - a.id))[0];
      return v ? [v] : [];
    });
  if (!drafts.length) return null;
  const v = drafts.find((v) => v.id === selected);
  return (
    <section className="creation-review">
      <strong>Your agent prepared an interaction</strong>
      <div className="button-row">
        {drafts.map((d) => (
          <button
            key={String(d.id)}
            onClick={() => {
              setSelected(d.id);
              setChanges(false);
            }}
          >
            Review {d.name}
          </button>
        ))}
      </div>
      {v && (
        <>
          <h3>{v.name}</h3>
          <p>{v.description}</p>
          <p>
            Actions:{" "}
            {v.actions.map((a) => a.label).join(", ") || "Room behavior"}
          </p>
          <details>
            <summary>Test results</summary>
            <pre>{v.report || "Your agent has not tested this draft yet."}</pre>
          </details>
          <div className="button-row">
            <button
              disabled={!enabled || !v.tested}
              onClick={() =>
                void action(() =>
                  conn.reducers.publishVersion({ versionId: v.id }),
                )
              }
            >
              Keep behavior
            </button>
            <button onClick={() => setChanges(true)}>Ask for changes</button>
            <button
              disabled={!enabled}
              onClick={() =>
                void action(() =>
                  conn.reducers.discardBehavior({ versionId: v.id }),
                )
              }
            >
              Discard behavior
            </button>
          </div>
          {changes && (
            <p>
              Ask your agent to revise and test this interaction in your
              existing conversation.
            </p>
          )}
          {!v.tested && (
            <p>Ask your agent to test this interaction before keeping it.</p>
          )}
        </>
      )}
    </section>
  );
}
