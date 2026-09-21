import { flushSync } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import { chunkOrder } from "./sort";
import { Sorter } from "./sorter.svelte";
import { segments, wavFile } from "./testing/audio";

describe("Sorter", () => {
  let destroy = () => {};

  const create = () => {
    let sorter!: Sorter;
    destroy = $effect.root(() => {
      sorter = new Sorter();
      sorter.mode = "Time";
      sorter.beatSlice = false;
      sorter.windowTime = 512;
    });
    flushSync();
    return sorter;
  };

  afterEach(() => destroy());

  it("decodes a file and produces a sorted result", async () => {
    const sorter = create();
    sorter.take(wavFile(segments([0.8, 0.2, 0.6, 0.4])));

    await vi.waitFor(() => expect(sorter.sorted).not.toBe(null), {
      timeout: 5000
    });

    const sorted = sorter.sorted!;
    expect(sorted.windowSize).toBe(sorter.samples);
    expect(sorted.filename).toBe(sorter.filename);
    expect(sorted.order).toEqual(
      chunkOrder(sorter.source!, sorter.samples, "Amplitude")
    );
  });

  it("re-sorts when the direction flips", async () => {
    const sorter = create();
    sorter.take(wavFile(segments([0.8, 0.2, 0.6, 0.4])));
    await vi.waitFor(() => expect(sorter.sorted).not.toBe(null), {
      timeout: 5000
    });
    const ascending = sorter.sorted!.order;

    sorter.direction = "Descending";

    await vi.waitFor(() =>
      expect(sorter.sorted!.order).toEqual([...ascending].reverse())
    );
    expect(sorter.sorted!.filename).toContain("desc");
  });

  it("clears the previous file's results as soon as a new file arrives", async () => {
    const sorter = create();
    sorter.take(wavFile(segments([0.8, 0.2])));
    await vi.waitFor(() => expect(sorter.sorted).not.toBe(null), {
      timeout: 5000
    });

    sorter.take(wavFile(segments([0.1, 0.9]), "next.wav"));
    flushSync();

    expect(sorter.decoded).toBe(null);
    expect(sorter.sorted).toBe(null);
  });

  it("clamps the window to the length of the file", async () => {
    const sorter = create();
    sorter.windowTime = 1e9;
    sorter.take(wavFile(segments([0.5])));

    await vi.waitFor(() => expect(sorter.decoded).not.toBe(null), {
      timeout: 5000
    });
    expect(sorter.samples).toBe(sorter.decoded!.length);
  });

  it("drops an undecodable file and explains why", async () => {
    const sorter = create();
    sorter.take(new File(["not audio"], "junk.wav", { type: "audio/wav" }));

    await vi.waitFor(() => expect(sorter.notice).not.toBe(null), {
      timeout: 5000
    });
    expect(sorter.file).toBe(null);
  });

  it("reports a drag that carried no file", () => {
    const sorter = create();
    sorter.take(null);

    expect(sorter.notice).not.toBe(null);
    expect(sorter.file).toBe(null);
  });

  it("removes silent chunks and marks the filename", async () => {
    const sorter = create();
    sorter.dropSilence = true;
    sorter.take(wavFile(segments([0.8, 0, 0.6])));

    await vi.waitFor(() => expect(sorter.decoded).not.toBe(null), {
      timeout: 5000
    });
    sorter.windowTime = 250;

    await vi.waitFor(() =>
      expect(sorter.sorted?.windowSize).toBe(sorter.samples)
    );
    expect(sorter.sorted!.order).toEqual([2, 0]);
    expect(sorter.sorted!.total).toBe(3);
    expect(sorter.sorted!.filename).toMatch(/-trim\.wav$/);
  });

  it("shifts the slicing by an offset in milliseconds", async () => {
    const sorter = create();
    sorter.take(wavFile(segments([0.8, 0.2, 0.6, 0.4])));
    await vi.waitFor(() => expect(sorter.decoded).not.toBe(null), {
      timeout: 5000
    });
    sorter.windowTime = 250;
    await vi.waitFor(() =>
      expect(sorter.sorted?.windowSize).toBe(sorter.samples)
    );
    expect(sorter.sorted!.total).toBe(4);

    sorter.offset = 10;

    await vi.waitFor(() => expect(sorter.sorted!.total).toBe(5));
  });
});
