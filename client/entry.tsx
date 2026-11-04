import { createRoot } from "react-dom/client";
const root = createRoot(document.getElementById("root")!);
if (new URLSearchParams(location.search).has("preview")) {
  import("./world/HostedPreview").then(({ mountPreview }) =>
    mountPreview(root),
  );
} else if (
  new URLSearchParams(location.search).has("frame_id") ||
  new URLSearchParams(location.search).has("activity")
) {
  root.render(<p>Connecting to your Discord community…</p>);
  Promise.all([
    import("./community/discord"),
    import("./community/CommunityApp"),
  ])
    .then(async ([{ connectActivity }, { CommunityApp }]) =>
      root.render(<CommunityApp activity={await connectActivity()} />),
    )
    .catch((e) =>
      root.render(
        <main>
          <h1>Could not open your community</h1>
          <p>{String(e.message)}</p>
        </main>,
      ),
    );
} else if (import.meta.env.VITE_COMMUNITY_ONLY === "true") {
  root.render(
    <main
      style={{
        padding: "3rem",
        fontFamily: "Georgia, serif",
        background: "#111619",
        color: "#e7ddc9",
        minHeight: "100vh",
      }}
    >
      <h1>Lantern</h1>
      <p>A place for your Discord community.</p>
      <p>Open Lantern from your server's App Launcher to enter your world.</p>
      <p>
        <a style={{ color: "#f4c46b" }} href="/privacy/">
          Privacy
        </a>{" "}
        &middot;{" "}
        <a style={{ color: "#f4c46b" }} href="/terms/">
          Terms
        </a>{" "}
        &middot;{" "}
        <a style={{ color: "#f4c46b" }} href="/support/">
          Support
        </a>
      </p>
    </main>,
  );
} else if (new URLSearchParams(location.search).has("community")) {
  import("./community/CommunityApp").then(({ CommunityApp }) =>
    root.render(<CommunityApp />),
  );
} else if (new URLSearchParams(location.search).has("poc")) {
  import("./poc/Workshop").then(({ Workshop }) => root.render(<Workshop />));
} else {
  import("./main").then(({ App }) => root.render(<App />));
}
