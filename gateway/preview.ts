import puppeteer, { type BrowserWorker } from "@cloudflare/puppeteer";
import type { D1Database } from "@cloudflare/workers-types";
import { parseDefinition } from "../shared/geometry";
import { validateNavigation } from "../shared/navigation";
type Env = {
  BROWSER: BrowserWorker;
  SESSIONS: D1Database;
  SPACETIME_HOST: string;
  SPACETIME_DATABASE: string;
};
const error = (message: string, status: number) =>
  Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
export async function preview(req: Request, env: Env) {
  if (req.method !== "POST") return error("POST required.", 405);
  const auth = req.headers.get("Authorization") ?? "";
  if (!/^Bearer [^\s]+$/.test(auth) || auth.length > 8192)
    return error("Builder authorization required.", 401);
  let input: {
    community_id: string;
    source: string;
    character?: string;
    yaw?: number;
    time?: number;
  };
  try {
    const reader = req.body?.getReader();
    if (!reader) return error("JSON required.", 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const r = await reader.read();
      if (r.done) break;
      size += r.value.length;
      if (size > 2000000) {
        await reader.cancel();
        return error("Preview exceeds 2 MB.", 413);
      }
      chunks.push(r.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    input = JSON.parse(new TextDecoder().decode(bytes));
    if (
      !input ||
      !/^[0-9]{1,24}$/.test(input.community_id) ||
      typeof input.source !== "string"
    )
      throw Error("Community and room source required.");
    for (const [key, min, max] of [
      ["yaw", -360, 360],
      ["time", 0, 3600],
    ] as const) {
      const n = input[key];
      if (
        n !== undefined &&
        (typeof n !== "number" || !Number.isFinite(n) || n < min || n > max)
      )
        throw Error(`Invalid ${key}.`);
    }
    validateNavigation(parseDefinition(input.source, "room"));
    if (input.character !== undefined) {
      if (typeof input.character !== "string")
        throw Error("Character must be JSON text.");
      parseDefinition(input.character, "character");
    }
  } catch (e) {
    return error(e instanceof Error ? e.message : "Invalid preview.", 400);
  }
  const access = await fetch(
    `${env.SPACETIME_HOST}/v1/database/${env.SPACETIME_DATABASE}/call/preview_principal`,
    {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify([input.community_id]),
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!access.ok) return error("Builder authorization failed.", 403);
  const owner = await access.json();
  if (typeof owner !== "string" || !/^[a-f0-9]{64}$/.test(owner))
    return error("Pair your agent and keep the Activity open.", 403);
  // Count per verified owner, not per client-supplied identity. The bucket table stays bounded.
  const bucket = Math.floor(Date.now() / 60000);
  const rate = await env.SESSIONS.prepare(
    "INSERT INTO preview_rate(owner, bucket, count) VALUES (?, ?, 1) ON CONFLICT(owner) DO UPDATE SET bucket=excluded.bucket, count=CASE WHEN preview_rate.bucket=excluded.bucket THEN preview_rate.count+1 ELSE 1 END RETURNING count",
  )
    .bind(owner, bucket)
    .first<{ count: number }>();
  if (!rate || rate.count > 6)
    return error("Preview limit reached; try again next minute.", 429);
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
  try {
    browser = await puppeteer.launch(env.BROWSER);
    const page = await browser.newPage();
    page.setDefaultTimeout(25000);
    await page.setViewport({ width: 1000, height: 760, deviceScaleFactor: 1 });
    const origin = new URL(req.url).origin;
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.origin === origin && !url.pathname.startsWith("/api/"))
        void request.continue();
      else void request.abort();
    });
    await page.goto(`${origin}/?preview`, {
      waitUntil: "networkidle0",
      timeout: 25000,
    });
    await page.waitForFunction(
      "typeof window.renderLanternPreview === 'function'",
    );
    await page.evaluate(
      async (payload) => {
        await window.renderLanternPreview!(payload);
      },
      {
        source: input.source,
        character: input.character,
        yaw: input.yaw,
        time: input.time,
      },
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    const canvas = await page.$("canvas[aria-label='Interactive 3D room']");
    if (!canvas) throw Error("Renderer did not create a canvas.");
    const png = await canvas.screenshot({ type: "png" });
    return new Response(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    console.error(
      "Preview rendering failed",
      e instanceof Error ? e.message : "unknown",
    );
    return error(
      "Preview rendering failed. Retry shortly; no world changes were made.",
      503,
    );
  } finally {
    await browser?.close();
  }
}
