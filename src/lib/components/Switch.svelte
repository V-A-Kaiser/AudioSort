<script lang="ts" generics="T extends string">
  let {
    options,
    value = $bindable(),
    label,
    size = "md"
  }: {
    options: readonly T[];
    value: T;
    label: string;
    size?: "sm" | "md";
  } = $props();

  const small = $derived(size === "sm");
  const index = $derived(options.indexOf(value));
  const columns = $derived(`repeat(${options.length}, minmax(0, 1fr))`);
  const text = $derived(small ? "px-2 text-xs leading-4" : "py-1.5 text-sm");
</script>

<span
  role="radiogroup"
  aria-label={label}
  class="relative grid border border-neutral-700 {small
    ? 'rounded'
    : 'rounded-lg p-0.5'}"
  style="grid-template-columns: {columns}"
>
  {#each options as option (option)}
    <button
      type="button"
      role="radio"
      aria-checked={option === value}
      class="cursor-pointer text-neutral-400 hover:text-neutral-100 {text} {small
        ? ''
        : 'rounded-md'}"
      onclick={() => (value = option)}
    >
      {option}
    </button>
  {/each}

  <span
    aria-hidden="true"
    class="pointer-events-none absolute overflow-hidden bg-neutral-100 transition-transform duration-200 ease-out {small
      ? 'inset-0 rounded-sm'
      : 'inset-0.5 rounded-md'}"
    style="width: calc((100% - {small
      ? 0
      : 4}px) / {options.length}); transform: translateX({index * 100}%)"
  >
    <span
      class="absolute top-0 left-0 grid transition-transform duration-200 ease-out"
      style="width: {options.length *
        100}%; grid-template-columns: {columns}; transform: translateX(-{(index *
        100) /
        options.length}%)"
    >
      {#each options as option (option)}
        <span class="text-center text-neutral-900 {text}">{option}</span>
      {/each}
    </span>
  </span>
</span>
