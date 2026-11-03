function on_climb(ctx) {
  ctx.say(ctx.playerName() + " climbs the rope ladder toward the Cloudglass Study.");
  ctx.movePlayer("9");
}
