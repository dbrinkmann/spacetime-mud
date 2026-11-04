import React from "react";
import { flushSync } from "react-dom";
import type { Root } from "react-dom/client";
import { Viewport } from "./Viewport";
import { parseDefinition } from "../../shared/geometry";
import { neutralCharacter } from "../../shared/world";
import { loadSignFont } from "./signs";
import "./world.css";
export type PreviewInput = {
  source: string;
  character?: string;
  yaw?: number;
  time?: number;
  focus?: [number, number, number];
  zoom?: number;
};
declare global {
  interface Window {
    renderLanternPreview?: (input: PreviewInput) => Promise<void>;
  }
}
export function mountPreview(root: Root) {
  window.renderLanternPreview = async (input) => {
    const room = parseDefinition(input.source, "room");
    const character = input.character
      ? parseDefinition(input.character, "character")
      : neutralCharacter("Scale reference");
    if (room.signs?.length) await loadSignFont();
    delete document.body.dataset.error;
    flushSync(() =>
      root.render(
        <div style={{ position: "absolute", inset: 0 }}>
          <Viewport
            room={room}
            character={character}
            guest={character}
            showGuest={false}
            preview={{
              yaw: input.yaw ?? 0,
              time: input.time ?? 0,
              focus: input.focus,
              zoom: input.zoom,
            }}
            command={{ id: 0, action: "idle" }}
            onStatus={() => {}}
            onError={(e) => {
              document.body.dataset.error = e;
            }}
          />
        </div>,
      ),
    );
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    if (document.body.dataset.error) throw Error(document.body.dataset.error);
  };
}
