import { validateComponent } from "./components";
import { copyValue, type Value } from "./values";
export type TransformValue = { position: number[]; rotation: number[] };
export type Operation = {
  id: string;
  entity: string;
  slot: string;
  generation: number;
  resource: string;
  from: TransformValue;
  to: TransformValue;
  started: number;
  duration: number;
  progress: number;
  paused: boolean;
  correlation: string;
  depth: number;
};
export function operationProgress(op: Operation, now: number) {
  return Math.min(
    1,
    Math.max(
      0,
      op.progress +
        (op.paused ? 0 : Math.max(0, now - op.started) / op.duration),
    ),
  );
}
export function sampleOperation(op: Operation, now: number): TransformValue {
  const t = operationProgress(op, now);
  return {
    position: op.from.position.map((n, i) => n + (op.to.position[i] - n) * t),
    rotation: op.from.rotation.map((n, i) => n + (op.to.rotation[i] - n) * t),
  };
}
export function operationDeadline(op: Operation) {
  return op.paused ? Infinity : op.started + (1 - op.progress) * op.duration;
}
export function transformValue(value: Value): TransformValue {
  validateComponent("transform", value);
  return copyValue(value) as unknown as TransformValue;
}
