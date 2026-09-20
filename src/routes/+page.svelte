<script lang="ts">
  import Dropzone from "$lib/components/Dropzone.svelte";
  import Waveform from "$lib/components/Waveform.svelte";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import Info from "@lucide/svelte/icons/info";
  import SortWorker from "$lib/sort.worker?worker";
  import { droppable } from "$lib/droppable";
  import { version } from "../../package.json";

  const targets = ["Amplitude", "Frequency"] as const;
  const measures = ["Mean", "Peak", "RMS"] as const;
  const directions = ["Ascending", "Descending"] as const;
  const modes = ["Tempo", "Samples"] as const;
  const divisions = [
    { label: "1/64 bar", beats: 0.0625, stub: "64th" },
    { label: "1/32 bar", beats: 0.125, stub: "32nd" },
    { label: "1/16 bar", beats: 0.25, stub: "16th" },
    { label: "1/8 bar", beats: 0.5, stub: "8th" },
    { label: "1/4 bar", beats: 1, stub: "4th" },
    { label: "1/2 bar", beats: 2, stub: "2nd" },
    { label: "1 bar", beats: 4, stub: "1bar" },
    { label: "2 bars", beats: 8, stub: "2bar" },
    { label: "4 bars", beats: 16, stub: "4bar" }
  ] as const;

  const stubs = {
    Amplitude: "amp",
    Frequency: "freq",
    Mean: "mean",
    Peak: "peak",
    RMS: "rms",
    Ascending: "asc",
    Descending: "desc"
  };

  const field =
    "w-full cursor-pointer appearance-none rounded-lg border border-neutral-700 bg-neutral-900 py-2 pr-9 pl-3 text-sm text-neutral-100 transition-colors hover:border-neutral-500 focus:border-neutral-400 focus:outline-none";
  const entry =
    "w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 transition-colors hover:border-neutral-500 focus:border-neutral-400 focus:outline-none";

  const name = "AudioSort";
  const order = Array.from({ length: name.length }, (_, index) => index);
  const shuffle = () =>
    order
      .map((index) => ({ index, key: Math.random() }))
      .sort((a, b) => a.key - b.key)
      .map(({ index }) => index);

  const settle = (apply: (value: number) => void) => {
    let timer: ReturnType<typeof setTimeout>;
    return (event: Event & { currentTarget: HTMLInputElement }) => {
      const value = event.currentTarget.valueAsNumber;
      clearTimeout(timer);
      timer = setTimeout(() => apply(value), 400);
    };
  };

  let about = $state<HTMLDialogElement | null>(null);
  let letters: HTMLElement[] = [];
  let offsets = $state(order.map(() => 0));
  let gliding = $state(false);
  let file = $state<File | null>(null);
  let mode = $state<(typeof modes)[number]>("Tempo");
  let windowSize = $state(65536);
  let bpm = $state(120);
  let division = $state<(typeof divisions)[number]>(divisions[3]);
  let target = $state<(typeof targets)[number]>("Amplitude");
  let measure = $state<(typeof measures)[number]>("Mean");
  let direction = $state<(typeof directions)[number]>("Ascending");
  let decoded = $state<AudioBuffer | null>(null);
  let sorted = $state<{
    blob: Blob;
    buffer: AudioBuffer;
    order: number[];
  } | null>(null);

  const cache: { key: string; order: number[] }[] = [];

  let worker = $state<Worker | null>(null);
  let ticket = 0;

  const onWindow = settle((value) => (windowSize = value));
  const onBpm = settle((value) => (bpm = value));

  const samples = $derived(
    mode === "Tempo" && decoded && bpm > 0
      ? Math.max(
          256,
          Math.round((decoded.sampleRate * 60 * division.beats) / bpm)
        )
      : Math.max(256, Math.round(windowSize) || 65536)
  );

  const filename = $derived(
    [
      file?.name.replace(/\.[^.]+$/, "") ?? "audio",
      mode === "Tempo"
        ? `${Math.round(bpm)}bpm-${division.stub}`
        : `${samples}smp`,
      stubs[target],
      stubs[measure],
      stubs[direction]
    ]
      .join("-")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") + ".wav"
  );

  $effect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const slide = (sequence: number[]) => {
      if (!letters[0]) return;

      const lefts = letters.map((letter) => letter.offsetLeft);
      const widths = letters.map((letter, index) =>
        index < letters.length - 1
          ? lefts[index + 1] - lefts[index]
          : letter.offsetWidth
      );

      let cursor = lefts[0];
      const next = order.map(() => 0);
      for (const letter of sequence) {
        next[letter] = cursor - lefts[letter];
        cursor += widths[letter];
      }
      offsets = next;
    };

    let settle: ReturnType<typeof setTimeout>;

    const resolve = () => {
      slide(shuffle());
      settle = setTimeout(() => slide(order), 1400);
    };

    slide(shuffle());

    const start = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        gliding = true;
        resolve();
      })
    );

    const loop = setInterval(() => {
      slide(shuffle());
      settle = setTimeout(resolve, 1400);
    }, 10000);

    return () => {
      cancelAnimationFrame(start);
      clearTimeout(settle);
      clearInterval(loop);
    };
  });

  $effect(() => {
    const source = file;
    cache.length = 0;

    if (!source) {
      decoded = null;
      return;
    }

    let stale = false;

    void (async () => {
      const context = new AudioContext();
      try {
        const buffer = await context.decodeAudioData(
          await source.arrayBuffer()
        );
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
    const instance = new SortWorker();
    worker = instance;

    return () => {
      instance.terminate();
      worker = null;
    };
  });

  $effect(() => {
    const buffer = decoded;
    const instance = worker;

    if (!buffer || !instance) return;

    instance.postMessage({
      type: "load",
      channels: Array.from({ length: buffer.numberOfChannels }, (_, index) =>
        buffer.getChannelData(index)
      ),
      sampleRate: buffer.sampleRate,
      length: buffer.length
    });
  });

  $effect(() => {
    const buffer = decoded;
    const instance = worker;
    const size = samples;
    const kind = target;
    const statistic = measure;
    const way = direction;

    if (!buffer || !instance) {
      sorted = null;
      return;
    }

    let stale = false;
    const id = ++ticket;

    const receive = ({ data }: MessageEvent) => {
      if (data.id !== id) return;
      instance.removeEventListener("message", receive);
      if (stale) return;

      const key = `${size}|${kind}|${statistic}|${way}`;
      const index = cache.findIndex((entry) => entry.key === key);

      if (index >= 0) cache.splice(index, 1);
      cache.push({ key, order: data.order });
      if (cache.length > 32) cache.shift();

      const stitched = new AudioBuffer({
        numberOfChannels: data.channels.length,
        sampleRate: data.sampleRate,
        length: data.length
      });
      data.channels.forEach(
        (channel: Float32Array<ArrayBuffer>, position: number) =>
          stitched.copyToChannel(channel, position)
      );

      sorted = { blob: data.blob, buffer: stitched, order: data.order };
    };

    instance.addEventListener("message", receive);
    instance.postMessage({
      type: "sort",
      id,
      windowSize: size,
      order:
        cache.find(
          (entry) => entry.key === `${size}|${kind}|${statistic}|${way}`
        )?.order ?? null,
      target: kind,
      measure: statistic,
      direction: way
    });

    return () => {
      stale = true;
      instance.removeEventListener("message", receive);
    };
  });
</script>

<main class="flex min-h-screen flex-col items-center gap-4 p-4">
  <h1
    aria-label={name}
    class="inline-flex text-6xl font-thin tracking-tight text-neutral-50 sm:text-7xl"
  >
    {#each [...name] as character, index (index)}
      <span
        bind:this={letters[index]}
        aria-hidden="true"
        class="inline-block will-change-transform {gliding
          ? 'transition-transform duration-700 ease-in-out'
          : ''}"
        style="transform: translateX({offsets[index]}px)"
      >
        {character}
      </span>
    {/each}
  </h1>
  <div class="group relative cursor-help">
    <h2 class="font-thin text-neutral-300">
      "It's <em class="font-normal">sort</em>a good!"
    </h2>
    <h3 class="text-xs font-thin italic">
      — Johann Carl Friedrich Gauss, Progenitor of FFT, 1805
    </h3>

    <span
      class="pointer-events-none absolute top-full left-1/2 z-10 mt-2 w-52 -translate-x-1/2 rounded-lg border border-neutral-700 bg-neutral-950 p-2 text-xs leading-relaxed text-neutral-300 opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
    >
      ...not a real quote, yet.
    </span>
  </div>

  {#if file}
    <div
      use:droppable={(dropped) => {
        if (dropped) file = dropped;
      }}
      class="flex w-full max-w-xl flex-col gap-3 rounded-xl outline-2 outline-offset-8 outline-transparent transition-colors outline-dashed data-dragging:bg-neutral-800 data-dragging:outline-neutral-400"
    >
      <Waveform {file} buffer={decoded} name={file.name} />
    </div>
  {:else}
    <Dropzone onfile={(dropped) => (file = dropped)} />
  {/if}

  {#snippet info(
    text: string,
    align: "start" | "end" | "split",
    points: readonly [string, string][] = []
  )}
    <span class="group relative inline-flex items-center">
      <button
        type="button"
        aria-label="{text} {points
          .map(([term, detail]) => `${term}: ${detail}`)
          .join(' ')}"
        class="cursor-help"
      >
        <Info
          size={12}
          class="text-neutral-600 transition-colors group-hover:text-neutral-300"
        />
      </button>
      <span
        aria-hidden="true"
        class="pointer-events-none absolute bottom-full z-10 mb-2 w-52 rounded-lg border border-neutral-700 bg-neutral-950 p-2 text-xs leading-relaxed font-normal text-neutral-300 opacity-0 shadow-lg transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 sm:w-64 {align ===
        'start'
          ? 'left-0'
          : align === 'end'
            ? 'right-0'
            : 'left-0 xs:right-0 xs:left-auto'}"
      >
        {text}

        {#if points.length}
          <ul class="mt-1.5 flex flex-col gap-1">
            {#each points as [term, detail] (term)}
              <li class="flex gap-1.5">
                <span aria-hidden="true" class="text-neutral-600">&bull;</span>
                <span
                  ><span class="text-neutral-100">{term}</span> &mdash; {detail}</span
                >
              </li>
            {/each}
          </ul>
        {/if}
      </span>
    </span>
  {/snippet}

  {#snippet choices(
    options: readonly string[],
    current: string,
    pick: (value: string) => void
  )}
    {@const index = options.indexOf(current)}
    {@const columns = `repeat(${options.length}, minmax(0, 1fr))`}
    <div
      class="relative grid rounded-lg border border-neutral-700 p-0.5"
      style="grid-template-columns: {columns}"
    >
      {#each options as option (option)}
        <button
          type="button"
          class="cursor-pointer rounded-md py-1.5 text-sm text-neutral-400 hover:text-neutral-100"
          onclick={() => pick(option)}
        >
          {option}
        </button>
      {/each}

      <span
        aria-hidden="true"
        class="pointer-events-none absolute inset-0.5 overflow-hidden rounded-md bg-neutral-100 transition-transform duration-200 ease-out"
        style="width: calc((100% - 4px) / {options.length}); transform: translateX({index *
          100}%)"
      >
        <span
          class="absolute top-0 left-0 grid transition-transform duration-200 ease-out"
          style="width: {options.length *
            100}%; grid-template-columns: {columns}; transform: translateX(-{(index *
            100) /
            options.length}%)"
        >
          {#each options as option (option)}
            <span class="py-1.5 text-center text-sm text-neutral-900"
              >{option}</span
            >
          {/each}
        </span>
      </span>
    </div>
  {/snippet}

  {#snippet modeSwitch()}
    {@const index = modes.indexOf(mode)}
    <span class="relative grid grid-cols-2 rounded border border-neutral-700">
      {#each modes as option (option)}
        <button
          type="button"
          class="cursor-pointer px-2 text-xs leading-4 text-neutral-400 hover:text-neutral-100"
          onclick={() => (mode = option)}
        >
          {option}
        </button>
      {/each}

      <span
        aria-hidden="true"
        class="pointer-events-none absolute inset-0 w-1/2 overflow-hidden rounded-sm bg-neutral-100 transition-transform duration-200 ease-out"
        style="transform: translateX({index * 100}%)"
      >
        <span
          class="absolute top-0 left-0 grid w-[200%] grid-cols-2 transition-transform duration-200 ease-out"
          style="transform: translateX(-{(index * 100) / modes.length}%)"
        >
          {#each modes as option (option)}
            <span class="px-2 text-center text-xs leading-4 text-neutral-900"
              >{option}</span
            >
          {/each}
        </span>
      </span>
    </span>
  {/snippet}

  <div class="grid w-full max-w-xl grid-cols-1 gap-4 xs:grid-cols-2">
    <div class="flex flex-col gap-2">
      <span class="flex items-center justify-between text-sm text-neutral-400">
        <span class="flex items-center gap-1.5">
          Window
          {@render info("The length of each chunk.", "start", [
            ["Tempo", "Autodetected BPM w/ beat division."],
            ["Samples", "Fixed sample length."]
          ])}
        </span>
        {@render modeSwitch()}
      </span>

      {#if mode === "Tempo"}
        <div class="grid grid-cols-2 gap-4">
          <label class="flex flex-col gap-1">
            <input
              type="number"
              min="20"
              max="300"
              step="1"
              value={bpm}
              oninput={onBpm}
              class={entry}
            />
            <span class="flex items-center gap-1.5 text-xs text-neutral-500">
              BPM
              {@render info(
                "The tempo used to size the chunks, detected from the file on load; enter a corrected value if necessary.",
                "start"
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
                "How much musical time each chunk covers, assuming a 4/4 time signature.",
                "end"
              )}
            </span>
          </label>
        </div>
      {:else}
        <input
          type="number"
          min="256"
          step="1"
          value={windowSize}
          oninput={onWindow}
          aria-label="Window"
          class={entry}
        />
      {/if}
    </div>

    <div class="flex flex-col gap-2">
      <span class="flex items-center gap-1.5 text-sm text-neutral-400">
        Target
        {@render info("How each chunk is sorted.", "split", [
          ["Amplitude", "Determines loudness from the chunk's sample values."],
          [
            "Frequency",
            "Determines brightness from a FFT of the chunk's spectrum."
          ]
        ])}
      </span>
      {@render choices(
        targets,
        target,
        (value) => (target = value as typeof target)
      )}
    </div>

    <div class="flex flex-col gap-2">
      <span class="flex items-center gap-1.5 text-sm text-neutral-400">
        Measure
        {@render info(
          "How a chunk is reduced to one number for comparison.",
          "start",
          [
            [
              "Mean",
              "Mean average of the chunk. Level for Amplitude, spectral centroid for Frequency."
            ],
            [
              "Peak",
              "Peak value for the chunk. Loudest sample for Amplitude, loudest bin for frequency."
            ],
            [
              "RMS",
              "Root Mean Square for the chunk. Weights louder parts more heavily than Mean."
            ]
          ]
        )}
      </span>
      {@render choices(
        measures,
        measure,
        (value) => (measure = value as typeof measure)
      )}
    </div>

    <div class="flex flex-col gap-2">
      <span class="flex items-center gap-1.5 text-sm text-neutral-400">
        Direction
        {@render info("Which end the sort starts from.", "split", [
          [
            "Ascending",
            "Lowest scores first. Quietest amplitude or darkest frequency."
          ],
          [
            "Descending",
            "Highest scores first. Loudest amplitude or brightest frequency."
          ]
        ])}
      </span>
      {@render choices(
        directions,
        direction,
        (value) => (direction = value as typeof direction)
      )}
    </div>
  </div>

  {#if sorted}
    <Waveform
      file={sorted.blob}
      buffer={sorted.buffer}
      order={sorted.order}
      windowSize={samples}
      name={filename}
      download
    />
  {/if}

  <footer
    class="mt-auto flex flex-wrap items-center gap-2 pt-8 text-sm text-neutral-500"
  >
    <span>&copy; 2026 Valerie Kaiser</span>
    <span class="select-none">&middot;</span>
    <span>v{version}</span>
    <span class="select-none">&middot;</span>
    <a
      href="https://github.com/V-A-Kaiser/AudioSort"
      target="_blank"
      rel="noreferrer"
      aria-label="Source on GitHub"
      class="transition-colors hover:text-neutral-300"
    >
      <svg
        viewBox="0 0 16 16"
        width="16"
        height="16"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
        />
      </svg>
    </a>
    <span class="select-none">&middot;</span>
    <button
      type="button"
      aria-label="About AudioSort"
      onclick={() => about?.showModal()}
      class="cursor-pointer transition-colors hover:text-neutral-300"
    >
      <Info size={18} />
    </button>
  </footer>

  <dialog
    bind:this={about}
    onclick={(event) => {
      if (event.target === about) about?.close();
    }}
    class="m-auto w-[min(28rem,calc(100vw-2rem))] scale-95 rounded-xl border border-neutral-700 bg-neutral-950 p-0 text-neutral-300 opacity-0 transition-all transition-discrete duration-200 ease-out backdrop:bg-neutral-950/0 backdrop:transition-all backdrop:transition-discrete backdrop:duration-200 open:scale-100 open:opacity-100 open:backdrop:bg-neutral-950/70 motion-reduce:transition-none motion-reduce:backdrop:transition-none starting:open:scale-95 starting:open:opacity-0 starting:open:backdrop:bg-neutral-950/0"
  >
    <div class="flex flex-col gap-3 p-5 text-sm">
      <div class="flex flex-col">
        <h2 class="text-lg font-thin text-neutral-50">About AudioSort</h2>
        <p class="text-xs text-neutral-500">v{version}</p>
      </div>

      <p class="leading-relaxed">
        AudioSort is a concatenative synthesis audio sorting tool. It slices an
        audio file into chunks, reduces each chunk to a single value for
        comparison, sorts the chunks, and then stitches everything back
        together.
      </p>
      <p class="leading-relaxed">
        AudioSort was inspired in part by a concatenative synthesis plugin
        called SKataRT.
      </p>

      <a
        href="https://forum.ircam.fr/projects/detail/skatart/"
        class="hover:text-red-400 hover:underline"
      >
        https://forum.ircam.fr/projects/detail/skatart/
      </a>
    </div>
  </dialog>
</main>
