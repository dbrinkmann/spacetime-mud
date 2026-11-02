export const templates = [
  {
    name: "Singing stone",
    kind: "scenery",
    description: "A smooth stone hums when touched.",
    actions: [{ id: "touch", label: "Touch the stone" }],
    source:
      'function on_touch(ctx) {\n  ctx.say("A clear note rises from the stone.");\n  ctx.set("singing", true);\n  ctx.schedule("quiet", 5);\n}\n\nfunction on_quiet(ctx) {\n  ctx.set("singing", false);\n  ctx.say("The stone falls silent.");\n}',
  },
  {
    name: "Keepsake chest",
    kind: "container",
    description: "A wooden chest holds a gift for each traveler.",
    actions: [{ id: "open", label: "Open the chest" }],
    source:
      'function on_open(ctx) {\n  if (ctx.personal("claimed")) {\n    ctx.say("You have already claimed your keepsake.");\n    return;\n  }\n  ctx.give("Amber keepsake", 1);\n  ctx.remember("claimed", true);\n  ctx.say(ctx.playerName() + " finds a piece of amber.");\n}',
  },
  {
    name: "Watchful keeper",
    kind: "character",
    description: "A hooded keeper watches the road.",
    actions: [{ id: "speak", label: "Speak to the keeper" }],
    source:
      'function on_speak(ctx) {\n  ctx.say("Welcome, " + ctx.playerName() + ". What brings you to this realm?");\n}\n\nfunction on_enter(ctx) {\n  ctx.say("The keeper nods to the new arrival.");\n}',
  },
];
