<script lang="ts">
  import WaveSurfer from "wavesurfer.js";
  import Play from "@lucide/svelte/icons/play";
  import Pause from "@lucide/svelte/icons/pause";

  let { file, order = null }: { file: File | Blob | null; order?: number[] | null } = $props();

  let container = $state<HTMLDivElement | null>(null);
  let width = $state(0);
  let surfer = $state<WaveSurfer | null>(null);
  let playing = $state(false);
  let position = $state(0);
  let duration = $state(0);
  let error = $state<string | null>(null);

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

  $effect(() => {
    surfer?.setOptions({ waveColor: tint(55), progressColor: tint(55) });
  });

  $effect(() => {
    if (!container || !file) {
      surfer = null;
      return;
    }

    playing = false;
    position = 0;
    duration = 0;
    error = null;

    const instance = WaveSurfer.create({
      container,
      height: 128,
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
    instance.on("play", () => (playing = true));
    instance.on("pause", () => (playing = false));
    instance.on("finish", () => (playing = false));
    instance.on("error", () => (error = "Could not decode this audio."));

    void instance.loadBlob(file);
    surfer = instance;

    return () => {
      instance.destroy();
    };
  });
</script>

<div class="flex w-full max-w-xl flex-col gap-4" class:hidden={!file}>
  <div class="relative" bind:clientWidth={width}>
    <div bind:this={container}></div>
  </div>

  {#if error}
    <p class="text-center text-sm text-red-400">{error}</p>
  {:else}
    <div class="flex items-center gap-3">
      <button
        type="button"
        aria-label={playing ? "Pause" : "Play"}
        class="flex size-10 cursor-pointer items-center justify-center rounded-full bg-neutral-100 text-neutral-900 transition-colors hover:bg-white disabled:cursor-default disabled:opacity-40"
        disabled={!duration}
        onclick={() => void surfer?.playPause()}
      >
        {#if playing}
          <Pause size={16} fill="currentColor" />
        {:else}
          <Play size={16} fill="currentColor" />
        {/if}
      </button>

      <p class="ml-auto font-mono text-sm text-neutral-400">
        {duration ? `${clock(position)} / ${clock(duration)}` : "Decoding…"}
      </p>
    </div>
  {/if}
</div>
