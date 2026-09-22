'use client';

// Avatar user menu — the `sidebarFooter` C2 slot node (M3 scope 5).
//
// Replaces the old footer's raw email + standalone logout button (M3
// acceptance: "logout reachable only through the avatar menu — old button
// deleted, not hidden"; see app-shell.tsx, whose footer default was removed
// for this). Composition: avatar/initials trigger → identity header (name +
// email) → theme toggle (scope 4's light/dark control lives here) → Log out
// (sign-out logic moved verbatim via useLogout).
//
// Avatar source: session.user.image (GitHub avatar on OAuth sign-ins),
// initials fallback for email accounts — no extra query (D-05 spirit).

import { useTheme } from 'next-themes';
import { Loader2, LogOut, Moon, Sun } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLogout } from '@/hooks/use-logout';

export function UserMenu({
  user,
}: {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
}) {
  const { theme, setTheme } = useTheme();
  const { logout, loading } = useLogout();

  const name = user.name?.trim() || user.email?.split('@')[0] || 'Account';
  const initials = name
    .split(/\s+/)
    .map((word) => word[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const dark = theme === 'dark';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          aria-label="User menu"
          className="w-full justify-start gap-2 px-2 font-normal"
        >
          <Avatar className="size-5 shrink-0">
            {user.image && <AvatarImage src={user.image} alt="" />}
            <AvatarFallback className="bg-muted text-[10px] text-muted-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="truncate">{name}</span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="truncate">
          <span className="block truncate text-sm font-medium text-foreground">
            {name}
          </span>
          <span className="block truncate text-xs font-normal text-muted-foreground">
            {user.email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setTheme(dark ? 'light' : 'dark')}>
          {dark ? <Sun /> : <Moon />}
          {dark ? 'Light mode' : 'Dark mode'}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            void logout();
          }}
          disabled={loading}
          className="text-destructive focus:text-destructive [&_svg]:text-destructive"
        >
          {loading ? <Loader2 className="animate-spin" /> : <LogOut />}
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
