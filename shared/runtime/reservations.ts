import { copyValue, type Value } from "./values";
export type ReservationBox = { center: number[]; size: number[] };
export type Reservation = {
  id: string;
  property: string;
  room: string;
  entity: string;
  slot: string;
  name: string;
  expires: number;
  box: ReservationBox;
};
export function reservationBox(value: Value): ReservationBox {
  const box = copyValue(value) as unknown as ReservationBox;
  if (
    !box ||
    Object.keys(box).some((k) => k !== "center" && k !== "size") ||
    !Array.isArray(box.center) ||
    !Array.isArray(box.size) ||
    box.center.length !== 3 ||
    box.size.length !== 3 ||
    box.center.some((n) => !Number.isFinite(n) || Math.abs(n) > 100) ||
    box.size.some((n) => !Number.isFinite(n) || n <= 0 || n > 100)
  )
    throw Error("Reservation requires room-space center and positive 3D size.");
  return box;
}
export function overlaps(a: ReservationBox, b: ReservationBox) {
  return a.center.every(
    (n, i) => Math.abs(n - b.center[i]) < (a.size[i] + b.size[i]) / 2,
  );
}
