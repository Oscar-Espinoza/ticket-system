<!-- Sidebar footer account menu. -->
<script lang="ts">
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';
  import LogOutIcon from '@lucide/svelte/icons/log-out';
  import MoonIcon from '@lucide/svelte/icons/moon';
  import SettingsIcon from '@lucide/svelte/icons/settings';
  import SunIcon from '@lucide/svelte/icons/sun';
  import UserRoundIcon from '@lucide/svelte/icons/user-round';

  import { Button } from '@/lib/components/ui/button';
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from '@/lib/components/ui/dropdown-menu';
  import { Avatar } from '@/lib/components/ui-icons';
  import { useTheme } from '@/lib/svelte/theme.svelte';
  import { useLogout } from '@/lib/svelte/use-logout.svelte';

  let {
    user,
  }: {
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  } = $props();

  const theme = useTheme();
  const logout = useLogout();

  const name = $derived(user.name?.trim() || user.email?.split('@')[0] || 'Account');
  const dark = $derived(theme.resolvedTheme === 'dark');
</script>

<DropdownMenu>
  <DropdownMenuTrigger>
    {#snippet child({ props })}
      <Button {...props} variant="ghost" aria-label="User menu" class="w-full justify-start gap-2 px-2 font-normal">
        <Avatar {name} src={user.image} size={20} class="shrink-0" />
        <span class="truncate">{name}</span>
      </Button>
    {/snippet}
  </DropdownMenuTrigger>

  <DropdownMenuContent align="start" class="w-56">
    <DropdownMenuLabel class="truncate">
      <span class="block truncate text-sm font-medium text-foreground">
        {name}
      </span>
      <span class="block truncate text-xs font-normal text-muted-foreground">
        {user.email}
      </span>
    </DropdownMenuLabel>
    <DropdownMenuSeparator />
    <DropdownMenuItem>
      {#snippet child({ props })}
        <a {...props} href="/dashboard/settings/profile">
          <UserRoundIcon />
          Profile
        </a>
      {/snippet}
    </DropdownMenuItem>
    <DropdownMenuItem>
      {#snippet child({ props })}
        <a {...props} href="/dashboard/settings">
          <SettingsIcon />
          Settings
        </a>
      {/snippet}
    </DropdownMenuItem>
    <DropdownMenuItem onSelect={() => theme.setTheme(dark ? 'light' : 'dark')}>
      {#if dark}<SunIcon />{:else}<MoonIcon />{/if}
      {dark ? 'Light mode' : 'Dark mode'}
    </DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuItem
      onSelect={() => {
        void logout.logout();
      }}
      disabled={logout.loading}
      class="text-destructive focus:text-destructive [&_svg]:text-destructive"
    >
      {#if logout.loading}<Loader2Icon class="animate-spin" />{:else}<LogOutIcon />{/if}
      Log out
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
