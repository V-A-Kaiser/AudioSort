import { chunkOrder, stitchChunks, toWav, type Audio } from "./sort";

type Sort = {
  type: "sort";
  id: number;
  windowSize: number;
  order: number[] | null;
  target: Parameters<typeof chunkOrder>[2];
  measure: Parameters<typeof chunkOrder>[3];
  direction: Parameters<typeof chunkOrder>[4];
};

type Request = ({ type: "load" } & Audio) | Sort;

const worker = self as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage: (message: unknown, transfer: Transferable[]) => void;
};

let source: Audio | null = null;
let pending: Sort | null = null;

const run = (data: Sort) => {
  if (!source) {
    pending = data;
    return;
  }

  const order =
    data.order ?? chunkOrder(source, data.windowSize, data.target, data.measure, data.direction);
  const stitched = stitchChunks(source, data.windowSize, order);

  worker.postMessage(
    { id: data.id, order, blob: toWav(stitched), ...stitched },
    stitched.channels.map((channel) => channel.buffer)
  );
};

worker.onmessage = ({ data }) => {
  if (data.type !== "load") {
    run(data);
    return;
  }

  source = { channels: data.channels, sampleRate: data.sampleRate, length: data.length };

  const queued = pending;
  pending = null;
  if (queued) run(queued);
};
