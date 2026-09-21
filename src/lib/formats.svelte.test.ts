import { flushSync } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Sorter } from "./sorter.svelte";
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
      sorter.mode = "Samples";
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

    sorter.windowSize = Math.round(decoded.sampleRate / 4);
    await vi.waitFor(() =>
      expect(sorter.sorted?.windowSize).toBe(sorter.samples)
    );
    expect(sorter.sorted!.order.slice(0, 4)).toEqual([0, 2, 3, 1]);
  });

  it.each(unsupported)("rejects %s with a notice", async (_, name, url) => {
    const sorter = await load(name, url);

    expect(sorter.notice).not.toBe(null);
    expect(sorter.file).toBe(null);
    expect(sorter.decoded).toBe(null);
  });
});
