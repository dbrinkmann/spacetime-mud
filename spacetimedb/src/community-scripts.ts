import { executeScript, type Scalar } from "./scripts";
export function evaluateObject(
  source: string,
  handler: string,
  initial: string,
  actorId: string,
  actorName: string,
) {
  const state: Record<string, Scalar> = Object.assign(
    Object.create(null),
    JSON.parse(initial),
  );
  const messages: Array<{ kind: string; message: string }> = [];
  const timers = new Map<string, number | null>();
  const key = (value: Scalar) => {
    if (
      typeof value !== "string" ||
      !/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(value) ||
      ["constructor", "prototype", "__proto__"].includes(value)
    )
      throw Error("Invalid state/event key.");
    return value;
  };
  const message = (kind: string, value: Scalar) => {
    if (typeof value !== "string" || !value.trim() || value.length > 1000)
      throw Error("Speech must contain 1-1000 characters.");
    if (messages.length >= 8)
      throw Error("Maximum eight speech effects per event.");
    if (kind === "tell" && !actorId) return;
    messages.push({ kind, message: value });
  };
  const stats = executeScript(source, handler, {
    actorId: () => actorId,
    actorName: () => actorName,
    say: (value) => message("say", value),
    tell: (value) => message("tell", value),
    emote: (value) => message("emote", value),
    get: (name) => state[key(name)] ?? null,
    set: (name, value) => {
      if (value === undefined) throw Error("State values must be scalar.");
      state[key(name)] = value;
      if (Object.keys(state).length > 64 || JSON.stringify(state).length > 8192)
        throw Error("Object state budget exceeded.");
    },
    after: (seconds, event) => {
      if (
        typeof seconds !== "number" ||
        !Number.isInteger(seconds) ||
        seconds < 5 ||
        seconds > 86400
      )
        throw Error("Timer delay must be 5-86400 whole seconds.");
      timers.set(key(event), seconds);
      if (timers.size > 4) throw Error("Maximum four timer effects per event.");
    },
    cancel: (event) => {
      timers.set(key(event), null);
      if (timers.size > 4) throw Error("Maximum four timer effects per event.");
    },
  });
  return {
    state: JSON.stringify(state),
    messages,
    timers: [...timers.entries()],
    stats,
  };
}
