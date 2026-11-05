<script lang="ts">
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/lib/components/ui/card';
  import { Button } from '@/lib/components/ui/button';
  import AcceptWorkspaceInvite from '@/lib/components/workspaces/accept-workspace-invite.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const invite = $derived(data.invite);
  const user = $derived(data.user);
  const valid = $derived(invite !== null);
  const mismatch = $derived(!!invite && !!user && invite.email.toLowerCase() !== user.email.toLowerCase());
  const roleLabel = $derived(invite?.role === 'admin' ? 'an admin' : 'a member');
  const workspaceName = $derived(invite?.workspaceName);
</script>

<svelte:head>
  <title>Join workspace · Ticket System</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center px-4">
  <Card class="w-full max-w-md">
    {#if !valid || !invite}
      <CardHeader>
        <CardTitle class="text-xl font-medium">Invalid invite link</CardTitle>
        <CardDescription class="mt-2 text-sm text-muted-foreground">
          This invitation is invalid, has expired or was already used. Ask a workspace admin for a
          new one.
        </CardDescription>
      </CardHeader>
    {:else if !user}
      <CardHeader>
        <CardTitle class="text-xl font-medium">You’ve been invited</CardTitle>
        <CardDescription class="mt-2 text-sm text-muted-foreground">
          Sign in with <strong class="text-foreground">{invite.email}</strong> to join the
          {workspaceName} workspace as {roleLabel}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button class="mt-6 w-full" href={`/login?redirect=/invite/workspace/${data.rawToken}`}>
          Sign in to continue
        </Button>
        <p class="mt-3 text-center text-sm text-muted-foreground">
          New here?
          <a href={`/signup?redirect=/invite/workspace/${data.rawToken}`} class="underline">Create an account</a>,
          then open this link again.
        </p>
      </CardContent>
    {:else if mismatch}
      <CardHeader>
        <CardTitle class="text-xl font-medium">Wrong account</CardTitle>
        <CardDescription class="mt-2 text-sm text-muted-foreground">
          This invitation was sent to
          <strong class="text-foreground">{invite.email}</strong>, but you’re signed in as
          <strong class="text-foreground">{user.email}</strong>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <a href="/dashboard" class="text-sm text-muted-foreground underline">Go to dashboard</a>
      </CardContent>
    {:else}
      <CardHeader>
        <CardTitle class="text-xl font-medium">Join {workspaceName}</CardTitle>
        <CardDescription class="mt-2 text-sm text-muted-foreground">
          You’ve been invited to this workspace as {roleLabel}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {#key data.token}<AcceptWorkspaceInvite token={data.token} />{/key}
      </CardContent>
    {/if}
  </Card>
</div>
