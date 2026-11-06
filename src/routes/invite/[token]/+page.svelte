<script lang="ts">
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/lib/components/ui/card';
  import { Button } from '@/lib/components/ui/button';
  import JoinProjectButton from '@/lib/components/join-project-button.svelte';
  import { PROJECT_ROLE_LABEL } from '@/lib/roles';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const invitation = $derived(data.invitation);
  const user = $derived(data.user);
  const token = $derived(data.token);
  const isEmailInvite = $derived(Boolean(invitation?.email));
  const mismatch = $derived(
    !!invitation && !!user && isEmailInvite && invitation.email!.toLowerCase() !== user.email.toLowerCase(),
  );
  const roleLabel = $derived(
    invitation ? PROJECT_ROLE_LABEL[isEmailInvite ? invitation.role : 'member'] : '',
  );
  const invitedBy = $derived(
    invitation?.inviterName ? `${invitation.inviterName} invited you` : 'You’ve been invited',
  );
</script>

<svelte:head>
  <title>Join project · Ticket System</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center px-4">
  <Card class="w-full max-w-md">
    {#if !invitation}
      <CardHeader>
        <CardTitle class="text-xl font-medium">Invalid invite link</CardTitle>
        <CardDescription class="mt-2 text-sm text-muted-foreground">
          This invitation is invalid, has expired or has already been used. Ask a project admin for
          a new one.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {#if user}
          <a href="/dashboard" class="text-sm text-muted-foreground underline">Go to dashboard</a>
        {/if}
      </CardContent>
    {:else if !user}
      <CardHeader>
        <CardTitle class="text-xl font-medium">{invitedBy}</CardTitle>
        <CardDescription class="mt-2 text-sm text-muted-foreground">
          Sign in to join {invitation.projectName} as {roleLabel.toLowerCase()}.{#if isEmailInvite}
            Use <strong class="text-foreground">{invitation.email}</strong>.{/if}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button class="mt-6 w-full" href={`/login?redirect=/invite/${token}`}>Sign in to continue</Button>
        <p class="mt-3 text-center text-sm text-muted-foreground">
          New here?
          <a href={`/signup?redirect=/invite/${token}`} class="underline">Create an account</a>, then
          open this link again.
        </p>
      </CardContent>
    {:else if mismatch}
      <CardHeader>
        <CardTitle class="text-xl font-medium">Wrong account</CardTitle>
        <CardDescription class="mt-2 text-sm text-muted-foreground">
          This invitation to {invitation.projectName} was sent to
          <strong class="text-foreground">{invitation.email}</strong>, but you’re signed in as
          <strong class="text-foreground">{user.email}</strong>. Sign in with the invited address to
          accept it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <a href="/dashboard" class="text-sm text-muted-foreground underline">Go to dashboard</a>
      </CardContent>
    {:else}
      <CardHeader>
        <CardTitle class="text-xl font-medium">Join {invitation.projectName}</CardTitle>
        <CardDescription class="mt-2 text-sm text-muted-foreground">
          {invitedBy} to join this project as {roleLabel.toLowerCase()}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {#key token}<JoinProjectButton {token} />{/key}
      </CardContent>
    {/if}
  </Card>
</div>
