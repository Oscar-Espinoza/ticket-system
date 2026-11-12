<script lang="ts">
  // Small stroke icons (16px grid). Decorative: the control that holds one
  // carries the accessible name.
  type Name = 'chevron-right' | 'chevron-down' | 'external' | 'expand' | 'collapse' | 'alert' | 'comment' | 'calendar' | 'clock' | 'user' | 'check' | 'bell' | 'folder' | 'wait';
  let { name, size = 14 }: { name: Name; size?: number } = $props();

  const PATHS: Record<Name, string> = {
    'chevron-right': 'M6 3.5 10.5 8 6 12.5',
    'chevron-down': 'M3.5 6 8 10.5 12.5 6',
    external: 'M9 3h4v4M13 3 7.5 8.5M11 9.5V12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h2.5',
    expand: 'M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5 9 7M2.5 13.5 7 9',
    collapse: 'M13.5 6.5h-4v-4M2.5 9.5h4v4M9.5 6.5 14 2M6.5 9.5 2 14',
    alert: 'M8 5v3.5M8 11h.01M8 1.8 14.5 13H1.5z',
    comment: 'M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z',
    calendar: 'M2.5 4.5h11v9h-11zM2.5 7.5h11M5.5 2.5v3M10.5 2.5v3',
    clock: 'M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM8 5v3.2l2 1.3',
    user: 'M8 8a2.7 2.7 0 1 0 0-5.4A2.7 2.7 0 0 0 8 8zM2.8 13.5c.5-2.4 2.5-3.7 5.2-3.7s4.7 1.3 5.2 3.7',
    check: 'm3.5 8.5 3 3 6-7',
    bell: 'M4 11.5V7a4 4 0 0 1 8 0v4.5l1 1H3zM6.5 14h3',
    folder: 'M2 4.5a1 1 0 0 1 1-1h3l1.5 1.5H13a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z',
    wait: 'M5 2.5h6M5 13.5h6M5.5 2.5c0 3 5 3.5 5 5.5s-5 2.5-5 5.5M10.5 2.5c0 3-5 3.5-5 5.5',
  };
</script>

<svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="shrink-0">
  <path d={PATHS[name]} />
</svg>
