import type { Package } from "../../shared/runtime/contracts";
import type { DataSchema } from "../../shared/runtime/values";
export function movingPackage(): Package {
  const string: DataSchema = { type: "string" },
    number: DataSchema = { type: "number" },
    nil: DataSchema = { type: "null" };
  const spatial: DataSchema = {
    type: "object",
    properties: {
      view: string,
      entity: { type: "object", properties: { id: string, kind: string } },
    },
  };
  return {
    hash: "mover",
    manifest: {
      id: "mover",
      version: "1.0.0",
      apiVersion: 2,
      stateVersion: 1,
      config: {
        type: "object",
        properties: { start: number, end: number, y: number, z: number },
      },
      state: {
        type: "object",
        properties: { running: { type: "boolean" }, cycles: number },
      },
      initialState: { running: false, cycles: 0 },
      writes: ["transform", "visibility"],
      handlers: {
        "lifecycle:activated": { handler: "on_start", input: nil },
        "timer:spawn": { handler: "on_spawn", input: nil },
        "timer:check": { handler: "on_check", input: nil },
        "spatial:enter": { handler: "on_enter", input: spatial },
        "spatial:exit": { handler: "on_exit", input: spatial },
        "operation:completed": {
          handler: "on_end",
          input: {
            type: "object",
            properties: { id: string, resource: string, outcome: string },
          },
        },
      },
    },
    source: `
function on_start(ctx){
 var x=ctx.config.get("start"),y=ctx.config.get("y"),z=ctx.config.get("z");
 ctx.operations.follow("transform",[[x,y,z],[ctx.config.get("end"),y,z]],5,"once");ctx.operations.pause("transform");ctx.components.set("visibility",false);
 ctx.subscribe("ahead",{frame:"self",box:{center:[0,0,2.5],size:[1.5,5],height:2},include:["tag:mover"],hysteresis:0.3});ctx.timers.after(.25,"spawn",null);
}
function on_spawn(ctx){
 var center=[ctx.config.get("start"),ctx.config.get("y"),ctx.config.get("z")];
 if(!ctx.reservations.claim("spawn",{center:center,size:[3,2,2]},1)){ctx.timers.after(.5,"spawn",null);return;}
 ctx.operations.restart("transform");ctx.operations.pause("transform");ctx.components.set("visibility",true);ctx.state.set("running",true);ctx.timers.after(.25,"check",null);
}
function on_check(ctx){if(ctx.view("ahead").length===0)ctx.operations.resume("transform");}
function on_enter(ctx){if(ctx.state.get("running"))ctx.operations.pause("transform");}
function on_exit(ctx){if(ctx.state.get("running")&&ctx.view("ahead").length===0)ctx.operations.resume("transform");}
function on_end(ctx){ctx.state.set("running",false);ctx.state.set("cycles",ctx.state.get("cycles")+1);ctx.components.set("visibility",false);ctx.timers.after(.5+ctx.random(),"spawn",null);}
`,
  };
}
