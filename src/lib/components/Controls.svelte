<script lang="ts">
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import Info from "@lucide/svelte/icons/info";
  import Switch from "$lib/components/Switch.svelte";
  import { directions, measures, targets } from "$lib/sort";
  import { divisions, modes, type Sorter } from "$lib/sorter.svelte";

  let { sorter }: { sorter: Sorter } = $props();

  const base =
    "w-full rounded-lg border border-neutral-700 bg-neutral-900 py-2 text-sm text-neutral-100 transition-colors hover:border-neutral-500 focus:border-neutral-400 focus:outline-none";
  const entry = `${base} px-3`;
  const field = `${base} cursor-pointer appearance-none pr-9 pl-3`;
  const toggle =
    "relative block h-9.5 w-full rounded-lg border border-neutral-700 transition-colors duration-200 ease-out peer-focus-visible:border-neutral-400 after:absolute after:inset-y-0.5 after:left-0.5 after:w-[calc((100%-4px)/2)] after:rounded-md after:bg-neutral-600 after:transition after:duration-200 after:ease-out peer-checked:after:translate-x-full peer-checked:after:bg-neutral-100";

  const settle = (apply: (value: number) => void) => {
    let timer: ReturnType<typeof setTimeout>;
    return (event: Event & { currentTarget: HTMLInputElement }) => {
      const value = event.currentTarget.valueAsNumber;
      clearTimeout(timer);
      timer = setTimeout(() => apply(value), 400);
    };
  };

  const onWindow = settle((value) => (sorter.windowSize = value));
  const onBpm = settle((value) => (sorter.bpm = value));
  const onOffset = settle((value) => (sorter.offset = value));
</script>

{#snippet offset()}
  <label class="flex flex-col gap-1">
    <div class="relative">
      <input
        type="number"
        step="1"
        value={sorter.offset}
        oninput={onOffset}
        class="{entry} pr-9"
      />
      <span
        aria-hidden="true"
        class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-neutral-500"
        >ms</span
      >
    </div>
    <span class="flex items-center gap-1.5 text-xs text-neutral-500">
      Offset
      {@render info(
        "The amount to shift the slicing grid. Negative values shift the waveform forward.",
        "middle"
      )}
    </span>
  </label>
{/snippet}

{#snippet info(
  text: string,
  align: "start" | "middle" | "split",
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
      class="tooltip bottom-full mb-2 font-normal group-focus-within:opacity-100 group-hover:opacity-100 sm:w-64 {align ===
      'start'
        ? 'left-0'
        : align === 'middle'
          ? 'left-1/2 -translate-x-1/2'
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

<div class="grid w-full max-w-xl grid-cols-1 gap-4 xs:grid-cols-2">
  <div class="flex flex-col gap-2 xs:col-span-2">
    <span class="flex items-center justify-between text-sm text-neutral-400">
      <span class="flex items-center gap-1.5">
        Window
        {@render info("The length of each chunk.", "start", [
          ["Tempo", "Autodetected BPM w/ beat division."],
          ["Samples", "Fixed sample length."]
        ])}
      </span>
      <Switch
        options={modes}
        bind:value={sorter.mode}
        label="Window mode"
        size="sm"
      />
    </span>

    {#if sorter.mode === "Tempo"}
      <div class="grid grid-cols-3 gap-4">
        <label class="flex flex-col gap-1">
          <input
            type="number"
            min="20"
            max="300"
            step="1"
            value={sorter.bpm}
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
            <select bind:value={sorter.division} class={field}>
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
              "middle"
            )}
          </span>
        </label>

        {@render offset()}
      </div>
    {:else}
      <div class="grid grid-cols-2 gap-4">
        <label class="flex flex-col gap-1">
          <input
            type="number"
            min="256"
            step="1"
            value={sorter.windowSize}
            oninput={onWindow}
            class={entry}
          />
          <span class="text-xs text-neutral-500">Samples</span>
        </label>

        {@render offset()}
      </div>
    {/if}
  </div>

  <div class="flex gap-4">
    <div class="flex flex-1 flex-col gap-2">
      <span class="flex items-center gap-1.5 text-sm text-neutral-400">
        <label for="remove-silence" class="cursor-pointer whitespace-nowrap"
          >Remove Silence</label
        >
        {@render info("Remove silent chunks from the sorted array.", "start")}
      </span>
      <label class="flex h-9.5 w-full cursor-pointer items-center">
        <input
          id="remove-silence"
          type="checkbox"
          role="switch"
          bind:checked={sorter.dropSilence}
          class="peer sr-only"
        />
        <span aria-hidden="true" class={toggle}></span>
      </label>
    </div>

    <div class="flex flex-1 flex-col gap-2">
      <span class="flex items-center gap-1.5 text-sm text-neutral-400">
        <label for="beat-slice" class="cursor-pointer whitespace-nowrap"
          >Beat Slice</label
        >
        {@render info(
          "Start chunk slicing at the first detected drum transient. Useful for slicing tracks with consistent rhythmic elements. Use the offset value to shift where the start occurs.",
          "start"
        )}
      </span>
      <label class="flex h-9.5 w-full cursor-pointer items-center">
        <input
          id="beat-slice"
          type="checkbox"
          role="switch"
          bind:checked={sorter.beatSlice}
          class="peer sr-only"
        />
        <span aria-hidden="true" class={toggle}></span>
      </label>
    </div>
  </div>

  <div class="flex flex-col gap-2">
    <span class="flex items-center gap-1.5 text-sm text-neutral-400">
      Measure
      {@render info(
        "How a chunk is reduced to one number for comparison.",
        "split",
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
    <Switch options={measures} bind:value={sorter.measure} label="Measure" />
  </div>

  <div class="flex flex-col gap-2">
    <span class="flex items-center gap-1.5 text-sm text-neutral-400">
      Target
      {@render info("How each chunk is sorted.", "start", [
        ["Amplitude", "Determines loudness from the chunk's sample values."],
        [
          "Frequency",
          "Determines brightness from a FFT of the chunk's spectrum."
        ]
      ])}
    </span>
    <Switch options={targets} bind:value={sorter.target} label="Target" />
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
    <Switch
      options={directions}
      bind:value={sorter.direction}
      label="Direction"
    />
  </div>
</div>
