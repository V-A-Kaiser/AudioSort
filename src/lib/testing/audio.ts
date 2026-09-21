import { toWav, type Audio } from "$lib/sort";

export const segments = (
  levels: number[],
  seconds = 0.25,
  sampleRate = 8000
): Audio => {
  const span = Math.round(seconds * sampleRate);
  const data = new Float32Array(levels.length * span);
  levels.forEach((level, segment) => {
    for (let index = 0; index < span; index++)
      data[segment * span + index] =
        level * Math.sin((2 * Math.PI * 440 * index) / sampleRate);
  });
  return { channels: [data], sampleRate, length: data.length };
};

export const wavFile = (audio: Audio, name = "tone.wav") =>
  new File([toWav(audio)], name, { type: "audio/wav" });
