<script lang="ts">
  import "./layout.css";

  let { children } = $props();
</script>

<svelte:head>
  <title>AudioSort | Concatenative Audio Sorting</title>
  <meta
    name="description"
    content="Concatenative audio sorting synthesis. Split an audio file into equal chunks and sort them to create new sonic textures."
  />
  <link rel="icon" href="/favicon.ico" sizes="any" />
</svelte:head>
<div class="min-h-screen bg-neutral-900 text-neutral-100">
  {@render children()}
</div>
