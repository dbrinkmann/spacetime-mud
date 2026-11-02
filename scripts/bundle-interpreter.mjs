import { build } from "esbuild";
await build({
  entryPoints: [
    "spacetimedb/node_modules/js-interpreter/lib/js-interpreter.js",
  ],
  outfile: "spacetimedb/src/vendor/interpreter.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  minify: true,
  legalComments: "inline",
  plugins: [
    {
      name: "no-node-vm",
      setup(b) {
        b.onResolve({ filter: /^vm$/ }, () => ({
          path: "vm",
          namespace: "disabled",
        }));
        b.onLoad({ filter: /.*/, namespace: "disabled" }, () => ({
          contents: 'throw new Error("Node vm is unavailable");',
        }));
      },
    },
  ],
});
