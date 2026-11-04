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
  speed?: number;
  correlation: string;
  depth: number;
  path?: number[][];
  mode?: "once" | "loop" | "pingpong";
};
export function operationProgress(op: Operation, now: number) {
  return Math.min(
    op.mode && op.mode !== "once" ? Infinity : 1,
    Math.max(
      0,
      op.progress +
        (op.paused
          ? 0
          : (Math.max(0, now - op.started) * (op.speed ?? 1)) / op.duration),
    ),
  );
}
export function sampleOperation(op: Operation, now: number): TransformValue {
  const t = operationProgress(op, now);
  if (op.path) {
    let phase =
      op.mode === "loop"
        ? t % 1
        : op.mode === "pingpong"
          ? t % 2 <= 1
            ? t % 2
            : 2 - (t % 2)
          : t;
    const reverse = op.mode === "pingpong" && t % 2 > 1;
    const lengths = op.path
      .slice(1)
      .map((p, i) => Math.hypot(...p.map((v, j) => v - op.path![i][j])));
    let remaining = phase * lengths.reduce((a, b) => a + b, 0);
    for (let i = 0; i < lengths.length; i++) {
      if (remaining <= lengths[i] || i === lengths.length - 1) {
        const a = op.path[i],
          b = op.path[i + 1],
          fraction = lengths[i] ? remaining / lengths[i] : 1;
        return {
          position: a.map((v, j) => v + (b[j] - v) * fraction),
          rotation: [
            op.from.rotation[0],
            (Math.atan2(
              (b[0] - a[0]) * (reverse ? -1 : 1),
              (b[2] - a[2]) * (reverse ? -1 : 1),
            ) *
              180) /
              Math.PI,
            op.from.rotation[2],
          ],
        };
      }
      remaining -= lengths[i];
    }
  }
  return {
    position: op.from.position.map((n, i) => n + (op.to.position[i] - n) * t),
    rotation: op.from.rotation.map((n, i) => n + (op.to.rotation[i] - n) * t),
  };
}
export function operationDeadline(op: Operation) {
  return op.paused || (op.mode && op.mode !== "once")
    ? Infinity
    : op.started + ((1 - op.progress) * op.duration) / (op.speed ?? 1);
}
export function transformValue(value: Value): TransformValue {
  validateComponent("transform", value);
  return copyValue(value) as unknown as TransformValue;
}
