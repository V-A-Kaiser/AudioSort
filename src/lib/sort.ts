type Target = "Amplitude" | "Frequency";

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

export const sortChunks = (buffer: AudioBuffer, windowSize: number, target: Target) => {
  const { numberOfChannels, sampleRate, length } = buffer;
  const channels = Array.from({ length: numberOfChannels }, (_, index) =>
    buffer.getChannelData(index)
  );
  const count = Math.ceil(length / windowSize);

  const scores = Array.from({ length: count }, (_, chunk) => {
    const offset = chunk * windowSize;
    const mono = new Float32Array(windowSize);
    for (let i = 0; i < windowSize; i++) {
      if (offset + i >= length) break;
      for (const channel of channels) mono[i] += channel[offset + i] / numberOfChannels;
    }

    if (target === "Amplitude") {
      let sum = 0;
      for (const sample of mono) sum += Math.abs(sample);
      return sum / windowSize;
    }

    const im = new Float32Array(windowSize);
    fft(mono, im);

    let weighted = 0;
    let total = 0;
    for (let k = 0; k <= windowSize >> 1; k++) {
      const magnitude = Math.hypot(mono[k], im[k]);
      weighted += ((k * sampleRate) / windowSize) * magnitude;
      total += magnitude;
    }
    return total ? weighted / total : 0;
  });

  const order = Array.from({ length: count }, (_, index) => index).sort(
    (a, b) => scores[a] - scores[b]
  );

  const sorted = new AudioBuffer({
    numberOfChannels,
    sampleRate,
    length: count * windowSize
  });

  order.forEach((chunk, position) => {
    const source = chunk * windowSize;
    const span = Math.min(windowSize, length - source);
    channels.forEach((channel, index) =>
      sorted.copyToChannel(channel.subarray(source, source + span), index, position * windowSize)
    );
  });

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
