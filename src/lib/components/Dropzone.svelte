<script lang="ts">
  import { droppable } from "$lib/droppable";

  let { onfile }: { onfile: (file: File) => void } = $props();

  let empty = $state(false);

  const take = (dropped: File | null) => {
    empty = !dropped;
    if (dropped) onfile(dropped);
  };
</script>

<label
  use:droppable={take}
  class="flex w-full max-w-xl cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-neutral-700 bg-neutral-900/50 px-8 py-16 text-center transition-colors focus-within:border-neutral-400 hover:border-neutral-500 hover:bg-neutral-900 data-dragging:border-neutral-400 data-dragging:bg-neutral-800"
>
  <input
    type="file"
    accept="audio/*"
    class="sr-only"
    onchange={(event) => take(event.currentTarget.files?.[0] ?? null)}
  />

  <div class="pointer-events-none flex flex-col gap-2">
    {#if empty}
      <p class="text-lg text-red-400">That drag carried no file.</p>
    {:else}
      <p class="text-lg text-neutral-300">Drop audio file here.</p>
      <p class="text-sm text-neutral-500">Click to browse.</p>
    {/if}
  </div>
</label>
