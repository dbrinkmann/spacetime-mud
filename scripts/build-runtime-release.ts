// Keep the established Discord URL while publishing the replacement runtime.
process.env.LANTERN_RELEASE_SITE = "https://lantern-staging.dbrinkmann.workers.dev";
await import("./build-runtime-staging.ts");
export {};
