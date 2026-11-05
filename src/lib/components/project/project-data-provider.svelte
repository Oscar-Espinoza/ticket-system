<!-- <ProjectDataProvider value={data}> — see project-data.svelte.ts for the API. -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  import type { ProjectData } from '@/lib/project-data-types';
  import { setProjectDataContext } from './project-data.svelte';

  let { value, children }: { value: ProjectData; children?: Snippet } = $props();

  setProjectDataContext(() => value);
</script>

{@render children?.()}
