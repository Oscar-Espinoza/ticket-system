<!--
  Choose a new password from an emailed reset link. The token arrives in the
  URL fragment (never sent to a server or in a Referer), is removed from the
  address bar, and is posted to the server only in request bodies: once to ask
  whether this link secures an unverified account (RESET_CLAIM_PREVIEW_PATH)
  and once to Better Auth's /reset-password.

  A completed reset signs out every session and verifies the address. On an
  account whose address was never verified it also secures it: two-factor,
  API keys, connected apps, linked sign-ins, the Slack link, push
  subscriptions and pending invitations are removed (src/lib/sso.ts
  claimUnverifiedAccount). The page says so first and asks for an explicit
  confirmation, which the server requires too (ACCOUNT_CLAIM_ACK_FIELD), and
  the success state lists what was removed. It never signs in by itself, so
  two-factor is still asked for at the next sign-in of a verified account.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { replaceState } from '$app/navigation';
  import { page } from '$app/state';
  import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';
  import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';

  import Wordmark from '@/lib/components/wordmark.svelte';
  import AccountSecuredNotice from '@/lib/components/auth/account-secured-notice.svelte';
  import { authClient } from '@/lib/svelte/auth-client';
  import { MIN_PASSWORD_LENGTH } from '@/lib/auth-rules';
  import {
    ACCOUNT_CLAIM_ACK_FIELD,
    ACCOUNT_CLAIM_FAILED,
    ACCOUNT_CLAIM_NOT_ACKNOWLEDGED,
    CLAIM_ITEM_LABEL,
    type ClaimReport,
    parseClaimReport,
    RESET_CLAIM_ITEMS,
    RESET_CLAIM_PREVIEW_PATH,
  } from '@/lib/account-claim';
  import { Button } from '@/lib/components/ui/button';
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/lib/components/ui/card';
  import { Input } from '@/lib/components/ui/input';
  import { Label } from '@/lib/components/ui/label';

  /** null = not asked yet; claim with `removes: null` = counts unknown (list everything). */
  type Preview = { claim: false } | { claim: true; removes: ClaimReport | null };

  let token = $state<string | null>(null);
  let checked = $state(false);
  let preview = $state<Preview | null>(null);
  let password = $state('');
  let confirm = $state('');
  let acknowledged = $state(false);
  let formError = $state<string | null>(null);
  let done = $state<{ claimed: ClaimReport | null } | null>(null);
  let claimFailed = $state(false);
  let loading = $state(false);

  onMount(() => {
    token = new URLSearchParams(location.hash.slice(1)).get('token');
    checked = true;
    if (location.hash) void replaceState(`${location.pathname}${location.search}`, page.state);
    if (token) void loadPreview(token);
  });

  async function loadPreview(value: string) {
    try {
      const res = await fetch(RESET_CLAIM_PREVIEW_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: value }),
      });
      const body = (await res.json()) as { claim?: unknown; removes?: unknown };
      preview = body.claim === true ? { claim: true, removes: parseClaimReport(body.removes) } : { claim: false };
    } catch {
      // Unknown: the form shows; if the account needs confirming, the server says so.
      preview = { claim: false };
    }
  }

  /** The warning's list: what this account really has when known, else everything a claim covers. */
  const warnings = $derived.by(() => {
    if (!preview?.claim) return [];
    const removes = preview.removes;
    const present = removes ? RESET_CLAIM_ITEMS.filter((item) => removes[item] > 0) : [...RESET_CLAIM_ITEMS];
    return present.map((item) => ({
      item,
      label: CLAIM_ITEM_LABEL[item],
      count: removes?.[item] ?? 0,
    }));
  });

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    formError = null;
    if (!token) return;
    if (password.length < MIN_PASSWORD_LENGTH) {
      formError = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
      return;
    }
    if (password !== confirm) {
      formError = 'The passwords don’t match.';
      return;
    }
    if (preview?.claim && !acknowledged) {
      formError = 'Confirm that you understand what will be removed.';
      return;
    }
    loading = true;
    const { data, error } = await authClient.$fetch<{ status: boolean; claimed?: unknown }>('/reset-password', {
      method: 'POST',
      body: {
        newPassword: password,
        token,
        ...(preview?.claim && acknowledged ? { [ACCOUNT_CLAIM_ACK_FIELD]: true } : {}),
      },
    });
    loading = false;
    // Better Auth's error body carries `code` (the client types only message/status).
    const code = error && 'code' in error ? (error as { code?: string }).code : undefined;
    if (!error) {
      done = { claimed: parseClaimReport(data?.claimed) };
      token = null;
    } else if (code === ACCOUNT_CLAIM_NOT_ACKNOWLEDGED) {
      // The account changed since the page asked (or the question failed): show the warning.
      preview = { claim: true, removes: null };
      acknowledged = false;
    } else if (code === ACCOUNT_CLAIM_FAILED) {
      claimFailed = true;
      token = null;
    } else if (code === 'INVALID_TOKEN') {
      token = null;
    } else if (code === 'SSO_REQUIRED') {
      formError = 'Your workspace requires single sign-on, so this account can’t use a password. Sign in with SSO.';
    } else if (code === 'PASSWORD_TOO_LONG') {
      formError = 'That password is too long.';
    } else if (error.status === 429) {
      formError = 'Too many attempts. Wait a moment and try again.';
    } else {
      formError = 'Couldn’t reset the password. Try again.';
    }
  }
</script>

<svelte:head>
  <title>Choose a new password · Ticket System</title>
  <meta name="referrer" content="no-referrer" />
</svelte:head>

<div class="flex min-h-screen flex-col items-center justify-center gap-6 px-6 py-12">
  <Wordmark />
  <Card class="w-full max-w-md">
    {#if done}
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <CircleCheckIcon class="size-5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          Password changed
        </CardTitle>
        <CardDescription>
          Every session of this account was signed out, and its email address is verified. Sign in with the new
          password.
        </CardDescription>
      </CardHeader>
      <CardContent class="flex flex-col gap-4">
        {#if done.claimed}
          <AccountSecuredNotice removed={done.claimed} via="password_reset" dismissible={false} />
        {/if}
        <Button href="/login" class="w-full">Sign in</Button>
      </CardContent>
    {:else if claimFailed}
      <CardHeader>
        <CardTitle>Almost done</CardTitle>
        <CardDescription>
          Your new password is set and every session was signed out, but securing the account didn’t finish. Ask
          for a new reset link and use it to finish.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button href="/forgot-password" class="w-full">Email me a new link</Button>
      </CardContent>
    {:else if checked && !token}
      <CardHeader>
        <CardTitle>This link doesn’t work</CardTitle>
        <CardDescription>
          Reset links work once, for an hour, and only the newest one. Ask for a new link.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button href="/forgot-password" class="w-full">Email me a new link</Button>
      </CardContent>
    {:else}
      <CardHeader>
        <CardTitle>Choose a new password</CardTitle>
        <CardDescription>This signs out every session of the account, including this browser’s.</CardDescription>
      </CardHeader>
      <CardContent>
        {#if checked && !preview}
          <p class="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2Icon class="size-4 animate-spin" aria-hidden="true" /> Checking the link…
          </p>
        {:else}
          <form onsubmit={handleSubmit} class="flex flex-col gap-4" novalidate>
            {#if preview?.claim}
              <div
                data-claim-warning
                class="flex flex-col gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm"
              >
                <p class="flex items-center gap-2 font-medium">
                  <TriangleAlertIcon class="size-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
                  This also removes things from the account
                </p>
                <p>
                  This account’s email address was never verified, so we can’t tell whether whoever set it up owns
                  the address. Setting a password from this link secures it: every session is signed out and
                  {warnings.length > 0 ? 'these are removed:' : 'anything a previous holder set up is removed.'}
                </p>
                {#if warnings.length > 0}
                  <ul class="list-disc pl-5" data-claim-warning-list>
                    {#each warnings as entry (entry.item)}
                      <li>{entry.label}{entry.count > 1 ? ` (${entry.count})` : ''}</li>
                    {/each}
                  </ul>
                {/if}
                <p>You’ll set up what you use again afterwards; your issues, projects and memberships stay.</p>
                <p>
                  If you still know your password, <a href="/login" class="font-medium underline underline-offset-2"
                    >sign in</a
                  > and verify your email first — then nothing is removed.
                </p>
                <label class="flex items-start gap-2 pt-1 font-medium">
                  <input
                    type="checkbox"
                    name="acknowledge"
                    class="mt-0.5 size-4 shrink-0 accent-current"
                    bind:checked={acknowledged}
                  />
                  I understand: remove these and secure the account.
                </label>
              </div>
            {/if}
            <div class="flex flex-col gap-2">
              <Label for="new-password">New password</Label>
              <Input id="new-password" type="password" autocomplete="new-password" bind:value={password} />
            </div>
            <div class="flex flex-col gap-2">
              <Label for="confirm-password">Repeat it</Label>
              <Input id="confirm-password" type="password" autocomplete="new-password" bind:value={confirm} />
            </div>
            {#if formError}<p role="alert" class="text-destructive text-sm">{formError}</p>{/if}
            <Button type="submit" class="w-full" disabled={loading || !token || (preview?.claim && !acknowledged)}>
              {#if loading}<Loader2Icon class="animate-spin" />{/if}
              {loading ? 'Saving…' : preview?.claim ? 'Secure the account and set the password' : 'Set new password'}
            </Button>
          </form>
        {/if}
      </CardContent>
    {/if}
  </Card>
</div>
