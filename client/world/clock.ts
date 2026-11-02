let anchor = Date.now(),
  tick = performance.now();
export function serverNow() {
  return anchor + performance.now() - tick;
}
export function syncClock(micros: bigint, sent: number) {
  const received = performance.now();
  anchor = Number(micros / 1000n) + (received - sent) / 2;
  tick = received;
}
