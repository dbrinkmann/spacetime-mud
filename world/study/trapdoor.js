function on_descend(ctx) {
  ctx.say(ctx.playerName() + " climbs down through the trapdoor to the inn.");
  ctx.movePlayer("7");
}
