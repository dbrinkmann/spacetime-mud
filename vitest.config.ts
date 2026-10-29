import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["tests/*.spec.tsx"],
    testTimeout: 30000,
    env: {
      VITE_SPACETIME_HOST:
        process.env.SPACETIME_HOST ?? "http://127.0.0.1:3030",
      VITE_SPACETIME_DATABASE: process.env.SPACETIME_DATABASE ?? "mud-test-v2",
    },
  },
});
