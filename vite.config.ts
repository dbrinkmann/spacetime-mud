import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  build: { target: "es2022" },
  plugins: [
    {
      name: "runtime-release-entry",
      transformIndexHtml: {
        order: "pre",
        handler(html) {
          return process.env.LANTERN_RUNTIME_BUILD === "true"
            ? html.replace("/client/entry.tsx", "/client/runtime/entry.tsx")
            : html;
        },
      },
    },
  ],
});
