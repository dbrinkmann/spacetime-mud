import {
  BUDGETS,
  validateManifest,
  type Entity,
  type Event,
  type Package,
  type Slot,
  type ExecutionResult,
} from "../../../shared/runtime/contracts";
import {
  assertSchema,
  copyValue,
  identifier,
  type RecordValue,
  type Value,
} from "../../../shared/runtime/values";
import type {
  RuntimeStore,
  Delivery,
  Timer,
} from "../../../shared/runtime/store";
import { validateComponent } from "../../../shared/runtime/components";
import { executeBehavior, migrateBehavior } from "./execution";
import { validateSource } from "./sandbox";
import {
  admitInvocation,
  settleInvocation,
} from "../../../shared/runtime/budgets";
import { canonical } from "../../../shared/runtime/digest";
import { prepareOperations } from "./operations";
import {
  sampleOperation,
  operationDeadline,
} from "../../../shared/runtime/operations";

/** Called inside a database transaction (or a simulation step). No ambient clock or I/O. */
export class WorldRuntime {
  constructor(
    readonly store: RuntimeStore,
    readonly now: number,
  ) {
    if (!Number.isFinite(now)) throw Error("Invalid runtime clock.");
  }
  register(pkg: Package) {
    const manifest = validateManifest(pkg.manifest);
    if (pkg.source.length > BUDGETS.source)
      throw Error("Source budget exceeded.");
    assertSchema(manifest.state, manifest.initialState);
    validateSource(pkg.source, [
      ...Object.values(manifest.handlers).map((h) => h.handler),
      ...Object.values(manifest.migrations ?? {}),
    ]);
    this.store.putPackage({ ...pkg, manifest });
  }
  create(entity: Entity) {
    identifier(entity.id);
    if (this.store.entity(entity.id)) throw Error("Entity already exists.");
    for (const [k, v] of Object.entries(entity.components))
      validateComponent(k, v);
    this.store.putEntity({
      ...entity,
      components: copyValue(entity.components) as RecordValue,
      publicState: copyValue(entity.publicState) as RecordValue,
      variables: copyValue(entity.variables ?? {}) as RecordValue,
    });
  }
  attach(
    entityId: string,
    slotName: string,
    hash: string,
    config: RecordValue,
  ) {
    const e = this.requiredEntity(entityId),
      pkg = this.store.package(hash);
    if (!pkg) throw Error("Package unavailable.");
    identifier(slotName);
    if (slotName.includes(":"))
      throw Error("Slot names cannot contain colons.");
    const id = `${entityId}:${slotName}`;
    const slots = this.store.slots(entityId);
    if (slots.length >= BUDGETS.slots || this.store.slot(id))
      throw Error("Slot limit or duplicate slot.");
    assertSchema(pkg.manifest.config, copyValue(config));
    for (const [key, schema] of Object.entries(pkg.manifest.variables ?? {}))
      if (Object.prototype.hasOwnProperty.call(e.variables ?? {}, key))
        assertSchema(schema, e.variables![key]);
    for (const other of slots) {
      const installed = this.store.package(other.packageHash)!;
      if (
        installed.manifest.writes.some((r) => pkg.manifest.writes.includes(r))
      )
        throw Error("Exclusive resource already owned.");
    }
    for (const resource of pkg.manifest.writes)
      if (
        !resource.startsWith("public.") &&
        !resource.startsWith("variables.") &&
        !Object.prototype.hasOwnProperty.call(e.components, resource)
      )
        throw Error("Required component unavailable.");
    if (this.store.pending(entityId).length + 3 > BUDGETS.inbox)
      throw Error("Inbox full.");
    this.store.putSlot({
      id,
      entity: entityId,
      packageHash: hash,
      generation: 1,
      enabled: false,
      config: copyValue(config) as RecordValue,
      state: copyValue(pkg.manifest.initialState) as RecordValue,
      lastError: "",
      created: false,
      bound: false,
    });
    for (const name of ["created", "bound", "activated"])
      this.enqueue(
        entityId,
        "lifecycle",
        name,
        null,
        { kind: "engine", id: "lifecycle" },
        id,
        1,
      );
    return id;
  }
  private requiredSlot(id: string) {
    const slot = this.store.slot(id);
    if (!slot) throw Error("Slot unavailable.");
    this.requiredEntity(slot.entity);
    return slot;
  }
  private cancelTimers(slot: Slot) {
    for (const timer of this.store.timers(slot.id))
      this.store.removeTimer(timer.id);
    const entity = this.store.entity(slot.entity);
    if (entity) {
      let changed = false;
      for (const op of this.store
        .operations(slot.entity)
        .filter((o) => o.slot === slot.id)) {
        entity.components[op.resource] = sampleOperation(op, this.now);
        this.store.removeOperation(op.id);
        changed = true;
      }
      if (changed) {
        entity.revision++;
        this.store.putEntity(entity);
      }
    }
  }
  suspend(id: string) {
    const slot = this.requiredSlot(id);
    // Generation invalidation happens before the notification. Cleanup is unconditional.
    this.store.putSlot({
      ...slot,
      enabled: false,
      generation: slot.generation + 1,
      lastError: "",
    });
    this.cancelTimers(slot);
    if (this.store.pending(slot.entity).length < BUDGETS.inbox)
      this.enqueue(
        slot.entity,
        "lifecycle",
        "deactivated",
        null,
        { kind: "engine", id: "lifecycle" },
        id,
        slot.generation + 1,
      );
  }
  resume(id: string) {
    const slot = this.requiredSlot(id);
    if (slot.enabled) return;
    const names = [
      ...(!slot.created ? ["created"] : []),
      ...(!slot.bound ? ["bound"] : []),
      "activated",
    ];
    if (this.store.pending(slot.entity).length + names.length > BUDGETS.inbox)
      throw Error("Inbox full.");
    this.store.putSlot({
      ...slot,
      enabled: false,
      generation: slot.generation + 1,
      lastError: "",
    });
    this.cancelTimers(slot);
    for (const name of names)
      this.enqueue(
        slot.entity,
        "lifecycle",
        name,
        null,
        { kind: "engine", id: "lifecycle" },
        id,
        slot.generation + 1,
      );
  }
  upgrade(id: string, hash: string, config: RecordValue) {
    const slot = this.requiredSlot(id),
      old = this.store.package(slot.packageHash)!,
      pkg = this.store.package(hash);
    if (!pkg || pkg.manifest.id !== old.manifest.id)
      throw Error("Upgrade requires the same package identity.");
    if (!slot.created || !slot.bound)
      throw Error("Finish initialization before upgrading.");
    assertSchema(pkg.manifest.config, copyValue(config));
    const entity = this.requiredEntity(slot.entity);
    for (const other of this.store
      .slots(slot.entity)
      .filter((s) => s.id !== id))
      if (
        this.store
          .package(other.packageHash)!
          .manifest.writes.some((r) => pkg.manifest.writes.includes(r))
      )
        throw Error("Exclusive resource already owned.");
    for (const resource of pkg.manifest.writes)
      if (
        !resource.startsWith("public.") &&
        !resource.startsWith("variables.") &&
        !Object.prototype.hasOwnProperty.call(entity.components, resource)
      )
        throw Error("Required component unavailable.");
    if (this.store.pending(slot.entity).length + 2 > BUDGETS.inbox)
      throw Error("Inbox full.");
    const state = migrateBehavior(pkg, slot, old.manifest.stateVersion, config);
    for (const [key, schema] of Object.entries(pkg.manifest.variables ?? {}))
      if (Object.prototype.hasOwnProperty.call(entity.variables ?? {}, key))
        assertSchema(schema, entity.variables![key]);
    this.store.putSlot({
      ...slot,
      packageHash: hash,
      generation: slot.generation + 1,
      enabled: false,
      lastError: "",
      state,
      config: copyValue(config) as RecordValue,
    });
    this.cancelTimers(slot);
    this.enqueue(
      slot.entity,
      "lifecycle",
      "upgraded",
      null,
      { kind: "engine", id: "lifecycle" },
      id,
      slot.generation + 1,
    );
    if (slot.enabled)
      this.enqueue(
        slot.entity,
        "lifecycle",
        "activated",
        null,
        { kind: "engine", id: "lifecycle" },
        id,
        slot.generation + 1,
      );
  }
  requiredEntity(id: string) {
    const e = this.store.entity(id);
    if (!e || !e.enabled) throw Error("Entity unavailable.");
    return e;
  }
  action(entityId: string, name: string, payload: Value, player: string) {
    this.requiredEntity(entityId);
    identifier(name);
    const value = copyValue(payload);
    const slots = this.store
      .slots(entityId)
      .filter(
        (s) =>
          s.enabled &&
          this.store.package(s.packageHash)?.manifest.handlers[
            `action:${name}`
          ],
      );
    if (!slots.length) throw Error("Action unavailable.");
    for (const slot of slots)
      assertSchema(
        this.store.package(slot.packageHash)!.manifest.handlers[
          `action:${name}`
        ].input,
        value,
      );
    return this.enqueue(entityId, "action", name, value, {
      kind: "player",
      id: player,
    });
  }
  inspect(caller: Entity, id: string): Value {
    const e = this.store.entity(id);
    if (
      !e ||
      !e.enabled ||
      e.community !== caller.community ||
      e.property !== caller.property
    )
      return null;
    for (const op of this.store.operations(id))
      e.components[op.resource] = sampleOperation(op, this.now);
    return copyValue({
      id: e.id,
      room: e.room,
      components: e.components,
      publicState: e.publicState,
    });
  }
  enqueue(
    entity: string,
    type: Event["type"],
    name: string,
    payload: Value,
    source: Event["source"],
    slot?: string,
    slotGeneration?: number,
    correlation?: string,
    depth = 0,
    receipt?: string,
  ) {
    const e = this.requiredEntity(entity);
    identifier(name);
    if (depth > BUDGETS.chain) throw Error("Causal chain budget exceeded.");
    if (this.store.pending(entity).length >= BUDGETS.inbox)
      throw Error("Inbox full.");
    const sequence = this.store.nextSequence(),
      id = receipt ?? `event:${sequence}`;
    const admitted =
      type === "action" || type === "message"
        ? this.store
            .slots(entity)
            .filter(
              (s) =>
                s.enabled &&
                (!slot || s.id === slot) &&
                !!this.store.package(s.packageHash)?.manifest.handlers[
                  `${type}:${name}`
                ],
            )
            .map((s) => ({ id: s.id, generation: s.generation }))
        : undefined;
    this.store.putDelivery({
      event: {
        id,
        entity,
        generation: e.generation,
        sequence,
        type,
        name,
        payload: copyValue(payload),
        source,
        occurredAt: this.now,
        correlation: correlation ?? id,
        depth,
        slot,
        slotGeneration,
      },
      admitted,
      recipients: [],
      cursor: 0,
      started: false,
    });
    return id;
  }
  private recipients(e: Event) {
    return this.store
      .slots(e.entity)
      .filter(
        (s) =>
          (!e.slot || e.slot === s.id) &&
          (e.type === "lifecycle" || s.enabled) &&
          (!e.slotGeneration || s.generation === e.slotGeneration) &&
          (e.type === "lifecycle" ||
            !!this.store.package(s.packageHash)?.manifest.handlers[
              `${e.type}:${e.name}`
            ]),
      );
  }
  private validateResult(
    entity: Entity,
    slot: Slot,
    event: Event,
    result: ExecutionResult,
  ) {
    const counts = new Map<string, number>(),
      timers = new Map(this.store.timers(slot.id).map((t) => [t.name, t]));
    for (const effect of result.effects) {
      if (effect.type === "message") {
        const target = this.requiredEntity(effect.target);
        if (
          target.community !== entity.community ||
          target.property !== entity.property
        )
          throw Error("Message permission denied.");
        if (event.depth >= BUDGETS.chain)
          throw Error("Causal chain budget exceeded.");
        const receivers = this.store
          .slots(target.id)
          .filter(
            (s) =>
              s.enabled &&
              (!effect.slot || s.id === effect.slot) &&
              this.store.package(s.packageHash)?.manifest.handlers[
                `message:${effect.name}`
              ],
          );
        if (!receivers.length) throw Error("Message not accepted.");
        for (const receiver of receivers)
          assertSchema(
            this.store.package(receiver.packageHash)!.manifest.handlers[
              `message:${effect.name}`
            ].input,
            effect.payload,
          );
        const count = (counts.get(target.id) ?? 0) + 1;
        counts.set(target.id, count);
        if (this.store.pending(target.id).length + count > BUDGETS.inbox)
          throw Error("Destination inbox full.");
      } else if (effect.type === "component")
        validateComponent(effect.key, effect.value);
      else if (effect.type === "timer") {
        if (effect.delay === null) timers.delete(effect.name);
        else
          timers.set(effect.name, {
            id: `timer:${slot.id.length}:${slot.id}:${effect.name}`,
            entity: entity.id,
            slot: slot.id,
            generation: slot.generation,
            due: this.now + effect.delay,
            name: effect.name,
            payload: effect.payload,
            correlation: event.correlation,
            depth: event.depth,
          });
      }
    }
    if (timers.size > BUDGETS.timers) throw Error("Timer budget exceeded.");
    const operations = prepareOperations(
      entity,
      slot,
      event,
      result.effects,
      this.store.operations(entity.id),
      this.now,
    );
    const variables = copyValue(entity.variables ?? {}) as RecordValue,
      changed = new Set<string>();
    for (const effect of result.effects)
      if (effect.type === "variable") {
        changed.add(effect.key);
        if (effect.deleted) delete variables[effect.key];
        else variables[effect.key] = effect.value;
      }
    copyValue(variables);
    for (const key of changed)
      if (Object.prototype.hasOwnProperty.call(variables, key))
        assertSchema(
          this.store.package(slot.packageHash)!.manifest.variables![key],
          variables[key],
        );
    const variableChanges = [...changed].filter(
      (key) =>
        canonical(entity.variables?.[key] ?? null) !==
          canonical(variables[key] ?? null) ||
        Object.prototype.hasOwnProperty.call(entity.variables ?? {}, key) !==
          Object.prototype.hasOwnProperty.call(variables, key),
    );
    if (
      operations.notices.length + variableChanges.length &&
      (event.depth >= BUDGETS.chain ||
        this.store.pending(entity.id).length +
          (counts.get(entity.id) ?? 0) +
          operations.notices.length +
          variableChanges.length >
          BUDGETS.inbox)
    )
      throw Error("Operation event budget exceeded.");
    const publicState = { ...entity.publicState };
    for (const effect of result.effects)
      if (effect.type === "public") publicState[effect.key] = effect.value;
    copyValue(publicState);
    return { timers, operations, variables, variableChanges };
  }
  /** One recipient per invocation; later events cannot overtake the current dispatch. */
  step(entityId: string): boolean {
    const delivery = this.store.pending(entityId)[0];
    if (!delivery) return false;
    if ((delivery.notBefore ?? 0) > this.now) return false;
    const event = delivery.event,
      entity = this.store.entity(entityId);
    if (!entity || !entity.enabled || entity.generation !== event.generation) {
      this.store.removeDelivery(event.id);
      return true;
    }
    if (!delivery.started) {
      delivery.recipients =
        delivery.admitted ??
        this.recipients(event).map((s) => ({
          id: s.id,
          generation: s.generation,
        }));
      delivery.started = true;
    }
    const recipient = delivery.recipients[delivery.cursor];
    if (!recipient) {
      this.store.removeDelivery(event.id);
      return true;
    }
    const receiptId = `${event.id}:${recipient.id}`;
    if (this.store.receipt(receiptId)) {
      this.advance(delivery);
      return true;
    }
    const slot = this.store.slot(recipient.id);
    if (
      !slot ||
      slot.generation !== recipient.generation ||
      slot.lastError ||
      (!slot.enabled && event.type !== "lifecycle")
    ) {
      this.store.putReceipt({
        id: receiptId,
        event: event.id,
        slot: recipient.id,
        outcome: "stale",
        error: "Slot unavailable or generation changed.",
      });
      this.advance(delivery);
      return true;
    }
    const pkg = this.store.package(slot.packageHash)!;
    if (!this.store.canRun(slot, entity)) {
      this.store.putSlot({
        ...slot,
        enabled: false,
        lastError: "Runtime grant revoked.",
      });
      this.cancelTimers(slot);
      this.store.putReceipt({
        id: receiptId,
        event: event.id,
        slot: slot.id,
        outcome: "rejected",
        error: "Runtime grant revoked.",
      });
      this.advance(delivery);
      return true;
    }
    // Authorization is delivery admission, not a receiver script failure. A revoked
    // sender must never be able to suspend an otherwise healthy recipient.
    if (event.type === "message") {
      const senderSlot =
        event.source.kind === "behavior"
          ? this.store.slot(event.source.id)
          : undefined;
      const sender = senderSlot
        ? this.store.entity(senderSlot.entity)
        : undefined;
      if (
        !senderSlot?.enabled ||
        senderSlot.generation !== event.source.generation ||
        !sender?.enabled ||
        !this.store.canRun(senderSlot, sender) ||
        sender.community !== entity.community ||
        sender.property !== entity.property
      ) {
        this.store.putReceipt({
          id: receiptId,
          event: event.id,
          slot: slot.id,
          outcome: "rejected",
          error: "Sender authority revoked.",
        });
        this.advance(delivery);
        return true;
      }
    }
    const retryAt = admitInvocation(this.store, entity, slot, this.now);
    if (retryAt !== null) {
      delivery.notBefore = retryAt;
      this.store.putDelivery(delivery);
      return false;
    }
    delete delivery.notBefore;
    let result: ExecutionResult,
      prepared: ReturnType<WorldRuntime["validateResult"]>;
    try {
      result = pkg.manifest.handlers[`${event.type}:${event.name}`]
        ? executeBehavior(
            pkg,
            slot,
            { ...entity, components: this.sampledComponents(entity) },
            event,
            this.now,
            (id) => this.inspect(entity, id),
          )
        : {
            state: slot.state,
            effects: [],
            stats: { steps: 0, calls: 0, allocations: 0 },
          };
      prepared = this.validateResult(entity, slot, event, result);
    } catch (error) {
      const message = String(error).slice(0, 1000);
      this.store.putSlot({ ...slot, enabled: false, lastError: message });
      this.cancelTimers(slot);
      this.store.putReceipt({
        id: receiptId,
        event: event.id,
        slot: slot.id,
        outcome: "failed",
        error: message,
      });
      this.advance(delivery);
      return true;
    }
    // All expected user errors have been validated before mutations. Database failures
    // must escape to roll back the host transaction, never be caught as script faults.
    settleInvocation(this.store, entity, slot, this.now, result.stats.steps);
    this.store.putSlot({
      ...slot,
      state: result.state,
      enabled:
        event.type === "lifecycle" && event.name === "activated"
          ? true
          : slot.enabled,
      lastError: "",
      created:
        slot.created ||
        (event.type === "lifecycle" && event.name === "created"),
      bound:
        slot.bound || (event.type === "lifecycle" && event.name === "bound"),
    });
    const { timers, operations, variables, variableChanges } = prepared;
    entity.components = operations.components;
    entity.variables = variables;
    for (const key of variableChanges)
      this.enqueue(
        entity.id,
        "variable",
        key,
        { key, exists: Object.prototype.hasOwnProperty.call(variables, key) },
        { kind: "engine", id: "variables" },
        undefined,
        undefined,
        event.correlation,
        event.depth + 1,
      );
    for (const old of this.store.operations(entity.id))
      if (!operations.operations.some((o) => o.id === old.id))
        this.store.removeOperation(old.id);
    for (const op of operations.operations) this.store.putOperation(op);
    for (const notice of operations.notices)
      this.enqueue(
        entity.id,
        "operation",
        notice.name,
        notice.payload,
        { kind: "engine", id: "operation" },
        slot.id,
        slot.generation,
        event.correlation,
        event.depth + 1,
      );
    for (const effect of result.effects) {
      if (effect.type === "public")
        entity.publicState[effect.key] = effect.value;
      if (effect.type === "message")
        this.enqueue(
          effect.target,
          "message",
          effect.name,
          effect.payload,
          { kind: "behavior", id: slot.id, generation: slot.generation },
          effect.slot,
          undefined,
          event.correlation,
          event.depth + 1,
          effect.receipt,
        );
    }
    if (
      result.effects.some(
        (e) =>
          e.type === "public" ||
          e.type === "component" ||
          e.type === "operation" ||
          e.type === "variable",
      )
    ) {
      entity.revision++;
      this.store.putEntity(entity);
    }
    for (const timer of this.store.timers(slot.id))
      if (!timers.has(timer.name)) this.store.removeTimer(timer.id);
    for (const timer of timers.values()) this.store.putTimer(timer);
    this.store.putReceipt({
      id: receiptId,
      event: event.id,
      slot: slot.id,
      outcome: "handled",
      error: "",
      trace: {
        packageHash: slot.packageHash,
        eventType: event.type,
        name: event.name,
        source: event.source.id,
        occurredAt: event.occurredAt,
        handledAt: this.now,
        ...result.stats,
        effects: result.effects.map((e) => e.type),
      },
    });
    this.advance(delivery);
    return true;
  }
  private advance(d: Delivery) {
    d.cursor++;
    if (d.cursor >= d.recipients.length) this.store.removeDelivery(d.event.id);
    else this.store.putDelivery(d);
  }
  drain(entity: string, limit: number = BUDGETS.dispatchBatch) {
    let n = 0;
    while (n < limit && this.step(entity)) n++;
    return n;
  }
  fireDueTimers(limit: number = BUDGETS.dispatchBatch) {
    let n = 0;
    for (const timer of this.store.dueTimers(this.now, limit)) {
      const slot = this.store.slot(timer.slot),
        entity = this.store.entity(timer.entity);
      if (
        slot?.enabled &&
        entity?.enabled &&
        slot.generation === timer.generation
      ) {
        if (this.store.pending(entity.id).length >= BUDGETS.inbox) continue;
        this.enqueue(
          entity.id,
          "timer",
          timer.name,
          timer.payload,
          { kind: "engine", id: "timer" },
          slot.id,
          slot.generation,
          timer.correlation,
          timer.depth,
        );
      }
      this.store.removeTimer(timer.id);
      n++;
    }
    return n;
  }
  finishOperation(id: string, entityId: string) {
    const op = this.store.operations(entityId).find((o) => o.id === id);
    if (!op || operationDeadline(op) > this.now) return false;
    const entity = this.store.entity(entityId),
      slot = this.store.slot(op.slot);
    if (
      !entity?.enabled ||
      !slot?.enabled ||
      slot.generation !== op.generation
    ) {
      this.store.removeOperation(id);
      return true;
    }
    if (this.store.pending(entityId).length >= BUDGETS.inbox) return false;
    entity.components[op.resource] = sampleOperation(op, this.now);
    entity.revision++;
    this.store.putEntity(entity);
    this.store.removeOperation(id);
    this.enqueue(
      entityId,
      "operation",
      "completed",
      { id, resource: op.resource, outcome: "completed" },
      { kind: "engine", id: "operation" },
      slot.id,
      slot.generation,
      op.correlation,
      op.depth,
    );
    return true;
  }
  finishDueOperations(limit: number = BUDGETS.dispatchBatch) {
    let n = 0;
    for (const op of this.store.dueOperations(this.now, limit))
      if (this.finishOperation(op.id, op.entity)) n++;
    return n;
  }
  private sampledComponents(entity: Entity) {
    const components = copyValue(entity.components) as RecordValue;
    for (const op of this.store.operations(entity.id))
      components[op.resource] = sampleOperation(op, this.now);
    return components;
  }
}
