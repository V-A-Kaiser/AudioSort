<script lang="ts">
  import { tick } from "svelte";
  import WaveSurfer from "wavesurfer.js";
  import Play from "@lucide/svelte/icons/play";
  import Pause from "@lucide/svelte/icons/pause";
  import Download from "@lucide/svelte/icons/download";
  import type WebAudioPlayer from "wavesurfer.js/dist/webaudio";
  import type { Audio } from "$lib/sort";

  let {
    file,
    audio = null,
    order = null,
    total = null,
    spans = null,
    slicing = false,
    describe = null,
    name = null,
    download = false
  }: {
    file: Blob;
    audio?: Audio | null;
    order?: number[] | null;
    total?: number | null;
    spans?: number[] | null;
    slicing?: boolean;
    describe?: ((chunk: number) => string) | null;
    name?: string | null;
    download?: boolean;
  } = $props();

  let visible = $state(8);
  let hover = $state<{ x: number; y: number; view: number } | null>(null);
  let tipWidth = $state(0);

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

  const player = (instance: WaveSurfer | null) =>
    instance?.getMediaElement() as unknown as WebAudioPlayer | undefined;

  const button =
    "flex size-7 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-neutral-100 ring-1 ring-neutral-100 transition-colors hover:bg-neutral-100 hover:text-neutral-900";

  const ramp = (from: number, to: number) => {
    const node = player(surfer)?.getGainNode();
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

    if (order && !slicing) {
      order.forEach((source, position) => {
        const color = hue(source / (total ?? order.length), lightness);
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

  const chunks = $derived(order && spans ? order.length : 0);
  const first = $derived(spans?.[0] ?? 0);
  const extent = $derived(spans && chunks ? spans[chunks] - first : 0);
  const scale = $derived(
    extent ? (stripWidth * chunks) / (visible * extent) : 0
  );

  const locate = (sample: number) => {
    let low = 0;
    let high = chunks - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (spans![middle] <= sample) low = middle;
      else high = middle - 1;
    }
    return low;
  };

  const hovered = $derived.by(() => {
    if (!hover || !scale || !order) return null;

    const sample = Math.floor((hover.view + offset) / scale) + first;
    return { sample: Math.max(0, sample), chunk: order[locate(sample)] };
  });
  const playhead = $derived(
    audio && scale ? (position * audio.sampleRate - first) * scale : 0
  );
  const peak = $derived(
    audio?.channels[0].reduce(
      (max, value) => Math.max(max, Math.abs(value)),
      0
    ) || 1
  );
  const view = $derived.by(() => {
    if (!audio || !scale) return null;

    const start = Math.max(0, (offset / scale + first) / audio.length);
    const end = Math.min(
      1,
      ((offset + stripWidth) / scale + first) / audio.length
    );
    return { left: start * 100, width: Math.max(0, end - start) * 100 };
  });

  $effect(() => {
    const target = canvas;
    if (!target || !audio || !order || !spans || !scale) return;

    void offset;

    const ratio = Math.max(1, devicePixelRatio);
    const height = target.clientHeight;
    target.width = stripWidth * ratio;
    target.height = height * ratio;

    const context = target.getContext("2d");
    if (!context) return;

    context.scale(ratio, ratio);
    context.clearRect(0, 0, stripWidth, height);

    const data = audio.channels[0];
    const middle = height / 2;
    const reach = (middle - 16) / peak;

    context.fillStyle = "#525252";
    for (
      let chunk = locate(offset / scale + first);
      chunk <= chunks && (spans[chunk] - first) * scale <= offset + stripWidth;
      chunk++
    )
      context.fillRect((spans[chunk] - first) * scale - offset, 0, 1, height);

    for (let x = 0; x < stripWidth; x++) {
      const start = offset + x;
      const from = Math.floor(start / scale) + first;
      const to = Math.floor((start + 1) / scale) + first;
      if (start < 0 || from >= spans[chunks]) continue;

      const chunk = locate(from);

      let low = 0;
      let high = 0;
      for (let i = Math.max(0, from); i < to && i < data.length; i++) {
        if (data[i] < low) low = data[i];
        if (data[i] > high) high = data[i];
      }

      context.fillStyle = hue(order[chunk] / (total ?? order.length), 55);
      context.fillRect(
        x,
        middle - high * reach,
        1,
        Math.max(1, (high - low) * reach)
      );
    }
  });

  $effect(() => {
    if (!playing || !strip || !stripWidth) return;
    strip.scrollLeft = playhead - stripWidth / 2;
  });

  $effect(() => {
    const host = strip;
    if (!host) return;

    const zoom = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();

      const next = Math.min(
        64,
        Math.max(0.25, visible * (1 + event.deltaY / 400))
      );
      if (next === visible) return;

      const x = event.clientX - host.getBoundingClientRect().left;
      const anchor = (host.scrollLeft + x) / scale;
      visible = next;

      void tick().then(() => {
        host.scrollLeft = anchor * scale - x;
        offset = host.scrollLeft;
      });
    };

    host.addEventListener("wheel", zoom, { passive: false });
    return () => host.removeEventListener("wheel", zoom);
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
    if (!download) {
      href = null;
      return;
    }

    const url = URL.createObjectURL(file);
    href = url;

    return () => URL.revokeObjectURL(url);
  });

  $effect(() => {
    if (!container || !audio) {
      surfer = null;
      playing = false;
      position = 0;
      duration = 0;
      return;
    }

    const host = container;
    const decoded = audio;

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
      cursorWidth: 0,
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
      decoded.channels.map((channel) => channel.slice()),
      decoded.length / decoded.sampleRate
    );
    surfer = instance;

    return () => {
      host.removeEventListener("pointerdown", duck);

      const media = player(instance);
      const node = media?.getGainNode();

      if (node) {
        const begin = node.context.currentTime;
        node.gain.cancelScheduledValues(begin);
        node.gain.setValueAtTime(node.gain.value, begin);
        node.gain.linearRampToValueAtTime(0, begin + 0.012);
      }

      instance.destroy();
      setTimeout(() => media?.destroy(), 14);
    };
  });
</script>

{#snippet chunkStrip()}
  {#if chunks && !error}
    <div
      bind:this={strip}
      bind:clientWidth={stripWidth}
      onscroll={(event) => (offset = event.currentTarget.scrollLeft)}
      class="relative h-32 [scrollbar-width:none] overflow-x-auto overflow-y-hidden [&::-webkit-scrollbar]:hidden"
    >
      <button
        type="button"
        aria-label="Seek"
        onclick={(event) => {
          if (!duration || !audio || !scale) return;

          const x =
            event.clientX - event.currentTarget.getBoundingClientRect().left;
          const seconds = (x / scale + first) / audio.sampleRate;
          surfer?.seekTo(Math.min(1, Math.max(0, seconds / duration)));
        }}
        onpointermove={(event) =>
          (hover = {
            x: event.clientX,
            y: event.clientY,
            view: event.clientX - (strip?.getBoundingClientRect().left ?? 0)
          })}
        onpointerleave={() => (hover = null)}
        class="absolute top-0 left-0 h-full cursor-pointer"
        style="width: {extent * scale}px"
      ></button>

      {#if hover && hovered && audio}
        {@const seconds = hovered.sample / audio.sampleRate}
        {@const flip = hover.x - 12 - tipWidth < 0}
        <div
          bind:offsetWidth={tipWidth}
          class="pointer-events-none fixed z-20 -translate-y-1/2 rounded-lg border border-neutral-700/60 bg-neutral-950/60 px-2 py-1.5 font-mono text-xs whitespace-nowrap text-neutral-300 {flip
            ? ''
            : '-translate-x-full'}"
          style="left: {flip ? hover.x + 12 : hover.x - 12}px; top: {hover.y}px"
        >
          <p>Sample: {hovered.sample.toLocaleString()}</p>
          <p>
            Timestamp:
            {clock(seconds)}.{Math.floor((seconds % 1) * 1000)
              .toString()
              .padStart(3, "0")}
          </p>
          {#if describe}
            <p>{describe(hovered.chunk)}</p>
          {/if}
        </div>
      {/if}

      <canvas
        bind:this={canvas}
        class="pointer-events-none sticky left-0 block h-full"
        style="width: {stripWidth}px"
      ></canvas>

      <div
        class="pointer-events-none absolute top-0 h-full w-px bg-neutral-50"
        style="left: {playhead}px"
      ></div>
    </div>
  {/if}
{/snippet}

<div class="flex w-full max-w-xl flex-col gap-4">
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

  {#if !slicing}
    {@render chunkStrip()}
  {/if}

  <div class="relative" bind:clientWidth={width}>
    <div class="h-32" bind:this={container}></div>

    {#if view && duration}
      <div
        class="pointer-events-none absolute top-0 z-10 h-full rounded-sm border border-neutral-50 bg-neutral-50/10"
        style="left: {view.left}%; width: {view.width}%"
      ></div>
    {/if}

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

  {#if slicing}
    {@render chunkStrip()}
  {/if}

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
        class="{button} cursor-pointer disabled:cursor-default disabled:opacity-40"
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
          class="{button} ml-auto"
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
