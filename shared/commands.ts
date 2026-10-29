export type Command =
  | { kind: "go"; direction: string }
  | { kind: "say"; message: string }
  | { kind: "tell"; target: string; message: string }
  | { kind: "agent"; prompt: string }
  | { kind: "look" | "help" | "home" | "who" | "build" | "clear" };
export function parseCommand(raw: string): Command {
  const s = raw.trim();
  if (!s) throw new Error("Enter a command.");
  const aliases: Record<string, string> = {
    n: "north",
    s: "south",
    e: "east",
    w: "west",
    u: "up",
    d: "down",
  };
  const lower = s.toLowerCase();
  const dir = aliases[lower] ?? lower;
  if (["north", "south", "east", "west", "up", "down"].includes(dir))
    return { kind: "go", direction: dir };
  if (lower.startsWith("go ")) {
    const value = lower.slice(3).trim();
    return { kind: "go", direction: aliases[value] ?? value };
  }
  if (
    ["look", "l", "help", "?", "home", "who", "build", "clear"].includes(lower)
  )
    return {
      kind: lower === "l" ? "look" : lower === "?" ? "help" : (lower as "look"),
    };
  if (s.startsWith("'") || /^say\s/i.test(s)) {
    const message = s.startsWith("'") ? s.slice(1).trim() : s.slice(4).trim();
    if (!message) throw new Error("Try: say Hello, travelers!");
    return { kind: "say", message };
  }
  if (/^ask\s/i.test(s)) return { kind: "agent", prompt: s.slice(4).trim() };
  if (/^tell\s/i.test(s)) {
    const m = s.match(/^tell\s+(?:"([^"]+)"|(\S+))\s+(.+)$/i);
    if (!m)
      throw new Error(
        "Try: tell AIAgent create a moonlit garden north. Quote names containing spaces.",
      );
    return { kind: "tell", target: m[1] ?? m[2], message: m[3].trim() };
  }
  throw new Error(
    "Unknown command. Try help, say, tell, or a direction (n/s/e/w/u/d).",
  );
}
