import {
  beatPhase,
  chunkScores,
  orderScores,
  stitchChunks,
  toWav,
  type Audio,
  type Direction,
  type Measure,
  type Target
} from "./sort";

type Sort = {
  type: "sort";
  id: number;
  windowSize: number;
  target: Target;
  measure: Measure;
  direction: Direction;
  dropSilence: boolean;
  beatSlice: boolean;
  offset: number;
};

export type SortRequest = ({ type: "load" } & Audio) | Sort;

export type SortResponse = Audio & {
  id: number;
  order: number[];
  total: number;
  blob: Blob;
  channels: Float32Array<ArrayBuffer>[];
};

const worker = self as unknown as {
  onmessage: ((event: MessageEvent<SortRequest>) => void) | null;
  postMessage: (message: SortResponse, transfer: Transferable[]) => void;
};

const scores = new Map<string, Float64Array>();
const phases = new Map<number, number>();
let source: Audio | null = null;
let pending: Sort | null = null;

const run = (data: Sort) => {
  if (!source) {
    pending = data;
    return;
  }

  const audio = source;
  const { windowSize } = data;

  const origin = (() => {
    const phase = data.beatSlice
      ? (phases.get(windowSize) ?? beatPhase(audio, windowSize))
      : 0;
    if (data.beatSlice) phases.set(windowSize, phase);

    const start =
      (((phase + data.offset) % windowSize) + windowSize) % windowSize;
    return start ? start - windowSize : 0;
  })();

  const score = (target: Target, measure: Measure) => {
    const key = `${windowSize}|${origin}|${target}|${measure}`;
    const cached =
      scores.get(key) ??
      chunkScores(audio, windowSize, target, measure, origin);
    scores.set(key, cached);
    return cached;
  };

  const ranked = score(data.target, data.measure);
  const sorted = orderScores(ranked, data.direction);
  const order = (() => {
    if (!data.dropSilence) return sorted;

    const loudness = score("Amplitude", "RMS");
    const audible = sorted.filter((chunk) => loudness[chunk] >= 0.001);
    return audible.length ? audible : sorted;
  })();
  const stitched = stitchChunks(audio, windowSize, order, undefined, origin);
  const channels = stitched.channels as Float32Array<ArrayBuffer>[];

  worker.postMessage(
    {
      id: data.id,
      order,
      total: ranked.length,
      blob: toWav(stitched),
      ...stitched,
      channels
    },
    channels.map((channel) => channel.buffer)
  );
};

worker.onmessage = ({ data }) => {
  if (data.type !== "load") {
    run(data);
    return;
  }

  scores.clear();
  phases.clear();
  source = {
    channels: data.channels,
    sampleRate: data.sampleRate,
    length: data.length
  };

  const queued = pending;
  pending = null;
  if (queued) run(queued);
};
