<!--
  Apps the user granted access to (OAuth consents), with Revoke.
  Port of src/components/oauth/authorized-apps.tsx.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
  import { toast } from 'svelte-sonner';

  import { revokeOAuthConsent } from '@/lib/actions/oauth-apps';
  import { relativeTime } from '@/lib/components/issues/issue-properties';
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
  import { EmptyState } from '@/lib/components/ui-icons';
  import { describeScope, type AuthorizedAppView } from '@/lib/components/oauth/oauth-model';
  import AppIcon from './app-icon.svelte';

  let { apps: initial }: { apps: AuthorizedAppView[] } = $props();

  // useState(initial): seeded once, then local.
  let apps = $state(untrack(() => initial));
  let revoking = $state<AuthorizedAppView | null>(null);

  async function revoke(app: AuthorizedAppView) {
    const result = await revokeOAuthConsent({ id: app.id });
    if (result.ok) {
      apps = apps.filter((a) => a.id !== app.id);
      toast.success(`Revoked ${app.name}`);
    } else toast.error(result.error);
  }
</script>

<section class="flex flex-col gap-4">
  <div>
    <h2 class="text-base font-medium">Authorized apps</h2>
    <p class="mt-1 text-sm text-muted-foreground">
      Apps that can access your account. Revoking signs them out everywhere.
    </p>
  </div>

  {#if apps.length === 0}
    <EmptyState
      class="rounded-lg border border-dashed border-border py-10"
      title="No authorized apps"
      description="Apps you allow through “Sign in with Ticket System” show up here."
    >
      {#snippet icon()}<ShieldCheckIcon />{/snippet}
    </EmptyState>
  {:else}
    <ul class="divide-y divide-border rounded-lg border border-border">
      {#each apps as app (app.id)}
        <li class="flex items-center gap-3 px-3 py-2.5">
          <AppIcon name={app.name} src={app.icon} />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium">
              {#if app.uri}
                <a href={app.uri} target="_blank" rel="noopener noreferrer nofollow" class="hover:underline">
                  {app.name}
                </a>
              {:else}
                {app.name}
              {/if}
            </p>
            <p
              class="mt-0.5 truncate text-xs text-muted-foreground"
              title={app.scopes.map(describeScope).join('\n')}
            >
              {app.scopes.includes('write')
                ? 'Read and write access'
                : app.scopes.includes('read')
                  ? 'Read access'
                  : 'Basic profile'}{' · authorized '}{relativeTime(new Date(app.grantedAt))}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            class="text-destructive hover:text-destructive"
            onclick={() => (revoking = app)}
          >
            Revoke
          </Button>
        </li>
      {/each}
    </ul>
  {/if}

  <AlertDialog open={!!revoking} onOpenChange={(open) => !open && (revoking = null)}>
    <AlertDialogContent size="sm">
      <AlertDialogHeader>
        <AlertDialogTitle>Revoke {revoking?.name}?</AlertDialogTitle>
        <AlertDialogDescription>
          Its access and refresh tokens stop working immediately. You can authorize it again later.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction variant="destructive" onclick={() => revoking && revoke(revoking)}>
          Revoke
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</section>
