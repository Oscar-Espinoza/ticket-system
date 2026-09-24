'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Search } from 'lucide-react';

import { CommandPalette } from '@/components/command-palette/command-palette';
import { CreateProjectDialog } from '@/components/create-project-dialog';
import { HotkeyOverlay } from '@/components/hotkey-overlay';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { useLogout } from '@/hooks/use-logout';
import { registerHotkeys } from '@/lib/hotkeys';
import type { PaletteCommand } from '@/lib/palette-commands';
import { projectHref } from '@/components/app-shell/routes';

export interface TopbarProject {
  id: string;
  name: string;
}

const subscribeNothing = () => () => {};

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

export function TopbarChrome({ projects }: { projects: TopbarProject[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const { logout } = useLogout();

  const triggerRef = useRef<HTMLButtonElement>(null);
  const paletteOpenRef = useRef(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  // Mac detection: useSyncExternalStore reads navigator AFTER hydration
  // (server snapshot = false) with no setState-in-effect, so the kbd hint
  // flips ⌘K/CtrlK without a hydration mismatch.
  const isMac = useSyncExternalStore(
    subscribeNothing,
    () => /Mac|iPhone|iPad/.test(navigator.userAgent),
    () => false,
  );

  // CommandDialog has no DialogTrigger, so radix would restore focus to <body>.
  const handlePaletteOpenChange = useCallback((next: boolean) => {
    paletteOpenRef.current = next;
    setPaletteOpen(next);
    if (!next) {
      setTimeout(() => {
        // A command may have opened another dialog; it owns focus then.
        if (!document.querySelector('[role="dialog"][data-state="open"]')) {
          triggerRef.current?.focus();
        }
      }, 0);
    }
  }, []);

  // `g` arms a one-shot capture listener: capture on window runs before the
  // registry's bubble listener, and preventDefault() makes the registry skip
  // the second key, so list-scoped single keys (e.g. `m`) don't also fire.
  useEffect(() => {
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
        router.push(target.href);
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
  }, [router]);

  // Registered once: handlers only touch refs and stable setters.
  useEffect(
    () =>
      registerHotkeys([
        {
          mod: true,
          key: 'k',
          description: 'Open command palette',
          allowInInput: true,
          handler: () => {
            triggerRef.current?.focus();
            handlePaletteOpenChange(!paletteOpenRef.current);
          },
        },
        {
          key: '/',
          description: 'Focus palette search',
          handler: () => {
            triggerRef.current?.focus();
            handlePaletteOpenChange(true);
          },
        },
        {
          key: '?',
          description: 'Show keyboard shortcuts',
          handler: () => setOverlayOpen((o) => !o),
        },
        {
          key: 'c',
          description: 'Create project',
          handler: () => setCreateOpen(true),
        },
      ]),
    [handlePaletteOpenChange],
  );

  const segments = pathname.split('/').filter(Boolean);
  const currentProjectId =
    segments[0] === 'dashboard' && segments[1] === 'projects'
      ? segments[2]
      : undefined;
  const currentProject = currentProjectId
    ? projects.find((p) => p.id === currentProjectId)
    : undefined;
  const dark = resolvedTheme === 'dark';

  const commands: PaletteCommand[] = [
    ...projects.map((project) => ({
      id: `go-${project.id}`,
      label: project.name,
      section: 'Projects',
      keywords: ['project', 'go to'],
      run: () => router.push(`/dashboard/projects/${project.id}`),
    })),
    ...GO_TO.map((t) => ({
      id: `goto-${t.key}`,
      label: `Go to ${t.label.toLowerCase()}`,
      section: 'Navigation',
      keywords: ['go to', 'navigate', t.label.toLowerCase()],
      run: () => router.push(t.href),
    })),
    {
      id: 'goto-search',
      label: 'Go to search',
      section: 'Navigation',
      keywords: ['find', 'full-text'],
      run: () => router.push('/dashboard/search'),
    },
    {
      id: 'goto-appearance',
      label: 'Appearance settings',
      section: 'Navigation',
      keywords: ['theme', 'density', 'compact'],
      run: () => router.push('/dashboard/settings/appearance'),
    },
    ...(currentProject
      ? PROJECT_GO_TO.map((page) => ({
          id: `project-${page.segment || 'issues'}-${currentProject.id}`,
          label: `${page.label} — ${currentProject.name}`,
          section: 'Current project',
          keywords: ['project', page.label.toLowerCase()],
          run: () => router.push(projectHref(currentProject.id, page.segment)),
        }))
      : []),
    {
      id: 'new-project',
      label: 'New project',
      section: 'Actions',
      keywords: ['create'],
      run: () => setCreateOpen(true),
    },
    {
      id: 'toggle-theme',
      label: dark ? 'Switch to light mode' : 'Switch to dark mode',
      section: 'Actions',
      keywords: ['theme', 'dark', 'light'],
      run: () => setTheme(dark ? 'light' : 'dark'),
    },
    {
      id: 'logout',
      label: 'Log out',
      section: 'Actions',
      keywords: ['sign out'],
      run: () => {
        void logout();
      },
    },
  ];

  return (
    <>
      <Button
        ref={triggerRef}
        variant="outline"
        size="sm"
        aria-label="Open command palette"
        onClick={() => handlePaletteOpenChange(true)}
        className="gap-2 text-muted-foreground"
      >
        <Search />
        <span>Search</span>
        <kbd className="pointer-events-none ml-1 inline-flex h-5 select-none items-center rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
          {isMac ? '⌘' : 'Ctrl'}K
        </kbd>
      </Button>

      <CommandPalette
        open={paletteOpen}
        onOpenChange={handlePaletteOpenChange}
        commands={commands}
      />
      <HotkeyOverlay open={overlayOpen} onOpenChange={setOverlayOpen} />
      <CreateProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        hideTrigger
      />
      <Toaster position="bottom-right" />
    </>
  );
}
