import { MemoryStore } from "../../../shared/runtime/memory-store";
import { WorldRuntime } from "./engine";
import type { Entity, Package } from "../../../shared/runtime/contracts";
import type { Value } from "../../../shared/runtime/values";

/** The production runtime with a virtual clock and transactional snapshot store. */
export class WorldSimulation {
  store = new MemoryStore();
  time = 0;
  readonly entities = new Set<string>();
  private transaction<T>(fn: (runtime: WorldRuntime) => T): T {
    const next = MemoryStore.restore(this.store.export());
    const result = fn(new WorldRuntime(next, this.time));
    this.store = next;
    return result;
  }
  register(pkg: Package) {
    this.transaction((r) => r.register(pkg));
  }
  create(entity: Entity) {
    this.transaction((r) => r.create(entity));
    this.entities.add(entity.id);
  }
  attach(
    entity: string,
    slot: string,
    hash: string,
    config: Record<string, Value>,
  ) {
    return this.transaction((r) => r.attach(entity, slot, hash, config));
  }
  action(entity: string, name: string, payload: Value, player: string) {
    return this.transaction((r) => r.action(entity, name, payload, player));
  }
  advance(seconds: number, maxSteps = 256) {
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 86400)
      throw Error("Invalid virtual-time increment.");
    if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 4096)
      throw Error("Invalid simulation work budget.");
    this.time += seconds;
    let steps = 0,
      progress = true;
    // Round-robin service mirrors bounded production wakes rather than draining
    // one entity's self-messaging loop before any neighbor can run.
    while (progress && steps < maxSteps) {
      progress = false;
      const fired = this.transaction((r) =>
        r.fireDueTimers(Math.min(16, maxSteps - steps)),
      );
      steps += fired;
      progress = fired > 0;
      for (const id of this.entities) {
        if (steps >= maxSteps) break;
        if (this.transaction((r) => r.step(id))) {
          steps++;
          progress = true;
        }
      }
    }
    return {
      time: this.time,
      steps,
      pending: [...this.entities].reduce(
        (n, id) => n + this.store.pending(id).length,
        0,
      ),
    };
  }
  snapshot() {
    return JSON.stringify({
      time: this.time,
      entities: [...this.entities],
      store: this.store.export(),
    });
  }
  static restore(snapshot: string) {
    const data = JSON.parse(snapshot),
      sim = new WorldSimulation();
    sim.time = data.time;
    data.entities.forEach((id: string) => sim.entities.add(id));
    sim.store = MemoryStore.restore(data.store);
    return sim;
  }
}
