import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import Dropzone from "./Dropzone.svelte";

describe("Dropzone", () => {
  it("shows the default prompt without a notice", async () => {
    const screen = await render(Dropzone, { onfile: () => {} });

    await expect
      .element(screen.getByText("Drop audio file here."))
      .toBeInTheDocument();
  });

  it("shows the notice in place of the prompt", async () => {
    const screen = await render(Dropzone, {
      onfile: () => {},
      notice: "Nope."
    });

    await expect.element(screen.getByText("Nope.")).toBeInTheDocument();
    expect(screen.getByText("Drop audio file here.").elements()).toHaveLength(
      0
    );
  });

  it("hands over a browsed file", async () => {
    const onfile = vi.fn();
    const screen = await render(Dropzone, { onfile });
    const file = new File(["x"], "a.wav", { type: "audio/wav" });

    await userEvent.upload(
      screen.container.querySelector("input[type=file]")!,
      file
    );

    expect(onfile).toHaveBeenCalledWith(file);
  });
});
