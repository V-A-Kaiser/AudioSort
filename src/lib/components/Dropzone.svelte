<script lang="ts">
  let { onfile }: { onfile: (file: File) => void } = $props();

  let dragging = $state(false);
  let empty = $state(false);

  const take = (list: FileList | null | undefined) => {
    empty = !list?.length;
    if (list?.length) onfile(list[0]);
    dragging = false;
  };

  const hover = (event: DragEvent) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    dragging = true;
  };
</script>

<label
  class="flex w-full max-w-xl cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-8 py-16 text-center transition-colors focus-within:border-neutral-400 {dragging
    ? 'border-neutral-400 bg-neutral-800'
    : 'border-neutral-700 bg-neutral-900/50 hover:border-neutral-500 hover:bg-neutral-900'}"
  ondragenter={hover}
  ondragover={hover}
  ondragleave={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) dragging = false;
  }}
  ondrop={(event) => {
    event.preventDefault();
    take(event.dataTransfer?.files);
  }}
>
  <input
    type="file"
    accept="audio/*"
    class="sr-only"
    onchange={(event) => take(event.currentTarget.files)}
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
