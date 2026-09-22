'use client';

// TopbarChrome — the `topbarRight` C2 slot node (M3 scope 1+2).
//
// One client component owns the whole interaction layer chrome so the C2
// shell stays frozen (M3 acceptance: "diff touches slots + new files only"):
//   - the palette trigger button (rendered into topbarRight by the layout);
//   - the CommandPalette itself and the `?` HotkeyOverlay;
//   - the global hotkey registrations (⌘K/Ctrl+K, `/`, `?`, `C`) — they go
//     through the C3 registry, which owns the app's only keydown listener;
//   - sonner's <Toaster> (toasts fire on every dashboard route; the layout
//     persists across client navigations, so it mounts exactly once).
//
// Focus return: ⌘K and `/` focus the trigger BEFORE opening the palette, and
// every close path restores focus to the trigger explicitly (radix's
// CommandDialog has no DialogTrigger, so its own closeAutoFocus lands on
// <body>) — M3 acceptance.

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

export interface TopbarProject {
  id: string;
  name: string;
}

const subscribeNothing = () => () => {};

export function TopbarChrome({ projects }: { projects: TopbarProject[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
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

  // Focus returns to the trigger on close (M3 acceptance): radix's
  // CommandDialog has NO DialogTrigger, so its closeAutoFocus would land on
  // <body>. Restore explicitly on the next tick — after radix has processed
  // the close; the content's later unmount never steals focus from an
  // element outside its scope.
  const handlePaletteOpenChange = useCallback((next: boolean) => {
    paletteOpenRef.current = next;
    setPaletteOpen(next);
    if (!next) setTimeout(() => triggerRef.current?.focus(), 0);
  }, []);

  // M3's global keys — registered once; handlers read paletteOpenRef (never
  // stale) and only touch stable refs/setters, so the closure is safe.
  // M5–M7 add scoped keys through this same registry from their own
  // components (C3), never their own listeners.
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

  // Built-in palette commands — scoped to what exists (M3 scope 1). The
  // contextual Members entry appears only on a project route.
  const segments = pathname.split('/').filter(Boolean);
  const currentProjectId =
    segments[0] === 'dashboard' && segments[1] === 'projects'
      ? segments[2]
      : undefined;
  const currentProject = currentProjectId
    ? projects.find((p) => p.id === currentProjectId)
    : undefined;
  const dark = theme === 'dark';

  const commands: PaletteCommand[] = [
    ...projects.map((project) => ({
      id: `go-${project.id}`,
      label: project.name,
      section: 'Projects',
      keywords: ['project', 'go to'],
      run: () => router.push(`/dashboard/projects/${project.id}`),
    })),
    ...(currentProject
      ? [
          {
            id: `members-${currentProject.id}`,
            label: `Members — ${currentProject.name}`,
            section: 'Projects',
            keywords: ['members', 'team'],
            run: () =>
              router.push(`/dashboard/projects/${currentProject.id}/members`),
          },
        ]
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
