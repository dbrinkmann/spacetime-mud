import type { Package } from "./contracts";
export const guidePackage: Package = {
  hash: "guide",
  manifest: {
    id: "guide",
    version: "1.0.0",
    apiVersion: 2,
    stateVersion: 1,
    config: { type: "object", properties: {} },
    state: { type: "object", properties: { arrivals: { type: "number" } } },
    initialState: {},
    writes: [],
    handlers: {
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
    'function on_introduce(ctx){ctx.prompt("introduction","What should I call you?",60);} function on_introduction(ctx,p){ctx.player.set("nickname",p.text);ctx.tell("Welcome, "+p.text);}' +
    'function on_start(ctx){ctx.subscribe("near",{frame:"self",box:{center:[0,0,0],size:[4,4]},include:["player"]});} function on_arrive(ctx,p){ctx.state.set("arrivals",(ctx.state.get("arrivals")||0)+1);} function on_talk(ctx){var visits=(ctx.player.get("visits")||0)+1;ctx.player.set("visits",visits);ctx.tell("Visit "+visits);ctx.dialog("help","What would you like?",["Directions","Goodbye"]);} function on_answer(ctx,p){ctx.say(p.choice==="Directions"?"The switch opens the door.":"See you soon.");}',
};
