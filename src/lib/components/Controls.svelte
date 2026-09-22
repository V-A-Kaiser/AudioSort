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
  const field = `${base} cursor-pointer appearance-none pr-6 pl-3`;
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

  type Unit = "ms" | "smp";

  let unit = $state<Unit>("ms");
  let offsetUnit = $state<Unit>("ms");
  let minimumUnit = $state<Unit>("ms");
  const rate = $derived(sorter.decoded?.sampleRate ?? 44100);

  const onWindow = settle(
    (value) =>
      (sorter.windowTime = unit === "ms" ? value : (value * 1000) / rate)
  );
  const onBpm = settle((value) => {
    if (value > 0) sorter.bpm = value;
  });
  const onSensitivity = settle((value) => (sorter.sensitivity = value));
  const onMinimum = settle(
    (value) =>
      (sorter.minimumTime =
        minimumUnit === "ms" ? value : (value * 1000) / rate)
  );
  const onOffset = settle(
    (value) =>
      (sorter.offset = offsetUnit === "ms" ? value : (value * 1000) / rate)
  );
</script>

{#snippet offset()}
  <div class="flex flex-col gap-1">
    <div class="relative">
      <input
        type="number"
        aria-label="Offset"
        step={offsetUnit === "ms" ? "0.1" : "1"}
        value={offsetUnit === "ms"
          ? Math.round(sorter.offset * 10) / 10
          : Math.round((sorter.offset * rate) / 1000)}
        oninput={onOffset}
        class="{entry} pr-10"
      />
      {@render units("Offset unit", offsetUnit, (next) => (offsetUnit = next))}
    </div>
    <span class="flex items-center gap-1.5 text-xs text-neutral-500">
      Offset
      {@render info(
        "The amount to shift the slicing grid. Negative values shift the waveform forward.",
        "middle"
      )}
    </span>
  </div>
{/snippet}

{#snippet units(label: string, current: Unit, choose: (next: Unit) => void)}
  <span
    role="radiogroup"
    aria-label={label}
    class="absolute inset-y-1 right-1 flex w-8 flex-col gap-0.5"
  >
    {#each ["ms", "smp"] as const as option (option)}
      <button
        type="button"
        role="radio"
        aria-checked={current === option}
        onclick={() => choose(option)}
        class="flex-1 cursor-pointer rounded text-[10px] leading-none transition-colors {current ===
        option
          ? 'bg-neutral-100 text-neutral-900'
          : 'text-neutral-500 hover:text-neutral-100'}"
      >
        {option}
      </button>
    {/each}
  </span>
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
          [
            "Tempo",
            "Autodetected BPM w/ beat division. Chunks are isochronous."
          ],
          [
            "Time",
            "Fixed sample/ms time length chunks. Chunks are isochronous."
          ],
          [
            "Transient",
            "Transient detection auto-slicing. Chunks are asynchronous."
          ]
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
        <div class="flex flex-col gap-1">
          <input
            type="number"
            aria-label="BPM"
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
        </div>

        <div class="flex flex-col gap-1">
          <div class="relative">
            <select
              bind:value={sorter.division}
              aria-label="Division"
              class="peer {field}"
            >
              {#each divisions as option (option.label)}
                <option value={option}>{option.label}</option>
              {/each}
            </select>
            <ChevronDown
              size={16}
              class="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 text-neutral-700 transition-colors peer-hover:text-neutral-500 peer-focus:text-neutral-400"
            />
          </div>
          <span class="flex items-center gap-1.5 text-xs text-neutral-500">
            Division
            {@render info(
              "How much musical time each chunk covers, assuming a 4/4 time signature.",
              "middle"
            )}
          </span>
        </div>

        {@render offset()}
      </div>
    {:else if sorter.mode === "Transient"}
      <div class="grid grid-cols-3 gap-4">
        <div class="flex flex-col gap-1">
          <div class="relative">
            <input
              type="number"
              aria-label="Sensitivity"
              min="0"
              max="100"
              step="1"
              value={sorter.sensitivity}
              oninput={onSensitivity}
              class="{entry} pr-9"
            />
            <span
              aria-hidden="true"
              class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-neutral-500"
              >%</span
            >
          </div>
          <span class="flex items-center gap-1.5 text-xs text-neutral-500">
            Sensitivity
            {@render info(
              "How strong a transient's attack must be to create a slice. Higher sensitivity creates more chunks.",
              "start"
            )}
          </span>
        </div>

        <div class="flex flex-col gap-1">
          <div class="relative">
            <input
              type="number"
              aria-label="Minimum length"
              min={minimumUnit === "ms"
                ? Math.ceil((256 / rate) * 10000) / 10
                : 256}
              step={minimumUnit === "ms" ? "0.1" : "1"}
              value={minimumUnit === "ms"
                ? Math.round(sorter.minimumTime * 10) / 10
                : Math.round((sorter.minimumTime * rate) / 1000)}
              oninput={onMinimum}
              class="{entry} pr-10"
            />
            {@render units(
              "Minimum length unit",
              minimumUnit,
              (next) => (minimumUnit = next)
            )}
          </div>
          <span class="flex items-center gap-1.5 text-xs text-neutral-500">
            Minimum Length
            {@render info(
              "The minimum length of a chunk created through transient slicing.",
              "middle"
            )}
          </span>
        </div>

        {@render offset()}
      </div>
    {:else}
      <div class="grid grid-cols-2 gap-4">
        <div class="flex flex-col gap-1">
          <div class="relative">
            <input
              type="number"
              aria-label="Window time"
              min={unit === "ms" ? Math.ceil((256 / rate) * 10000) / 10 : 256}
              step={unit === "ms" ? "0.1" : "1"}
              value={unit === "ms"
                ? Math.round(sorter.windowTime * 10) / 10
                : Math.round((sorter.windowTime * rate) / 1000)}
              oninput={onWindow}
              class="{entry} pr-10"
            />
            {@render units("Time unit", unit, (next) => (unit = next))}
          </div>
        </div>

        {@render offset()}
      </div>
    {/if}
  </div>

  <div class="flex gap-4">
    <div class="flex flex-1 flex-col gap-2">
      <span class="flex items-center gap-1.5 text-sm text-neutral-400">
        <span id="remove-silence" class="whitespace-nowrap">Remove Silence</span
        >
        {@render info("Remove silent chunks from the sorted array.", "start")}
      </span>
      <label class="flex h-9.5 w-full cursor-pointer items-center">
        <input
          aria-labelledby="remove-silence"
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
        <span id="beat-slice" class="whitespace-nowrap">Beat Slice</span>
        {@render info(
          "Start chunk slicing at the first detected transient. Useful for slicing tracks with consistent rhythmic elements. Use the offset value to shift where the start occurs. Not utilized in transient slicing mode.",
          "start"
        )}
      </span>
      <label
        class="flex h-9.5 w-full cursor-pointer items-center has-disabled:cursor-not-allowed has-disabled:opacity-50"
      >
        <input
          aria-labelledby="beat-slice"
          type="checkbox"
          role="switch"
          disabled={sorter.mode === "Transient"}
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
