import { createRoot } from "react-dom/client";
const root = createRoot(document.getElementById("root")!);
const params = new URLSearchParams(location.search);
if (params.has("runtime-preview")) {
  import("./Preview").then(({ mountRuntimePreview }) =>
    mountRuntimePreview(root),
  );
} else if (params.has("frame_id") || params.has("activity")) {
  root.render(<p>Connecting to your Discord community…</p>);
  Promise.all([import("../community/discord"), import("./Workbench")])
    .then(async ([{ connectActivity }, { RuntimeWorkbench }]) =>
      root.render(
        <RuntimeWorkbench
          activity={await connectActivity(import.meta.env.VITE_RUNTIME_HOST)}
        />,
      ),
    )
    .catch((error) =>
      root.render(
        <main>
          <h1>Could not open your community</h1>
          <p>{String(error.message)}</p>
          <p>Close and reopen Lantern to reconnect.</p>
        </main>,
      ),
    );
} else if (params.has("runtime")) {
  import("./Workbench").then(({ RuntimeWorkbench }) =>
    root.render(<RuntimeWorkbench />),
  );
} else {
  root.render(
    <main
      style={{
        padding: "3rem",
        fontFamily: "sans-serif",
        background: "#111619",
        color: "#e7ddc9",
        minHeight: "100vh",
      }}
    >
      <h1>Lantern</h1>
      <p>A place for your Discord community.</p>
      <p>Open Lantern from your server’s App Launcher to enter your world.</p>
      <p>
        <a href="/privacy/">Privacy</a> · <a href="/terms/">Terms</a> ·{" "}
        <a href="/support/">Support</a>
      </p>
    </main>,
  );
}
