import type { RuntimeStore, InteractionRecord } from "./store";
import { sampleOperation } from "./operations";
/** Resolve from current authoritative positions, never from client-supplied coordinates. */
export function resolveTarget(
  store: RuntimeStore,
  request: InteractionRecord,
  id: string,
  time: number,
) {
  const target = request.target;
  if (!target || !request.player) throw Error("Target request unavailable.");
  const players = store.players(request.property, request.room, time);
  const actor = players.find((p) => p.id === `player:${request.player}`);
  if (!actor) throw Error("Player is no longer in this room.");
  let position: number[] | undefined;
  if (id.startsWith("player:") && target.kinds.includes("player"))
    position = players.find((p) => p.id === id)?.trajectory.position;
  if (!id.startsWith("player:") && target.kinds.includes("object")) {
    const e = store.entity(id);
    if (
      e?.enabled &&
      e.property === request.property &&
      e.room === request.room &&
      e.components.visibility !== false
    ) {
      const op = store.operations(id).find((o) => o.resource === "transform");
      position = op
        ? sampleOperation(op, time).position
        : (e.components.transform as { position: number[] } | undefined)
            ?.position;
    }
  }
  if (
    !position ||
    Math.hypot(...position.map((p, i) => p - actor.trajectory.position[i])) >
      target.range
  )
    throw Error("Choose an allowed target within range.");
  return { target: id };
}
