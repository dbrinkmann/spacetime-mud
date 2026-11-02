import { build } from "esbuild";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import type { Room, Character } from "../shared/geometry.ts";
let compiled: ReturnType<typeof build> | undefined;
export async function renderPreview(room: Room, character: Character) {
  compiled ??= build({
    entryPoints: [
      fileURLToPath(
        new URL("../client/world/AgentPreview.tsx", import.meta.url),
      ),
    ],
    bundle: true,
    write: false,
    outdir: "preview",
    format: "esm",
    platform: "browser",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
  });
  const files = (await compiled).outputFiles!,
    js = files.find((f) => f.path.endsWith(".js"))!.text,
    css = files.find((f) => f.path.endsWith(".css"))?.text ?? "";
  const data = JSON.stringify({ room, character }).replace(/</g, "\\u003c");
  const html = `<!doctype html><html><head><link rel="stylesheet" href="/bundle.css"></head><body style="margin:0"><div id="root"></div><script type="application/json" id="definition">${data}</script><script type="module" src="/bundle.js"></script></body></html>`;
  const server = createServer((req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (req.url === "/bundle.js") {
      res.setHeader("Content-Type", "text/javascript");
      res.end(js);
    } else if (req.url === "/bundle.css") {
      res.setHeader("Content-Type", "text/css");
      res.end(css);
    } else if (req.url === "/") {
      res.setHeader("Content-Type", "text/html");
      res.end(html);
    } else {
      res.statusCode = 404;
      res.end();
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--enable-unsafe-swiftshader"],
    });
    const page = await browser.newPage({
      viewport: { width: 1000, height: 760 },
    });
    page.setDefaultTimeout(15000);
    await page.goto(
      `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    );
    await page.waitForFunction(
      () => !!window.boxWorld || !!document.body.dataset.error,
    );
    const error = await page.evaluate(() => document.body.dataset.error);
    if (error) throw Error(error);
    await page.waitForTimeout(300);
    return await page
      .getByRole("img", { name: "Interactive 3D room" })
      .screenshot();
  } finally {
    await browser?.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
