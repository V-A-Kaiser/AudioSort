<script lang="ts">
  import "./layout.css";

  let { children } = $props();
</script>

<svelte:head><link rel="icon" href="/favicon.ico" sizes="any" /></svelte:head>
<div class="min-h-screen bg-neutral-900 text-neutral-100">
  {@render children()}
</div>
