export type WorldMap = {
  rooms: Array<{
    property: string;
    room: string;
    name: string;
    common: boolean;
  }>;
  exits: Array<{
    from: { property: string; room: string };
    to: { property: string; room: string };
  }>;
};
export function RoomMap({
  world,
  property,
  room,
}: {
  world: WorldMap;
  property: string;
  room: string;
}) {
  const rooms = world.rooms.filter((r) => r.property === property),
    columns = Math.min(3, rooms.length || 1),
    rows = Math.ceil(rooms.length / columns);
  const point = (p: { property: string; room: string }) => {
    const i = rooms.findIndex(
      (r) => r.property === p.property && r.room === p.room,
    );
    return i < 0
      ? undefined
      : { x: 55 + (i % columns) * 100, y: 30 + Math.floor(i / columns) * 65 };
  };
  return (
    <section aria-label="Room map">
      <h2>{rooms[0]?.common ? "Common map" : "Home map"}</h2>
      <svg
        viewBox={`0 0 ${columns * 100 + 10} ${Math.max(1, rows) * 65}`}
        role="img"
        aria-label="Connected rooms"
      >
        {world.exits.map((e, i) => {
          const a = point(e.from),
            b = point(e.to);
          return a && b ? (
            <line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="#637c90"
            />
          ) : null;
        })}
        {rooms.map((r) => {
          const p = point(r)!;
          return (
            <g key={r.room}>
              <circle
                cx={p.x}
                cy={p.y}
                r={r.room === room ? 9 : 6}
                fill={r.room === room ? "#edb55c" : "#91a4b3"}
              />
              <text
                x={p.x}
                y={p.y + 23}
                textAnchor="middle"
                fontSize="10"
                fill="#d6e3eb"
              >
                <title>{r.name}</title>
                {r.name.length > 16 ? r.name.slice(0, 14) + "…" : r.name}
              </text>
            </g>
          );
        })}
      </svg>
    </section>
  );
}
