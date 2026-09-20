<script lang="ts">
  import WaveSurfer from "wavesurfer.js";
  import Play from "@lucide/svelte/icons/play";
  import Pause from "@lucide/svelte/icons/pause";
  import Download from "@lucide/svelte/icons/download";

  let {
    file,
    buffer = null,
    order = null,
    windowSize = null,
    name = null,
    download = false
  }: {
    file: File | Blob | null;
    buffer?: AudioBuffer | null;
    order?: number[] | null;
    windowSize?: number | null;
    name?: string | null;
    download?: boolean;
  } = $props();

  const visible = 8;

  let container = $state<HTMLDivElement | null>(null);
  let strip = $state<HTMLDivElement | null>(null);
  let canvas = $state<HTMLCanvasElement | null>(null);
  let stripWidth = $state(0);
  let offset = $state(0);
  let width = $state(0);
  let surfer = $state<WaveSurfer | null>(null);
  let playing = $state(false);
  let position = $state(0);
  let duration = $state(0);
  let error = $state<string | null>(null);
  let href = $state<string | null>(null);
  let label = $state<HTMLElement | null>(null);
  let labelWidth = $state(0);
  let drift = $state(0);

  const ramp = (from: number, to: number) => {
    const node = (
      surfer?.getMediaElement() as unknown as
        { getGainNode?: () => GainNode } | undefined
    )?.getGainNode?.();
    if (!node) return;

    const context = node.context as AudioContext;
    void context.resume();

    const begin = context.currentTime;
    node.gain.cancelScheduledValues(begin);
    node.gain.setValueAtTime(from, begin);
    node.gain.linearRampToValueAtTime(to, begin + 0.012);

    if (!to) return;

    const remaining =
      (surfer?.getDuration() ?? 0) - (surfer?.getCurrentTime() ?? 0);
    if (remaining <= 0.024) return;

    node.gain.setValueAtTime(to, begin + remaining - 0.012);
    node.gain.linearRampToValueAtTime(0, begin + remaining);
  };

  const hue = (fraction: number, lightness: number) =>
    `hsl(${250 - 250 * fraction} 100% ${lightness}%)`;

  const tint = (lightness: number) => {
    const context = document.createElement("canvas").getContext("2d");
    if (!context || !width) return "#525252";

    const gradient = context.createLinearGradient(
      0,
      0,
      width * Math.max(1, devicePixelRatio),
      0
    );

    if (order) {
      order.forEach((source, position) => {
        const color = hue(source / order.length, lightness);
        gradient.addColorStop(position / order.length, color);
        gradient.addColorStop((position + 1) / order.length, color);
      });
    } else {
      for (let stop = 0; stop <= 32; stop++)
        gradient.addColorStop(stop / 32, hue(stop / 32, lightness));
    }

    return gradient;
  };

  const clock = (seconds: number) =>
    `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
      .toString()
      .padStart(2, "0")}`;

  const bars = Array.from(
    { length: 64 },
    (_, index) => 12 + 76 * Math.abs(Math.sin(index * 1.7))
  );

  const chunkWidth = $derived(stripWidth / visible);
  const chunks = $derived(order && windowSize ? order.length : 0);
  const playhead = $derived(
    buffer && windowSize
      ? ((position * buffer.sampleRate) / windowSize) * chunkWidth
      : 0
  );

  $effect(() => {
    const target = canvas;
    if (!target || !buffer || !order || !windowSize || !stripWidth) return;

    void offset;

    const ratio = Math.max(1, devicePixelRatio);
    const height = target.clientHeight;
    target.width = stripWidth * ratio;
    target.height = height * ratio;

    const context = target.getContext("2d");
    if (!context) return;

    context.scale(ratio, ratio);
    context.clearRect(0, 0, stripWidth, height);

    const data = buffer.getChannelData(0);
    const middle = height / 2;

    for (let x = 0; x < stripWidth; x++) {
      const start = offset + x;
      const chunk = Math.floor(start / chunkWidth);
      if (chunk < 0 || chunk >= order.length) continue;

      const from = Math.floor((start / chunkWidth) * windowSize);
      const to = Math.floor(((start + 1) / chunkWidth) * windowSize);

      let low = 0;
      let high = 0;
      for (let i = from; i < to && i < data.length; i++) {
        if (data[i] < low) low = data[i];
        if (data[i] > high) high = data[i];
      }

      context.fillStyle = hue(order[chunk] / order.length, 55);
      context.fillRect(
        x,
        middle - high * middle,
        1,
        Math.max(1, (high - low) * middle)
      );
    }

    context.fillStyle = "#262626";
    for (
      let chunk = Math.floor(offset / chunkWidth);
      chunk <= Math.floor((offset + stripWidth) / chunkWidth);
      chunk++
    )
      context.fillRect(chunk * chunkWidth - offset, 0, 1, height);
  });

  $effect(() => {
    if (!playing || !strip || !stripWidth) return;
    strip.scrollLeft = playhead - stripWidth / 2;
  });

  $effect(() => {
    surfer?.setOptions({ waveColor: tint(55), progressColor: tint(55) });
  });

  $effect(() => {
    void name;
    void labelWidth;

    drift =
      label && !matchMedia("(prefers-reduced-motion: reduce)").matches
        ? Math.max(0, label.scrollWidth - label.clientWidth)
        : 0;
  });

  $effect(() => {
    if (!download || !file) {
      href = null;
      return;
    }

    const url = URL.createObjectURL(file);
    href = url;

    return () => URL.revokeObjectURL(url);
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
      Array.from({ length: decoded.numberOfChannels }, (_, index) =>
        decoded.getChannelData(index).slice()
      ),
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
  {#if name}
    <p
      bind:this={label}
      bind:clientWidth={labelWidth}
      class="text-sm text-neutral-300 {drift
        ? 'overflow-hidden whitespace-nowrap'
        : 'truncate'}"
    >
      <span
        class="inline-block whitespace-nowrap {drift ? 'animate-drift' : ''}"
        style="--drift: -{drift}px; animation-duration: {2 + drift / 20}s"
      >
        {name}
      </span>
    </p>
  {/if}

  {#if chunks && !error}
    <div
      bind:this={strip}
      bind:clientWidth={stripWidth}
      onscroll={(event) => (offset = event.currentTarget.scrollLeft)}
      class="relative h-20 overflow-x-auto overflow-y-hidden rounded-lg bg-neutral-950"
    >
      <button
        type="button"
        aria-label="Seek"
        onclick={(event) => {
          if (!duration || !buffer || !windowSize) return;

          const x =
            event.clientX - event.currentTarget.getBoundingClientRect().left;
          const seconds = ((x / chunkWidth) * windowSize) / buffer.sampleRate;
          surfer?.seekTo(Math.min(1, Math.max(0, seconds / duration)));
        }}
        class="absolute top-0 left-0 h-full cursor-pointer"
        style="width: {chunks * chunkWidth}px"
      ></button>

      <canvas
        bind:this={canvas}
        class="pointer-events-none absolute top-0 h-full"
        style="left: {offset}px; width: {stripWidth}px"
      ></canvas>

      <div
        class="pointer-events-none absolute top-0 h-full w-px bg-neutral-50"
        style="left: {playhead}px"
      ></div>
    </div>
  {/if}

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
    <div class="h-1 w-full overflow-hidden rounded-full bg-neutral-800">
      <div
        class="h-full rounded-full bg-neutral-100"
        style="width: {duration ? (position / duration) * 100 : 0}%"
      ></div>
    </div>

    <div class="relative flex items-center gap-3">
      <button
        type="button"
        aria-label={playing ? "Pause" : "Play"}
        class="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full bg-neutral-900 text-neutral-100 ring-1 ring-neutral-100 transition-colors hover:bg-neutral-100 hover:text-neutral-900 disabled:cursor-default disabled:opacity-40"
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
          <Pause size={14} fill="currentColor" />
        {:else}
          <Play size={14} fill="currentColor" />
        {/if}
      </button>

      {#if href && name}
        <a
          {href}
          download={name}
          aria-label="Download"
          class="ml-auto flex size-7 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-neutral-100 ring-1 ring-neutral-100 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
        >
          <Download size={14} />
        </a>
      {/if}

      <p
        class="pointer-events-none absolute left-1/2 -translate-x-1/2 font-mono text-xs text-neutral-400 select-none"
      >
        {duration ? `${clock(position)} / ${clock(duration)}` : "Decoding…"}
      </p>
    </div>
  {/if}
</div>
