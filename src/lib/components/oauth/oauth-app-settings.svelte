<!--
  OAuth apps the user registered:
  list, register, rotate secret, delete, and the one-time credential reveal.
-->
<script lang="ts">
  import { m } from '@/lib/i18n';
  import { untrack } from 'svelte';
  import AppWindowIcon from '@lucide/svelte/icons/app-window';
  import CopyIcon from '@lucide/svelte/icons/copy';
  import KeyRoundIcon from '@lucide/svelte/icons/key-round';
  import MoreHorizontalIcon from '@lucide/svelte/icons/ellipsis';
  import PlusIcon from '@lucide/svelte/icons/plus';
  import Trash2Icon from '@lucide/svelte/icons/trash-2';
  import { toast } from 'svelte-sonner';

  import { deleteOAuthApp, rotateOAuthAppSecret } from '@/lib/actions/oauth-apps';
  import CopyField from '@/lib/components/integrations/copy-field.svelte';
  import Field from '@/lib/components/settings/field.svelte';
  import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
  } from '@/lib/components/ui/alert-dialog';
  import { Button } from '@/lib/components/ui/button';
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from '@/lib/components/ui/dialog';
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from '@/lib/components/ui/dropdown-menu';
  import { EmptyState } from '@/lib/components/ui-icons';
  import type { OAuthAppView } from '@/lib/oauth-model';
  import AppIcon from './app-icon.svelte';
  import OAuthAppRegisterDialog from './oauth-app-register-dialog.svelte';

  /** Credentials to show once: after create (id + secret) or rotate (secret). */
  type Reveal = { app: OAuthAppView; secret: string | null; rotated: boolean };
  type Confirm = { kind: 'rotate' | 'delete'; app: OAuthAppView } | null;

  let { origin, apps: initial }: { origin: string; apps: OAuthAppView[] } = $props();

  // useState(initial): seeded once, then local.
  let apps = $state(untrack(() => initial));
  let creating = $state(false);
  let reveal = $state<Reveal | null>(null);
  let confirm = $state<Confirm>(null);

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(m.settings_oauth_copied_toast({ what }));
    } catch {
      toast.error(m.settings_oauth_copy_failed());
    }
  }

  async function rotate(app: OAuthAppView) {
    const result = await rotateOAuthAppSecret({ clientId: app.clientId });
    if (result.ok) reveal = { app, secret: result.clientSecret, rotated: true };
    else toast.error(result.error);
  }

  async function remove(app: OAuthAppView) {
    const result = await deleteOAuthApp({ clientId: app.clientId });
    if (result.ok) {
      apps = apps.filter((a) => a.clientId !== app.clientId);
      toast.success(m.settings_oauth_deleted_toast({ name: app.name }));
    } else toast.error(result.error);
  }
</script>

{#snippet registerButton()}
  <Button size="sm" onclick={() => (creating = true)}>
    <PlusIcon />
    {m.settings_oauth_register_app()}
  </Button>
{/snippet}

<section class="flex flex-col gap-4">
  <div class="flex items-start justify-between gap-4">
    <div>
      <h2 class="text-base font-medium">{m.settings_oauth_your_apps()}</h2>
      <p class="mt-1 text-sm text-muted-foreground">
        {m.settings_oauth_your_apps_desc()}
      </p>
    </div>
    {#if apps.length > 0}{@render registerButton()}{/if}
  </div>

  {#if apps.length === 0}
    <EmptyState
      class="rounded-lg border border-dashed border-border py-10"
      title={m.settings_oauth_none()}
      description={m.settings_oauth_none_hint()}
      action={registerButton}
    >
      {#snippet icon()}<AppWindowIcon />{/snippet}
    </EmptyState>
  {:else}
    <ul class="divide-y divide-border rounded-lg border border-border">
      {#each apps as app (app.clientId)}
        <li class="flex items-center gap-3 px-3 py-2.5">
          <AppIcon name={app.name} src={app.icon} />
          <div class="min-w-0 flex-1">
            <p class="flex items-center gap-2 text-sm font-medium">
              <span class="truncate">{app.name}</span>
              <span
                class="shrink-0 rounded border border-border px-1 text-[0.65rem] font-normal text-muted-foreground uppercase"
              >
                {app.isPublic ? m.settings_oauth_public() : m.settings_oauth_confidential()}
              </span>
              {#if app.disabled}
                <span
                  class="shrink-0 rounded border border-amber-500/40 px-1 text-[0.65rem] font-normal text-amber-700 uppercase dark:text-amber-400"
                  title={m.settings_oauth_disabled_hint()}
                >
                  {m.settings_oauth_disabled()}
                </span>
              {/if}
            </p>
            <p class="mt-0.5 truncate font-mono text-xs text-muted-foreground">
              {app.clientId}<span class="font-sans"
                >{' · '}{m.settings_oauth_redirect_count({ count: app.redirectUris.length })}</span
              >
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger>
              {#snippet child({ props })}
                <Button {...props} variant="ghost" size="icon-sm" aria-label={m.settings_oauth_actions({ name: app.name })}>
                  <MoreHorizontalIcon />
                </Button>
              {/snippet}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => copy(app.clientId, m.settings_oauth_client_id())}>
                <CopyIcon />
                {m.settings_oauth_copy_client_id()}
              </DropdownMenuItem>
              {#if !app.isPublic}
                <DropdownMenuItem onSelect={() => (confirm = { kind: 'rotate', app })}>
                  <KeyRoundIcon />
                  {m.settings_oauth_rotate_secret()}
                </DropdownMenuItem>
              {/if}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => (confirm = { kind: 'delete', app })}>
                <Trash2Icon />
                {m.common_delete()}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </li>
      {/each}
    </ul>
  {/if}

  {#if creating}
    <OAuthAppRegisterDialog
      onClose={() => (creating = false)}
      onCreated={(app, secret) => {
        apps = [...apps, app];
        creating = false;
        reveal = { app, secret, rotated: false };
      }}
    />
  {/if}

  <Dialog open={!!reveal} onOpenChange={(open) => !open && (reveal = null)}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>
          {reveal?.rotated
            ? m.settings_oauth_new_secret()
            : m.settings_oauth_registered({ name: reveal?.app.name ?? m.settings_oauth_default_app_name() })}
        </DialogTitle>
        <DialogDescription>
          {reveal?.secret
            ? m.settings_oauth_secret_once()
            : m.settings_oauth_public_no_secret()}{reveal?.rotated ? m.settings_oauth_secret_rotated() : ''}
        </DialogDescription>
      </DialogHeader>
      {#if reveal}
        <div class="flex flex-col gap-4">
          {#if !reveal.rotated}
            <Field id="oauth-client-id" label={m.settings_oauth_client_id()}>
              <CopyField id="oauth-client-id" value={reveal.app.clientId} label={m.settings_oauth_client_id()} />
            </Field>
          {/if}
          {#if reveal.secret}
            <Field id="oauth-client-secret" label={m.settings_oauth_client_secret()}>
              <CopyField id="oauth-client-secret" value={reveal.secret} label={m.settings_oauth_client_secret()} />
            </Field>
          {/if}
          {#if !reveal.rotated}
            <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <dt class="text-muted-foreground">{m.settings_oauth_authorize()}</dt>
              <dd class="truncate font-mono">{origin}/api/auth/oauth2/authorize</dd> <!-- i18n-ignore -->
              <dt class="text-muted-foreground">{m.settings_oauth_token()}</dt>
              <dd class="truncate font-mono">{origin}/api/auth/oauth2/token</dd> <!-- i18n-ignore -->
              <dt class="text-muted-foreground">{m.settings_oauth_scopes()}</dt>
              <dd class="font-mono">read write offline_access</dd> <!-- i18n-ignore -->
            </dl>
          {/if}
        </div>
      {/if}
      <DialogFooter>
        <Button onclick={() => (reveal = null)}>{m.common_done()}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <AlertDialog open={!!confirm} onOpenChange={(open) => !open && (confirm = null)}>
    <AlertDialogContent size="sm">
      <AlertDialogHeader>
        <AlertDialogTitle>
          {confirm?.kind === 'rotate'
            ? m.settings_oauth_rotate_title()
            : m.settings_oauth_delete_title({ name: confirm?.app.name ?? '' })}
        </AlertDialogTitle>
        <AlertDialogDescription>
          {confirm?.kind === 'rotate'
            ? m.settings_oauth_rotate_desc()
            : m.settings_oauth_delete_desc()}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
        <AlertDialogAction
          variant={confirm?.kind === 'delete' ? 'destructive' : 'default'}
          onclick={() => {
            if (!confirm) return;
            if (confirm.kind === 'rotate') void rotate(confirm.app);
            else void remove(confirm.app);
          }}
        >
          {confirm?.kind === 'rotate' ? m.settings_oauth_rotate() : m.common_delete()}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</section>
