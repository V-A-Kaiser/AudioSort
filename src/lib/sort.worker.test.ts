import { describe, expect, it, vi } from "vitest";
import type { Audio } from "./sort";

const source: Audio = (() => {
  const levels = [0.8, 0.2, 0.6, 0.4];
  const data = new Float32Array(4 * 64);
  levels.forEach((level, chunk) =>
    data.fill(level, chunk * 64, (chunk + 1) * 64)
  );
  return { channels: [data], sampleRate: 8000, length: data.length };
})();

vi.mock("./sort", { spy: true });

const sort = (
  id: number,
  direction: "Ascending" | "Descending" = "Ascending"
) => ({
  type: "sort" as const,
  id,
  windowSize: 64,
  target: "Amplitude" as const,
  measure: "Mean" as const,
  direction
});

const harness = async () => {
  const posted: {
    message: Record<string, unknown>;
    transfer: Transferable[];
  }[] = [];

  const scope = {
    onmessage: null as ((event: MessageEvent) => void) | null,
    postMessage: (message: unknown, transfer: Transferable[]) =>
      posted.push({ message: message as Record<string, unknown>, transfer })
  };

  vi.stubGlobal("self", scope);
  vi.resetModules();
  await import("./sort.worker");

  return {
    posted,
    scores: vi.mocked((await import("./sort")).chunkScores),
    send: (data: unknown) => scope.onmessage?.({ data } as MessageEvent)
  };
};

describe("sort.worker", () => {
  it("sorts once the source is loaded", async () => {
    const { posted, send } = await harness();

    send({ type: "load", ...source });
    send(sort(7));

    expect(posted).toHaveLength(1);
    expect(posted[0].message.id).toBe(7);
    expect(posted[0].message.order).toEqual([1, 3, 2, 0]);
    expect(posted[0].message.sampleRate).toBe(8000);
    expect(posted[0].message.length).toBe(4 * 64 + 8);
    expect(posted[0].message.blob).toBeInstanceOf(Blob);
  });

  it("transfers the stitched channel buffers", async () => {
    const { posted, send } = await harness();

    send({ type: "load", ...source });
    send(sort(1));

    const channels = posted[0].message.channels as Float32Array[];
    expect(posted[0].transfer).toEqual(
      channels.map((channel) => channel.buffer)
    );
  });

  it("queues a sort that arrives before the source", async () => {
    const { posted, send } = await harness();

    send(sort(3));
    expect(posted).toHaveLength(0);

    send({ type: "load", ...source });
    expect(posted).toHaveLength(1);
    expect(posted[0].message.id).toBe(3);
  });

  it("keeps only the newest queued sort", async () => {
    const { posted, send } = await harness();

    send(sort(1));
    send(sort(2));
    send({ type: "load", ...source });

    expect(posted).toHaveLength(1);
    expect(posted[0].message.id).toBe(2);
  });

  it("does not replay the queued sort on a later load", async () => {
    const { posted, send } = await harness();

    send(sort(1));
    send({ type: "load", ...source });
    send({ type: "load", ...source });

    expect(posted).toHaveLength(1);
  });

  it("reuses cached scores across a direction flip", async () => {
    const { posted, scores, send } = await harness();

    send({ type: "load", ...source });
    send(sort(1));
    send(sort(2, "Descending"));

    expect(scores).toHaveBeenCalledTimes(1);
    expect(posted[1].message.order).toEqual([0, 2, 3, 1]);

    const channels = posted[1].message.channels as Float32Array[];
    expect(channels[0][32]).toBeCloseTo(0.8, 5);
    expect(channels[0][96]).toBeCloseTo(0.6, 5);
  });

  it("clears the score cache on a new load", async () => {
    const { scores, send } = await harness();

    send({ type: "load", ...source });
    send(sort(1));
    send({ type: "load", ...source });
    send(sort(2));

    expect(scores).toHaveBeenCalledTimes(2);
  });
});
