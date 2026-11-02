import { test, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../client/main";
// jsdom covers forms/subscriptions; real WebGL is exercised in visual-browser.ts.
vi.mock("../client/world/Viewport", () => ({ Viewport: () => null }));
test("real UI explores, builds, previews, publishes, uses an object, chats and reconnects", async () => {
  window.history.replaceState({}, "", "?workshop=1");
  HTMLElement.prototype.scrollTo = vi.fn();
  const user = userEvent.setup();
  const suffix = Date.now().toString(36);
  const view = render(<App />);
  try {
    await screen.findByText("Live", {}, { timeout: 15000 });
    await user.type(
      screen.getByLabelText("What should we call you?"),
      `UI ${suffix}`,
    );
    await user.click(screen.getByRole("button", { name: "Enter world →" }));
    await screen.findByRole("heading", { name: "The Nexus" });
    await user.click(screen.getByRole("button", { name: "Create" }));
    await user.click(screen.getByRole("button", { name: "Create a zone" }));
    await user.type(screen.getByLabelText("Zone name"), `UI Garden ${suffix}`);
    await user.type(
      screen.getByLabelText("Entrance description"),
      "Silver leaves catch the moonlight.",
    );
    await user.click(screen.getByRole("button", { name: "Create zone" }));
    await screen.findByLabelText("Behavior script");
    await user.click(screen.getByRole("button", { name: "Save new draft" }));
    await screen.findByRole("button", { name: "Test saved draft" });
    await user.click(screen.getByRole("button", { name: "Test saved draft" }));
    await screen.findByText(/PASS on_touch/);
    await user.click(
      screen.getByRole("button", { name: "Publish tested version" }),
    );
    await user.click(screen.getByRole("button", { name: "Explore" }));
    await screen.findByRole("heading", { name: `UI Garden ${suffix}` });
    await user.click(
      await screen.findByRole("button", { name: "Touch the stone" }),
    );
    await screen.findByText("A clear note rises from the stone.");
    await user.type(
      screen.getByLabelText("Chat message"),
      "Hello from the garden",
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByText("Hello from the garden");
    window.history.replaceState({}, "", "/");
    await user.click(screen.getByRole("button", { name: "Create" }));
    await screen.findByRole("heading", { name: "Teach your agent to build." });
    expect(
      (
        screen.getByRole("button", {
          name: "Connect agent",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    view.unmount();
    render(<App />);
    await screen.findByRole(
      "heading",
      { name: `UI Garden ${suffix}` },
      { timeout: 15000 },
    );
    expect(screen.queryByText("What should we call you?")).toBeNull();
  } finally {
    cleanup();
    window.history.replaceState({}, "", "/");
  }
});
