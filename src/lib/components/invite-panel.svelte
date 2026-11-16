<!--
  Invite panel (settings › Members, owner/admin):
  invite by email with a role, the pending email invitations (resend / copy
  link / revoke; invite-panel-pending-row.svelte), and the reusable shareable
  link (joins as member). URLs arrive from the server page; actions refresh the
  page so lists stay fresh without local syncing.
-->
<script lang="ts">
  import { m } from '@/lib/i18n';
  import { untrack } from 'svelte';
  import CopyIcon from '@lucide/svelte/icons/copy';
  import Link2Icon from '@lucide/svelte/icons/link-2';
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';
  import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
  import SendIcon from '@lucide/svelte/icons/send';
  import { toast } from 'svelte-sonner';

  // The wrappers refresh the page data after they resolve.
  import { generateInviteLink, inviteByEmail, type GenerateInviteState } from '@/lib/actions/invite';
  import { Button } from '@/lib/components/ui/button';
  import { Input } from '@/lib/components/ui/input';
  import { Label } from '@/lib/components/ui/label';
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/lib/components/ui/select';
  import { useProjectPermissions } from '@/lib/components/workspaces/permissions.svelte';
  import { PROJECT_ROLE_DESCRIPTION, PROJECT_ROLE_LABEL, type AssignableRole } from '@/lib/roles';
  import PendingRow from './invite-panel-pending-row.svelte';
  import { announceSent, copyText } from './invite-toasts';
  import type { PendingInvitation } from './invite-panel-types';

  let {
    projectId,
    inviteUrl,
    pending = [],
  }: {
    projectId: string;
    inviteUrl: string | null;
    pending?: PendingInvitation[];
  } = $props();

  // ---- Invite by email (EmailInviteForm) ----------------------------------
  const perms = useProjectPermissions();
  const roles = $derived(perms.assignableRoles);
  const roleItems = $derived(roles.map((r) => ({ value: r, label: PROJECT_ROLE_LABEL[r] })));
  let email = $state('');
  let role = $state<AssignableRole>(
    untrack(() => (perms.assignableRoles.includes('member') ? 'member' : perms.assignableRoles[0])),
  );
  let emailError = $state<string | null>(null);
  let emailRunning = $state(0);
  const emailPending = $derived(emailRunning > 0);

  async function submitEmail(event: SubmitEvent) {
    event.preventDefault();
    const value = email.trim();
    if (!value) return;
    emailRunning++;
    try {
      const result = await inviteByEmail({ projectId, email: value, role });
      if (!result.ok) {
        emailError = result.error;
        return;
      }
      emailError = null;
      email = '';
      announceSent(value, result);
    } finally {
      emailRunning--;
    }
  }

  // ---- Shareable link (state around generateInviteLink) ----------
  let linkState = $state<GenerateInviteState>({});
  let linkPending = $state(false);
  // Prefer the just-generated URL over the (possibly stale) server prop.
  const displayUrl = $derived(linkState.url ?? inviteUrl);

  async function submitLink(event: SubmitEvent & { currentTarget: HTMLFormElement }) {
    event.preventDefault();
    if (linkPending) return;
    const formData = new FormData(event.currentTarget);
    const prevState = linkState;
    linkPending = true;
    try {
      const hadUrl = Boolean(prevState.url ?? inviteUrl);
      const result = await generateInviteLink(prevState, formData);
      if (!result) return;
      if (result.url) toast.success(hadUrl ? m.projects_invite_link_regenerated() : m.projects_invite_link_created());
      linkState = result;
    } finally {
      linkPending = false;
    }
  }
</script>

<div class="flex flex-col gap-6">
  <section>
    <h2 class="mb-1 text-base font-medium">{m.projects_invite_by_email()}</h2>
    <p class="mb-3 text-sm text-muted-foreground">
      {m.projects_invite_by_email_desc()}
    </p>
    <form onsubmit={submitEmail} class="flex flex-col gap-2 sm:flex-row">
      <Label for="invite-email" class="sr-only">{m.projects_invite_email_address()}</Label>
      <Input
        id="invite-email"
        type="email"
        autocomplete="off"
        placeholder={m.projects_invite_email_placeholder()}
        bind:value={email}
        oninput={() => {
          if (emailError) emailError = null;
        }}
        aria-invalid={emailError ? true : undefined}
        aria-describedby={emailError ? 'invite-email-error' : undefined}
        class="flex-1"
      />
      <Select items={roleItems} bind:value={() => role, (v) => (role = v as AssignableRole)}>
        <SelectTrigger class="sm:w-28" aria-label={m.projects_role()}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {#each roles as r (r)}
            <SelectItem value={r} title={PROJECT_ROLE_DESCRIPTION[r]}>
              {PROJECT_ROLE_LABEL[r]}
            </SelectItem>
          {/each}
        </SelectContent>
      </Select>
      <Button type="submit" disabled={emailPending || !email.trim()}>
        {#if emailPending}<Loader2Icon class="animate-spin" />{:else}<SendIcon />{/if}
        {m.projects_invite_send()}
      </Button>
    </form>
    {#if emailError}
      <p id="invite-email-error" role="alert" class="mt-2 text-sm text-destructive">
        {emailError}
      </p>
    {/if}
  </section>

  {#if pending.length > 0}
    <section>
      <h2 class="mb-2 text-sm font-medium text-muted-foreground">
        {m.projects_invite_pending({ count: pending.length })}
      </h2>
      <ul class="flex flex-col divide-y divide-border/60 rounded-lg border">
        {#each pending as invitation (invitation.id)}
          <PendingRow {projectId} {invitation} />
        {/each}
      </ul>
    </section>
  {/if}

  <section>
    <h2 class="mb-1 flex items-center gap-1.5 text-base font-medium">
      <Link2Icon class="size-4 text-muted-foreground" aria-hidden="true" />
      {m.projects_invite_shareable()}
    </h2>
    <form onsubmit={submitLink}>
      <input type="hidden" name="projectId" value={projectId} />
      {#if displayUrl}
        <div class="flex flex-col gap-2">
          <p class="text-sm text-muted-foreground">
            {m.projects_invite_shareable_desc()}
          </p>
          <div class="flex flex-col gap-2 sm:flex-row">
            <Label for="invite-url" class="sr-only">{m.projects_invite_link()}</Label>
            <Input
              id="invite-url"
              readonly
              value={displayUrl}
              class="flex-1 font-mono text-xs"
              onfocus={(e) => e.currentTarget.select()}
            />
            <div class="flex gap-2">
              <Button type="button" variant="outline" onclick={() => void copyText(displayUrl, m.projects_invite_link())}>
                <CopyIcon />
                {m.common_copy()}
              </Button>
              <Button type="submit" variant="outline" disabled={linkPending}>
                {#if linkPending}<Loader2Icon class="animate-spin" />{:else}<RefreshCwIcon />{/if}
                {m.projects_invite_regenerate()}
              </Button>
            </div>
          </div>
        </div>
      {:else}
        <div class="flex flex-col items-start gap-2">
          <p class="text-sm text-muted-foreground">{m.projects_invite_generate_desc()}</p>
          <Button type="submit" variant="outline" disabled={linkPending}>
            {#if linkPending}<Loader2Icon class="animate-spin" />{:else}<Link2Icon />{/if}
            {m.projects_invite_generate()}
          </Button>
        </div>
      {/if}
      {#if linkState.errors?.server}
        <p role="alert" class="mt-2 text-sm text-destructive">
          {linkState.errors.server}
        </p>
      {/if}
    </form>
  </section>
</div>
