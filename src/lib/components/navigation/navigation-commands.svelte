<!-- Global palette commands owned by navigation (search, my issues tabs, views). Renders nothing. -->
<script lang="ts">
  import { goto } from '$app/navigation';

  import { m } from '@/lib/i18n';
  import { registerPaletteCommands } from '@/lib/svelte/palette-commands.svelte';

  $effect(() =>
    registerPaletteCommands([
      {
        id: 'search-issues',
        label: m.editor_nav_cmd_search(),
        section: m.editor_palette_section_navigation(),
        keywords: ['find', 'full text', 'comments'],
        run: () => void goto('/dashboard/search'),
      },
      {
        id: 'my-issues-created',
        label: m.editor_nav_cmd_created(),
        section: m.editor_palette_section_navigation(),
        keywords: ['my issues', 'created'],
        run: () => void goto('/dashboard/my-issues?tab=created'),
      },
      {
        id: 'my-issues-subscribed',
        label: m.editor_nav_cmd_subscribed(),
        section: m.editor_palette_section_navigation(),
        keywords: ['my issues', 'subscribed', 'following'],
        run: () => void goto('/dashboard/my-issues?tab=subscribed'),
      },
    ]),
  );
</script>
