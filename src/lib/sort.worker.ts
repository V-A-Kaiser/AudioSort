import {
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
};

export type SortRequest = ({ type: "load" } & Audio) | Sort;

export type SortResponse = Audio & {
  id: number;
  order: number[];
  blob: Blob;
  channels: Float32Array<ArrayBuffer>[];
};

const worker = self as unknown as {
  onmessage: ((event: MessageEvent<SortRequest>) => void) | null;
  postMessage: (message: SortResponse, transfer: Transferable[]) => void;
};

const scores = new Map<string, Float64Array>();
let source: Audio | null = null;
let pending: Sort | null = null;

const run = (data: Sort) => {
  if (!source) {
    pending = data;
    return;
  }

  const key = `${data.windowSize}|${data.target}|${data.measure}`;
  const cached =
    scores.get(key) ??
    chunkScores(source, data.windowSize, data.target, data.measure);
  scores.set(key, cached);

  const order = orderScores(cached, data.direction);
  const stitched = stitchChunks(source, data.windowSize, order);
  const channels = stitched.channels as Float32Array<ArrayBuffer>[];

  worker.postMessage(
    { id: data.id, order, blob: toWav(stitched), ...stitched, channels },
    channels.map((channel) => channel.buffer)
  );
};

worker.onmessage = ({ data }) => {
  if (data.type !== "load") {
    run(data);
    return;
  }

  scores.clear();
  source = {
    channels: data.channels,
    sampleRate: data.sampleRate,
    length: data.length
  };

  const queued = pending;
  pending = null;
  if (queued) run(queued);
};
