import React from "react";
import { createRoot } from "react-dom/client";
import { Viewport } from "./Viewport";
import type { Room, Character } from "../../shared/geometry";
import "./world.css";
const data = JSON.parse(
  document.getElementById("definition")!.textContent!,
) as { room: Room; character: Character };
createRoot(document.getElementById("root")!).render(
  <div style={{ position: "absolute", inset: 0 }}>
    <Viewport
      room={data.room}
      character={data.character}
      guest={data.character}
      showGuest={false}
      command={{ id: 0, action: "idle" }}
      onStatus={() => {}}
      onError={(error) => {
        document.body.dataset.error = error;
      }}
    />
  </div>,
);
