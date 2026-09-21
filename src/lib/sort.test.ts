import { describe, expect, it } from "vitest";
import {
  chunkOrder,
  chunkScores,
  orderScores,
  stitchChunks,
  toWav,
  type Audio
} from "./sort";

const mono = (
  count: number,
  windowSize: number,
  sample: (chunk: number, index: number) => number,
  sampleRate = 8000
): Audio => {
  const data = new Float32Array(count * windowSize);
  for (let chunk = 0; chunk < count; chunk++)
    for (let index = 0; index < windowSize; index++)
      data[chunk * windowSize + index] = sample(chunk, index);
  return { channels: [data], sampleRate, length: data.length };
};

const sine = (frequency: number, index: number, sampleRate = 8000) =>
  Math.sin((2 * Math.PI * frequency * index) / sampleRate);

describe("chunkOrder / amplitude", () => {
  const levels = [0.8, 0.2, 0.6, 0.4];
  const audio = mono(4, 64, (chunk) => levels[chunk]);

  it("sorts quietest first by default", () => {
    expect(chunkOrder(audio, 64, "Amplitude")).toEqual([1, 3, 2, 0]);
  });

  it("sorts loudest first when descending", () => {
    expect(chunkOrder(audio, 64, "Amplitude", "Mean", "Descending")).toEqual([
      0, 2, 3, 1
    ]);
  });

  it("ranks a lone spike above a steady level under Peak but not Mean", () => {
    const spiky = mono(2, 64, (chunk, index) =>
      chunk === 0 ? 0.5 : index === 7 ? 0.9 : 0
    );

    expect(chunkOrder(spiky, 64, "Amplitude", "Peak")).toEqual([0, 1]);
    expect(chunkOrder(spiky, 64, "Amplitude", "Mean")).toEqual([1, 0]);
  });

  it("ranks a burst above a higher-mean steady chunk under RMS", () => {
    const bursty = mono(2, 64, (chunk, index) =>
      chunk === 0 ? 0.6 : index < 32 ? 1 : 0
    );

    expect(chunkOrder(bursty, 64, "Amplitude", "RMS")).toEqual([0, 1]);
    expect(chunkOrder(bursty, 64, "Amplitude", "Mean")).toEqual([1, 0]);
  });

  it("measures Peak on absolute value, so negative excursions count", () => {
    const negative = mono(2, 64, (chunk) => (chunk === 0 ? -0.9 : 0.3));

    expect(chunkOrder(negative, 64, "Amplitude", "Peak")).toEqual([1, 0]);
  });

  it("scores the mono downmix, so out-of-phase content cancels", () => {
    const left = new Float32Array(128);
    const right = new Float32Array(128);
    left.fill(0.9, 0, 64);
    right.fill(-0.9, 0, 64);
    left.fill(0.3, 64);
    right.fill(0.3, 64);

    const stereo: Audio = {
      channels: [left, right],
      sampleRate: 8000,
      length: 128
    };
    expect(chunkOrder(stereo, 64, "Amplitude", "Peak")).toEqual([0, 1]);
  });

  it("scores a trailing partial chunk against the full window", () => {
    const data = new Float32Array(160);
    data.fill(0.5, 0, 64);
    data.fill(0.1, 64, 128);
    data.fill(0.8, 128);

    const partial: Audio = { channels: [data], sampleRate: 8000, length: 160 };
    expect(chunkOrder(partial, 64, "Amplitude")).toEqual([1, 2, 0]);
  });
});

describe("chunkOrder / frequency", () => {
  const frequencies = [1000, 250, 500];
  const audio = mono(3, 1024, (chunk, index) =>
    sine(frequencies[chunk], index)
  );

  it("sorts by peak bin frequency", () => {
    expect(chunkOrder(audio, 1024, "Frequency", "Peak")).toEqual([1, 2, 0]);
  });

  it("sorts by spectral centroid", () => {
    expect(chunkOrder(audio, 1024, "Frequency", "Mean")).toEqual([1, 2, 0]);
  });

  it("sorts by rms frequency", () => {
    expect(chunkOrder(audio, 1024, "Frequency", "RMS")).toEqual([1, 2, 0]);
  });

  it("reverses when descending", () => {
    expect(chunkOrder(audio, 1024, "Frequency", "Peak", "Descending")).toEqual([
      0, 2, 1
    ]);
  });

  it("ignores level, ranking a quiet high chunk above a loud low one", () => {
    const uneven = mono(2, 1024, (chunk, index) =>
      chunk === 0 ? 0.05 * sine(1000, index) : sine(250, index)
    );

    expect(chunkOrder(uneven, 1024, "Frequency", "Peak")).toEqual([1, 0]);
  });

  it("weights high frequencies harder under RMS than under centroid", () => {
    const split = mono(2, 1024, (chunk, index) =>
      chunk === 0 ? sine(250, index) + sine(2000, index) : sine(1203.125, index)
    );

    expect(chunkOrder(split, 1024, "Frequency", "Mean")).toEqual([0, 1]);
    expect(chunkOrder(split, 1024, "Frequency", "RMS")).toEqual([1, 0]);
  });

  it("windows each chunk, keeping an off-bin tone from leaking across the spectrum", () => {
    const leaky = mono(2, 1024, (chunk, index) =>
      chunk === 0 ? sine(253.90625, index) : sine(289.0625, index)
    );

    expect(chunkOrder(leaky, 1024, "Frequency", "Mean")).toEqual([0, 1]);
  });

  it("scores silence as zero", () => {
    const quiet = mono(2, 1024, (chunk, index) =>
      chunk === 0 ? sine(500, index) : 0
    );

    expect(chunkOrder(quiet, 1024, "Frequency", "Mean")).toEqual([1, 0]);
    expect(chunkOrder(quiet, 1024, "Frequency", "Peak")).toEqual([1, 0]);
  });

  it("orders tones with a window that is not a power of two", () => {
    const odd = mono(3, 1000, (chunk, index) =>
      sine(frequencies[chunk], index)
    );

    expect(chunkOrder(odd, 1000, "Frequency", "Peak")).toEqual([1, 2, 0]);
    expect(chunkOrder(odd, 1000, "Frequency", "Mean")).toEqual([1, 2, 0]);
  });

  it("scores the stereo downmix", () => {
    const left = new Float32Array(2048);
    const right = new Float32Array(2048);
    for (let index = 0; index < 1024; index++) {
      left[index] = sine(1000, index);
      right[index] = sine(1000, index);
      left[1024 + index] = sine(250, index);
      right[1024 + index] = sine(250, index);
    }

    const stereo: Audio = {
      channels: [left, right],
      sampleRate: 8000,
      length: 2048
    };
    expect(chunkOrder(stereo, 1024, "Frequency", "Peak")).toEqual([1, 0]);
  });
});

describe("chunkScores / orderScores", () => {
  const audio = mono(4, 64, (chunk) => [0.8, 0.2, 0.6, 0.4][chunk]);

  it("returns one score per chunk", () => {
    const scores = chunkScores(audio, 64, "Amplitude");

    expect(scores).toHaveLength(4);
    expect(scores[0]).toBeCloseTo(0.8, 5);
    expect(scores[1]).toBeCloseTo(0.2, 5);
  });

  it("reverses the order when descending", () => {
    const scores = chunkScores(audio, 64, "Amplitude");

    expect(orderScores(scores, "Descending")).toEqual(
      orderScores(scores, "Ascending").reverse()
    );
  });

  it("gives a single chunk when the window exceeds the file", () => {
    expect(chunkOrder(audio, 1024, "Amplitude")).toEqual([0]);
    expect(chunkOrder(audio, 1024, "Frequency")).toEqual([0]);
  });
});

describe("stitchChunks", () => {
  const audio = mono(4, 64, (chunk) => chunk + 1);

  it("concatenates chunks in the given order when no fade is applied", () => {
    const stitched = stitchChunks(audio, 64, [2, 0], 0);

    expect(stitched.length).toBe(128);
    expect(stitched.sampleRate).toBe(8000);
    expect(stitched.channels).toHaveLength(1);
    expect(Array.from(stitched.channels[0].slice(0, 64))).toEqual(
      Array(64).fill(3)
    );
    expect(Array.from(stitched.channels[0].slice(64))).toEqual(
      Array(64).fill(1)
    );
  });

  it("defaults the fade to an eighth of the window and pads the tail by it", () => {
    const stitched = stitchChunks(audio, 64, [0, 1]);

    expect(stitched.length).toBe(2 * 64 + 8);
    expect(stitched.channels[0]).toHaveLength(2 * 64 + 8);
  });

  it("crossfades the seam between the outgoing lookahead and the incoming head", () => {
    const stitched = stitchChunks(audio, 64, [2, 0]);
    const data = stitched.channels[0];
    const gain = (index: number) => (Math.PI / 2) * (index / 8);

    for (let index = 0; index < 8; index++)
      expect(data[index]).toBeCloseTo(3 * Math.sin(gain(index)), 5);

    expect(data[8]).toBeCloseTo(3, 5);
    expect(data[63]).toBeCloseTo(3, 5);

    for (let index = 0; index < 8; index++)
      expect(data[64 + index]).toBeCloseTo(
        4 * Math.cos(gain(index)) + 1 * Math.sin(gain(index)),
        5
      );

    expect(data[72]).toBeCloseTo(1, 5);
    expect(data[127]).toBeCloseTo(1, 5);

    for (let index = 0; index < 8; index++)
      expect(data[128 + index]).toBeCloseTo(2 * Math.cos(gain(index)), 5);
  });

  it("clips the lookahead at the end of the source", () => {
    const stitched = stitchChunks(audio, 64, [3]);

    expect(stitched.length).toBe(72);
    expect(stitched.channels[0][63]).toBeCloseTo(4, 5);
    expect(Array.from(stitched.channels[0].slice(64))).toEqual(
      Array(8).fill(0)
    );
  });

  it("stitches every channel with the same order", () => {
    const left = new Float32Array(128);
    const right = new Float32Array(128);
    left.fill(1, 0, 64);
    left.fill(2, 64);
    right.fill(3, 0, 64);
    right.fill(4, 64);

    const stereo: Audio = {
      channels: [left, right],
      sampleRate: 8000,
      length: 128
    };
    const stitched = stitchChunks(stereo, 64, [1, 0], 0);

    expect(stitched.channels).toHaveLength(2);
    expect(stitched.channels[0][0]).toBe(2);
    expect(stitched.channels[0][64]).toBe(1);
    expect(stitched.channels[1][0]).toBe(4);
    expect(stitched.channels[1][64]).toBe(3);
  });

  it("pads a window longer than the file with silence", () => {
    const stitched = stitchChunks(audio, 1024, [0], 0);

    expect(stitched.length).toBe(1024);
    expect(stitched.channels[0][255]).toBe(4);
    expect(stitched.channels[0][256]).toBe(0);
  });

  it("caps a fade longer than the window at the window", () => {
    const stitched = stitchChunks(audio, 64, [0, 1], 256);

    expect(stitched.length).toBe(2 * 64 + 64);
    expect(stitched.channels[0].every(Number.isFinite)).toBe(true);
  });

  it("repeats a chunk when the order repeats it", () => {
    const stitched = stitchChunks(audio, 64, [1, 1, 1], 0);

    expect(stitched.length).toBe(192);
    expect(Array.from(stitched.channels[0])).toEqual(Array(192).fill(2));
  });
});

describe("toWav", () => {
  const audio: Audio = {
    channels: [
      Float32Array.from([1, -1, 0.5, 2]),
      Float32Array.from([0, 0.25, -2, -0.5])
    ],
    sampleRate: 44100,
    length: 4
  };

  it("writes a 16-bit PCM header", async () => {
    const blob = toWav(audio);
    expect(blob.type).toBe("audio/wav");
    expect(blob.size).toBe(44 + 4 * 2 * 2);

    const view = new DataView(await blob.arrayBuffer());
    const text = (offset: number, size: number) =>
      String.fromCharCode(...new Uint8Array(view.buffer, offset, size));

    expect(text(0, 4)).toBe("RIFF");
    expect(view.getUint32(4, true)).toBe(36 + 16);
    expect(text(8, 8)).toBe("WAVEfmt ");
    expect(view.getUint32(16, true)).toBe(16);
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(44100);
    expect(view.getUint32(28, true)).toBe(44100 * 2 * 2);
    expect(view.getUint16(32, true)).toBe(4);
    expect(view.getUint16(34, true)).toBe(16);
    expect(text(36, 4)).toBe("data");
    expect(view.getUint32(40, true)).toBe(16);
  });

  it("interleaves channels and clamps beyond full scale", async () => {
    const view = new DataView(await toWav(audio).arrayBuffer());
    const samples = Array.from({ length: 8 }, (_, index) =>
      view.getInt16(44 + index * 2, true)
    );

    expect(samples).toEqual([
      32767, 0, -32767, 8191, 16383, -32767, 32767, -16383
    ]);
  });

  it("writes a header-only file for empty audio", async () => {
    const blob = toWav({
      channels: [new Float32Array(0)],
      sampleRate: 8000,
      length: 0
    });
    expect(blob.size).toBe(44);

    const view = new DataView(await blob.arrayBuffer());
    expect(view.getUint32(4, true)).toBe(36);
    expect(view.getUint32(40, true)).toBe(0);
  });
});
