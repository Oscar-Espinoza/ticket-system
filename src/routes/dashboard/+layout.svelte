<!--
  Dashboard frame: AppShell with the topbar chrome and the user menu. The guard
  and the shell data are in +layout.server.ts. Also the dashboard's navigation
  indicator: a progress bar, and the dashboard skeleton.
-->
<script lang="ts">
  import AppShell from '@/lib/components/app-shell/app-shell.svelte';
  import DashboardLoading from '@/lib/components/app-shell/dashboard-loading.svelte';
  import { useNavigationLoading } from '@/lib/components/app-shell/navigation-loading.svelte';
  import NavigationProgress from '@/lib/components/app-shell/navigation-progress.svelte';
  import TopbarChrome from '@/lib/components/topbar-chrome.svelte';
  import UserMenu from '@/lib/components/user-menu.svelte';
  import VerifyEmailBanner from '@/lib/components/auth/verify-email-banner.svelte';
  import type { LayoutProps } from './$types';

  let { data, children }: LayoutProps = $props();

  const loading = useNavigationLoading();
  const topbarProjects = $derived(data.projects.map((p) => ({ id: p.id, name: p.name })));
</script>

<NavigationProgress active={loading.active} />

<AppShell
  user={data.user}
  projects={data.projects}
  favorites={data.favorites}
  workspaces={data.workspaces}
  inboxCount={data.inboxCount}
>
  {#snippet topbarRight()}
    <TopbarChrome projects={topbarProjects} />
  {/snippet}
  {#snippet sidebarFooter()}
    <UserMenu user={data.user} />
  {/snippet}
  {#if loading.dashboard}
    <DashboardLoading />
  {/if}
  <!-- Kept mounted (hidden) while the skeleton shows, so a cancelled navigation loses nothing. -->
  <div class={loading.dashboard ? 'hidden' : 'contents'}>
    {#if data.unverifiedEmail}
      <VerifyEmailBanner email={data.unverifiedEmail} />
    {/if}
    {@render children()}
  </div>
</AppShell>
