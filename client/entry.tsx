import { createRoot } from "react-dom/client";
const root = createRoot(document.getElementById("root")!);
if (new URLSearchParams(location.search).has("poc")) {
  import("./poc/Workshop").then(({ Workshop }) => root.render(<Workshop />));
} else {
  import("./main").then(({ App }) => root.render(<App />));
}
