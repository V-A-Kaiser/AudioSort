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

export const chunkScores = (
  audio: Audio,
  windowSize: number,
  target: Target,
  measure: Measure = "Mean",
  origin = 0
) => {
  const { channels, sampleRate, length } = audio;
  const share = 1 / channels.length;
  const count = Math.ceil((length - origin) / windowSize);
  const fftSize = 2 ** Math.ceil(Math.log2(windowSize));
  const scores = new Float64Array(count);

  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);

  const cos = new Float32Array(fftSize >> 1);
  const sin = new Float32Array(fftSize >> 1);
  const hann = new Float32Array(windowSize);
  if (target === "Frequency") {
    for (let k = 0; k < fftSize >> 1; k++) {
      cos[k] = Math.cos((-2 * Math.PI * k) / fftSize);
      sin[k] = Math.sin((-2 * Math.PI * k) / fftSize);
    }
    for (let i = 0; i < windowSize; i++)
      hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / windowSize);
  }

  for (let chunk = 0; chunk < count; chunk++) {
    const offset = origin + chunk * windowSize;
    const span = Math.min(windowSize, length - offset);
    re.fill(0);

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

    im.fill(0);
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

export const beatPhase = (audio: Audio, windowSize: number) => {
  const { channels, length } = audio;
  const hop = 128;
  const frames = Math.floor(length / hop);
  const level = new Float64Array(frames);

  for (let frame = 0; frame < frames; frame++) {
    let sum = 0;
    for (const channel of channels)
      for (let i = frame * hop; i < (frame + 1) * hop; i++)
        sum += channel[i] * channel[i];
    level[frame] = Math.sqrt(sum / (hop * channels.length));
  }

  let best = 0;
  let strongest = 0;
  for (let phase = 0; phase < windowSize; phase += hop) {
    let sum = 0;
    for (let at = phase; at < length; at += windowSize) {
      const frame = Math.floor(at / hop);
      if (frame > 0 && frame < frames)
        sum += Math.max(0, level[frame] - level[frame - 1]);
    }
    if (sum > strongest) {
      strongest = sum;
      best = phase;
    }
  }

  const average = level.reduce((sum, value) => sum + value, 0) / frames;
  const beats = Math.ceil(length / windowSize);
  if (!strongest || strongest / beats < 0.1 * average) return 0;
  return (((best - hop) % windowSize) + windowSize) % windowSize;
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
  windowSize: number,
  order: number[],
  fade = Math.min(512, windowSize >> 3),
  origin = 0
): Audio => {
  const { channels, sampleRate, length } = audio;
  const numberOfChannels = channels.length;
  const count = order.length;
  const blend = Math.min(fade, windowSize);

  const stitched = Array.from(
    { length: numberOfChannels },
    () => new Float32Array(count * windowSize + blend)
  );

  order.forEach((chunk, position) => {
    const source = origin + chunk * windowSize;
    const span = Math.min(windowSize + blend, length - source);
    const start = position * windowSize;

    for (let i = Math.max(0, -source); i < span; i++) {
      const gain =
        i < blend
          ? Math.sin((Math.PI / 2) * (i / blend))
          : i >= windowSize
            ? Math.cos((Math.PI / 2) * ((i - windowSize) / blend))
            : 1;

      for (let index = 0; index < numberOfChannels; index++)
        stitched[index][start + i] += channels[index][source + i] * gain;
    }
  });

  return {
    channels: stitched,
    sampleRate,
    length: count * windowSize + blend
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

  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (const channel of channels) {
      view.setInt16(
        offset,
        Math.max(-1, Math.min(1, channel[i])) * 0x7fff,
        true
      );
      offset += 2;
    }
  }

  return new Blob([view], { type: "audio/wav" });
};
