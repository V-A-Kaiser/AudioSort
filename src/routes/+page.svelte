<script lang="ts">
  import Dropzone from "$lib/components/Dropzone.svelte";
  import Waveform from "$lib/components/Waveform.svelte";
  import X from "@lucide/svelte/icons/x";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import { sortChunks, toWav } from "$lib/sort";

  const windows = Array.from({ length: 7 }, (_, index) => 2 ** (index + 10));
  const targets = ["Amplitude", "Frequency"] as const;

  const field =
    "w-full cursor-pointer appearance-none rounded-lg border border-neutral-700 bg-neutral-900 py-2 pr-9 pl-3 text-sm text-neutral-100 transition-colors hover:border-neutral-500 focus:border-neutral-400 focus:outline-none";

  let file = $state<File | null>(null);
  let windowSize = $state(1024);
  let target = $state<(typeof targets)[number]>("Amplitude");
  let sorted = $state<Blob | null>(null);
  let order = $state<number[] | null>(null);
  let sorting = $state(false);

  $effect(() => {
    const source = file;
    const size = windowSize;
    const measure = target;

    if (!source) {
      sorted = null;
      order = null;
      return;
    }

    let stale = false;
    sorting = true;

    void (async () => {
      const context = new AudioContext();
      try {
        const decoded = await context.decodeAudioData(await source.arrayBuffer());
        const result = sortChunks(decoded, size, measure);
        if (!stale) {
          sorted = toWav(result.buffer);
          order = result.order;
        }
      } catch {
        if (!stale) {
          sorted = null;
          order = null;
        }
      } finally {
        void context.close();
        if (!stale) sorting = false;
      }
    })();

    return () => {
      stale = true;
    };
  });
</script>

<main class="flex min-h-screen flex-col items-center gap-10 px-6 pt-24">
  <h1 class="text-6xl font-thin tracking-tight text-neutral-50 sm:text-7xl">AudioSort</h1>

  {#if file}
    <div class="flex w-full max-w-xl flex-col gap-3">
      <div class="flex items-center gap-3">
        <p class="truncate text-lg text-neutral-200">{file.name}</p>
        <button
          type="button"
          aria-label="Clear file"
          class="ml-auto flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-neutral-700 text-neutral-400 transition-colors hover:border-neutral-500 hover:text-neutral-100"
          onclick={() => (file = null)}
        >
          <X size={16} />
        </button>
      </div>

      <Waveform {file} />
    </div>
  {:else}
    <Dropzone onfile={(dropped) => (file = dropped)} />
  {/if}

  <div class="flex w-full max-w-xl gap-4">
    <label class="flex flex-1 flex-col gap-2">
      <span class="text-sm text-neutral-400">Window</span>
      <div class="relative">
        <select bind:value={windowSize} class={field}>
          {#each windows as size (size)}
            <option value={size}>{size}</option>
          {/each}
        </select>
        <ChevronDown
          size={16}
          class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-neutral-500"
        />
      </div>
    </label>

    <label class="flex flex-1 flex-col gap-2">
      <span class="text-sm text-neutral-400">Target</span>
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
  </div>

  {#if sorted}
    <Waveform file={sorted} {order} />
  {:else if sorting}
    <p class="text-sm text-neutral-500">[TODO]</p>
  {/if}
</main>
