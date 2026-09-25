'use client';

// Settings → GitHub body: account (link with elevated scopes), repository +
// webhook, and PR automations. Controls hide for non-admins; the actions
// re-check the role server-side.

import { useEffect, useState, useTransition } from 'react';
import { usePathname } from 'next/navigation';
import { AlertTriangle, Check, ExternalLink, Loader2, Unplug, Webhook } from 'lucide-react';
import { toast } from 'sonner';

import {
  connectRepository,
  disconnectRepository,
  registerWebhook,
  updateGithubAutomation,
  type ConnectResult,
} from '@/app/actions/github';
import { getGithubWebhookHealth, updateGithubWebhookEvents } from '@/app/actions/developer';
import { useProjectData } from '@/components/project/project-data';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Avatar, StateIcon } from '@/components/ui-icons';
import { Field } from '@/components/settings/field';
import { authClient } from '@/lib/auth-client';
import {
  AUTOMATION_OFF,
  defaultPrMergeState,
  defaultPrOpenState,
} from '@/lib/github/automation';
import { REQUIRED_SCOPES } from '@/lib/github/scopes';
import type { WorkflowState } from '@/lib/issue-model';
import { cn } from '@/lib/utils';
import { GithubMark } from './github-mark';
import { RepoPicker } from './repo-picker';

type AccountProp =
  | { status: 'none' }
  | { status: 'invalid' }
  | { status: 'error' }
  | {
      status: 'connected';
      login: string;
      avatarUrl: string;
      scopes: string[];
      hasRequiredScopes: boolean;
    };

export interface GithubSettingsProps {
  projectId: string;
  canEdit: boolean;
  account: AccountProp;
  linkError: string | null;
  repo: string | null;
  webhookRegistered: boolean;
  connectedByName: string | null;
  webhookUrl: string;
  webhookUnreachable: boolean;
  prOpenStateId: string | null;
  prMergeStateId: string | null;
}

export function GithubSettings(props: GithubSettingsProps) {
  const ready = props.account.status === 'connected' && props.account.hasRequiredScopes;
  return (
    <div className="flex flex-col">
      {!props.canEdit && (
        <p className="mb-6 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Only project owners and admins can change the GitHub connection.
        </p>
      )}
      <AccountSection account={props.account} linkError={props.linkError} />
      <Separator className="my-10" />
      <RepositorySection {...props} accountReady={ready} />
      <Separator className="my-10" />
      <AutomationSection {...props} />
    </div>
  );
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="text-base font-medium">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function Callout({ tone, children }: { tone: 'warning' | 'error'; children: React.ReactNode }) {
  return (
    <p
      role={tone === 'error' ? 'alert' : undefined}
      className={cn(
        'flex items-start gap-2 rounded-md border px-3 py-2 text-sm',
        tone === 'warning'
          ? 'border-amber-500/30 bg-amber-500/10 text-foreground'
          : 'border-destructive/30 bg-destructive/10 text-destructive',
      )}
    >
      <AlertTriangle
        aria-hidden="true"
        className={cn('mt-0.5 size-4 shrink-0', tone === 'warning' && 'text-amber-500')}
      />
      <span>{children}</span>
    </p>
  );
}

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

function AccountSection({ account, linkError }: { account: AccountProp; linkError: string | null }) {
  const pathname = usePathname();
  const [pending, setPending] = useState(false);

  const link = async () => {
    setPending(true);
    // Redirects to GitHub; the callback updates this user's GitHub account row
    // (or creates it) with the extra scopes, then returns here.
    const { error } = await authClient.linkSocial({
      provider: 'github',
      scopes: [...REQUIRED_SCOPES],
      callbackURL: pathname,
      errorCallbackURL: pathname,
    });
    if (error) {
      setPending(false);
      toast.error(error.message ?? 'Could not start the GitHub connection.');
    }
  };

  const button = (label: string, variant: 'default' | 'outline' = 'default') => (
    <Button variant={variant} onClick={link} disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : <GithubMark className="size-4" />}
      {label}
    </Button>
  );

  return (
    <section className="flex flex-col gap-4" aria-labelledby="github-account">
      <SectionHeading
        title="Your GitHub account"
        description={`Branches and webhooks are created with your own GitHub authorization (${REQUIRED_SCOPES.join(', ')}). Your token never leaves the server.`}
      />
      {linkError && <Callout tone="error">{linkError}</Callout>}
      {account.status === 'none' && <div>{button('Connect GitHub')}</div>}
      {account.status === 'invalid' && (
        <>
          <Callout tone="warning">Your GitHub authorization expired or was revoked.</Callout>
          <div>{button('Reconnect GitHub')}</div>
        </>
      )}
      {account.status === 'error' && (
        <Callout tone="warning">GitHub couldn&apos;t be reached. Reload to try again.</Callout>
      )}
      {account.status === 'connected' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Avatar name={account.login} src={account.avatarUrl} />
            <a
              href={`https://github.com/${account.login}`}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium hover:underline"
            >
              @{account.login}
            </a>
            <div className="flex flex-wrap gap-1">
              {account.scopes.map((scope) => (
                <span
                  key={scope}
                  className="rounded border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
                >
                  {scope}
                </span>
              ))}
            </div>
          </div>
          {account.hasRequiredScopes ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Check className="size-3.5 text-emerald-500" aria-hidden="true" />
              Repository access granted.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Grant repository access to connect repositories and create branches.
              </p>
              <div>{button('Grant repository access')}</div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Repository + webhook
// ---------------------------------------------------------------------------

function toastConnect(result: ConnectResult, success: string) {
  if (!result.ok) {
    toast.error(result.error);
    return;
  }
  if (result.webhook === 'registered') toast.success(success);
  else toast.warning(result.warning ?? 'Webhook not registered.');
}

function RepositorySection({
  projectId,
  canEdit,
  accountReady,
  repo,
  webhookRegistered,
  connectedByName,
  webhookUrl,
  webhookUnreachable,
}: GithubSettingsProps & { accountReady: boolean }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [action, setAction] = useState<'connect' | 'webhook' | 'disconnect' | null>(null);
  const health = useWebhookHealth(projectId, !!repo && webhookRegistered && canEdit && accountReady);

  const run = (kind: typeof action, fn: () => Promise<void>) => {
    setAction(kind);
    startTransition(async () => {
      await fn();
      setAction(null);
    });
  };

  const connect = () =>
    run('connect', async () => {
      if (!selected) return;
      const result = await connectRepository({ projectId, repo: selected });
      toastConnect(result, `Connected ${result.ok ? result.repo : selected}`);
      if (result.ok) setSelected(null);
    });

  const reRegister = () =>
    run('webhook', async () => {
      const result = await registerWebhook(projectId);
      toastConnect(result, 'Webhook registered');
      if (result.ok && result.webhook === 'registered') health.markCurrent();
    });

  const disconnect = () =>
    run('disconnect', async () => {
      const result = await disconnectRepository(projectId);
      if (!result.ok) toast.error(result.error);
      else if (result.warning) toast.warning(result.warning);
      else toast.success('Repository disconnected');
    });

  const spinner = (kind: typeof action) => pending && action === kind && <Loader2 className="animate-spin" />;

  return (
    <section className="flex flex-col gap-4" aria-labelledby="github-repo">
      <SectionHeading
        title="Repository"
        description="Issues link to pull requests in this repository, and branches are created here."
      />

      {webhookUnreachable && (
        <Callout tone="warning">
          GitHub can&apos;t deliver webhooks to <span className="font-mono text-xs">{webhookUrl}</span>.
          Branches still work, but pull request automation needs a public URL — set{' '}
          <span className="font-mono text-xs">NEXT_PUBLIC_APP_URL</span> (or{' '}
          <span className="font-mono text-xs">GITHUB_WEBHOOK_BASE_URL</span> for a tunnel) and
          register the webhook again.
        </Callout>
      )}

      {repo ? (
        <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
          <div className="flex items-center gap-3">
            <GithubMark className="size-4 shrink-0" />
            <a
              href={`https://github.com/${repo}`}
              target="_blank"
              rel="noreferrer"
              className="flex min-w-0 items-center gap-1 font-mono text-sm hover:underline"
            >
              <span className="truncate">{repo}</span>
              <ExternalLink className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
            </a>
            {connectedByName && (
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                Connected by {connectedByName}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Webhook className="size-4 text-muted-foreground" aria-hidden="true" />
            {webhookRegistered ? (
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                Webhook active
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="size-1.5 rounded-full bg-amber-500" aria-hidden="true" />
                Webhook not registered — pull requests won&apos;t update issues.
              </span>
            )}
          </div>
          {health.status === 'outdated' && (
            <Callout tone="warning">
              <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span>
                  The webhook doesn&apos;t send review and CI events yet, so pull requests can&apos;t show
                  approval and check status.
                </span>
                <Button size="xs" variant="outline" onClick={health.update} disabled={health.updating}>
                  {health.updating && <Loader2 className="animate-spin" />}
                  Update webhook
                </Button>
              </span>
            </Callout>
          )}
          {health.status === 'missing' && (
            <Callout tone="warning">
              The webhook was removed on GitHub. Register it again to keep pull requests in sync.
            </Callout>
          )}
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={reRegister}
                disabled={pending || !accountReady}
                title={accountReady ? undefined : 'Connect your GitHub account with repository access first'}
              >
                {spinner('webhook')}
                {webhookRegistered ? 'Re-register webhook' : 'Register webhook'}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" disabled={pending}>
                    {spinner('disconnect') || <Unplug />}
                    Disconnect
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Disconnect {repo}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      The webhook is removed from GitHub and pull requests stop updating issues.
                      Existing links and branch names on issues are kept.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={disconnect}>
                      Disconnect
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>
      ) : canEdit ? (
        accountReady ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <RepoPicker projectId={projectId} value={selected} onChange={setSelected} disabled={pending} />
            <Button onClick={connect} disabled={!selected || pending}>
              {spinner('connect')}
              Connect repository
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Connect your GitHub account with repository access above to pick a repository.
          </p>
        )
      ) : (
        <p className="text-sm text-muted-foreground">No repository connected.</p>
      )}
    </section>
  );
}

/**
 * Whether the registered hook subscribes to every event we handle — hooks from
 * before review / CI support only send pull_request + push. Checked with the
 * viewer's own token; 'unknown' (no access) shows nothing.
 */
function useWebhookHealth(projectId: string, enabled: boolean) {
  const [status, setStatus] = useState<'current' | 'outdated' | 'missing' | 'unknown'>('unknown');
  const [updating, startUpdate] = useTransition();

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    getGithubWebhookHealth(projectId)
      .then((result) => {
        if (!cancelled && result.ok) setStatus(result.status);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [projectId, enabled]);

  const update = () =>
    startUpdate(async () => {
      const result = await updateGithubWebhookEvents(projectId);
      if (result.ok) {
        setStatus('current');
        toast.success('Webhook updated');
      } else {
        toast.error(result.error);
      }
    });

  // A fresh registration subscribes to every event.
  const markCurrent = () => setStatus('current');

  return { status: enabled ? status : 'unknown', update, updating, markCurrent };
}

// ---------------------------------------------------------------------------
// Automations
// ---------------------------------------------------------------------------

const DEFAULT_VALUE = 'default';

function toValue(setting: string | null) {
  return setting ?? DEFAULT_VALUE;
}

function fromValue(value: string) {
  return value === DEFAULT_VALUE ? null : value;
}

function StateSelect({
  id,
  value,
  onChange,
  states,
  fallback,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  states: WorkflowState[];
  fallback: WorkflowState | undefined;
  disabled: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} className="w-full max-w-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={DEFAULT_VALUE}>
          {fallback ? (
            <>
              <StateIcon state={fallback} size={14} />
              {fallback.name} <span className="text-muted-foreground">(default)</span>
            </>
          ) : (
            'Default (no matching state)'
          )}
        </SelectItem>
        <SelectItem value={AUTOMATION_OFF}>No action</SelectItem>
        <SelectSeparator />
        {states.map((state) => (
          <SelectItem key={state.id} value={state.id}>
            <StateIcon state={state} size={14} />
            {state.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function AutomationSection({ projectId, canEdit, prOpenStateId, prMergeStateId }: GithubSettingsProps) {
  const { states, project } = useProjectData();
  const example = `${project.ticketKey}-12`;
  // A saved state id that was since deleted shows (and behaves) as the default.
  const known = (setting: string | null) =>
    setting === AUTOMATION_OFF || states.some((s) => s.id === setting) ? setting : null;
  const [open, setOpen] = useState(() => toValue(known(prOpenStateId)));
  const [merge, setMerge] = useState(() => toValue(known(prMergeStateId)));
  const [pending, startTransition] = useTransition();

  const save = (next: { open: string; merge: string }) => {
    const previous = { open, merge };
    setOpen(next.open);
    setMerge(next.merge);
    startTransition(async () => {
      const result = await updateGithubAutomation({
        projectId,
        prOpenStateId: fromValue(next.open),
        prMergeStateId: fromValue(next.merge),
      });
      if (result.ok) {
        toast.success('Automation updated');
      } else {
        setOpen(previous.open);
        setMerge(previous.merge);
        toast.error(result.error);
      }
    });
  };

  return (
    <section className="flex flex-col gap-5" aria-labelledby="github-automation">
      <SectionHeading
        title="Pull request automation"
        description={`Move issues when a linked pull request changes. Issues are linked by their ID in the branch name or PR title, or with magic words like “Fixes ${example}” in the description. Issues only move forward — never out of a completed or canceled state.`}
      />
      <Field
        id="github-pr-open"
        label="When a pull request is opened"
        hint="Drafts wait until they're marked ready for review."
      >
        <StateSelect
          id="github-pr-open"
          value={open}
          onChange={(value) => save({ open: value, merge })}
          states={states}
          fallback={defaultPrOpenState(states)}
          disabled={!canEdit || pending}
        />
      </Field>
      <Field
        id="github-pr-merge"
        label="When a pull request is merged"
        hint={`Also applies to commits on the default branch that say “Fixes ${example}”. “Ref ${example}” or “Part of ${example}” only link.`}
      >
        <StateSelect
          id="github-pr-merge"
          value={merge}
          onChange={(value) => save({ open, merge: value })}
          states={states}
          fallback={defaultPrMergeState(states)}
          disabled={!canEdit || pending}
        />
      </Field>
    </section>
  );
}
