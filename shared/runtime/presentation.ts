import type { Entity } from "./contracts";
import type { Operation } from "./operations";
import type { Walker } from "./walking";
import { copyValue } from "./values";
/** Client projection deliberately excludes variables, slot state, code and diagnostics. */
export function presentEntity(
  entity: Entity,
  operations: Operation[],
  actions: string[],
) {
  return {
    id: entity.id,
    revision: entity.revision,
    components: copyValue(entity.components) as Entity["components"],
    operations,
    actions: [...new Set(actions)].sort(),
  };
}
export type PresentedEntity = ReturnType<typeof presentEntity>;
export type RoomPresentation = {
  walkers?: Walker[];
  serverTime: number;
  entities: PresentedEntity[];
};
