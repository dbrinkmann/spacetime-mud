import { validateComponent, copyComponentData } from "./components";
import {
  assertSchema,
  copyValue,
  identifier,
  type RecordValue,
} from "./values";
import type { Package } from "./contracts";
export type EntityTemplate = {
  hash: string;
  property: string;
  components: RecordValue;
  bindings: Array<{ slot: string; hash: string; config: RecordValue }>;
};
export function validateTemplate(
  template: EntityTemplate,
  getPackage: (hash: string) => Package | undefined,
) {
  copyComponentData(template.components);
  Object.entries(template.components).forEach(([k, v]) =>
    validateComponent(k, v),
  );
  if (!Array.isArray(template.bindings) || template.bindings.length > 8)
    throw Error("Template supports up to eight behaviors.");
  const names = new Set<string>(),
    resources = new Set<string>();
  for (const b of template.bindings) {
    identifier(b.slot);
    if (b.slot.includes(":") || names.has(b.slot))
      throw Error("Invalid or duplicate slot.");
    names.add(b.slot);
    const pkg = getPackage(b.hash);
    if (!pkg) throw Error("Template package unavailable.");
    assertSchema(pkg.manifest.config, copyValue(b.config));
    for (const key of pkg.manifest.writes) {
      if (resources.has(key)) throw Error("Conflicting template writers.");
      resources.add(key);
      if (
        !/^(public|variables|world)\./.test(key) &&
        !(key in template.components)
      )
        throw Error("Template component unavailable.");
    }
  }
}
