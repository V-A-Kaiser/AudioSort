import SortWorker from "./sort.worker?worker";
import type { SortRequest, SortResponse } from "./sort.worker";
import {
  tempo,
  type Audio,
  type Direction,
  type Measure,
  type Target
} from "./sort";

export const modes = ["Tempo", "Time", "Transient"] as const;
export const divisions = [
  { label: "1/64 bar", beats: 0.0625, stub: "64th" },
  { label: "1/32 bar", beats: 0.125, stub: "32nd" },
  { label: "1/16 bar", beats: 0.25, stub: "16th" },
  { label: "1/8 bar", beats: 0.5, stub: "8th" },
  { label: "1/4 bar", beats: 1, stub: "4th" },
  { label: "1/2 bar", beats: 2, stub: "2nd" },
  { label: "1 bar", beats: 4, stub: "1bar" },
  { label: "2 bars", beats: 8, stub: "2bar" },
  { label: "4 bars", beats: 16, stub: "4bar" }
] as const;

export type Mode = (typeof modes)[number];
export type Division = (typeof divisions)[number];

export type Sorted = {
  blob: Blob;
  audio: Audio;
  order: number[];
  total: number;
  edges: number[];
  spans: number[];
  scores: Float64Array;
  target: Target;
  measure: Measure;
  windowSize: number;
  filename: string;
};

const stubs = {
  Amplitude: "amp",
  Frequency: "freq",
  Mean: "mean",
  Peak: "peak",
  RMS: "rms",
  Ascending: "asc",
  Descending: "desc"
};

export class Sorter {
  file = $state.raw<File | null>(null);
  notice = $state<string | null>(null);
  decoded = $state.raw<AudioBuffer | null>(null);
  mode = $state<Mode>("Tempo");
  windowTime = $state(1000);
  bpm = $state(120);
  division = $state.raw<Division>(divisions[3]);
  target = $state<Target>("Amplitude");
  measure = $state<Measure>("Mean");
  direction = $state<Direction>("Ascending");
  dropSilence = $state(true);
  beatSlice = $state(true);
  offset = $state(0);
  sensitivity = $state(50);
  minimumTime = $state(100);
  sorted = $state.raw<Sorted | null>(null);

  #worker = $state.raw<Worker | null>(null);
  #ticket = 0;

  source = $derived.by((): Audio | null => {
    const buffer = this.decoded;
    if (!buffer) return null;

    return {
      channels: Array.from({ length: buffer.numberOfChannels }, (_, index) =>
        buffer.getChannelData(index)
      ),
      sampleRate: buffer.sampleRate,
      length: buffer.length
    };
  });

  samples = $derived.by(() => {
    const requested =
      this.mode === "Tempo" && this.decoded && this.bpm > 0
        ? Math.round(
            (this.decoded.sampleRate * 60 * this.division.beats) / this.bpm
          )
        : Math.round(
            ((this.windowTime || 1000) * (this.decoded?.sampleRate ?? 44100)) /
              1000
          );

    return Math.min(this.decoded?.length ?? Infinity, Math.max(256, requested));
  });

  minimum = $derived(
    Math.max(
      256,
      Math.round(
        ((this.minimumTime || 0) * (this.decoded?.sampleRate ?? 44100)) / 1000
      )
    )
  );

  filename = $derived(
    [
      this.file?.name.replace(/\.[^.]+$/, "") ?? "audio",
      this.mode === "Tempo"
        ? `${Math.round(this.bpm)}bpm-${this.division.stub}`
        : this.mode === "Transient"
          ? `transient-${Math.round(this.sensitivity)}-${this.minimum}smp`
          : `${this.samples}smp`,
      stubs[this.target],
      stubs[this.measure],
      stubs[this.direction],
      this.dropSilence ? "trim" : ""
    ]
      .join("-")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") + ".wav"
  );

  take = (file: File | null) => {
    this.notice = file ? null : "That drag carried no file.";
    if (!file) return;

    this.decoded = null;
    this.sorted = null;
    this.file = file;
  };

  constructor() {
    $effect(() => {
      const file = this.file;
      if (!file) return;

      let stale = false;

      void (async () => {
        const context = new AudioContext();
        try {
          const buffer = await context.decodeAudioData(
            await file.arrayBuffer()
          );
          if (stale) return;
          this.decoded = buffer;

          const detected = tempo({
            channels: Array.from(
              { length: buffer.numberOfChannels },
              (_, index) => buffer.getChannelData(index)
            ),
            sampleRate: buffer.sampleRate,
            length: buffer.length
          });
          if (detected) this.bpm = Math.round(detected);
        } catch {
          if (stale) return;
          this.file = null;
          this.notice =
            "Could not decode this file. It is either not an audio file, or the format is not supported by this browser.";
        } finally {
          void context.close();
        }
      })();

      return () => {
        stale = true;
      };
    });

    $effect(() => {
      const instance = new SortWorker();
      this.#worker = instance;

      return () => {
        instance.terminate();
        this.#worker = null;
      };
    });

    $effect(() => {
      const audio = this.source;
      const instance = this.#worker;
      if (!audio || !instance) return;

      instance.postMessage({ type: "load", ...audio } satisfies SortRequest);
    });

    $effect(() => {
      const audio = this.source;
      const instance = this.#worker;
      const {
        samples: windowSize,
        target,
        measure,
        direction,
        dropSilence,
        beatSlice,
        offset,
        filename
      } = this;
      const transient =
        this.mode === "Transient"
          ? {
              sensitivity:
                Math.min(100, Math.max(0, this.sensitivity || 0)) / 100,
              minimum: this.minimum
            }
          : null;

      if (!audio || !instance) return;

      const id = ++this.#ticket;

      const receive = ({ data }: MessageEvent<SortResponse>) => {
        if (data.id !== id) return;

        const {
          blob,
          order,
          total,
          edges,
          spans,
          scores,
          channels,
          sampleRate,
          length
        } = data;
        this.sorted = {
          blob,
          order,
          total,
          edges,
          spans,
          scores,
          target,
          measure,
          windowSize,
          filename,
          audio: { channels, sampleRate, length }
        };
      };

      instance.addEventListener("message", receive);
      instance.postMessage({
        type: "sort",
        id,
        windowSize,
        target,
        measure,
        direction,
        dropSilence,
        beatSlice,
        offset: Math.round(((offset || 0) * audio.sampleRate) / 1000),
        transient
      } satisfies SortRequest);

      return () => instance.removeEventListener("message", receive);
    });
  }
}
