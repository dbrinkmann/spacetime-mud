import { validateView, validateRegion } from "../../shared/intelligent-objects";
import { executeScript, type Scalar, type ScriptApi } from "./scripts";
export function evaluateObject(
  source: string,
  handler: string,
  initial: string,
  actorId: string,
  actorName: string,
  extensions: ScriptApi = {},
  eventArgs: unknown[] = [],
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
  const stats = executeScript(
    source,
    handler,
    {
      reserve: (name, region, seconds) => {
        key(name);
        validateRegion(region);
        if (!Number.isFinite(seconds) || seconds < 0.25 || seconds > 60)
          throw Error("Reservation duration must be .25..60 seconds.");
        return false;
      },
      release: (name) => {
        key(name);
      },
      unsubscribe: (name) => {
        key(name);
      },
      subscribe: (name, view) => {
        key(name);
        validateView(view);
      },
      view: (name) => {
        key(name);
        return [];
      },
      "motion.pause": () => {},
      "motion.resume": () => {},
      "motion.restart": () => {},
      "motion.setSpeed": (speed) => {
        if (!Number.isFinite(speed) || speed < 0.1 || speed > 20)
          throw Error("Speed must be .1..20 m/s.");
      },
      "motion.progress": () => 0,
      setVisible: (visible) => {
        if (typeof visible !== "boolean")
          throw Error("Visibility must be boolean.");
      },
      randomInt: (min, max) => {
        if (
          !Number.isInteger(min) ||
          !Number.isInteger(max) ||
          min > max ||
          Math.abs(min) > 1000000 ||
          Math.abs(max) > 1000000
        )
          throw Error("Invalid integer range.");
        return min;
      },
      ...extensions,
      actorId: () => actorId,
      actorName: () => actorName,
      say: (value) => message("say", value),
      tell: (value) => message("tell", value),
      emote: (value) => message("emote", value),
      get: (name) => state[key(name)] ?? null,
      set: (name, value) => {
        if (value === undefined) throw Error("State values must be scalar.");
        state[key(name)] = value;
        if (
          Object.keys(state).length > 64 ||
          JSON.stringify(state).length > 8192
        )
          throw Error("Object state budget exceeded.");
      },
      after: (seconds, event) => {
        if (
          typeof seconds !== "number" ||
          !Number.isFinite(seconds) ||
          seconds < 0.25 ||
          seconds > 86400
        )
          throw Error("Timer delay must be 0.25-86400 seconds.");
        timers.set(key(event), seconds);
        if (timers.size > 4)
          throw Error("Maximum four timer effects per event.");
      },
      cancel: (event) => {
        timers.set(key(event), null);
        if (timers.size > 4)
          throw Error("Maximum four timer effects per event.");
      },
    },
    eventArgs,
  );
  return {
    state: JSON.stringify(state),
    messages,
    timers: [...timers.entries()],
    stats,
  };
}
