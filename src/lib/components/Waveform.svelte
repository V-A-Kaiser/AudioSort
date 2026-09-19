<script lang="ts">
  import WaveSurfer from "wavesurfer.js";
  import Play from "@lucide/svelte/icons/play";
  import Pause from "@lucide/svelte/icons/pause";

  let {
    file,
    buffer = null,
    order = null
  }: { file: File | Blob | null; buffer?: AudioBuffer | null; order?: number[] | null } = $props();

  let container = $state<HTMLDivElement | null>(null);
  let width = $state(0);
  let surfer = $state<WaveSurfer | null>(null);
  let playing = $state(false);
  let position = $state(0);
  let duration = $state(0);
  let error = $state<string | null>(null);

  const ramp = (from: number, to: number) => {
    const node = (
      surfer?.getMediaElement() as unknown as { getGainNode?: () => GainNode } | undefined
    )?.getGainNode?.();
    if (!node) return;

    const context = node.context as AudioContext;
    void context.resume();

    const begin = context.currentTime;
    node.gain.cancelScheduledValues(begin);
    node.gain.setValueAtTime(from, begin);
    node.gain.linearRampToValueAtTime(to, begin + 0.012);

    if (!to) return;

    const remaining = (surfer?.getDuration() ?? 0) - (surfer?.getCurrentTime() ?? 0);
    if (remaining <= 0.024) return;

    node.gain.setValueAtTime(to, begin + remaining - 0.012);
    node.gain.linearRampToValueAtTime(0, begin + remaining);
  };

  const tint = (lightness: number) => {
    const context = document.createElement("canvas").getContext("2d");
    if (!context || !width) return "#525252";

    const gradient = context.createLinearGradient(0, 0, width * Math.max(1, devicePixelRatio), 0);
    const hue = (fraction: number) => `hsl(${250 - 250 * fraction} 100% ${lightness}%)`;

    if (order) {
      order.forEach((source, position) => {
        const color = hue(source / order.length);
        gradient.addColorStop(position / order.length, color);
        gradient.addColorStop((position + 1) / order.length, color);
      });
    } else {
      for (let stop = 0; stop <= 32; stop++) gradient.addColorStop(stop / 32, hue(stop / 32));
    }

    return gradient;
  };

  const clock = (seconds: number) =>
    `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
      .toString()
      .padStart(2, "0")}`;

  const bars = Array.from({ length: 64 }, (_, index) => 12 + 76 * Math.abs(Math.sin(index * 1.7)));

  $effect(() => {
    surfer?.setOptions({ waveColor: tint(55), progressColor: tint(55) });
  });

  $effect(() => {
    if (!container || !file || !buffer) {
      surfer = null;
      return;
    }

    const host = container;
    const decoded = buffer;

    playing = false;
    position = 0;
    duration = 0;
    error = null;

    const instance = WaveSurfer.create({
      container: host,
      height: "auto",
      splitChannels: [],
      backend: "WebAudio",
      waveColor: "#525252",
      progressColor: "#e5e5e5",
      cursorColor: "#fafafa",
      cursorWidth: 1,
      sampleRate: 48000,
      normalize: true,
      dragToSeek: true
    });

    instance.on("ready", (seconds) => (duration = seconds));
    instance.on("timeupdate", (seconds) => (position = seconds));
    const duck = () => ramp(1, 0);
    host.addEventListener("pointerdown", duck);

    instance.on("play", () => {
      playing = true;
      ramp(0, 1);
    });
    instance.on("seeking", () => ramp(0, 1));
    instance.on("pause", () => (playing = false));
    instance.on("finish", () => (playing = false));
    instance.on("error", () => (error = "Could not decode this audio."));
    instance.on("interaction", () => void instance.play());

    void instance.loadBlob(
      file,
      Array.from({ length: decoded.numberOfChannels }, (_, index) => decoded.getChannelData(index)),
      decoded.duration
    );
    surfer = instance;

    return () => {
      host.removeEventListener("pointerdown", duck);

      const player = instance.getMediaElement() as unknown as {
        getGainNode?: () => GainNode;
        destroy?: () => void;
      };
      const node = player.getGainNode?.();

      if (node) {
        const begin = node.context.currentTime;
        node.gain.cancelScheduledValues(begin);
        node.gain.setValueAtTime(node.gain.value, begin);
        node.gain.linearRampToValueAtTime(0, begin + 0.012);
      }

      instance.destroy();
      setTimeout(() => player.destroy?.(), 14);
    };
  });
</script>

<div class="flex w-full max-w-xl flex-col gap-4" class:hidden={!file}>
  <div class="relative" bind:clientWidth={width}>
    <div class="h-32" bind:this={container}></div>

    {#if !duration && !error}
      <div class="absolute inset-0 flex items-center gap-[2px]">
        {#each bars as height, bar (bar)}
          <div
            class="flex-1 animate-pulse rounded-full bg-neutral-700"
            style="height: {height}%; animation-delay: {bar * 40}ms"
          ></div>
        {/each}
      </div>
    {/if}
  </div>

  {#if error}
    <p class="text-center text-sm text-red-400">{error}</p>
  {:else}
    <div class="flex items-center gap-3">
      <button
        type="button"
        aria-label={playing ? "Pause" : "Play"}
        class="flex size-8 cursor-pointer items-center justify-center rounded-full bg-neutral-100 text-neutral-900 transition-colors hover:bg-white disabled:cursor-default disabled:opacity-40"
        disabled={!duration}
        onclick={() => {
          if (!playing) {
            void surfer?.play();
            return;
          }

          ramp(1, 0);
          setTimeout(() => surfer?.pause(), 14);
        }}
      >
        {#if playing}
          <Pause size={16} fill="currentColor" />
        {:else}
          <Play size={16} fill="currentColor" />
        {/if}
      </button>

      <p
        class="ml-auto rounded-full bg-neutral-100 px-4 py-2 font-mono text-sm text-neutral-900 select-none"
      >
        {duration ? `${clock(position)} / ${clock(duration)}` : "Decoding…"}
      </p>
    </div>
  {/if}
</div>
