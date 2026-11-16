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
  import { m } from '@/lib/i18n';
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
    claimItemLabel,
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
      label: claimItemLabel(item),
      count: removes?.[item] ?? 0,
    }));
  });

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    formError = null;
    if (!token) return;
    if (password.length < MIN_PASSWORD_LENGTH) {
      formError = m.auth_password_min({ min: MIN_PASSWORD_LENGTH });
      return;
    }
    if (password !== confirm) {
      formError = m.auth_reset_passwords_dont_match();
      return;
    }
    if (preview?.claim && !acknowledged) {
      formError = m.auth_reset_confirm_removal();
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
      formError = m.auth_reset_sso();
    } else if (code === 'PASSWORD_TOO_LONG') {
      formError = m.auth_reset_too_long();
    } else if (error.status === 429) {
      formError = m.auth_login_too_many();
    } else {
      formError = m.auth_reset_failed();
    }
  }
</script>

<svelte:head>
  <title>{m.auth_reset_page_title()}</title>
  <meta name="referrer" content="no-referrer" />
</svelte:head>

<div class="flex min-h-screen flex-col items-center justify-center gap-6 px-6 py-12">
  <Wordmark />
  <Card class="w-full max-w-md">
    {#if done}
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <CircleCheckIcon class="size-5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          {m.auth_reset_changed()}
        </CardTitle>
        <CardDescription>{m.auth_reset_changed_description()}</CardDescription>
      </CardHeader>
      <CardContent class="flex flex-col gap-4">
        {#if done.claimed}
          <AccountSecuredNotice removed={done.claimed} via="password_reset" dismissible={false} />
        {/if}
        <Button href="/login" class="w-full">{m.auth_sign_in()}</Button>
      </CardContent>
    {:else if claimFailed}
      <CardHeader>
        <CardTitle>{m.auth_reset_almost()}</CardTitle>
        <CardDescription>{m.auth_reset_almost_description()}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button href="/forgot-password" class="w-full">{m.auth_reset_new_link()}</Button>
      </CardContent>
    {:else if checked && !token}
      <CardHeader>
        <CardTitle>{m.auth_reset_bad_link()}</CardTitle>
        <CardDescription>{m.auth_reset_bad_link_description()}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button href="/forgot-password" class="w-full">{m.auth_reset_new_link()}</Button>
      </CardContent>
    {:else}
      <CardHeader>
        <CardTitle>{m.auth_reset_choose()}</CardTitle>
        <CardDescription>{m.auth_reset_choose_description()}</CardDescription>
      </CardHeader>
      <CardContent>
        {#if checked && !preview}
          <p class="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2Icon class="size-4 animate-spin" aria-hidden="true" /> {m.auth_reset_checking()}
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
                  {m.auth_reset_warning_title()}
                </p>
                <p>
                  {warnings.length > 0 ? m.auth_reset_warning_body_list() : m.auth_reset_warning_body_all()}
                </p>
                {#if warnings.length > 0}
                  <ul class="list-disc pl-5" data-claim-warning-list>
                    {#each warnings as entry (entry.item)}
                      <li>{entry.label}{entry.count > 1 ? ` (${entry.count})` : ''}</li>
                    {/each}
                  </ul>
                {/if}
                <p>{m.auth_reset_warning_after()}</p>
                <p>
                  {m.auth_reset_warning_know_before()} <a href="/login" class="font-medium underline underline-offset-2"
                    >{m.auth_reset_warning_know_link()}</a
                  > {m.auth_reset_warning_know_after()}
                </p>
                <label class="flex items-start gap-2 pt-1 font-medium">
                  <input
                    type="checkbox"
                    name="acknowledge"
                    class="mt-0.5 size-4 shrink-0 accent-current"
                    bind:checked={acknowledged}
                  />
                  {m.auth_reset_acknowledge()}
                </label>
              </div>
            {/if}
            <div class="flex flex-col gap-2">
              <Label for="new-password">{m.auth_reset_new_password()}</Label>
              <Input id="new-password" type="password" autocomplete="new-password" bind:value={password} />
            </div>
            <div class="flex flex-col gap-2">
              <Label for="confirm-password">{m.auth_reset_repeat()}</Label>
              <Input id="confirm-password" type="password" autocomplete="new-password" bind:value={confirm} />
            </div>
            {#if formError}<p role="alert" class="text-destructive text-sm">{formError}</p>{/if}
            <Button type="submit" class="w-full" disabled={loading || !token || (preview?.claim && !acknowledged)}>
              {#if loading}<Loader2Icon class="animate-spin" />{/if}
              {loading ? m.common_saving() : preview?.claim ? m.auth_reset_secure_and_set() : m.auth_reset_set()}
            </Button>
          </form>
        {/if}
      </CardContent>
    {/if}
  </Card>
</div>
