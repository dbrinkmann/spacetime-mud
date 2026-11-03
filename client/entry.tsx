import { createRoot } from "react-dom/client";
const root = createRoot(document.getElementById("root")!);
if (
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
} else if (new URLSearchParams(location.search).has("community")) {
  import("./community/CommunityApp").then(({ CommunityApp }) =>
    root.render(<CommunityApp />),
  );
} else if (new URLSearchParams(location.search).has("poc")) {
  import("./poc/Workshop").then(({ Workshop }) => root.render(<Workshop />));
} else {
  import("./main").then(({ App }) => root.render(<App />));
}
