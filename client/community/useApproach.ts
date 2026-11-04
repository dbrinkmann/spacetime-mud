import { useEffect, useRef } from "react";
import type { Room, Vec3 } from "../../shared/geometry";
import { sampleMotion } from "../../shared/world";
import type { CommunityCharacter } from "../module_bindings/types";
import { serverNow } from "../world/clock";
export function characterMotion(p: CommunityCharacter) {
  return {
    path: JSON.parse(p.path) as Vec3[],
    started: Number(p.startedAt.microsSinceUnixEpoch / 1000n),
    pose: p.pose,
    seat: p.seat,
    yaw: p.yaw,
  };
}
type Intent = {
  target: Vec3;
  roomId: bigint;
  run: () => Promise<void>;
  armed: boolean;
  requested: number;
};
export function useApproach(
  me: CommunityCharacter | undefined,
  scene: Room | undefined,
  move: (target: Vec3) => Promise<void>,
  error: (message: string) => void,
) {
  const pending = useRef<Intent | undefined>(undefined);
  const current = useRef({ me, scene, move, error });
  current.current = { me, scene, move, error };
  const cancel = () => {
    pending.current = undefined;
  };
  useEffect(() => {
    cancel();
    return cancel;
  }, [me?.roomId, scene]);
  useEffect(() => {
    const timer = setInterval(() => {
      const intent = pending.current;
      if (!intent) return;
      const { me, scene, error } = current.current;
      if (
        !me ||
        !scene ||
        me.roomId !== intent.roomId ||
        !me.controller ||
        me.away
      ) {
        cancel();
        return;
      }
      const motion = characterMotion(me),
        end = motion.path.at(-1)!;
      const matches =
        Math.hypot(end[0] - intent.target[0], end[2] - intent.target[2]) < 0.05;
      if (!matches) {
        if (intent.armed || serverNow() - intent.requested > 3000) cancel();
        return;
      }
      intent.armed = true;
      const sampled = sampleMotion(motion, scene, serverNow());
      if (
        sampled.animation !== "walk" &&
        Math.hypot(
          sampled.position[0] - intent.target[0],
          sampled.position[2] - intent.target[2],
        ) < 0.12
      ) {
        cancel();
        void intent
          .run()
          .catch((e) => error(e instanceof Error ? e.message : String(e)));
      }
    }, 80);
    return () => {
      clearInterval(timer);
      cancel();
    };
  }, []);
  const approach = async (
    target: Vec3 | undefined,
    run: () => Promise<void>,
  ) => {
    cancel();
    const { me, scene, move } = current.current;
    if (!me || !scene) return;
    if (!target) {
      await run();
      return;
    }
    const at = sampleMotion(characterMotion(me), scene, serverNow());
    if (
      at.animation !== "walk" &&
      Math.hypot(at.position[0] - target[0], at.position[2] - target[2]) < 0.12
    ) {
      await run();
      return;
    }
    const intent: Intent = {
      target,
      roomId: me.roomId,
      run,
      armed: false,
      requested: serverNow(),
    };
    pending.current = intent;
    try {
      await move(target);
    } catch (e) {
      if (pending.current === intent) cancel();
      throw e;
    }
  };
  return { approach, cancel };
}
