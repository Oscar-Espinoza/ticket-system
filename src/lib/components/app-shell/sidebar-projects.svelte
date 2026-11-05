<!-- "Your projects" sidebar section (port of src/components/app-shell/sidebar-projects.tsx). -->
<script module lang="ts">
  export interface SidebarProject {
    id: string;
    name: string;
    ticketKey: string;
    /** Parent team (sub-teams, D4a); nested under it when the viewer has both. */
    parentId?: string | null;
  }
</script>

<script lang="ts">
  import SidebarProjectItem, { MAX_DEPTH } from './sidebar-project-item.svelte';
  import SidebarSection from './sidebar-section.svelte';

  let { projects }: { projects: SidebarProject[] } = $props();

  const tree = $derived.by(() => {
    // Sub-teams nest under a parent the viewer also sees; otherwise top level.
    const ids = new Set(projects.map((p) => p.id));
    const childrenOf = new Map<string, SidebarProject[]>();
    const roots: SidebarProject[] = [];
    for (const project of projects) {
      const parentId = project.parentId;
      if (parentId && parentId !== project.id && ids.has(parentId)) {
        const list = childrenOf.get(parentId);
        if (list) list.push(project);
        else childrenOf.set(parentId, [project]);
      } else {
        roots.push(project);
      }
    }
    // Anything not reachable from a root (a parent cycle, or deeper than
    // MAX_DEPTH) is listed at the top level instead of disappearing.
    const reached = new Set<string>();
    const walk = (list: SidebarProject[], depth: number) => {
      for (const project of list) {
        reached.add(project.id);
        if (depth < MAX_DEPTH) walk(childrenOf.get(project.id) ?? [], depth + 1);
      }
    };
    walk(roots, 0);
    const top = [...roots, ...projects.filter((p) => !reached.has(p.id))];
    return { top, nested: childrenOf };
  });
</script>

<SidebarSection>
  {#snippet title()}
    <a
      href="/dashboard"
      class="rounded outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      Your projects
    </a>
  {/snippet}
  {#if projects.length === 0}
    <p class="px-2 py-1 text-xs text-muted-foreground">No projects yet.</p>
  {:else}
    {#each tree.top as project (project.id)}
      <SidebarProjectItem {project} childrenOf={tree.nested} />
    {/each}
  {/if}
</SidebarSection>
