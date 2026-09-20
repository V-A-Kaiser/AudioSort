import { chunkOrder, stitchChunks, toWav, type Audio } from "./sort";

type Request =
  | ({ type: "load" } & Audio)
  | {
      type: "sort";
      id: number;
      windowSize: number;
      order: number[] | null;
      target: Parameters<typeof chunkOrder>[2];
      measure: Parameters<typeof chunkOrder>[3];
      direction: Parameters<typeof chunkOrder>[4];
    };

const worker = self as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage: (message: unknown, transfer: Transferable[]) => void;
};

let source: Audio | null = null;

worker.onmessage = ({ data }) => {
  if (data.type === "load") {
    source = { channels: data.channels, sampleRate: data.sampleRate, length: data.length };
    return;
  }

  if (!source) return;

  const order =
    data.order ?? chunkOrder(source, data.windowSize, data.target, data.measure, data.direction);
  const stitched = stitchChunks(source, data.windowSize, order);

  worker.postMessage(
    { id: data.id, order, blob: toWav(stitched), ...stitched },
    stitched.channels.map((channel) => channel.buffer)
  );
};
