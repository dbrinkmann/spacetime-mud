import { test, expect, vi } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../client/main";

test("real UI joins the database, builds, navigates, chats, and preserves identity", async () => {
  HTMLElement.prototype.scrollTo = vi.fn();
  const user = userEvent.setup();
  const name = `UITest ${Date.now().toString(36)}`;
  const view = render(<App />);
  try {
    await screen.findByText("Live", {}, { timeout: 15000 });
    await user.type(screen.getByLabelText("What should we call you?"), name);
    await user.click(screen.getByRole("button", { name: "Enter world →" }));
    await screen.findByRole("heading", { name: "The Nexus" });
    await user.click(screen.getByRole("button", { name: "Build" }));
    const select = screen.getByLabelText(
      "Direction from here",
    ) as HTMLSelectElement;
    const option = [...select.options].find((o) => !o.disabled)!;
    expect(option).toBeTruthy();
    await user.selectOptions(select, option.value);
    await user.type(
      screen.getByLabelText("Name", { exact: true }),
      `UI Garden ${name}`,
    );
    await user.type(
      screen.getByLabelText("What do travelers see?"),
      "Silver leaves catch the moonlight.",
    );
    await user.click(screen.getByRole("button", { name: "Create room →" }));
    const passage = await screen.findByRole("button", {
      name: new RegExp(`UI Garden ${name}`),
    });
    await user.click(passage);
    await screen.findByRole("heading", { name: `UI Garden ${name}` });
    await user.type(
      screen.getByLabelText("Game command"),
      `say Greetings from ${name}`,
    );
    await user.click(screen.getByRole("button", { name: "Send command" }));
    await screen.findByText(`Greetings from ${name}`);
    await user.click(screen.getByRole("button", { name: "AIAgent" }));
    expect(
      (
        screen.getByRole("button", {
          name: "Pair & enable Claude Code",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await user.click(screen.getByRole("button", { name: "Command guide" }));
    await screen.findByRole("heading", { name: "Traveler’s guide" });
    view.unmount();
    render(<App />);
    await screen.findByRole(
      "heading",
      { name: `UI Garden ${name}` },
      { timeout: 15000 },
    );
    expect(screen.queryByText("What should we call you?")).toBeNull();
  } finally {
    cleanup();
  }
});
