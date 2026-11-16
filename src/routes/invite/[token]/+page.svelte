<script lang="ts">
  import { m } from '@/lib/i18n';
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/lib/components/ui/card';
  import { Button } from '@/lib/components/ui/button';
  import JoinProjectButton from '@/lib/components/join-project-button.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const invitation = $derived(data.invitation);
  const user = $derived(data.user);
  const token = $derived(data.token);
  const isEmailInvite = $derived(Boolean(invitation?.email));
  const mismatch = $derived(
    !!invitation && !!user && isEmailInvite && invitation.email!.toLowerCase() !== user.email.toLowerCase(),
  );
  const roleLabel = $derived.by(() => {
    const role = isEmailInvite ? invitation?.role : 'member';
    return role === 'admin'
      ? m.auth_invite_role_admin()
      : role === 'guest'
        ? m.auth_invite_role_guest()
        : m.auth_invite_role_member();
  });
  const invitedBy = $derived(
    invitation?.inviterName
      ? m.auth_invite_invited_by({ name: invitation.inviterName })
      : m.auth_invite_invited(),
  );
</script>

<svelte:head>
  <title>{m.auth_invite_page_title()}</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center px-4">
  <Card class="w-full max-w-md">
    {#if !invitation}
      <CardHeader>
        <CardTitle class="text-xl font-medium">{m.auth_invite_invalid()}</CardTitle>
        <CardDescription class="mt-2 text-sm text-muted-foreground">
          {m.auth_invite_invalid_project()}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {#if user}
          <a href="/dashboard" class="text-sm text-muted-foreground underline">{m.auth_invite_go_dashboard()}</a>
        {/if}
      </CardContent>
    {:else if !user}
      <CardHeader>
        <CardTitle class="text-xl font-medium">{invitedBy}</CardTitle>
        <CardDescription class="mt-2 text-sm text-muted-foreground">
          {m.auth_invite_sign_in_to_join({ project: invitation.projectName, role: roleLabel })}{#if isEmailInvite}
            {m.auth_invite_use_email({ email: invitation.email ?? '' })}{/if}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button class="mt-6 w-full" href={`/login?redirect=/invite/${token}`}>{m.auth_invite_sign_in_continue()}</Button>
        <p class="mt-3 text-center text-sm text-muted-foreground">
          {m.auth_invite_new_here()}
          <a href={`/signup?redirect=/invite/${token}`} class="underline">{m.auth_invite_create_account()}</a>{m.auth_invite_then_open()}
        </p>
      </CardContent>
    {:else if mismatch}
      <CardHeader>
        <CardTitle class="text-xl font-medium">{m.auth_invite_wrong_account()}</CardTitle>
        <CardDescription class="mt-2 text-sm text-muted-foreground">
          {m.auth_invite_wrong_account_project({
            project: invitation.projectName,
            invited: invitation.email ?? '',
            current: user.email,
          })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <a href="/dashboard" class="text-sm text-muted-foreground underline">{m.auth_invite_go_dashboard()}</a>
      </CardContent>
    {:else}
      <CardHeader>
        <CardTitle class="text-xl font-medium">{m.auth_invite_join({ project: invitation.projectName })}</CardTitle>
        <CardDescription class="mt-2 text-sm text-muted-foreground">
          {m.auth_invite_join_as({ invited: invitedBy, role: roleLabel })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {#key token}<JoinProjectButton {token} />{/key}
      </CardContent>
    {/if}
  </Card>
</div>
