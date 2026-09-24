'use client';

import Link from 'next/link';
import { useTheme } from 'next-themes';
import { Loader2, LogOut, Moon, Settings, Sun, UserRound } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar } from '@/components/ui-icons';
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
  const { resolvedTheme, setTheme } = useTheme();
  const { logout, loading } = useLogout();

  const name = user.name?.trim() || user.email?.split('@')[0] || 'Account';
  const dark = resolvedTheme === 'dark';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          aria-label="User menu"
          className="w-full justify-start gap-2 px-2 font-normal"
        >
          <Avatar name={name} src={user.image} size={20} className="shrink-0" />
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
        <DropdownMenuItem asChild>
          <Link href="/dashboard/settings/profile">
            <UserRound />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/dashboard/settings">
            <Settings />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme(dark ? 'light' : 'dark')}>
          {dark ? <Sun /> : <Moon />}
          {dark ? 'Light mode' : 'Dark mode'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
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
