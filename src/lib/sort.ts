export const targets = ["Amplitude", "Frequency"] as const;
export const measures = ["Mean", "Peak", "RMS"] as const;
export const directions = ["Ascending", "Descending"] as const;

export type Target = (typeof targets)[number];
export type Measure = (typeof measures)[number];
export type Direction = (typeof directions)[number];

export type Audio = {
  channels: Float32Array[];
  sampleRate: number;
  length: number;
};

export const grid = (layout: number | number[], length: number, origin = 0) =>
  typeof layout === "number"
    ? Array.from(
        { length: Math.ceil((length - origin) / layout) + 1 },
        (_, index) => origin + index * layout
      )
    : layout;

export const chunkScores = (
  audio: Audio,
  layout: number | number[],
  target: Target,
  measure: Measure = "Mean",
  origin = 0
) => {
  const { channels, sampleRate, length } = audio;
  const edges = grid(layout, length, origin);
  const share = 1 / channels.length;
  const count = edges.length - 1;
  const scores = new Float64Array(count);

  const longest = edges.reduce(
    (most, edge, index) =>
      index ? Math.max(most, edge - edges[index - 1]) : 0,
    0
  );
  const re = new Float32Array(2 ** Math.ceil(Math.log2(longest)));
  const im = new Float32Array(re.length);

  let windowSize = 0;
  let fftSize = 0;
  let cos = new Float32Array(0);
  let sin = new Float32Array(0);
  let hann = new Float32Array(0);

  for (let chunk = 0; chunk < count; chunk++) {
    const offset = edges[chunk];
    const size = edges[chunk + 1] - offset;
    const span = Math.min(size, length - offset);

    if (size !== windowSize) {
      windowSize = size;
      fftSize = 2 ** Math.ceil(Math.log2(windowSize));

      if (target === "Frequency") {
        cos = new Float32Array(fftSize >> 1);
        sin = new Float32Array(fftSize >> 1);
        hann = new Float32Array(windowSize);
        for (let k = 0; k < fftSize >> 1; k++) {
          cos[k] = Math.cos((-2 * Math.PI * k) / fftSize);
          sin[k] = Math.sin((-2 * Math.PI * k) / fftSize);
        }
        for (let i = 0; i < windowSize; i++)
          hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / windowSize);
      }
    }

    re.fill(0, 0, fftSize);

    for (const channel of channels)
      for (let i = Math.max(0, -offset); i < span; i++)
        re[i] += channel[offset + i] * share;

    if (target === "Amplitude") {
      if (measure === "Peak") {
        let peak = 0;
        for (let i = 0; i < span; i++) peak = Math.max(peak, Math.abs(re[i]));
        scores[chunk] = peak;
        continue;
      }

      let sum = 0;
      for (let i = 0; i < span; i++)
        sum += measure === "RMS" ? re[i] * re[i] : Math.abs(re[i]);
      scores[chunk] =
        measure === "RMS" ? Math.sqrt(sum / windowSize) : sum / windowSize;
      continue;
    }

    im.fill(0, 0, fftSize);
    for (let i = 0; i < span; i++) re[i] *= hann[i];

    for (let i = 1, j = 0; i < fftSize; i++) {
      let bit = fftSize >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        const swap = re[i];
        re[i] = re[j];
        re[j] = swap;
      }
    }

    for (let len = 2; len <= fftSize; len <<= 1) {
      const half = len >> 1;
      const stride = fftSize / len;
      for (let start = 0; start < fftSize; start += len) {
        for (let k = 0; k < half; k++) {
          const wr = cos[k * stride];
          const wi = sin[k * stride];
          const a = start + k;
          const b = a + half;
          const br = re[b] * wr - im[b] * wi;
          const bi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - br;
          im[b] = im[a] - bi;
          re[a] += br;
          im[a] += bi;
        }
      }
    }

    let weighted = 0;
    let total = 0;
    let loudest = 0;
    let peakFrequency = 0;
    for (let k = 0; k <= fftSize >> 1; k++) {
      const magnitude = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      const frequency = (k * sampleRate) / fftSize;

      if (magnitude > loudest) {
        loudest = magnitude;
        peakFrequency = frequency;
      }

      weighted +=
        (measure === "RMS" ? frequency * frequency : frequency) * magnitude;
      total += magnitude;
    }

    scores[chunk] =
      measure === "Peak"
        ? peakFrequency
        : !total
          ? 0
          : measure === "RMS"
            ? Math.sqrt(weighted / total)
            : weighted / total;
  }

  return scores;
};

const onsets = (audio: Audio, hop: number, log = false) => {
  const { channels, length } = audio;
  const frames = Math.floor(length / hop);
  const level = new Float64Array(frames);

  for (let frame = 0; frame < frames; frame++) {
    let sum = 0;
    for (const channel of channels)
      for (let i = frame * hop; i < (frame + 1) * hop; i++)
        sum += channel[i] * channel[i];
    const rms = Math.sqrt(sum / (hop * channels.length));
    level[frame] = log ? Math.log(1e-6 + rms) : rms;
  }

  const rises = new Float64Array(frames);
  let strongest = 0;
  for (let frame = 1; frame < frames; frame++) {
    rises[frame] = Math.max(0, level[frame] - level[frame - 1]);
    strongest = Math.max(strongest, rises[frame]);
  }

  const average = level.reduce((sum, value) => sum + value, 0) / frames;
  return { level, rises, strongest, average };
};

export const beatPhase = (audio: Audio, windowSize: number) => {
  const hop = 128;
  const { rises, strongest, average } = onsets(audio, hop);
  if (!strongest || strongest < 0.5 * average) return 0;

  const first = rises.findIndex((rise) => rise >= 0.3 * strongest);
  return ((((first - 1) * hop) % windowSize) + windowSize) % windowSize;
};

export const tempo = (audio: Audio) => {
  const hop = 256;
  const { rises } = onsets(audio, hop, true);
  const frames = rises.length;
  const mean = rises.reduce((sum, rise) => sum + rise, 0) / frames;
  if (!(mean >= 0.01)) return null;

  const fps = audio.sampleRate / hop;

  const shortest = Math.floor((60 * fps) / 200);
  const longest = Math.min(Math.ceil((60 * fps) / 60), frames - 2);
  if (shortest >= longest) return null;

  const scores = Array.from({ length: longest - shortest + 3 }, (_, index) => {
    const lag = shortest - 1 + index;
    let sum = 0;
    for (let frame = 0; frame + lag < frames; frame++)
      sum += (rises[frame] - mean) * (rises[frame + lag] - mean);
    return sum / (frames - lag);
  });
  const weigh = (index: number) =>
    scores[index] *
    Math.exp(-0.5 * Math.log2((60 * fps) / (shortest - 1 + index) / 120) ** 2);

  let best = 1;
  for (let index = 2; index < scores.length - 1; index++)
    if (weigh(index) > weigh(best)) best = index;
  if (scores[best] <= 0) return null;

  const [before, peak, after] = scores.slice(best - 1, best + 2);
  const shift = (before - after) / (2 * (before - 2 * peak + after)) || 0;
  return (60 * fps) / (shortest - 1 + best + shift);
};

export const transients = (
  audio: Audio,
  sensitivity: number,
  minimum: number,
  offset = 0
) => {
  const hop = 128;
  const reach = Math.round((0.02 * audio.sampleRate) / hop);
  const { level } = onsets(audio, hop);
  const lows = level.map((_, frame) => {
    let low = frame;
    for (let back = 1; back <= reach && frame - back >= 0; back++)
      if (level[frame - back] < level[low]) low = frame - back;
    return low;
  });
  const rises = level.map((value, frame) => value - level[lows[frame]]);
  const strongest = rises.reduce((most, rise) => Math.max(most, rise), 0);
  const threshold = (1 - sensitivity) * strongest;
  const candidates: { rise: number; at: number }[] = [];

  rises.forEach((rise, frame) => {
    if (
      !(rise > 0) ||
      rise < threshold ||
      rise < rises[frame - 1] ||
      rise <= (rises[frame + 1] ?? 0)
    )
      return;

    const low = lows[frame];
    let start = low;
    while (level[start] - level[low] < 0.2 * rise) start++;

    const at = Math.max(low, start - 1) * hop + offset;
    if (at > 0 && audio.length - at >= minimum) candidates.push({ rise, at });
  });

  const chosen: number[] = [];
  for (const { at } of candidates.sort((a, b) => b.rise - a.rise))
    if (chosen.every((edge) => Math.abs(edge - at) >= minimum)) chosen.push(at);

  return [0, ...chosen.sort((a, b) => a - b), audio.length];
};

export const orderScores = (scores: Float64Array, direction: Direction) =>
  Array.from(scores, (_, index) => index).sort((a, b) =>
    direction === "Descending" ? scores[b] - scores[a] : scores[a] - scores[b]
  );

export const chunkOrder = (
  audio: Audio,
  windowSize: number,
  target: Target,
  measure: Measure = "Mean",
  direction: Direction = "Ascending"
) => orderScores(chunkScores(audio, windowSize, target, measure), direction);

export const stitchChunks = (
  audio: Audio,
  layout: number | number[],
  order: number[],
  fade?: number,
  origin = 0
): Audio => {
  const { channels, sampleRate, length } = audio;
  const edges = grid(layout, length, origin);
  const numberOfChannels = channels.length;
  const sizes = order.map((chunk) => edges[chunk + 1] - edges[chunk]);
  const total = sizes.reduce((sum, size) => sum + size, 0);
  const shortest = edges.reduce(
    (least, edge, index) =>
      index ? Math.min(least, edge - edges[index - 1]) : least,
    Infinity
  );
  const blend = Math.min(fade ?? Math.min(512, shortest >> 3), shortest);

  const stitched = Array.from(
    { length: numberOfChannels },
    () => new Float32Array(total + blend)
  );

  let start = 0;
  order.forEach((chunk, position) => {
    const source = edges[chunk];
    const windowSize = sizes[position];
    const span = Math.min(windowSize + blend, length - source);

    for (let i = Math.max(0, -source); i < span; i++) {
      const gain =
        i < blend
          ? Math.sin((Math.PI / 2) * (i / blend)) ** 2
          : i >= windowSize
            ? Math.cos((Math.PI / 2) * ((i - windowSize) / blend)) ** 2
            : 1;

      for (let index = 0; index < numberOfChannels; index++)
        stitched[index][start + i] += channels[index][source + i] * gain;
    }

    start += windowSize;
  });

  return {
    channels: stitched,
    sampleRate,
    length: total + blend
  };
};

export const toWav = (audio: Audio) => {
  const { channels, sampleRate, length } = audio;
  const numberOfChannels = channels.length;
  const bytes = length * numberOfChannels * 2;
  const view = new DataView(new ArrayBuffer(44 + bytes));

  const ascii = (offset: number, text: string) =>
    [...text].forEach((character, index) =>
      view.setUint8(offset + index, character.charCodeAt(0))
    );

  ascii(0, "RIFF");
  view.setUint32(4, 36 + bytes, true);
  ascii(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numberOfChannels * 2, true);
  view.setUint16(32, numberOfChannels * 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, bytes, true);

  const samples = new Int16Array(view.buffer, 44, length * numberOfChannels);
  channels.forEach((channel, index) => {
    for (let i = 0; i < length; i++)
      samples[i * numberOfChannels + index] =
        Math.max(-1, Math.min(1, channel[i])) * 0x7fff;
  });

  return new Blob([view], { type: "audio/wav" });
};
