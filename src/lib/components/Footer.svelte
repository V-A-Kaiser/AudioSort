<script lang="ts">
  import Info from "@lucide/svelte/icons/info";
  import { version } from "../../../package.json";

  let about = $state<HTMLDialogElement | null>(null);
</script>

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
      comparison, sorts the chunks, and then stitches everything back together.
    </p>
    <p class="leading-relaxed">
      AudioSort was inspired in part by a concatenative synthesis plugin called
      SKataRT.
    </p>

    <a
      href="https://forum.ircam.fr/projects/detail/skatart/"
      target="_blank"
      rel="noreferrer"
      class="hover:text-red-400 hover:underline"
    >
      https://forum.ircam.fr/projects/detail/skatart/
    </a>
  </div>
</dialog>
