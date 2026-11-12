<!-- OAuth consent card. -->
<script module lang="ts">
  export interface ConsentApp {
    name: string;
    icon: string | null;
    uri: string | null;
    policy: string | null;
    tos: string | null;
    /** Registered itself through dynamic client registration (name unverified). */
    dynamic: boolean;
  }

  /** openid is implied by any sign-in; don't list it as a separate permission. */
  const HIDDEN_SCOPES = new Set(['openid']);
</script>

<script lang="ts">
  import CheckIcon from '@lucide/svelte/icons/check';
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';
  import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';

  import { authClient } from '@/lib/svelte/auth-client';
  import { Avatar } from '@/lib/components/ui-icons';
  import { Button } from '@/lib/components/ui/button';
  import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
  } from '@/lib/components/ui/card';
  import { describeScope, safeHref } from '@/lib/oauth-model';
  import AppIcon from './app-icon.svelte';

  let {
    app,
    scopes,
    user,
    redirectHost,
  }: {
    app: ConsentApp | null;
    scopes: string[];
    user: { name: string; email: string; image: string | null };
    redirectHost: string | null;
  } = $props();

  let pending = $state<'allow' | 'deny' | null>(null);
  let error = $state<string | null>(null);

  async function answer(accept: boolean) {
    pending = accept ? 'allow' : 'deny';
    error = null;
    // The oauth-provider client plugin adds the page's signed query (oauth_query).
    const { data, error: failure } = await authClient.$fetch<{ url?: string; redirect_uri?: string }>(
      '/oauth2/consent',
      { method: 'POST', body: { accept } },
    );
    const target = data?.url ?? data?.redirect_uri;
    if (failure || !target) {
      pending = null;
      error = 'This authorization request expired or is invalid. Start again from the app.';
      return;
    }
    window.location.assign(target);
  }

  const visible = $derived(scopes.filter((s) => !HIDDEN_SCOPES.has(s)));
  const homepage = $derived(app ? safeHref(app.uri) : null);
  const policy = $derived(app ? safeHref(app.policy) : null);
  const tos = $derived(app ? safeHref(app.tos) : null);
</script>

{#if !app}
  <Card class="w-full max-w-sm">
    <CardHeader>
      <CardTitle class="flex items-center gap-2">
        <TriangleAlertIcon class="size-4 text-amber-500" />
        Invalid authorization request
      </CardTitle>
      <CardDescription>
        The link expired or the app no longer exists. Go back to the app and try connecting again.
      </CardDescription>
    </CardHeader>
  </Card>
{:else}
  <Card class="w-full max-w-sm">
    <CardHeader class="items-center text-center">
      <AppIcon name={app.name} src={app.icon} size="lg" class="mx-auto" />
      <CardTitle class="mt-3 text-base">
        {#if homepage}<a
            href={homepage}
            target="_blank"
            rel="noopener noreferrer nofollow"
            class="hover:underline">{app.name}</a
          >{:else}{app.name}{/if}{#if redirectHost}<span class="font-normal text-muted-foreground"> · {redirectHost}</span>{/if}
        wants to access your account
      </CardTitle>
      {#if app.dynamic}
        <p class="text-xs text-amber-600 dark:text-amber-500">
          This app registered itself. Its name isn’t verified: only continue if you started this
          from {redirectHost ?? 'the app'}.
        </p>
      {/if}
      <CardDescription class="flex items-center justify-center gap-2">
        <Avatar name={user.name} src={user.image} size={20} />
        <span class="truncate">{user.email}</span>
      </CardDescription>
    </CardHeader>
    <CardContent>
      <p class="mb-2 text-xs font-medium text-muted-foreground">This will allow it to:</p>
      <ul class="flex flex-col gap-2 text-sm">
        {#each visible.length ? visible : ['openid'] as scope (scope)}
          <li class="flex items-start gap-2">
            <CheckIcon class="mt-0.5 size-4 shrink-0 text-emerald-500" />
            {describeScope(scope)}
          </li>
        {/each}
      </ul>
      {#if error}
        <p role="alert" class="mt-4 text-xs text-destructive">
          {error}
        </p>
      {/if}
    </CardContent>
    <CardFooter class="flex flex-col gap-3">
      <div class="flex w-full gap-2">
        <Button variant="outline" class="flex-1" disabled={pending !== null} onclick={() => answer(false)}>
          {#if pending === 'deny'}<Loader2Icon class="animate-spin" />{/if}
          Deny
        </Button>
        <Button class="flex-1" disabled={pending !== null} onclick={() => answer(true)} autofocus>
          {#if pending === 'allow'}<Loader2Icon class="animate-spin" />{/if}
          Allow
        </Button>
      </div>
      <p class="text-center text-xs text-muted-foreground">
        {#if redirectHost}You’ll be sent to <span class="font-medium text-foreground">{redirectHost}</span
          >.{' '}{/if}Revoke access anytime in Settings → OAuth apps.{#if policy || tos}{' '}{#if policy}<a
              href={policy}
              target="_blank"
              rel="noopener noreferrer nofollow"
              class="underline">Privacy</a
            >{/if}{#if policy && tos}{' · '}{/if}{#if tos}<a
              href={tos}
              target="_blank"
              rel="noopener noreferrer nofollow"
              class="underline">Terms</a
            >{/if}{/if}
      </p>
    </CardFooter>
  </Card>
{/if}
