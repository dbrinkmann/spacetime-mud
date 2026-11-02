import type { Ctx } from "./index";
export function seedWorld(ctx: Ctx) {
  const owner = ctx.sender;
  const nexus = ctx.db.zone.insert({
    id: 0n,
    name: "The Nexus",
    owner,
    entrance: 0n,
  });
  const home = ctx.db.room.insert({
    id: 0n,
    zoneId: nexus.id,
    name: "The Nexus",
    description:
      "Marble pillars disappear into a sky of stained glass. Between them, doorways shimmer with worlds imagined by travelers.\n\nStep through a portal to explore, or open Build and create a realm of your own.",
    exits: [],
    creator: owner,
    x: 0,
    y: 0,
    floor: 0,
  });
  ctx.db.zone.id.update({ ...nexus, entrance: home.id });
  const zone = ctx.db.zone.insert({
    id: 0n,
    name: "Bellkeeper’s Crossing",
    owner,
    entrance: 0n,
  });
  const addRoom = (
    name: string,
    description: string,
    x: number,
    y: number,
    floor = 0,
  ) =>
    ctx.db.room.insert({
      id: 0n,
      zoneId: zone.id,
      name,
      description,
      exits: [],
      creator: owner,
      x,
      y,
      floor,
    });
  const court = addRoom(
    "Bellkeeper’s Crossing",
    "Rain glistens on ancient flagstones. An iron gate guards a moonlit garden to the north. A worn pressure plate rests before it. To the east, a bronze bell hangs beneath a leaning tower.\n\nThe inscription reads: “A little weight opens the way. A little courage keeps it open.”",
    0,
    0,
  );
  const garden = addRoom(
    "The Moonlit Garden",
    "Silver leaves turn in a wind you cannot feel. Beneath an elder tree stands a cedar chest, its lid carved with the names of travelers long gone. The gate leads south to the crossing.",
    0,
    -1,
  );
  const tower = addRoom(
    "The Bell Tower",
    "A bronze bell hangs from a frayed rope. Pale feathers line the stairway to the roost above. Ring it, and perhaps the keeper will answer.",
    1,
    0,
  );
  const loft = addRoom(
    "The Keeper’s Roost",
    "Lantern moths drift among the rafters. An old raven watches over the crossing from its perch. The tower stairs descend through the dust.",
    1,
    0,
    1,
  );
  ctx.db.zone.id.update({ ...zone, entrance: court.id });
  const object = (
    roomId: bigint,
    name: string,
    description: string,
    kind = "scenery",
  ) =>
    ctx.db.object.insert({
      id: 0n,
      zoneId: zone.id,
      roomId,
      owner,
      kind,
      name,
      description,
      actions: [],
      versionId: 0n,
      active: false,
    });
  const gate = object(
    court.id,
    "The Iron Gate",
    "Rust-dark bars seal the garden. The pressure plate seems connected to its latch.",
    "exit",
  );
  const plate = object(
    court.id,
    "Worn Pressure Plate",
    "A square of stone sits slightly above the flagstones.",
    "scenery",
  );
  const chest = object(
    garden.id,
    "Traveler’s Chest",
    "A cedar chest holds a keepsake for every traveler.",
    "container",
  );
  const raven = object(
    loft.id,
    "The Bellkeeper",
    "A raven with a silver ring around one leg. It seems to be waiting for a sound.",
    "character",
  );
  const bell = object(
    tower.id,
    "Bronze Bell",
    "The rope feels warm, though the tower is cold.",
  );
  const install = (
    obj: typeof gate,
    actions: { id: string; label: string }[],
    source: string,
  ) => {
    const v = ctx.db.version.insert({
      id: 0n,
      objectId: obj.id,
      author: owner,
      name: obj.name,
      description: obj.description,
      actions,
      source,
      tested: true,
      report: "Built-in showcase behavior; integration tested.",
      createdAt: ctx.timestamp,
    });
    ctx.db.object.id.update({ ...obj, actions, versionId: v.id, active: true });
  };
  install(
    gate,
    [],
    "// The pressure plate controls this gate.\nfunction on_enter(ctx) {}",
  );
  install(
    plate,
    [{ id: "press", label: "Stand on the plate" }],
    `function on_press(ctx) { ctx.setOther("${gate.id}", "open", true); ctx.say("Stone sinks beneath your weight. The iron gate lifts for twelve seconds."); ctx.schedule("reset", 12); }\nfunction on_reset(ctx) { ctx.setOther("${gate.id}", "open", false); ctx.say("With a sigh of old iron, the garden gate closes."); }`,
  );
  install(
    chest,
    [{ id: "open", label: "Open the chest" }],
    'function on_open(ctx) { if (ctx.personal("claimed")) { ctx.say("You have already taken your keepsake. Leave a little wonder for the next traveler."); } else { ctx.give("Moonleaf charm", 1); ctx.remember("claimed", true); ctx.say(ctx.playerName() + " finds a moonleaf charm nestled in the cedar chest."); } }',
  );
  install(
    raven,
    [{ id: "speak", label: "Speak to the keeper" }],
    'function on_speak(ctx) { ctx.say("The raven tilts its head. Every world begins with an empty room, traveler. What will yours become?"); }',
  );
  install(
    bell,
    [{ id: "ring", label: "Ring the bell" }],
    `function on_ring(ctx) { if (ctx.get("ringing")) { ctx.say("The bell is still singing."); return; } ctx.set("ringing",true);ctx.moveObject("${raven.id}","${tower.id}");ctx.say("The bronze bell rings. A silver-ringed raven glides down from the rafters.");ctx.schedule("quiet",8); }\nfunction on_quiet(ctx) { ctx.set("ringing",false);ctx.moveObject("${raven.id}","${loft.id}");ctx.say("The last note fades. The keeper returns to its roost."); }`,
  );
  const link = (
    a: typeof court,
    b: typeof court,
    direction: string,
    back: string,
    gateId = 0n,
  ) => {
    const ar = ctx.db.room.id.find(a.id)!,
      br = ctx.db.room.id.find(b.id)!;
    ctx.db.room.id.update({
      ...ar,
      exits: [
        ...ar.exits,
        { direction, destination: b.id, gateId, secret: false },
      ],
    });
    ctx.db.room.id.update({
      ...br,
      exits: [
        ...br.exits,
        { direction: back, destination: a.id, gateId, secret: false },
      ],
    });
  };
  link(court, garden, "north", "south", gate.id);
  link(court, tower, "east", "west");
  link(tower, loft, "up", "down");
}
