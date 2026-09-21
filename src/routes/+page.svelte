<script lang="ts">
  import Controls from "$lib/components/Controls.svelte";
  import Dropzone from "$lib/components/Dropzone.svelte";
  import Footer from "$lib/components/Footer.svelte";
  import Title from "$lib/components/Title.svelte";
  import Waveform from "$lib/components/Waveform.svelte";
  import { droppable } from "$lib/droppable";
  import { Sorter } from "$lib/sorter.svelte";

  const sorter = new Sorter();

  const describe = $derived.by(() => {
    const sorted = sorter.sorted;
    if (!sorted) return null;

    return (chunk: number) =>
      sorted.target === "Frequency"
        ? `${sorted.measure} Frequency: ${Math.round(sorted.scores[chunk])} Hz`
        : `${sorted.measure} Amplitude: ${sorted.scores[chunk].toFixed(3)}`;
  });

  const slices = $derived(
    sorter.sorted
      ? Array.from({ length: sorter.sorted.total }, (_, index) => index)
      : null
  );
</script>

<main class="flex min-h-screen flex-col items-center gap-4 p-4">
  <Title name="AudioSort" />

  <div class="group relative cursor-help">
    <h2 class="font-thin text-neutral-300">
      "It's <em class="font-normal">sort</em>a good!"
    </h2>
    <h3 class="text-xs font-thin italic">
      — Johann Carl Friedrich Gauss, Progenitor of FFT, 1805
    </h3>

    <span
      class="tooltip top-full left-1/2 mt-2 -translate-x-1/2 group-hover:opacity-100"
    >
      ...not a real quote, yet.
    </span>
  </div>

  {#if sorter.file}
    <div
      use:droppable={sorter.take}
      class="flex w-full max-w-xl flex-col gap-3 rounded-xl outline-2 outline-offset-8 outline-transparent transition-colors outline-dashed data-dragging:bg-neutral-800 data-dragging:outline-neutral-400"
    >
      <Waveform
        file={sorter.file}
        audio={sorter.source}
        name={sorter.file.name}
        order={slices}
        spans={sorter.sorted?.edges}
        {describe}
        slicing
      />
    </div>
  {:else}
    <Dropzone onfile={sorter.take} notice={sorter.notice} />
  {/if}

  <Controls {sorter} />

  {#if sorter.sorted}
    <Waveform
      file={sorter.sorted.blob}
      audio={sorter.sorted.audio}
      order={sorter.sorted.order}
      total={sorter.sorted.total}
      {describe}
      spans={sorter.sorted.spans}
      name={sorter.sorted.filename}
      download
    />
  {/if}

  <Footer />
</main>
