import { executeSandbox, type ScriptApi } from "./runtime/sandbox";
export { executeSandbox, type ScriptApi, type Scalar } from "./runtime/sandbox";
// Legacy adapter, removed when the replacement application reaches its parity gate.
// The sandbox itself has no knowledge of world API names.
export function executeScript(
  source: string,
  handler: string,
  api: ScriptApi,
  eventArgs: unknown[] = [],
) {
  return executeSandbox(source, handler, api, eventArgs, {
    arguments: ["subscribe", "reserve"],
    results: ["view"],
  });
}
