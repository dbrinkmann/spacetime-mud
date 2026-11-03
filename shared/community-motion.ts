import { type Motion, walkSpeed } from "./world";
// A closed, server-validated walk followed by a pause. Empty homes need no ticks.
// Both renderer and authoritative takeover resolve the same phase from time.
export function routineMotion(motion: Motion, now: number): Motion {
  const distance = motion.path.slice(1).reduce((sum, p, i) => {
    const a = motion.path[i];
    return sum + Math.hypot(p[0] - a[0], p[2] - a[2]);
  }, 0);
  const period = (distance / walkSpeed) * 1000 + 10000;
  const elapsed = Math.max(0, now - motion.started);
  return { ...motion, started: now - (elapsed % period) };
}
