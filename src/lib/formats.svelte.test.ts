import { flushSync } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Sorter } from "./sorter.svelte";
import cage from "./testing/acagearoundtheinfinite.mp3?url";
import blank from "./testing/formats/burst-blank.mp3?url";
import tagged from "./testing/formats/burst-tagged.mp3?url";
import untagged from "./testing/formats/burst-untagged.mp3?url";
import aiff from "./testing/formats/tone.aiff?url";
import alac from "./testing/formats/tone-alac.m4a?url";
import flac from "./testing/formats/tone.flac?url";
import m4a from "./testing/formats/tone.m4a?url";
import mp3 from "./testing/formats/tone.mp3?url";
import ogg from "./testing/formats/tone.ogg?url";
import opus from "./testing/formats/tone.opus?url";
import wav from "./testing/formats/tone.wav?url";
import webm from "./testing/formats/tone.webm?url";

const supported = [
  ["WAV", "tone.wav", wav],
  ["MP3", "tone.mp3", mp3],
  ["AAC in M4A", "tone.m4a", m4a],
  ["FLAC", "tone.flac", flac],
  ["Vorbis in Ogg", "tone.ogg", ogg],
  ["Opus in Ogg", "tone.opus", opus],
  ["Opus in WebM", "tone.webm", webm]
] as const;

const unsupported = [
  ["AIFF", "tone.aiff", aiff],
  ["ALAC in M4A", "tone-alac.m4a", alac]
] as const;

describe("audio formats in Chromium", () => {
  let destroy = () => {};
  afterEach(() => destroy());

  const load = async (name: string, url: string) => {
    let sorter!: Sorter;
    destroy = $effect.root(() => {
      sorter = new Sorter();
      sorter.mode = "Time";
      sorter.beatSlice = false;
      sorter.direction = "Descending";
    });
    flushSync();

    sorter.take(new File([await (await fetch(url)).blob()], name));
    await vi.waitFor(
      () => expect(sorter.decoded ?? sorter.notice).not.toBe(null),
      { timeout: 5000 }
    );
    return sorter;
  };

  it.each(supported)("decodes and sorts %s", async (_, name, url) => {
    const sorter = await load(name, url);
    expect(sorter.notice).toBe(null);

    const decoded = sorter.decoded!;
    expect(decoded.duration).toBeGreaterThan(0.95);
    expect(decoded.duration).toBeLessThan(1.1);

    sorter.windowTime = 250;
    await vi.waitFor(() =>
      expect(sorter.sorted?.windowSize).toBe(sorter.samples)
    );
    expect(sorter.sorted!.order.slice(0, 4)).toEqual([0, 2, 3, 1]);
  });

  it.each([
    ["with a gapless tag", "burst-tagged.mp3", tagged],
    ["without a tag", "burst-untagged.mp3", untagged],
    ["with a blank first frame", "burst-blank.mp3", blank]
  ] as const)(
    "decodes an MP3 %s without leading padding",
    async (_, name, url) => {
      const sorter = await load(name, url);
      const { channels, sampleRate } = sorter.source!;
      const onset = channels[0].findIndex((sample) => Math.abs(sample) > 0.3);

      expect(onset / sampleRate).toBeGreaterThan(0.249);
      expect(onset / sampleRate).toBeLessThan(0.252);
    }
  );

  it("lines a 168 BPM render up with its eighth-note grid", async () => {
    const sorter = await load("cage.mp3", cage);
    sorter.mode = "Tempo";
    sorter.bpm = 168;
    await vi.waitFor(() =>
      expect(sorter.sorted?.windowSize).toBe(sorter.samples)
    );

    const { channels, sampleRate } = sorter.source!;
    const plain = sorter.sorted!;
    const kick = plain.edges[256];
    const peak = (from: number, to: number) =>
      channels[0]
        .subarray(Math.round(from), Math.round(to))
        .reduce((most, sample) => Math.max(most, Math.abs(sample)), 0);

    expect(kick).toBe(Math.round((256 * sampleRate * 30) / 168));
    expect(peak(kick, kick + 0.005 * sampleRate)).toBeGreaterThan(0.8);
    expect(
      peak(kick - 0.01 * sampleRate, kick - 0.002 * sampleRate)
    ).toBeLessThan(0.7);

    sorter.beatSlice = true;
    await vi.waitFor(() => expect(sorter.sorted === plain).toBe(false));
    const early = Math.min(
      ...sorter
        .sorted!.edges.map((edge) => kick - edge)
        .filter((gap) => gap >= 0)
    );
    expect(early).toBeLessThan(2 * 128);
  });

  it.each(unsupported)("rejects %s with a notice", async (_, name, url) => {
    const sorter = await load(name, url);

    expect(sorter.notice).not.toBe(null);
    expect(sorter.file).toBe(null);
    expect(sorter.decoded).toBe(null);
  });
});
