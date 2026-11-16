<script lang="ts">
  import { m } from '@/lib/i18n';
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/lib/components/ui/card';
  import { Button } from '@/lib/components/ui/button';
  import AcceptWorkspaceInvite from '@/lib/components/workspaces/accept-workspace-invite.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const invite = $derived(data.invite);
  const user = $derived(data.user);
  const valid = $derived(invite !== null);
  const mismatch = $derived(!!invite && !!user && invite.email.toLowerCase() !== user.email.toLowerCase());
  const roleLabel = $derived(invite?.role === 'admin' ? m.auth_invite_ws_role_admin() : m.auth_invite_ws_role_member());
  const workspaceName = $derived(invite?.workspaceName);
</script>

<svelte:head>
  <title>{m.auth_invite_ws_page_title()}</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center px-4">
  <Card class="w-full max-w-md">
    {#if !valid || !invite}
      <CardHeader>
        <CardTitle class="text-xl font-medium">{m.auth_invite_invalid()}</CardTitle>
        <CardDescription class="mt-2 text-sm text-muted-foreground">
          {m.auth_invite_ws_invalid()}
        </CardDescription>
      </CardHeader>
    {:else if !user}
      <CardHeader>
        <CardTitle class="text-xl font-medium">{m.auth_invite_invited()}</CardTitle>
        <CardDescription class="mt-2 text-sm text-muted-foreground">
          {m.auth_invite_ws_sign_in({ email: invite.email, workspace: workspaceName ?? '', role: roleLabel })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button class="mt-6 w-full" href={`/login?redirect=/invite/workspace/${data.rawToken}`}>
          {m.auth_invite_sign_in_continue()}
        </Button>
        <p class="mt-3 text-center text-sm text-muted-foreground">
          {m.auth_invite_new_here()}
          <a href={`/signup?redirect=/invite/workspace/${data.rawToken}`} class="underline">{m.auth_invite_create_account()}</a>{m.auth_invite_then_open()}
        </p>
      </CardContent>
    {:else if mismatch}
      <CardHeader>
        <CardTitle class="text-xl font-medium">{m.auth_invite_wrong_account()}</CardTitle>
        <CardDescription class="mt-2 text-sm text-muted-foreground">
          {m.auth_invite_ws_wrong_account({ invited: invite.email, current: user.email })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <a href="/dashboard" class="text-sm text-muted-foreground underline">{m.auth_invite_go_dashboard()}</a>
      </CardContent>
    {:else}
      <CardHeader>
        <CardTitle class="text-xl font-medium">{m.auth_invite_join({ project: workspaceName ?? '' })}</CardTitle>
        <CardDescription class="mt-2 text-sm text-muted-foreground">
          {m.auth_invite_ws_join_as({ role: roleLabel })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {#key data.token}<AcceptWorkspaceInvite token={data.token} />{/key}
      </CardContent>
    {/if}
  </Card>
</div>
