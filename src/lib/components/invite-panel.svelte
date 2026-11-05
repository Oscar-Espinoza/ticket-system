<!--
  Invite panel (settings › Members, owner/admin). Port of src/components/invite-panel.tsx:
  invite by email with a role, the pending email invitations (resend / copy
  link / revoke; invite-panel-pending-row.svelte), and the reusable shareable
  link (joins as member). URLs arrive from the server page; actions refresh the
  page so lists stay fresh without local syncing.
-->
<script module lang="ts">
  import type { AssignableRole } from '@/lib/components/workspaces/role-rules';

  export interface PendingInvitation {
    id: string;
    email: string;
    role: AssignableRole;
    /** ISO string. */
    expiresAt: string;
    url: string;
    invitedByName: string | null;
  }
</script>

<script lang="ts">
  import { untrack } from 'svelte';
  import CopyIcon from '@lucide/svelte/icons/copy';
  import Link2Icon from '@lucide/svelte/icons/link-2';
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';
  import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
  import SendIcon from '@lucide/svelte/icons/send';
  import { toast } from 'svelte-sonner';

  // The wrappers refresh the page data after they resolve (React's revalidatePath).
  import { generateInviteLink, inviteByEmail, type GenerateInviteState } from '@/lib/actions/invite';
  import { Button } from '@/lib/components/ui/button';
  import { Input } from '@/lib/components/ui/input';
  import { Label } from '@/lib/components/ui/label';
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/lib/components/ui/select';
  import { useProjectPermissions } from '@/lib/components/workspaces/permissions.svelte';
  import { PROJECT_ROLE_DESCRIPTION, PROJECT_ROLE_LABEL } from '@/lib/components/workspaces/role-rules';
  import PendingRow from './invite-panel-pending-row.svelte';
  import { announceSent, copyText } from './invite-panel-utils';

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

  // ---- Shareable link (useActionState around generateInviteLink) ----------
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
      if (result.url) toast.success(hadUrl ? 'Invite link regenerated' : 'Invite link created');
      linkState = result;
    } finally {
      linkPending = false;
    }
  }
</script>

<div class="flex flex-col gap-6">
  <section>
    <h2 class="mb-1 text-base font-medium">Invite by email</h2>
    <p class="mb-3 text-sm text-muted-foreground">
      They’ll get a link that works once, for that address, for 7 days.
    </p>
    <form onsubmit={submitEmail} class="flex flex-col gap-2 sm:flex-row">
      <Label for="invite-email" class="sr-only">Email address</Label>
      <Input
        id="invite-email"
        type="email"
        autocomplete="off"
        placeholder="name@company.com"
        bind:value={email}
        oninput={() => {
          if (emailError) emailError = null;
        }}
        aria-invalid={emailError ? true : undefined}
        aria-describedby={emailError ? 'invite-email-error' : undefined}
        class="flex-1"
      />
      <Select items={roleItems} bind:value={() => role, (v) => (role = v as AssignableRole)}>
        <SelectTrigger class="sm:w-28" aria-label="Role">
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
        Send invite
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
        Pending invitations · {pending.length}
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
      Shareable link
    </h2>
    <form onsubmit={submitLink}>
      <input type="hidden" name="projectId" value={projectId} />
      {#if displayUrl}
        <div class="flex flex-col gap-2">
          <p class="text-sm text-muted-foreground">
            Anyone with this link can join as a member. It expires in 30 days.
          </p>
          <div class="flex flex-col gap-2 sm:flex-row">
            <Label for="invite-url" class="sr-only">Invite link</Label>
            <Input
              id="invite-url"
              readonly
              value={displayUrl}
              class="flex-1 font-mono text-xs"
              onfocus={(e) => e.currentTarget.select()}
            />
            <div class="flex gap-2">
              <Button type="button" variant="outline" onclick={() => void copyText(displayUrl, 'Invite link')}>
                <CopyIcon />
                Copy
              </Button>
              <Button type="submit" variant="outline" disabled={linkPending}>
                {#if linkPending}<Loader2Icon class="animate-spin" />{:else}<RefreshCwIcon />{/if}
                Regenerate
              </Button>
            </div>
          </div>
        </div>
      {:else}
        <div class="flex flex-col items-start gap-2">
          <p class="text-sm text-muted-foreground">Generate a link anyone can use to join as a member.</p>
          <Button type="submit" variant="outline" disabled={linkPending}>
            {#if linkPending}<Loader2Icon class="animate-spin" />{:else}<Link2Icon />{/if}
            Generate invite link
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
