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
</script>

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
      class="tooltip bottom-full mb-2 font-normal group-focus-within:opacity-100 group-hover:opacity-100 sm:w-64 {align ===
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
      <Switch
        options={modes}
        bind:value={sorter.mode}
        label="Window mode"
        size="sm"
      />
    </span>

    {#if sorter.mode === "Tempo"}
      <div class="grid grid-cols-2 gap-4">
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
        value={sorter.windowSize}
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
    <Switch options={targets} bind:value={sorter.target} label="Target" />
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
    <Switch options={measures} bind:value={sorter.measure} label="Measure" />
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
