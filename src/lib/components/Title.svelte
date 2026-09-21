<script lang="ts">
  let { name }: { name: string } = $props();

  const order = $derived(
    Array.from({ length: name.length }, (_, index) => index)
  );

  let letters: HTMLElement[] = [];
  let offsets = $state<number[]>([]);
  let gliding = $state(false);

  $effect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const identity = order;

    const shuffle = () =>
      identity
        .map((index) => ({ index, key: Math.random() }))
        .sort((a, b) => a.key - b.key)
        .map(({ index }) => index);

    const slide = (sequence: number[]) => {
      if (!letters[0]) return;

      const lefts = letters.map((letter) => letter.offsetLeft);
      const widths = letters.map((letter, index) =>
        index < letters.length - 1
          ? lefts[index + 1] - lefts[index]
          : letter.offsetWidth
      );

      let cursor = lefts[0];
      const next = identity.map(() => 0);
      for (const letter of sequence) {
        next[letter] = cursor - lefts[letter];
        cursor += widths[letter];
      }
      offsets = next;
    };

    let resting: ReturnType<typeof setTimeout>;

    const resolve = () => {
      slide(shuffle());
      resting = setTimeout(() => slide(identity), 1400);
    };

    slide(shuffle());

    const start = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        gliding = true;
        resolve();
      })
    );

    const loop = setInterval(() => {
      slide(shuffle());
      resting = setTimeout(resolve, 1400);
    }, 10000);

    return () => {
      cancelAnimationFrame(start);
      clearTimeout(resting);
      clearInterval(loop);
    };
  });
</script>

<h1
  aria-label={name}
  class="inline-flex text-6xl font-thin tracking-tight text-neutral-50 sm:text-7xl"
>
  {#each [...name] as character, index (index)}
    <span
      bind:this={letters[index]}
      aria-hidden="true"
      class="inline-block will-change-transform {gliding
        ? 'transition-transform duration-700 ease-in-out'
        : ''}"
      style="transform: translateX({offsets[index] ?? 0}px)"
    >
      {character}
    </span>
  {/each}
</h1>
