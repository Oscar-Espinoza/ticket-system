<!--
  Port of src/components/theme-provider.tsx (next-themes ThemeProvider with
  attribute="class", defaultTheme="dark", enableSystem). Rendered once by the
  root layout around the app; read and change the theme with useTheme() from
  '@/lib/svelte/theme.svelte'. ModeWatcher injects the pre-hydration script
  that sets .dark / color-scheme before first paint.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { ModeWatcher } from 'mode-watcher';

  import { THEME_WATCHER_OPTIONS } from '@/lib/svelte/theme.svelte';

  let { children }: { children?: Snippet } = $props();
</script>

<ModeWatcher
  defaultMode={THEME_WATCHER_OPTIONS.defaultMode}
  modeStorageKey={THEME_WATCHER_OPTIONS.modeStorageKey}
  darkClassNames={[...THEME_WATCHER_OPTIONS.darkClassNames]}
  lightClassNames={[...THEME_WATCHER_OPTIONS.lightClassNames]}
  track={THEME_WATCHER_OPTIONS.track}
  disableTransitions={THEME_WATCHER_OPTIONS.disableTransitions}
/>
{@render children?.()}
