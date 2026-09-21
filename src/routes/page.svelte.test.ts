import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import { segments, wavFile } from "$lib/testing/audio";
import Page from "./+page.svelte";

describe("page", () => {
  it("shows the dropzone and controls before a file is chosen", async () => {
    const screen = await render(Page);

    await expect
      .element(screen.getByText("Drop audio file here."))
      .toBeInTheDocument();
    await expect
      .element(screen.getByRole("radiogroup", { name: "Target" }))
      .toBeInTheDocument();
    await expect
      .element(screen.getByRole("switch", { name: "Remove Silence" }))
      .toBeInTheDocument();
  });

  it("sorts a chosen file into a downloadable result", async () => {
    const screen = await render(Page);

    await userEvent.upload(
      screen.container.querySelector("input[type=file]")!,
      wavFile(segments([0.8, 0.2, 0.6, 0.4], 1))
    );

    await expect
      .element(screen.getByRole("link", { name: "Download" }), {
        timeout: 10000
      })
      .toHaveAttribute("download", expect.stringMatching(/^tone-.*\.wav$/));
  });

  it("clears the previous results as soon as a second file is dropped", async () => {
    const screen = await render(Page);

    await userEvent.upload(
      screen.container.querySelector("input[type=file]")!,
      wavFile(segments([0.8, 0.2, 0.6, 0.4], 1))
    );
    await expect
      .element(screen.getByRole("link", { name: "Download" }), {
        timeout: 10000
      })
      .toBeInTheDocument();

    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(wavFile(segments([0.1, 0.9], 1), "next.wav"));
    screen.container
      .querySelector("main > div.outline-dashed")!
      .dispatchEvent(
        new DragEvent("drop", { dataTransfer, bubbles: true, cancelable: true })
      );
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(
      screen.container.querySelector(
        'a[aria-label="Download"][download^="tone-"]'
      )
    ).toBe(null);
  });
});
