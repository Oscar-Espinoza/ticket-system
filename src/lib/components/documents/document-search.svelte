<!-- Docs search box kept in `?q=`. -->
<script lang="ts">
  import { untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import Search from '@lucide/svelte/icons/search';

  import { createDebouncer } from '@/lib/svelte/debounce';

  let { initial }: { initial: string } = $props();

  // useState(initial): the first value only.
  let value = $state(untrack(() => initial));
  const debounce = createDebouncer();

  $effect(() => debounce.cancel);

  function push(next: string) {
    const q = next.trim();
    const pathname = page.url.pathname;
    // Same history entry, scroll and focus kept.
    void goto(q ? `${pathname}?q=${encodeURIComponent(q)}` : pathname, { replace: true, reset: false });
  }
</script>

<label class="relative flex items-center">
  <Search class="pointer-events-none absolute left-2 size-3.5 text-muted-foreground" aria-hidden="true" />
  <input
    type="search"
    {value}
    placeholder="Search docs…"
    aria-label="Search documents"
    oninput={(e) => {
      const next = e.currentTarget.value;
      value = next;
      debounce.schedule(() => push(next), 300);
    }}
    onkeydown={(e) => {
      if (e.key === 'Escape' && value) {
        e.preventDefault();
        value = '';
        push('');
      }
    }}
    class="h-7 w-48 rounded-md border border-input bg-transparent pr-2 pl-7 text-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-input/30"
  />
</label>
