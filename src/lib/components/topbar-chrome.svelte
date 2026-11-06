<!--
  Topbar right side: palette trigger, the command palette, the `?` overlay, the
  palette-owned create-project dialog and the global shortcuts (⌘K, /, ?, g…, c).
 The app-wide <Toaster> lives in the
  root layout (src/routes/+layout.svelte), so it is not rendered here.
-->
<script module lang="ts">
  export interface TopbarProject {
    id: string;
    name: string;
  }

  // Linear-style "g then x" navigation. Second keys and their destinations.
  const GO_TO: { key: string; label: string; href: string }[] = [
    { key: 'i', label: 'Inbox', href: '/dashboard/inbox' },
    { key: 'm', label: 'My issues', href: '/dashboard/my-issues' },
    { key: 'v', label: 'Views', href: '/dashboard/views' },
    { key: 'd', label: 'Drafts', href: '/dashboard/drafts' },
    { key: 's', label: 'Settings', href: '/dashboard/settings' },
    { key: 'p', label: 'Projects', href: '/dashboard' },
  ];
  const SEQUENCE_MS = 1000;

  const PROJECT_GO_TO = [
    { segment: '', label: 'Issues' },
    { segment: 'triage', label: 'Triage' },
    { segment: 'cycles', label: 'Cycles' },
    { segment: 'epics', label: 'Epics' },
    { segment: 'settings/members', label: 'Members' },
    { segment: 'settings', label: 'Settings' },
  ];
</script>

<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import SearchIcon from '@lucide/svelte/icons/search';
  import { createSubscriber } from 'svelte/reactivity';

  import { projectHref } from '@/lib/components/app-shell/routes';
  import {
    CREATE_PARAM,
    hasIssueCreator,
    subscribeIssueCreator,
  } from '@/lib/components/productivity/new-issue-bus.svelte';
  import CommandPalette from '@/lib/components/command-palette/command-palette.svelte';
  import CreateProjectDialog from '@/lib/components/create-project-dialog.svelte';
  import HotkeyOverlay from '@/lib/components/hotkey-overlay.svelte';
  import { Button } from '@/lib/components/ui/button';
  import { registerHotkeys } from '@/lib/svelte/hotkeys.svelte';
  import { isAppHydrated, markAppHydrated } from '@/lib/svelte/hydration';
  import type { PaletteCommand } from '@/lib/svelte/palette-commands.svelte';
  import { useTheme } from '@/lib/svelte/theme.svelte';
  import { useLogout } from '@/lib/svelte/use-logout.svelte';

  let { projects }: { projects: TopbarProject[] } = $props();

  const theme = useTheme();
  const logout = useLogout();

  let triggerRef = $state<HTMLElement | null>(null);
  let paletteOpenRef = false;
  let paletteOpen = $state(false);
  let overlayOpen = $state(false);
  let createOpen = $state(false);

  // Server values (isMac = false, no issue creator)
  // during SSR and hydration; the browser values from then on, so the kbd hint
  // flips ⌘K/CtrlK without a hydration mismatch.
  let hydrated = $state(isAppHydrated());
  $effect(() => {
    hydrated = true;
    markAppHydrated();
  });
  const isMac = $derived(hydrated && /Mac|iPhone|iPad/.test(navigator.userAgent));

  const trackIssueCreator = createSubscriber((update) => subscribeIssueCreator(update));
  const issueCreator = $derived.by(() => {
    if (!hydrated) return false;
    trackIssueCreator();
    return hasIssueCreator();
  });

  // CommandDialog has no DialogTrigger, so the dialog would restore focus to <body>.
  function handlePaletteOpenChange(next: boolean) {
    paletteOpenRef = next;
    paletteOpen = next;
    if (!next) {
      setTimeout(() => {
        // A command may have opened another dialog; it owns focus then.
        if (!document.querySelector('[role="dialog"][data-state="open"]')) {
          triggerRef?.focus();
        }
      }, 0);
    }
  }

  // `g` arms a one-shot capture listener: capture on window runs before the
  // registry's bubble listener, and preventDefault() makes the registry skip
  // the second key, so list-scoped single keys (e.g. `m`) don't also fire.
  $effect(() => {
    let disarm: (() => void) | null = null;
    const arm = () => {
      disarm?.();
      const timer = window.setTimeout(() => disarm?.(), SEQUENCE_MS);
      const onKey = (event: KeyboardEvent) => {
        if (['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) return;
        disarm?.();
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        const target = GO_TO.find((t) => t.key === event.key.toLowerCase());
        if (!target) return;
        event.preventDefault();
        event.stopPropagation();
        void goto(target.href);
      };
      window.addEventListener('keydown', onKey, { capture: true });
      disarm = () => {
        window.clearTimeout(timer);
        window.removeEventListener('keydown', onKey, { capture: true });
        disarm = null;
      };
    };
    const unregister = registerHotkeys([
      { key: 'g', description: 'Go to… (then a key below)', scope: 'Navigation', handler: arm },
      ...GO_TO.map((t) => ({
        key: `G ${t.key.toUpperCase()}`,
        description: `Go to ${t.label.toLowerCase()}`,
        scope: 'Navigation',
        passive: true,
      })),
    ]);
    return () => {
      disarm?.();
      unregister();
    };
  });

  // Registered once: handlers only touch plain refs and state setters.
  $effect(() =>
    registerHotkeys([
      {
        mod: true,
        key: 'k',
        description: 'Open command palette',
        allowInInput: true,
        handler: () => {
          triggerRef?.focus();
          handlePaletteOpenChange(!paletteOpenRef);
        },
      },
      {
        key: '/',
        description: 'Focus palette search',
        handler: () => {
          triggerRef?.focus();
          handlePaletteOpenChange(true);
        },
      },
      {
        key: '?',
        description: 'Show keyboard shortcuts',
        handler: () => (overlayOpen = !overlayOpen),
      },
    ]),
  );

  const currentProjectId = $derived.by(() => {
    const segments = page.url.pathname.split('/').filter(Boolean);
    return segments[0] === 'dashboard' && segments[1] === 'projects' ? segments[2] : undefined;
  });
  const currentProject = $derived(currentProjectId ? projects.find((p) => p.id === currentProjectId) : undefined);

  // `c` creates a project outside projects. Inside one it creates an issue: the
  // page's new-issue dialog registers its own `c` (new-issue-bus); pages without
  // one hand off to the issues page, which opens the dialog for `?create=1`.
  $effect(() => {
    const projectId = currentProjectId;
    if (projectId && issueCreator) return;
    return registerHotkeys([
      projectId
        ? {
            key: 'c',
            scope: 'Issues',
            description: 'Create issue',
            handler: () => void goto(`${projectHref(projectId)}?${CREATE_PARAM}=1`),
          }
        : { key: 'c', description: 'Create project', handler: () => (createOpen = true) },
    ]);
  });

  const dark = $derived(theme.resolvedTheme === 'dark');

  const commands = $derived<PaletteCommand[]>([
    ...projects.map((project) => ({
      id: `go-${project.id}`,
      label: project.name,
      section: 'Projects',
      keywords: ['project', 'go to'],
      run: () => void goto(`/dashboard/projects/${project.id}`),
    })),
    ...GO_TO.map((t) => ({
      id: `goto-${t.key}`,
      label: `Go to ${t.label.toLowerCase()}`,
      section: 'Navigation',
      keywords: ['go to', 'navigate', t.label.toLowerCase()],
      run: () => void goto(t.href),
    })),
    {
      id: 'goto-search',
      label: 'Go to search',
      section: 'Navigation',
      keywords: ['find', 'full-text'],
      run: () => void goto('/dashboard/search'),
    },
    {
      id: 'goto-appearance',
      label: 'Appearance settings',
      section: 'Navigation',
      keywords: ['theme', 'density', 'compact'],
      run: () => void goto('/dashboard/settings/appearance'),
    },
    ...(currentProject
      ? PROJECT_GO_TO.map((target) => ({
          id: `project-${target.segment || 'issues'}-${currentProject.id}`,
          label: `${target.label} — ${currentProject.name}`,
          section: 'Current project',
          keywords: ['project', target.label.toLowerCase()],
          run: () => void goto(projectHref(currentProject.id, target.segment)),
        }))
      : []),
    {
      id: 'new-project',
      label: 'New project',
      section: 'Actions',
      keywords: ['create'],
      run: () => (createOpen = true),
    },
    {
      id: 'toggle-theme',
      label: dark ? 'Switch to light mode' : 'Switch to dark mode',
      section: 'Actions',
      keywords: ['theme', 'dark', 'light'],
      run: () => theme.setTheme(dark ? 'light' : 'dark'),
    },
    {
      id: 'logout',
      label: 'Log out',
      section: 'Actions',
      keywords: ['sign out'],
      run: () => {
        void logout.logout();
      },
    },
  ]);
</script>

<Button
  bind:ref={triggerRef}
  variant="outline"
  size="sm"
  aria-label="Open command palette"
  onclick={() => handlePaletteOpenChange(true)}
  class="gap-2 text-muted-foreground"
>
  <SearchIcon />
  <span>Search</span>
  <kbd
    class="pointer-events-none ml-1 inline-flex h-5 select-none items-center rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground"
  >
    {isMac ? '⌘' : 'Ctrl'}K
  </kbd>
</Button>

<!--
  Spacer: the former in-flow Toaster <section> took a slot in the topbar's `gap-2` row and pushed the trigger 8px
  in from the edge. The Toaster now lives in the root layout.
-->
<span aria-hidden="true"></span>

<CommandPalette open={paletteOpen} onOpenChange={handlePaletteOpenChange} {commands} />
<HotkeyOverlay open={overlayOpen} onOpenChange={(next) => (overlayOpen = next)} />
<CreateProjectDialog open={createOpen} onOpenChange={(next) => (createOpen = next)} hideTrigger />
