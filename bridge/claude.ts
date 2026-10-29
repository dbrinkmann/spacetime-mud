import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";
import {
  agentInstructions,
  proposalSchema,
  validateProposal,
  type Proposal,
} from "../shared/agent.ts";

export function claudeExecutable(): string {
  if (process.env.CLAUDE_EXECUTABLE) return process.env.CLAUDE_EXECUTABLE;
  if (process.platform === "win32") {
    const dirs = (process.env.PATH ?? "").split(delimiter);
    for (const dir of dirs)
      for (const rel of [
        "claude.exe",
        "node_modules/@anthropic-ai/claude-code/bin/claude.exe",
      ]) {
        const p = join(dir, rel);
        if (existsSync(p)) return p;
      }
    const native = join(
      process.env.USERPROFILE ?? "",
      ".local",
      "bin",
      "claude.exe",
    );
    if (existsSync(native)) return native;
    throw new Error(
      "Claude Code executable not found. Install Claude Code and run claude auth login.",
    );
  }
  return "claude";
}
export async function runClaude(
  context: unknown,
  signal?: AbortSignal,
): Promise<Proposal> {
  const args = [
    "--print",
    "--safe-mode",
    "--tools",
    "",
    "--strict-mcp-config",
    "--mcp-config",
    '{"mcpServers":{}}',
    "--no-session-persistence",
    "--output-format",
    "json",
    "--json-schema",
    JSON.stringify(proposalSchema),
    "--system-prompt",
    agentInstructions,
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(claudeExecutable(), args, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      signal,
    });
    let stdout = "",
      stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(
        new Error("Claude timed out after 120 seconds. Try a smaller request."),
      );
    }, 120_000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.length > 1_000_000) {
        child.kill();
        reject(new Error("Claude output exceeded limit."));
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk).slice(-2000);
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      try {
        if (code !== 0)
          throw new Error(
            `Claude exited (${code}). Check claude auth status and your usage limit. ${stderr.slice(0, 200)}`,
          );
        const output = JSON.parse(stdout);
        if (output.is_error)
          throw new Error(
            String(output.result ?? "Claude request failed.").slice(0, 300),
          );
        const value =
          output.structured_output ??
          JSON.parse(
            String(output.result).replace(/^```(?:json)?\s*|\s*```$/g, ""),
          );
        resolve(validateProposal(value));
      } catch (e) {
        reject(e);
      }
    });
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify(context));
  });
}
