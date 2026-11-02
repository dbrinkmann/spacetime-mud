import React, { useState } from "react";
import type { Room, GateStatus } from "./module_bindings/types";
const offset: Record<string, number[]> = {
  north: [0, -1],
  south: [0, 1],
  east: [1, 0],
  west: [-1, 0],
  up: [0.4, -0.4],
  down: [-0.4, 0.4],
};
export function WorldMap({
  rooms,
  current,
  gates,
  move,
  disabled,
  expanded = false,
}: {
  rooms: Room[];
  current: Room;
  gates: GateStatus[];
  move: (direction: string) => void;
  disabled: boolean;
  expanded?: boolean;
}) {
  const [level, setLevel] = useState<number | null>(null);
  const floor = level ?? current.floor;
  const visible = rooms.filter(
    (r) => r.zoneId === current.zoneId && r.floor === floor,
  );
  const xs = visible.map((r) => r.x),
    ys = visible.map((r) => r.y),
    minX = Math.min(current.x, ...xs) - 1,
    maxX = Math.max(current.x, ...xs) + 1,
    minY = Math.min(current.y, ...ys) - 1,
    maxY = Math.max(current.y, ...ys) + 1;
  const width = Math.max(4, maxX - minX) * 72,
    height = Math.max(3, maxY - minY) * 72;
  const pos = (r: Room) => [(r.x - minX) * 72 + 36, (r.y - minY) * 72 + 36];
  const floors = [
    ...new Set(
      rooms.filter((r) => r.zoneId === current.zoneId).map((r) => r.floor),
    ),
  ].sort((a, b) => a - b);
  const closed = (id: bigint) => !!id && !gates.find((g) => g.id === id)?.open;
  return (
    <section
      className={`map-panel ${expanded ? "expanded" : ""}`}
      aria-label="World map"
    >
      <div className="section-title">
        <span>ATLAS OF THE KNOWN WORLD</span>
        <span>LEVEL {floor}</span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Map of ${current.name}, level ${floor}`}
      >
        <defs>
          <pattern
            id="map-grid"
            width="18"
            height="18"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 18 0 L 0 0 0 18"
              fill="none"
              stroke="#b8a265"
              strokeOpacity=".045"
            />
          </pattern>
          <filter id="glow">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>
        <rect width="100%" height="100%" fill="url(#map-grid)" />
        {visible.flatMap((r) =>
          r.exits.map((e) => {
            const [x, y] = pos(r),
              dest = visible.find((d) => d.id === e.destination),
              o = offset[e.direction] ?? [0, 0],
              end = dest ? pos(dest) : [x + o[0] * 38, y + o[1] * 38];
            return (
              <g key={`${r.id}-${e.direction}`}>
                <line
                  x1={x}
                  y1={y}
                  x2={end[0]}
                  y2={end[1]}
                  stroke={closed(e.gateId) ? "#a26449" : "#78683e"}
                  strokeWidth="2"
                  strokeDasharray={dest ? "" : "4 4"}
                />
                {closed(e.gateId) && (
                  <rect
                    x={(x + end[0]) / 2 - 4}
                    y={(y + end[1]) / 2 - 4}
                    width="8"
                    height="8"
                    fill="#d98d64"
                    transform={`rotate(45 ${(x + end[0]) / 2} ${(y + end[1]) / 2})`}
                  />
                )}
              </g>
            );
          }),
        )}
        {visible.map((r) => {
          const [x, y] = pos(r),
            here = r.id === current.id,
            exit = current.exits.find((e) => e.destination === r.id);
          return (
            <g
              key={String(r.id)}
              role={exit ? "button" : undefined}
              aria-label={exit ? `Move ${exit.direction} to ${r.name}` : r.name}
              tabIndex={exit && !disabled ? 0 : undefined}
              onClick={() => {
                if (exit && !disabled) move(exit.direction);
              }}
              onKeyDown={(e) => {
                if (exit && !disabled && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  move(exit.direction);
                }
              }}
              className={exit ? "map-room clickable" : "map-room"}
            >
              <title>
                {r.name}
                {here ? " · You are here" : ""}
              </title>
              {here && (
                <rect
                  x={x - 12}
                  y={y - 12}
                  width="24"
                  height="24"
                  fill="#f7cc5c"
                  filter="url(#glow)"
                />
              )}
              <rect
                x={x - 8}
                y={y - 8}
                width="16"
                height="16"
                fill={here ? "#f4cd6d" : "#252535"}
                stroke={here ? "#fff0aa" : "#877347"}
              />
              <text
                x={x}
                y={y + 26}
                textAnchor="middle"
                fill={here ? "#ead7a5" : "#a49b88"}
                fontSize="9"
              >
                {r.name.length > 23 ? r.name.slice(0, 21) + "…" : r.name}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="map-legend">
        <span>
          <i className="you-dot" /> You
        </span>
        <span>◇ Closed gate</span>
        <span>┄ Unexplored</span>
      </div>
      {floors.length > 1 && (
        <div className="floor-controls">
          {floors.map((f) => (
            <button
              key={f}
              className={f === floor ? "selected" : ""}
              onClick={() => setLevel(f)}
            >
              Level {f}
            </button>
          ))}
          <button onClick={() => setLevel(null)}>Follow me</button>
        </div>
      )}
      <div className="movement">
        <span className="eyebrow">MOVE</span>
        <div className="dpad">
          {[
            ["north", "W", "↑"],
            ["west", "A", "←"],
            ["south", "S", "↓"],
            ["east", "D", "→"],
          ].map(([d, k, arrow]) => (
            <button
              className={d}
              key={d}
              aria-label={`Move ${d}`}
              disabled={
                disabled || !current.exits.some((e) => e.direction === d)
              }
              onClick={() => move(d)}
            >
              <b>{k}</b>
              <small>{arrow}</small>
            </button>
          ))}
        </div>
        <div className="vertical-move">
          {["up", "down"].map((d) => (
            <button
              key={d}
              disabled={
                disabled || !current.exits.some((e) => e.direction === d)
              }
              onClick={() => move(d)}
            >
              {d === "up" ? "↑" : "↓"} {d}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
