import {
  validateManifest,
  type Package,
  type PackageManifest,
} from "./contracts";
import { canonical, sha256 } from "./digest";
import { identifier } from "./values";

export type Publisher = { id: string; community: string };
export type RegistryEntry = {
  id: string;
  owner: string;
  community: string;
  visibility: "private" | "community" | "public";
  listed: boolean;
};
export type Revision = {
  key: string;
  id: string;
  version: string;
  hash: string;
  license: string;
  documentation: string;
};
export type Bundle = {
  format: 2;
  manifest: PackageManifest;
  source: string;
  hash: string;
  license: string;
  documentation: string;
};
export interface RegistryStore {
  entry(id: string): RegistryEntry | undefined;
  putEntry(entry: RegistryEntry): void;
  revision(key: string): Revision | undefined;
  putRevision(revision: Revision): void;
  package(hash: string): Package | undefined;
  install(pkg: Package): void;
}
/** Registry authorization is independent of runtime grants and transient agent pairing. */
export class BehaviorRegistry {
  constructor(readonly store: RegistryStore) {}
  canRead(actor: Publisher, entry: RegistryEntry) {
    return (
      entry.owner === actor.id ||
      entry.visibility === "public" ||
      (entry.visibility === "community" && entry.community === actor.community)
    );
  }
  publish(
    actor: Publisher,
    bundle: Bundle,
    visibility: RegistryEntry["visibility"],
  ) {
    if (!["private", "community", "public"].includes(visibility))
      throw Error("Invalid visibility.");
    if (bundle.format !== 2) throw Error("Unsupported bundle format.");
    const manifest = validateManifest(bundle.manifest);
    if (typeof bundle.source !== "string" || bundle.source.length > 16000)
      throw Error("Invalid source.");
    if (
      typeof bundle.license !== "string" ||
      bundle.license.length < 1 ||
      bundle.license.length > 120 ||
      typeof bundle.documentation !== "string" ||
      bundle.documentation.length > 8000
    )
      throw Error("Invalid package documentation.");
    const hash = sha256(canonical({ manifest, source: bundle.source }));
    if (bundle.hash !== hash) throw Error("Bundle content hash mismatch.");
    const existing = this.store.entry(manifest.id);
    if (existing && existing.owner !== actor.id)
      throw Error("Package namespace belongs to another publisher.");
    const key = `${manifest.id}@${manifest.version}`,
      old = this.store.revision(key);
    if (old) {
      if (
        old.hash !== hash ||
        old.license !== bundle.license ||
        old.documentation !== bundle.documentation
      )
        throw Error("Published revisions are immutable.");
      return old;
    }
    const revision = {
      key,
      id: manifest.id,
      version: manifest.version,
      hash,
      license: bundle.license,
      documentation: bundle.documentation,
    };
    // Runtime source/schema validation precedes registry mutations in the host transaction.
    if (!this.store.package(hash))
      this.store.install({ hash, manifest, source: bundle.source });
    if (!existing)
      this.store.putEntry({
        id: manifest.id,
        owner: actor.id,
        community: actor.community,
        visibility,
        listed: true,
      });
    this.store.putRevision(revision);
    return revision;
  }
  get(actor: Publisher, id: string, version: string, install = false) {
    identifier(id);
    const entry = this.store.entry(id);
    if (
      !entry ||
      !this.canRead(actor, entry) ||
      (install && !entry.listed && entry.owner !== actor.id)
    )
      throw Error("Package unavailable.");
    const revision = this.store.revision(`${id}@${version}`);
    if (!revision) throw Error("Package unavailable.");
    const pkg = this.store.package(revision.hash)!;
    return {
      format: 2,
      hash: pkg.hash,
      source: pkg.source,
      manifest: pkg.manifest,
      license: revision.license,
      documentation: revision.documentation,
    } satisfies Bundle;
  }
  setListing(actor: Publisher, id: string, listed: boolean) {
    const entry = this.store.entry(id);
    if (!entry || entry.owner !== actor.id) throw Error("Package unavailable.");
    this.store.putEntry({ ...entry, listed });
  }
}
