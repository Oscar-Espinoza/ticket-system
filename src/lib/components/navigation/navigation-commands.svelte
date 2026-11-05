<!-- Global palette commands owned by navigation (search, my issues tabs, views).
     Port of src/components/navigation/navigation-commands.tsx. Renders nothing. -->
<script lang="ts">
  import { goto } from '$app/navigation';

  import { registerPaletteCommands } from '@/lib/svelte/palette-commands.svelte';

  $effect(() =>
    registerPaletteCommands([
      {
        id: 'search-issues',
        label: 'Search issues…',
        section: 'Navigation',
        keywords: ['find', 'full text', 'comments'],
        run: () => void goto('/dashboard/search'),
      },
      {
        id: 'my-issues-created',
        label: 'Issues I created',
        section: 'Navigation',
        keywords: ['my issues', 'created'],
        run: () => void goto('/dashboard/my-issues?tab=created'),
      },
      {
        id: 'my-issues-subscribed',
        label: 'Issues I’m subscribed to',
        section: 'Navigation',
        keywords: ['my issues', 'subscribed', 'following'],
        run: () => void goto('/dashboard/my-issues?tab=subscribed'),
      },
    ]),
  );
</script>
