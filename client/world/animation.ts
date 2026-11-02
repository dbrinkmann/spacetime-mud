import { type Part, parts, type Vec3 } from "../../shared/geometry";
export type Animation = "idle" | "walk" | "sit" | "wave" | "talk";
export function poseFor(animation: Animation, time: number) {
  const rotation = Object.fromEntries(
    parts.map((p) => [p, [0, 0, 0]]),
  ) as Record<Part, Vec3>;
  let bob = Math.sin(time * 2) * 0.012;
  rotation.head[1] = Math.sin(time * 0.7) * 0.05;
  if (animation === "walk") {
    const stride = Math.sin(time * 8) * 0.55;
    rotation.leftLeg[0] = stride;
    rotation.rightLeg[0] = -stride;
    rotation.leftArm[0] = -stride * 0.75;
    rotation.rightArm[0] = stride * 0.75;
    bob = Math.abs(Math.sin(time * 8)) * 0.035;
  }
  if (animation === "sit") {
    rotation.leftLeg[0] = -Math.PI / 2;
    rotation.rightLeg[0] = -Math.PI / 2;
    rotation.leftArm[0] = -0.35;
    rotation.rightArm[0] = -0.35;
    bob = 0;
  }
  if (animation === "wave") {
    rotation.leftArm[2] = 2.4 + Math.sin(time * 7) * 0.22;
    rotation.head[2] = -0.08;
  }
  if (animation === "talk") {
    rotation.rightArm[0] = -0.35 - Math.sin(time * 5) * 0.16;
    rotation.head[0] = Math.sin(time * 4) * 0.07;
  }
  return { rotation, bob };
}
