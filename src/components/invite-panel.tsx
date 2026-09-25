'use client';

// Invite panel (settings › Members, owner/admin): invite by email with a role,
// the pending email invitations (resend / copy link / revoke), and the
// reusable shareable link (joins as member). URLs arrive from the server page;
// actions revalidate the page so lists stay fresh without local syncing.

import { useActionState, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Copy, Link2, Loader2, Mail, MoreHorizontal, RefreshCw, Send, X } from 'lucide-react';

import {
  generateInviteLink,
  inviteByEmail,
  resendInvitation,
  revokeInvitation,
  type GenerateInviteState,
} from '@/app/actions/invite';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LabelChip } from '@/components/ui-icons';
import { useProjectPermissions } from '@/components/workspaces/permissions';
import { PROJECT_ROLE_DESCRIPTION, PROJECT_ROLE_LABEL, type AssignableRole } from '@/components/workspaces/role-rules';
import { relativeTime } from '@/components/issues/issue-properties';

export interface PendingInvitation {
  id: string;
  email: string;
  role: AssignableRole;
  /** ISO string. */
  expiresAt: string;
  url: string;
  invitedByName: string | null;
}

async function copyText(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error('Copy failed — your browser blocked clipboard access');
  }
}

/** Toast after an email invite / resend; offers the link when email is off. */
function announceSent(email: string, result: { emailed?: boolean; url?: string }) {
  if (result.emailed || !result.url) {
    toast.success(`Invitation sent to ${email}`);
    return;
  }
  const url = result.url;
  toast.success('Invitation created', {
    description: 'Email isn’t configured on this server — share the link yourself.',
    action: { label: 'Copy link', onClick: () => void copyText(url, 'Invite link') },
  });
}

export function InvitePanel({
  projectId,
  inviteUrl,
  pending = [],
}: {
  projectId: string;
  inviteUrl: string | null;
  pending?: PendingInvitation[];
}) {
  return (
    <div className="flex flex-col gap-6">
      <EmailInviteForm projectId={projectId} />
      {pending.length > 0 && <PendingInvitations projectId={projectId} pending={pending} />}
      <ShareableLink projectId={projectId} inviteUrl={inviteUrl} />
    </div>
  );
}

function EmailInviteForm({ projectId }: { projectId: string }) {
  const perms = useProjectPermissions();
  const roles = perms.assignableRoles;
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AssignableRole>(roles.includes('member') ? 'member' : roles[0]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = email.trim();
    if (!value) return;
    startTransition(async () => {
      const result = await inviteByEmail({ projectId, email: value, role });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setEmail('');
      announceSent(value, result);
    });
  }

  return (
    <section>
      <h2 className="mb-1 text-base font-medium">Invite by email</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        They’ll get a link that works once, for that address, for 7 days.
      </p>
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
        <Label htmlFor="invite-email" className="sr-only">
          Email address
        </Label>
        <Input
          id="invite-email"
          type="email"
          autoComplete="off"
          placeholder="name@company.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (error) setError(null);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'invite-email-error' : undefined}
          className="flex-1"
        />
        <Select value={role} onValueChange={(v) => setRole(v as AssignableRole)}>
          <SelectTrigger className="sm:w-28" aria-label="Role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {roles.map((r) => (
              <SelectItem key={r} value={r} title={PROJECT_ROLE_DESCRIPTION[r]}>
                {PROJECT_ROLE_LABEL[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" disabled={isPending || !email.trim()}>
          {isPending ? <Loader2 className="animate-spin" /> : <Send />}
          Send invite
        </Button>
      </form>
      {error && (
        <p id="invite-email-error" role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}

function PendingInvitations({
  projectId,
  pending,
}: {
  projectId: string;
  pending: PendingInvitation[];
}) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-medium text-muted-foreground">
        Pending invitations · {pending.length}
      </h2>
      <ul className="flex flex-col divide-y divide-border/60 rounded-lg border">
        {pending.map((invitation) => (
          <PendingRow key={invitation.id} projectId={projectId} invitation={invitation} />
        ))}
      </ul>
    </section>
  );
}

function PendingRow({ projectId, invitation }: { projectId: string; invitation: PendingInvitation }) {
  const perms = useProjectPermissions();
  const [isPending, startTransition] = useTransition();
  // Rendered from a server snapshot; "expired" is recomputed on each render.
  const expiresAt = new Date(invitation.expiresAt);
  // eslint-disable-next-line react-hooks/purity -- display-only comparison against the clock
  const expired = expiresAt.getTime() <= Date.now();
  const manageable = perms.assignableRoles.includes(invitation.role);

  function resend() {
    startTransition(async () => {
      const result = await resendInvitation({ projectId, invitationId: invitation.id });
      if (!result.ok) toast.error(result.error);
      else announceSent(invitation.email, result);
    });
  }

  function revoke() {
    startTransition(async () => {
      const result = await revokeInvitation({ projectId, invitationId: invitation.id });
      if (!result.ok) toast.error(result.error);
      else toast.success(`Invitation for ${invitation.email} revoked`);
    });
  }

  return (
    <li className="flex min-h-11 items-center gap-3 px-3 py-2">
      <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{invitation.email}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {expired ? 'Expired' : `Expires ${relativeTime(expiresAt)}`}
          {invitation.invitedByName && ` · invited by ${invitation.invitedByName}`}
        </span>
      </span>
      <LabelChip color={expired ? 'destructive' : 'default'}>
        {expired ? 'Expired' : PROJECT_ROLE_LABEL[invitation.role]}
      </LabelChip>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Actions for the invitation to ${invitation.email}`}
            disabled={isPending}
          >
            {isPending ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {manageable && (
            <DropdownMenuItem onSelect={resend}>
              <Send />
              {expired ? 'Renew and resend' : 'Resend email'}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => void copyText(invitation.url, 'Invite link')}>
            <Copy />
            Copy invite link
          </DropdownMenuItem>
          {manageable && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={revoke}>
                <X />
                Revoke invitation
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

const initialState: GenerateInviteState = {};

function ShareableLink({ projectId, inviteUrl }: { projectId: string; inviteUrl: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, formAction, isPending] = useActionState(
    async (prevState: GenerateInviteState | Record<string, never>, formData: FormData) => {
      const hadUrl = Boolean((prevState as GenerateInviteState).url ?? inviteUrl);
      const result = await generateInviteLink(prevState, formData);
      if (result.url) toast.success(hadUrl ? 'Invite link regenerated' : 'Invite link created');
      return result;
    },
    initialState,
  );
  // Prefer the just-generated URL over the (possibly stale) server prop.
  const displayUrl = state.url ?? inviteUrl;

  return (
    <section>
      <h2 className="mb-1 flex items-center gap-1.5 text-base font-medium">
        <Link2 className="size-4 text-muted-foreground" aria-hidden="true" />
        Shareable link
      </h2>
      <form action={formAction}>
        <input type="hidden" name="projectId" value={projectId} />
        {displayUrl ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">
              Anyone with this link can join as a member. It expires in 30 days.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Label htmlFor="invite-url" className="sr-only">
                Invite link
              </Label>
              <Input
                id="invite-url"
                readOnly
                value={displayUrl}
                className="flex-1 font-mono text-xs"
                ref={inputRef}
                onFocus={(e) => e.currentTarget.select()}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void copyText(displayUrl, 'Invite link')}
                >
                  <Copy />
                  Copy
                </Button>
                <Button type="submit" variant="outline" disabled={isPending}>
                  {isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                  Regenerate
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-muted-foreground">
              Generate a link anyone can use to join as a member.
            </p>
            <Button type="submit" variant="outline" disabled={isPending}>
              {isPending ? <Loader2 className="animate-spin" /> : <Link2 />}
              Generate invite link
            </Button>
          </div>
        )}
        {state.errors?.server && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {state.errors.server}
          </p>
        )}
      </form>
    </section>
  );
}
