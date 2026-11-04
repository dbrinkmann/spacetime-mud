import type { Package } from "./contracts";
export const guidePackage: Package = {
  hash: "guide",
  manifest: {
    id: "guide",
    version: "1.0.0",
    apiVersion: 2,
    stateVersion: 1,
    config: { type: "object", properties: {} },
    state: {
      type: "object",
      properties: { arrivals: { type: "number" }, news: { type: "number" } },
    },
    initialState: {},
    writes: [],
    handlers: {
      "action:inspect": { handler: "on_inspect", input: { type: "null" } },
      "dialog:inspect": {
        handler: "on_selected",
        input: { type: "object", properties: { target: { type: "string" } } },
      },
      "lifecycle:activated": { handler: "on_start", input: { type: "null" } },
      "spatial:enter": {
        handler: "on_arrive",
        input: {
          type: "object",
          properties: {
            view: { type: "string" },
            entity: {
              type: "object",
              properties: { id: { type: "string" }, kind: { type: "string" } },
            },
          },
        },
      },
      "action:talk": { handler: "on_talk", input: { type: "null" } },
      "room:entered": {
        handler: "on_entered",
        input: {
          type: "object",
          properties: { player: { type: "string" }, name: { type: "string" } },
        },
      },
      "action:greet": { handler: "on_greet", input: { type: "null" } },
      "action:location": { handler: "on_location", input: { type: "null" } },
      "action:directions": {
        handler: "on_directions",
        input: { type: "null" },
      },
      "action:housing": { handler: "on_housing", input: { type: "null" } },
      "action:news": { handler: "on_news", input: { type: "null" } },
      "action:introduce": { handler: "on_introduce", input: { type: "null" } },
      "dialog:introduction": {
        handler: "on_introduction",
        input: { type: "object", properties: { text: { type: "string" } } },
      },
      "dialog:help": {
        handler: "on_answer",
        input: { type: "object", properties: { choice: { type: "string" } } },
      },
    },
  },
  source:
    'function on_inspect(ctx){ctx.target("inspect","Choose someone or something nearby.",{kinds:["object","player"],range:12});} function on_selected(ctx,p){var target=ctx.entities.inspect(p.target);ctx.tell(target?"Selected: "+(target.name||target.id):"That target has left.");}' +
    'function on_entered(ctx,p){ctx.tell("Welcome, "+p.name+". Ask me about this place.");} function on_greet(ctx){ctx.say("The guide waves hello.");} function on_location(ctx){ctx.tell("You are in the common gathering space.");} function on_directions(ctx){ctx.tell("Follow the named exits to explore connected rooms.");} function on_housing(ctx){ctx.tell("Find an available authored doorway to make your home.");} function on_news(ctx){var n=ctx.state.get("news")||0;var stories=["New neighbors are arriving.","Builders are creating new places.","Every doorway has a story."];ctx.tell(stories[n%stories.length]);ctx.state.set("news",n+1);}' +
    'function on_introduce(ctx){ctx.prompt("introduction","What should I call you?",60);} function on_introduction(ctx,p){ctx.player.set("nickname",p.text);ctx.tell("Welcome, "+p.text);}' +
    'function on_start(ctx){ctx.subscribe("near",{frame:"self",box:{center:[0,0,0],size:[4,4]},include:["player"]});} function on_arrive(ctx,p){ctx.state.set("arrivals",(ctx.state.get("arrivals")||0)+1);} function on_talk(ctx){var visits=(ctx.player.get("visits")||0)+1;ctx.player.set("visits",visits);ctx.tell("Visit "+visits);ctx.dialog("help","What would you like?",["Directions","Goodbye"]);} function on_answer(ctx,p){ctx.say(p.choice==="Directions"?"The switch opens the door.":"See you soon.");}',
};
