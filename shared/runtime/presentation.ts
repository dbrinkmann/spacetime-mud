import type { Entity } from "./contracts";
import type { Operation } from "./operations";
import type { Walker } from "./walking";
import type { InteractionRecord } from "./store";
import { copyValue } from "./values";
import { copyComponentData } from "./components";
export function bindHomeSigns(
  entity: Entity,
  name: (entrance: string) => string | undefined,
): Entity {
  const components = { ...entity.components };
  for (const [key, value] of Object.entries(components))
    if (key === "sign" || key.startsWith("sign.")) {
      const sign = value as Record<string, import("./values").Value>;
      if (typeof sign.homeEntrance === "string")
        components[key] = {
          ...sign,
          text: name(sign.homeEntrance) ?? sign.text,
        };
    }
  return { ...entity, components };
}
/** Client projection deliberately excludes variables, slot state, code and diagnostics. */
export function presentEntity(
  entity: Entity,
  operations: Operation[],
  actions: string[],
) {
  return {
    id: entity.id,
    revision: entity.revision,
    components: copyComponentData(entity.components) as Entity["components"],
    operations,
    actions: [...new Set(actions)].sort(),
  };
}
export type PresentedEntity = ReturnType<typeof presentEntity>;
export type RoomPresentation = {
  location?: Walker | null;
  interactions?: InteractionRecord[];
  walkers?: Walker[];
  serverTime: number;
  entities: PresentedEntity[];
};
