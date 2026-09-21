import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-svelte";
import { toWav } from "$lib/sort";
import { segments } from "$lib/testing/audio";
import Waveform from "./Waveform.svelte";
import "../../routes/layout.css";

describe("Waveform", () => {
  const audio = segments([0.2, 0.8, 0.5, 0.4]);
  const file = toWav(audio);

  it("enables playback once the audio is ready", async () => {
    const screen = await render(Waveform, { file, audio, name: "tone.wav" });

    await expect
      .element(screen.getByRole("button", { name: "Play" }))
      .toBeEnabled();
    await expect.element(screen.getByText("tone.wav")).toBeInTheDocument();
  });

  it("stays in the decoding state without audio", async () => {
    const screen = await render(Waveform, { file, audio: null });

    await expect.element(screen.getByText("Decoding…")).toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: "Play" }))
      .toBeDisabled();
  });

  it("draws the chunk strip only when given an order", async () => {
    const plain = await render(Waveform, { file, audio });
    expect(plain.container.querySelector("canvas.pointer-events-none")).toBe(
      null
    );
    await plain.unmount();

    const sorted = await render(Waveform, {
      file,
      audio,
      order: [0, 3, 2, 1],
      windowSize: 2000
    });
    await expect
      .element(sorted.getByRole("button", { name: "Seek" }))
      .toBeInTheDocument();
    expect(
      sorted.container.querySelector("canvas.pointer-events-none")
    ).not.toBe(null);
  });

  it("offers a blob download under the given name", async () => {
    const screen = await render(Waveform, {
      file,
      audio,
      name: "sorted.wav",
      download: true
    });

    const link = screen.getByRole("link", { name: "Download" });
    await expect.element(link).toHaveAttribute("download", "sorted.wav");
    expect(link.element().getAttribute("href")).toMatch(/^blob:/);
  });

  it("draws the slicing strip below the waveform when slicing", async () => {
    const above = await render(Waveform, {
      file,
      audio,
      order: [0, 1, 2, 3],
      windowSize: 2000
    });
    const place = (container: HTMLElement) => {
      const seek = container.querySelector("button[aria-label=Seek]")!;
      const wave = container.querySelector(".h-32:not([class*=overflow])")!;
      return seek.compareDocumentPosition(wave) &
        Node.DOCUMENT_POSITION_FOLLOWING
        ? "above"
        : "below";
    };
    await expect
      .element(above.getByRole("button", { name: "Seek" }))
      .toBeInTheDocument();
    expect(place(above.container)).toBe("above");
    await above.unmount();

    const below = await render(Waveform, {
      file,
      audio,
      order: [0, 1, 2, 3, 4],
      windowSize: 2000,
      origin: -1000,
      slicing: true
    });
    await expect
      .element(below.getByRole("button", { name: "Seek" }))
      .toBeInTheDocument();
    expect(place(below.container)).toBe("below");
  });

  it("shows the sample, time and score under the pointer", async () => {
    const screen = await render(Waveform, {
      file,
      audio,
      order: [0, 3, 2, 1],
      windowSize: 2000,
      describe: (chunk: number) => `score ${chunk}`
    });
    const seek = screen.getByRole("button", { name: "Seek" });
    await expect.element(seek).toBeInTheDocument();

    const box = seek.element().getBoundingClientRect();
    await seek.hover({
      position: { x: (box.width / 4) * 1.7, y: box.height / 2 }
    });

    await expect
      .element(screen.getByText(/^Sample 3.?[34]\d\d$/))
      .toBeVisible();
    await expect.element(screen.getByText(/^0:00\.4[1-3]\d$/)).toBeVisible();
    await expect.element(screen.getByText("score 3")).toBeVisible();

    await seek.unhover();
    expect(screen.getByText("score 3").elements()).toHaveLength(0);
  });

  it("flips the tooltip right at the left edge of the window", async () => {
    const screen = await render(Waveform, {
      file,
      audio,
      order: [0, 3, 2, 1],
      windowSize: 2000,
      describe: (chunk: number) => `score ${chunk}`
    });
    const seek = screen.getByRole("button", { name: "Seek" });
    await expect.element(seek).toBeInTheDocument();

    const box = seek.element().getBoundingClientRect();
    await seek.hover({ position: { x: 4, y: box.height / 2 } });
    await expect.element(screen.getByText("score 0")).toBeVisible();

    const tip = screen.getByText("score 0").element().parentElement!;
    await expect
      .poll(() => tip.getBoundingClientRect().left)
      .toBeGreaterThanOrEqual(0);
  });
});
