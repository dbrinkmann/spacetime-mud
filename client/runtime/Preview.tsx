import { flushSync } from "react-dom";
import type { Root } from "react-dom/client";
import { RuntimeScene } from "./Scene";
import { loadSignFont } from "../world/signs";
import type { RoomPresentation } from "../../shared/runtime/presentation";
export type RuntimePreviewInput = {
  source: string;
  focus?: [number, number, number];
  zoom?: number;
  yaw?: number;
  time?: number;
};
declare global {
  interface Window {
    renderRuntimePreview?: (input: RuntimePreviewInput) => Promise<void>;
  }
}
export function mountRuntimePreview(root: Root) {
  let version = 0;
  window.renderRuntimePreview = async (input) => {
    const snapshot = JSON.parse(input.source) as RoomPresentation;
    await loadSignFont();
    flushSync(() =>
      root.render(
        <div style={{ position: "absolute", inset: 0 }}>
          <RuntimeScene
            key={++version}
            snapshot={snapshot}
            self=""
            onWalk={() => {}}
            onSelect={() => {}}
            onSay={() => {}}
            preview={input}
          />
        </div>,
      ),
    );
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  };
}
