import { flushSync } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-svelte";
import { Sorter } from "$lib/sorter.svelte";
import Controls from "./Controls.svelte";

describe("Controls", () => {
  let destroy = () => {};

  const setup = async () => {
    let sorter!: Sorter;
    destroy = $effect.root(() => {
      sorter = new Sorter();
    });
    flushSync();
    return { sorter, screen: await render(Controls, { sorter }) };
  };

  afterEach(() => destroy());

  it("applies a typed BPM once typing settles", async () => {
    const { sorter, screen } = await setup();

    await screen.getByRole("spinbutton", { name: "BPM" }).fill("90");

    expect(sorter.bpm).toBe(120);
    await vi.waitFor(() => expect(sorter.bpm).toBe(90));
  });

  it("keeps the last tempo while the BPM field is empty or zero", async () => {
    const { sorter, screen } = await setup();
    const bpm = screen.getByRole("spinbutton", { name: "BPM" });

    await bpm.fill("");
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(sorter.bpm).toBe(120);

    await bpm.fill("0");
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(sorter.bpm).toBe(120);
  });
});
