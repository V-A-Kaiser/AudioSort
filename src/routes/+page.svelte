<script lang="ts">
  import Dropzone from "$lib/components/Dropzone.svelte";
  import Waveform from "$lib/components/Waveform.svelte";
  import X from "@lucide/svelte/icons/x";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import Info from "@lucide/svelte/icons/info";
  import { sortChunks, toWav } from "$lib/sort";
  import { droppable } from "$lib/droppable";

  const windows = Array.from({ length: 7 }, (_, index) => 2 ** (index + 10));
  const targets = ["Amplitude", "Frequency"] as const;
  const measures = ["Mean", "Peak", "RMS"] as const;
  const directions = ["Ascending", "Descending"] as const;
  const modes = ["Tempo", "Samples"] as const;
  const divisions = [
    { label: "1/16", beats: 0.25 },
    { label: "1/8", beats: 0.5 },
    { label: "1/4", beats: 1 },
    { label: "1/2", beats: 2 },
    { label: "1 bar", beats: 4 },
    { label: "2 bars", beats: 8 },
    { label: "4 bars", beats: 16 }
  ] as const;

  const field =
    "w-full cursor-pointer appearance-none rounded-lg border border-neutral-700 bg-neutral-900 py-2 pr-9 pl-3 text-sm text-neutral-100 transition-colors hover:border-neutral-500 focus:border-neutral-400 focus:outline-none";
  const entry =
    "w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 transition-colors hover:border-neutral-500 focus:border-neutral-400 focus:outline-none";

  const name = "AudioSort";
  const shuffle = (source: string) =>
    [...source]
      .map((character) => ({ character, key: Math.random() }))
      .sort((a, b) => a.key - b.key)
      .map(({ character }) => character)
      .join("");

  let title = $state(name);
  let file = $state<File | null>(null);
  let mode = $state<(typeof modes)[number]>("Tempo");
  let windowSize = $state(65536);
  let bpm = $state(120);
  let division = $state<(typeof divisions)[number]>(divisions[2]);
  let target = $state<(typeof targets)[number]>("Amplitude");
  let measure = $state<(typeof measures)[number]>("Mean");
  let direction = $state<(typeof directions)[number]>("Ascending");
  let decoded = $state<AudioBuffer | null>(null);
  let sorted = $state<{ blob: Blob; buffer: AudioBuffer; order: number[] } | null>(null);

  const samples = $derived(
    mode === "Tempo" && decoded && bpm > 0
      ? Math.max(256, Math.round((decoded.sampleRate * 60 * division.beats) / bpm))
      : Math.max(256, Math.round(windowSize) || 65536)
  );

  $effect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let locked = 0;
    title = shuffle(name);

    const tick = setInterval(() => {
      locked += 1;
      title = name.slice(0, locked) + shuffle(name.slice(locked));
      if (locked >= name.length) clearInterval(tick);
    }, 70);

    return () => clearInterval(tick);
  });

  $effect(() => {
    const source = file;

    if (!source) {
      decoded = null;
      return;
    }

    let stale = false;

    void (async () => {
      const context = new AudioContext();
      try {
        const buffer = await context.decodeAudioData(await source.arrayBuffer());
        if (stale) return;
        decoded = buffer;

        const { analyze } = await import("web-audio-beat-detector");
        const tempo = await analyze(buffer).catch(() => null);
        if (!stale && tempo) bpm = Math.round(tempo * 10) / 10;
      } catch {
        if (!stale) decoded = null;
      } finally {
        void context.close();
      }
    })();

    return () => {
      stale = true;
    };
  });

  $effect(() => {
    const buffer = decoded;
    const size = samples;
    const kind = target;
    const statistic = measure;
    const way = direction;

    if (!buffer) {
      sorted = null;
      return;
    }

    let stale = false;

    void (async () => {
      await new Promise((resolve) => setTimeout(resolve));
      if (stale) return;

      const result = sortChunks(buffer, size, kind, statistic, way);
      const blob = toWav(result.buffer);
      if (!stale) sorted = { blob, buffer: result.buffer, order: result.order };
    })();

    return () => {
      stale = true;
    };
  });
</script>

<main class="flex min-h-screen flex-col items-center gap-4 p-4">
  <h1 aria-label={name} class="text-6xl font-thin tracking-tight text-neutral-50 sm:text-7xl">
    {title}
  </h1>
  <h2 class="font-thin text-neutral-300">It won't sound better, but at least it'll be tidy.</h2>

  {#if file}
    <div
      use:droppable={(dropped) => {
        if (dropped) file = dropped;
      }}
      class="flex w-full max-w-xl flex-col gap-3 rounded-xl outline-2 outline-offset-8 outline-transparent transition-colors outline-dashed data-dragging:bg-neutral-800 data-dragging:outline-neutral-400"
    >
      <div class="flex items-center gap-3">
        <p class="truncate text-lg text-neutral-200">{file.name}</p>
        <button
          type="button"
          aria-label="Clear file"
          class="ml-auto flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-neutral-100 text-neutral-900 transition-colors hover:bg-white"
          onclick={() => (file = null)}
        >
          <X size={16} />
        </button>
      </div>

      <Waveform {file} buffer={decoded} />
    </div>
  {:else}
    <Dropzone onfile={(dropped) => (file = dropped)} />
  {/if}

  {#snippet info(text: string)}
    <span class="group relative inline-flex items-center">
      <button type="button" aria-label={text} class="cursor-help">
        <Info size={12} class="text-neutral-600 transition-colors group-hover:text-neutral-300" />
      </button>
      <span
        aria-hidden="true"
        class="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-48 -translate-x-1/2 rounded-lg border border-neutral-700 bg-neutral-950 p-2 text-xs leading-relaxed font-normal text-neutral-300 opacity-0 shadow-lg transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
      >
        {text}
      </span>
    </span>
  {/snippet}

  {#snippet modeSwitch()}
    <span class="flex rounded border border-neutral-700">
      {#each modes as option (option)}
        <button
          type="button"
          class="cursor-pointer rounded-sm px-2 text-xs leading-4 transition-colors {mode === option
            ? 'bg-neutral-100 text-neutral-900'
            : 'text-neutral-400 hover:text-neutral-100'}"
          onclick={() => (mode = option)}
        >
          {option}
        </button>
      {/each}
    </span>
  {/snippet}

  <div class="grid w-full max-w-xl grid-cols-2 gap-4">
    <div class="flex flex-col gap-2">
      <span class="flex items-center justify-between text-sm text-neutral-400">
        <span class="flex items-center gap-1.5">
          Window
          {@render info(
            "Length of each chunk the audio is cut into. Every chunk is scored, then the chunks are reordered by that score."
          )}
        </span>
        {@render modeSwitch()}
      </span>

      {#if mode === "Tempo"}
        <div class="grid grid-cols-2 gap-4">
          <label class="flex flex-col gap-1">
            <input type="number" min="20" max="300" step="0.1" bind:value={bpm} class={entry} />
            <span class="flex items-center gap-1.5 text-xs text-neutral-500">
              BPM
              {@render info(
                "Tempo used to size the chunks. Detected from the file on load; type over it to correct a bad guess."
              )}
            </span>
          </label>

          <label class="flex flex-col gap-1">
            <div class="relative">
              <select bind:value={division} class={field}>
                {#each divisions as option (option.label)}
                  <option value={option}>{option.label}</option>
                {/each}
              </select>
              <ChevronDown
                size={16}
                class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-neutral-500"
              />
            </div>
            <span class="flex items-center gap-1.5 text-xs text-neutral-500">
              Division
              {@render info(
                "How much musical time each chunk covers, assuming 4/4. With the tempo, this sets the chunk length."
              )}
            </span>
          </label>
        </div>
      {:else}
        <input
          type="number"
          min="256"
          step="1"
          list="windows"
          bind:value={windowSize}
          aria-label="Window"
          class={entry}
        />
        <datalist id="windows">
          {#each windows as size (size)}
            <option value={size}></option>
          {/each}
        </datalist>
      {/if}
    </div>

    <label class="flex flex-col gap-2">
      <span class="flex items-center gap-1.5 text-sm text-neutral-400">
        Target
        {@render info(
          "What each chunk is scored on: Amplitude for how loud it is, Frequency for how bright it is."
        )}
      </span>
      <div class="relative">
        <select bind:value={target} class={field}>
          {#each targets as option (option)}
            <option value={option}>{option}</option>
          {/each}
        </select>
        <ChevronDown
          size={16}
          class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-neutral-500"
        />
      </div>
    </label>

    <label class="flex flex-col gap-2">
      <span class="flex items-center gap-1.5 text-sm text-neutral-400">
        Measure
        {@render info(
          "How a chunk becomes one number. Mean averages it, Peak takes the extreme, RMS weights louder parts more."
        )}
      </span>
      <div class="relative">
        <select bind:value={measure} class={field}>
          {#each measures as option (option)}
            <option value={option}>{option}</option>
          {/each}
        </select>
        <ChevronDown
          size={16}
          class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-neutral-500"
        />
      </div>
    </label>

    <label class="flex flex-col gap-2">
      <span class="flex items-center gap-1.5 text-sm text-neutral-400">
        Direction
        {@render info(
          "Which end the sort starts from. Ascending puts the quietest or darkest chunks first."
        )}
      </span>
      <div class="relative">
        <select bind:value={direction} class={field}>
          {#each directions as option (option)}
            <option value={option}>{option}</option>
          {/each}
        </select>
        <ChevronDown
          size={16}
          class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-neutral-500"
        />
      </div>
    </label>
  </div>

  {#if sorted}
    <Waveform file={sorted.blob} buffer={sorted.buffer} order={sorted.order} />
  {/if}
</main>
