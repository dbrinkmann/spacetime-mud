# Runtime and world architecture

## Authority and ownership

SpacetimeDB 2.13.0 stores the world and runs transactional TypeScript reducers. Clients send intentions; reducers validate identity, location, permissions, version and action availability. Everyone may create up to five zones. A zone owner can grant/revoke collaborators. Cross-zone links require edit permission on both ends.

Rooms store map coordinates independently from exits. Rooms, players, chat, scripts, discovery, inventory and state are private tables; per-viewer views expose the appropriate data. Players receive previously visited rooms, their current objects and room chat. Builders also see the rooms, drafts and traces they can edit. A bridge inherits the paired player's view only while its grant is active. Hidden exits are filtered on the server until the gate object's personal `discovered` state is true.

Zone names and entrance IDs are intentionally public portal metadata. They do not expose room descriptions, scripts, secrets or inventory. Existing public room tables from the original demo were removed in the authorized reset.

## Objects and scripts

Scripted objects have a type, zone, location, owner, presentation, actions, active version and persistent state. Rooms/exits remain efficient structural tables; behavior objects can represent scenery, items, containers, characters, gates or room behaviors. Object definitions and attachments are immutable versions. Shared state and per-player state use separate namespaces. Inventory rewards are namespaced by issuing object, preventing one builder from forging another object's key.

The interpreter is [Neil Fraser's JS-Interpreter](https://github.com/NeilFraser/JS-Interpreter), packaged as `js-interpreter@6.0.2`. It was tested inside actual TypeScript reducers; an external script server is unnecessary. It executes ordinary ES5 syntax, including functions, loops, conditionals, arrays and objects. Use `var` and `function`, not arrow functions or `let`/`const`.

Only primitive values cross the game API boundary. Native libraries, eval, Function, constructors, regex, getters/setters, prototype access, ambient clocks, randomness, filesystem and network access are unavailable. Implicit object-to-primitive coercion is rejected because it could expand large nested structures outside interpreter stepping. No code is evaluated by host `eval` or `Function`.

Each handler has limits: 16,000 source characters; bounded AST size/depth; 20,000 interpreter steps; 128 stack frames; 1,024 object allocations; 10,000 property writes; 256 array slots; 4,096-character strings; 64 game API calls. Event chains share a limit of 16 events and depth five. These are work/allocation limits, not a separately allocated process heap or an OS sandbox. Tests exercise loops, recursion, string growth, native aliases, dynamic code and prototype access. A broader adversarial security review remains appropriate before an unrestricted high-volume launch.

The upstream bundle's optional Node `vm` import is replaced by a rejecting stub. Ambient Math/Date libraries are not initialized. The adapter seals native and polyfilled functions and wraps interpreter stepping and object/property allocation. These are host integration controls around an existing interpreter, not a new scripting language.

## Script API

Handlers are named `on_<actionId>`, `on_enter`, `on_leave`, or `on_<timerName>`. An object may publish up to eight visible actions. Game scripts do not sleep or require an online agent.

| API | Behavior |
|---|---|
| `ctx.get(key)`, `ctx.set(key, value)` | Shared object state; scalar values only |
| `ctx.personal(key)`, `ctx.remember(key, value)` | State scoped to the event's player |
| `ctx.id()`, `ctx.actor()`, `ctx.room()` | String IDs for object, acting player and room |
| `ctx.playerName()`, `ctx.payload()`, `ctx.now()` | Player name, timer payload, server timestamp in seconds |
| `ctx.say(text)` | Room message |
| `ctx.getOther(id,key)`, `ctx.setOther(id,key,value)` | Shared state of published objects in the same zone |
| `ctx.signal(id,event)` | Invoke another same-zone object's handler within the event budget |
| `ctx.schedule(name,seconds,payload,repeatSeconds)` | Named persistent timer; replaces the previous timer of that name |
| `ctx.cancel(name)` | Cancel a named timer |
| `ctx.give(name,count)`, `ctx.has(name)`, `ctx.take(name,count)` | Inventory scoped to this issuing object |
| `ctx.hasFrom(id,name)`, `ctx.takeFrom(id,name,count)` | Check/consume another same-zone object's item, e.g. a key |
| `ctx.moveObject(id,roomId)` | Move a published same-zone object |
| `ctx.movePlayer(roomId)` | Move the acting player, who must be present, within this zone |

State and event names use letters, digits and underscores, starting with a letter. IDs passed to the API must be decimal strings. Each object has up to 64 keys per shared/personal scope. A player has up to 100 inventory stacks. Zones have 100 rooms and 100 objects; objects retain up to 50 definition versions.

A gate blocks an exit unless its shared `open` state is true. A hidden gate reveals its passage when its personal `discovered` state is true. Builders can configure existing passages, and add bidirectional connections to existing rooms with permission on both ends.

## Execution and failure semantics

An interaction is validated, then its entire script/event chain builds an effect plan against a shared state, inventory, location and timer overlay. Only after all handlers finish does the reducer apply the effects. The enclosing database transaction commits state, messages, movement, rewards and timers together. Script errors discard the plan. Timer errors are recorded in builder traces without applying partial effects.

Preview uses the same overlay and validation but discards effects. It runs one selected declared handler against current state; it does not advance time or prove all future states are valid. A tested draft may be published, and every exposed action must have a named function declaration. Runtime limits still apply after publication.

Client request IDs deduplicate successful interactions in a bounded recent history. Location, action, permission and state validation remain authoritative. Return to Nexus intentionally bypasses `on_leave` as an escape from hostile/broken content. Scripted teleports do not recursively dispatch room enter/leave events; ordinary passage movement does.

## Timers

Timers are private scheduled-table rows bound to the exported scheduled reducer. Only the database scheduler can invoke that reducer. Rows pin object, script version, event, actor, payload, due time and optional repeat interval. The scheduled reducer checks that the row and published version are still current.

One-shot timers are removed by the scheduler after invocation. Repeats enqueue a new one-shot at the current server time plus the interval; missed ticks do not replay in a burst. Delays are best effort, not frame-precise. Minimum interval is one second; maximum delay/interval is seven days; maximum outstanding timers are eight per object and 64 per zone. Named replacement and cancellation work inside the same transaction as the interaction.

Deletion cancels timers. Publication and rollback deliberately cancel all previous timers for that object, while preserving inventory and state. A failed timer is logged and stops repeating. Timers persist across builder disconnect and server restart. The release verification includes a real local server process restart with a pending timer.

## Agent authoring

The player's machine runs the consented outbound bridge. Claude Code receives structured context and an action schema, with computer tools and customization disabled. It can create a room, propose an object definition/revision, or respond. Object proposals create private drafts; publication is a player action in the workshop. Grant revocation withdraws private source/job views and rejects later completions. No browser asks an unknown remote service to control the player's computer.

This first release intentionally uses one structured proposal per request. Broad autonomous multi-object planning, package inheritance, combat, economies, drag-and-drop atlas editing and a full debugging IDE remain future work. The shipped builder has direct room layout/link controls, templates, source editing, preview, version activation and traces.
