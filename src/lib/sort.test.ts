import { describe, expect, it } from "vitest";
import {
  beatPhase,
  chunkOrder,
  chunkScores,
  orderScores,
  stitchChunks,
  tempo,
  toWav,
  transients,
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

  it("reads a negative origin as leading silence", () => {
    const stitched = stitchChunks(audio, 64, [0, 1], 0, -32);

    expect(Array.from(stitched.channels[0].slice(0, 32))).toEqual(
      Array(32).fill(0)
    );
    expect(Array.from(stitched.channels[0].slice(32, 96))).toEqual(
      Array(64).fill(1)
    );
    expect(stitched.channels[0][96]).toBe(2);
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

describe("beatPhase", () => {
  const sampleRate = 44100;
  const beat = sampleRate / 2;
  const lead = 7000;
  const kicks = Array.from({ length: 8 }, (_, kick) => lead + kick * beat);

  const track: Audio = (() => {
    const data = new Float32Array(lead + 8 * beat);
    for (const start of kicks) {
      let phase = 0;
      for (let index = 0; index < beat; index++) {
        const time = index / sampleRate;
        const frequency = 50 + 100 * Math.exp(-time / 0.03);
        phase += (2 * Math.PI * frequency) / sampleRate;
        data[start + index] = Math.exp(-time / 0.08) * Math.sin(phase);
      }
    }
    return { channels: [data], sampleRate, length: data.length };
  })();

  it("puts each boundary just before a kick", () => {
    const phase = beatPhase(track, beat);

    for (const kick of kicks) {
      const lead = (((kick - phase) % beat) + beat) % beat;
      expect(lead).toBeGreaterThanOrEqual(0);
      expect(lead).toBeLessThan(3 * 128);
    }
  });

  it("gives every kick its own chunk, starting with the kick", () => {
    const origin = beatPhase(track, beat) - beat;
    const chunks = kicks.map((kick) => Math.floor((kick - origin) / beat));
    expect(chunks).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

    const stitched = stitchChunks(track, beat, chunks, 0, origin);
    const data = stitched.channels[0];
    chunks.forEach((_, position) => {
      let loudest = 0;
      for (let index = 1; index < beat; index++)
        if (
          Math.abs(data[position * beat + index]) >
          Math.abs(data[position * beat + loudest])
        )
          loudest = index;
      expect(loudest).toBeLessThan(0.02 * sampleRate);
    });
  });

  it("anchors to the first kick when the tempo drifts from the grid", () => {
    const spacing = Math.round(beat * 1.02);
    const drifting: Audio = (() => {
      const data = new Float32Array(lead + 16 * spacing);
      for (let kick = 0; kick < 16; kick++) {
        let phase = 0;
        for (let index = 0; index < spacing; index++) {
          const time = index / sampleRate;
          const frequency = 50 + 100 * Math.exp(-time / 0.03);
          phase += (2 * Math.PI * frequency) / sampleRate;
          data[lead + kick * spacing + index] =
            Math.exp(-time / 0.08) * Math.sin(phase);
        }
      }
      return { channels: [data], sampleRate, length: data.length };
    })();

    const early = (((lead - beatPhase(drifting, beat)) % beat) + beat) % beat;
    expect(early).toBeGreaterThanOrEqual(0);
    expect(early).toBeLessThan(3 * 128);
  });

  it("leaves the grid alone for audio without transients", () => {
    const steady = mono(4, 1024, (_, index) => sine(440, index));

    expect(beatPhase(steady, 1024)).toBe(0);
  });
});

describe("uneven chunks", () => {
  const edges = [0, 64, 192, 256];
  const levels = [0.8, 0.2, 0.6];
  const audio: Audio = (() => {
    const data = new Float32Array(256);
    levels.forEach((level, chunk) =>
      data.fill(level, edges[chunk], edges[chunk + 1])
    );
    return { channels: [data], sampleRate: 8000, length: data.length };
  })();

  it("scores each chunk over its own length", () => {
    expect(
      Array.from(chunkScores(audio, edges, "Amplitude"), (score) =>
        Number(score.toFixed(3))
      )
    ).toEqual(levels);
  });

  it("stitches chunks back to back at their own lengths", () => {
    const stitched = stitchChunks(audio, edges, [2, 1], 0);

    expect(stitched.length).toBe(64 + 128);
    expect(stitched.channels[0][63]).toBeCloseTo(0.6, 5);
    expect(stitched.channels[0][64]).toBeCloseTo(0.2, 5);
    expect(stitched.channels[0][191]).toBeCloseTo(0.2, 5);
  });
});

describe("transients", () => {
  const hits = [3000, 9000, 20000, 26000];
  const track: Audio = (() => {
    const data = new Float32Array(32000);
    [1, 0.9, 1, 0.3].forEach((level, hit) => {
      for (let index = 0; index < 4000; index++)
        data[hits[hit] + index] =
          level * Math.exp(-index / 400) * Math.sin(index / 3);
    });
    return { channels: [data], sampleRate: 8000, length: data.length };
  })();

  it("slices just before each transient", () => {
    const edges = transients(track, 0.9, 256);

    expect(edges[0]).toBe(0);
    expect(edges[edges.length - 1]).toBe(track.length);
    expect(edges).toHaveLength(hits.length + 2);
    hits.forEach((hit, index) => {
      expect(edges[index + 1]).toBeGreaterThan(hit - 3 * 128);
      expect(edges[index + 1]).toBeLessThanOrEqual(hit);
    });
  });

  it("keeps only the strongest transients at a lower sensitivity", () => {
    expect(transients(track, 0.5, 256)).toHaveLength(hits.length + 1);
  });

  it("shifts every slice by the offset", () => {
    const plain = transients(track, 0.9, 256);
    const shifted = transients(track, 0.9, 256, -200);

    expect(shifted.slice(1, -1)).toEqual(
      plain.slice(1, -1).map((edge) => edge - 200)
    );
  });

  it("never makes a chunk after the lead-in shorter than the minimum", () => {
    const edges = transients(track, 0.9, 7000);

    expect(edges).toHaveLength(4);
    edges
      .slice(2)
      .forEach((edge, index) =>
        expect(edge - edges[index + 1]).toBeGreaterThanOrEqual(7000)
      );
  });

  it("keeps a transient near the start of the file", () => {
    const edges = transients(track, 0.9, 7000);

    expect(edges[1]).toBeGreaterThan(hits[0] - 3 * 128);
    expect(edges[1]).toBeLessThanOrEqual(hits[0]);
  });

  it("slices at the start of a strike, not a sharper hit inside it", () => {
    const sampleRate = 44100;
    const data = new Float32Array(2 * sampleRate);
    for (let index = 0; index < 0.5 * sampleRate; index++) {
      const time = index / sampleRate;
      data[sampleRate + index] =
        Math.min(1, time / 0.01) *
          Math.exp(-time / 0.3) *
          sine(1000, index, sampleRate) +
        (index >= 2426
          ? 0.6 *
            Math.exp(-(index - 2426) / (0.05 * sampleRate)) *
            sine(1000, index - 2426, sampleRate)
          : 0);
    }
    const edges = transients(
      { channels: [data], sampleRate, length: data.length },
      0.9,
      0.1 * sampleRate
    );

    expect(edges).toHaveLength(3);
    expect(edges[1]).toBeGreaterThan(sampleRate - 3 * 128);
    expect(edges[1]).toBeLessThanOrEqual(sampleRate);
  });

  it("slices just before an attack that rises out of a noise bed", () => {
    const sampleRate = 44100;
    const data = Float32Array.from(
      { length: 2 * sampleRate },
      (_, index) => 0.01 * ((Math.sin(index * 12.9898) * 43758.5453) % 1)
    );
    for (let index = 0; index < 0.3 * sampleRate; index++)
      data[sampleRate + index] +=
        Math.exp(-index / (0.1 * sampleRate)) * sine(200, index, sampleRate);
    const edges = transients(
      { channels: [data], sampleRate, length: data.length },
      0.9,
      0.1 * sampleRate
    );

    expect(edges).toHaveLength(3);
    expect(edges[1]).toBeGreaterThanOrEqual(sampleRate - 2 * 128);
    expect(edges[1]).toBeLessThanOrEqual(sampleRate);
  });

  it("prefers the stronger of two transients within the minimum", () => {
    const data = new Float32Array(32000);
    [
      [8000, 0.4],
      [12000, 1]
    ].forEach(([hit, level]) => {
      for (let index = 0; index < 4000; index++)
        data[hit + index] +=
          level * Math.exp(-index / 400) * Math.sin(index / 3);
    });
    const edges = transients(
      { channels: [data], sampleRate: 8000, length: data.length },
      0.9,
      7000
    );

    expect(edges).toHaveLength(3);
    expect(edges[1]).toBeGreaterThan(12000 - 3 * 128);
    expect(edges[1]).toBeLessThanOrEqual(12000);
  });
});

describe("tempo", () => {
  const kicks = (bpm: number, seconds = 30, sampleRate = 44100): Audio => {
    const data = new Float32Array(seconds * sampleRate);
    const beat = (60 / bpm) * sampleRate;
    for (let start = 0; start < data.length; start += beat) {
      let phase = 0;
      for (let index = 0; index < 0.2 * sampleRate; index++) {
        const time = index / sampleRate;
        phase +=
          (2 * Math.PI * (50 + 100 * Math.exp(-time / 0.03))) / sampleRate;
        const at = Math.round(start) + index;
        if (at < data.length)
          data[at] = Math.exp(-time / 0.08) * Math.sin(phase);
      }
    }
    return { channels: [data], sampleRate, length: data.length };
  };

  it.each([90, 110, 122.5, 140, 167])("detects %d BPM", (bpm) => {
    expect(tempo(kicks(bpm))).toBeCloseTo(bpm, 0);
  });

  it("detects the tempo at other sample rates", () => {
    expect(tempo(kicks(128, 30, 48000))).toBeCloseTo(128, 0);
  });

  it("finds no tempo in a steady tone", () => {
    expect(tempo(mono(64, 1024, (_, index) => sine(440, index)))).toBe(null);
  });

  it("finds no tempo in audio too short to hold a beat", () => {
    expect(tempo(mono(1, 1024, () => 0.5))).toBe(null);
  });
});
