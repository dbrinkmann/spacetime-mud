import type { Operation } from "./operations";
import type { RuntimeStore } from "./store";
import type { Entity } from "./contracts";
import { navigationScene, walkable } from "./walking";
export function validateNavigationEdit(
  store: RuntimeStore,
  before: Entity,
  after: Entity,
  time: number,
  nextOperations?: Operation[],
) {
  if (
    !before.components.collider &&
    !after.components.collider &&
    !before.components.walkSurface &&
    !after.components.walkSurface
  )
    return;
  const entities = store.roomEntities(after.property, after.room);
  if (entities.filter((e) => e.components.walkSurface).length !== 1) return;
  const operations = entities.flatMap((e) => store.operations(e.id));
  const oldNav = navigationScene(entities, operations, time),
    newNav = navigationScene(
      entities.map((e) => (e.id === after.id ? after : e)),
      nextOperations
        ? [
            ...operations.filter((o) => o.entity !== after.id),
            ...nextOperations,
          ]
        : operations,
      time,
    );
  for (const player of store.players(after.property, after.room, time)) {
    const [x, , z] = player.trajectory.position;
    if (walkable(oldNav, x, z) && !walkable(newNav, x, z))
      throw Error(
        "Navigation change would enclose a player; wait until the region is clear.",
      );
  }
}
