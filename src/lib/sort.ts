type Target = "Amplitude" | "Frequency";
type Measure = "Mean" | "Peak" | "RMS";
type Direction = "Ascending" | "Descending";

const fft = (re: Float32Array, im: Float32Array) => {
  const n = re.length;

  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const angle = (-2 * Math.PI) / len;
    for (let start = 0; start < n; start += len) {
      for (let k = 0; k < half; k++) {
        const wr = Math.cos(angle * k);
        const wi = Math.sin(angle * k);
        const ar = re[start + k];
        const ai = im[start + k];
        const br = re[start + k + half] * wr - im[start + k + half] * wi;
        const bi = re[start + k + half] * wi + im[start + k + half] * wr;
        re[start + k] = ar + br;
        im[start + k] = ai + bi;
        re[start + k + half] = ar - br;
        im[start + k + half] = ai - bi;
      }
    }
  }
};

export const sortChunks = (
  buffer: AudioBuffer,
  windowSize: number,
  target: Target,
  measure: Measure = "Mean",
  direction: Direction = "Ascending",
  fade = Math.min(512, windowSize >> 3)
) => {
  const { numberOfChannels, sampleRate, length } = buffer;
  const channels = Array.from({ length: numberOfChannels }, (_, index) =>
    buffer.getChannelData(index)
  );
  const count = Math.ceil(length / windowSize);
  const fftSize = 2 ** Math.ceil(Math.log2(windowSize));

  const scores = Array.from({ length: count }, (_, chunk) => {
    const offset = chunk * windowSize;
    const mono = new Float32Array(fftSize);
    for (let i = 0; i < windowSize; i++) {
      if (offset + i >= length) break;
      for (const channel of channels) mono[i] += channel[offset + i] / numberOfChannels;
    }

    if (target === "Amplitude") {
      if (measure === "Peak") {
        let peak = 0;
        for (const sample of mono) peak = Math.max(peak, Math.abs(sample));
        return peak;
      }

      let sum = 0;
      for (const sample of mono) sum += measure === "RMS" ? sample * sample : Math.abs(sample);
      return measure === "RMS" ? Math.sqrt(sum / windowSize) : sum / windowSize;
    }

    const im = new Float32Array(fftSize);
    for (let i = 0; i < windowSize; i++)
      mono[i] *= 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / windowSize);
    fft(mono, im);

    let weighted = 0;
    let total = 0;
    let loudest = 0;
    let peakFrequency = 0;
    for (let k = 0; k <= fftSize >> 1; k++) {
      const magnitude = Math.hypot(mono[k], im[k]);
      const frequency = (k * sampleRate) / fftSize;

      if (magnitude > loudest) {
        loudest = magnitude;
        peakFrequency = frequency;
      }

      weighted += (measure === "RMS" ? frequency * frequency : frequency) * magnitude;
      total += magnitude;
    }

    if (measure === "Peak") return peakFrequency;
    if (!total) return 0;
    return measure === "RMS" ? Math.sqrt(weighted / total) : weighted / total;
  });

  const order = Array.from({ length: count }, (_, index) => index).sort((a, b) =>
    direction === "Descending" ? scores[b] - scores[a] : scores[a] - scores[b]
  );

  const stitched = Array.from(
    { length: numberOfChannels },
    () => new Float32Array(count * windowSize + fade)
  );

  order.forEach((chunk, position) => {
    const source = chunk * windowSize;
    const span = Math.min(windowSize + fade, length - source);
    const start = position * windowSize;

    for (let i = 0; i < span; i++) {
      const gain =
        i < fade
          ? Math.sin((Math.PI / 2) * (i / fade))
          : i >= windowSize
            ? Math.cos((Math.PI / 2) * ((i - windowSize) / fade))
            : 1;

      for (let index = 0; index < numberOfChannels; index++)
        stitched[index][start + i] += channels[index][source + i] * gain;
    }
  });

  const sorted = new AudioBuffer({
    numberOfChannels,
    sampleRate,
    length: count * windowSize + fade
  });
  stitched.forEach((data, index) => sorted.copyToChannel(data, index));

  return { buffer: sorted, order };
};

export const toWav = (buffer: AudioBuffer) => {
  const { numberOfChannels, sampleRate, length } = buffer;
  const bytes = length * numberOfChannels * 2;
  const view = new DataView(new ArrayBuffer(44 + bytes));

  const ascii = (offset: number, text: string) =>
    [...text].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));

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

  const channels = Array.from({ length: numberOfChannels }, (_, index) =>
    buffer.getChannelData(index)
  );

  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (const channel of channels) {
      view.setInt16(offset, Math.max(-1, Math.min(1, channel[i])) * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([view], { type: "audio/wav" });
};
