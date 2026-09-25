'use client';

// Settings → GitLab, Bitbucket & Sentry body. Code hosts connect with an
// access token (encrypted server-side) and get a webhook; Sentry connects an
// internal integration by its client secret. Controls hide for non-admins; the
// actions re-check the role server-side.

import { useId, useState, useTransition, type ReactNode } from 'react';
import Link from 'next/link';
import { AlertTriangle, Check, Copy, ExternalLink, Loader2, Unplug, Webhook } from 'lucide-react';
import { toast } from 'sonner';

import {
  connectBitbucket,
  connectGitlab,
  connectSentry,
  disconnectIntegration,
  registerIntegrationWebhook,
  type VcsConnectResult,
} from '@/app/actions/developer';
import { projectHref } from '@/components/app-shell/routes';
import { Field } from '@/components/settings/field';
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
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { BitbucketMark, GitlabMark, SentryMark } from './provider-marks';

export interface VcsIntegrationView {
  repo: string;
  webUrl: string;
  /** GitLab only; shown when not gitlab.com. */
  baseUrl: string | null;
  webhookRegistered: boolean;
  connectedByName: string | null;
}

export interface SentryIntegrationView {
  webhookUrl: string;
  hasToken: boolean;
  connectedByName: string | null;
}

export interface DeveloperSettingsProps {
  projectId: string;
  canEdit: boolean;
  gitlab: VcsIntegrationView | null;
  bitbucket: VcsIntegrationView | null;
  sentry: SentryIntegrationView | null;
  /** The URL a Sentry connection uses (shown before connecting: Sentry needs it first). */
  sentryWebhookUrl: string;
  webhookBase: string;
  webhookUnreachable: boolean;
}

export function DeveloperSettings(props: DeveloperSettingsProps) {
  return (
    <div className="flex flex-col">
      {!props.canEdit && (
        <p className="mb-6 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Only project owners and admins can change these connections.
        </p>
      )}
      {props.webhookUnreachable && (
        <div className="mb-6">
          <Callout tone="warning">
            Webhooks can&apos;t reach <Mono>{props.webhookBase}</Mono>. Connections still save, but automation
            needs a public URL — set <Mono>NEXT_PUBLIC_APP_URL</Mono> (or <Mono>GITHUB_WEBHOOK_BASE_URL</Mono>{' '}
            for a tunnel) and register the webhooks again.
          </Callout>
        </div>
      )}
      <VcsSection provider="gitlab" projectId={props.projectId} canEdit={props.canEdit} integration={props.gitlab} />
      <Separator className="my-10" />
      <VcsSection
        provider="bitbucket"
        projectId={props.projectId}
        canEdit={props.canEdit}
        integration={props.bitbucket}
      />
      <Separator className="my-10" />
      <SentrySection {...props} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function Mono({ children }: { children: ReactNode }) {
  return <span className="font-mono text-xs">{children}</span>;
}

function SectionHeading({ icon, title, description }: { icon: ReactNode; title: string; description: ReactNode }) {
  return (
    <div>
      <h2 className="flex items-center gap-2 text-base font-medium">
        {icon}
        {title}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function Callout({ tone, children }: { tone: 'warning' | 'error'; children: ReactNode }) {
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
      <AlertTriangle aria-hidden="true" className={cn('mt-0.5 size-4 shrink-0', tone === 'warning' && 'text-amber-500')} />
      <span>{children}</span>
    </p>
  );
}

function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () =>
    navigator.clipboard.writeText(value).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => toast.error("Couldn't copy to the clipboard"),
    );
  return (
    <div className="flex max-w-xl items-center gap-2">
      <Input readOnly value={value} aria-label={label} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
      <Button type="button" variant="outline" size="icon" onClick={copy} aria-label={`Copy ${label.toLowerCase()}`}>
        {copied ? <Check className="text-emerald-500" /> : <Copy />}
      </Button>
    </div>
  );
}

function DisconnectButton({
  name,
  description,
  disabled,
  pending,
  onConfirm,
}: {
  name: string;
  description: string;
  disabled: boolean;
  pending: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" disabled={disabled}>
          {pending ? <Loader2 className="animate-spin" /> : <Unplug />}
          Disconnect
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Disconnect {name}?</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            Disconnect
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function toastConnect(result: VcsConnectResult, success: string) {
  if (!result.ok) toast.error(result.error);
  else if (result.webhook === 'registered') toast.success(success);
  else toast.warning(result.warning ?? 'Webhook not registered.');
}

// ---------------------------------------------------------------------------
// GitLab / Bitbucket
// ---------------------------------------------------------------------------

const VCS_COPY = {
  gitlab: {
    name: 'GitLab',
    icon: <GitlabMark className="size-4 text-[#e24329]" />,
    description:
      'Link a GitLab project (gitlab.com or self-hosted) so merge requests and commits update issues, with pipeline and approval status on each issue.',
    repoLabel: 'Project path',
    repoPlaceholder: 'group/project',
    tokenHint: (
      <>
        A personal, group or project access token with the <Mono>api</Mono> scope, from someone with the Maintainer
        role (needed to add the webhook). It&apos;s encrypted and only used to manage the webhook.
      </>
    ),
    pr: 'merge requests',
  },
  bitbucket: {
    name: 'Bitbucket',
    icon: <BitbucketMark className="size-4 text-[#2684ff]" />,
    description:
      'Link a Bitbucket Cloud repository so pull requests and commits update issues, with build and approval status on each issue.',
    repoLabel: 'Repository',
    repoPlaceholder: 'workspace/repository',
    tokenHint: (
      <>
        A repository or workspace access token with <Mono>webhook</Mono> and <Mono>pullrequest</Mono> read access —
        or an API token / app password together with your username below. It&apos;s encrypted and used for the
        webhook and build statuses.
      </>
    ),
    pr: 'pull requests',
  },
} as const;

function VcsSection({
  provider,
  projectId,
  canEdit,
  integration,
}: {
  provider: 'gitlab' | 'bitbucket';
  projectId: string;
  canEdit: boolean;
  integration: VcsIntegrationView | null;
}) {
  const copy = VCS_COPY[provider];
  const [pending, startTransition] = useTransition();
  const [action, setAction] = useState<'webhook' | 'disconnect' | null>(null);

  const run = (kind: typeof action, fn: () => Promise<void>) => {
    setAction(kind);
    startTransition(async () => {
      await fn();
      setAction(null);
    });
  };

  const reRegister = () =>
    run('webhook', async () => {
      toastConnect(await registerIntegrationWebhook({ projectId, provider }), 'Webhook registered');
    });

  const disconnect = () =>
    run('disconnect', async () => {
      const result = await disconnectIntegration({ projectId, provider });
      if (!result.ok) toast.error(result.error);
      else if (result.warning) toast.warning(result.warning);
      else toast.success(`${copy.name} disconnected`);
    });

  return (
    <section className="flex flex-col gap-4" aria-label={copy.name}>
      <SectionHeading
        icon={copy.icon}
        title={copy.name}
        description={
          <>
            {copy.description} Issues move with the{' '}
            <Link href={projectHref(projectId, 'settings/github')} className="underline underline-offset-2">
              pull request automation
            </Link>{' '}
            states from the GitHub settings.
          </>
        }
      />
      {integration ? (
        <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
          <div className="flex items-center gap-3">
            {copy.icon}
            <a
              href={integration.webUrl}
              target="_blank"
              rel="noreferrer"
              className="flex min-w-0 items-center gap-1 font-mono text-sm hover:underline"
            >
              <span className="truncate">{integration.repo}</span>
              <ExternalLink className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
            </a>
            {integration.baseUrl && (
              <span className="hidden truncate text-xs text-muted-foreground sm:inline">{integration.baseUrl}</span>
            )}
            {integration.connectedByName && (
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                Connected by {integration.connectedByName}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Webhook className="size-4 text-muted-foreground" aria-hidden="true" />
            {integration.webhookRegistered ? (
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                Webhook active
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="size-1.5 rounded-full bg-amber-500" aria-hidden="true" />
                Webhook not registered — {copy.pr} won&apos;t update issues.
              </span>
            )}
          </div>
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={reRegister} disabled={pending}>
                {pending && action === 'webhook' && <Loader2 className="animate-spin" />}
                {integration.webhookRegistered ? 'Re-register webhook' : 'Register webhook'}
              </Button>
              <DisconnectButton
                name={integration.repo}
                description={`The webhook is removed from ${copy.name} and ${copy.pr} stop updating issues. Existing links on issues are kept.`}
                disabled={pending}
                pending={pending && action === 'disconnect'}
                onConfirm={disconnect}
              />
            </div>
          )}
        </div>
      ) : canEdit ? (
        <VcsConnectForm provider={provider} projectId={projectId} />
      ) : (
        <p className="text-sm text-muted-foreground">Not connected.</p>
      )}
    </section>
  );
}

function VcsConnectForm({ provider, projectId }: { provider: 'gitlab' | 'bitbucket'; projectId: string }) {
  const copy = VCS_COPY[provider];
  const id = useId();
  const [baseUrl, setBaseUrl] = useState('');
  const [repo, setRepo] = useState('');
  const [token, setToken] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result =
        provider === 'gitlab'
          ? await connectGitlab({ projectId, baseUrl, repo, token })
          : await connectBitbucket({ projectId, repo, token, username });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toastConnect(result, `Connected ${result.repo}`);
      setToken('');
    });
  };

  return (
    <form onSubmit={submit} className="flex max-w-xl flex-col gap-4">
      {provider === 'gitlab' && (
        <Field id={`${id}-url`} label="GitLab URL" hint="Leave empty for gitlab.com.">
          <Input
            id={`${id}-url`}
            placeholder="https://gitlab.com"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            autoComplete="off"
            disabled={pending}
          />
        </Field>
      )}
      <Field id={`${id}-repo`} label={copy.repoLabel}>
        <Input
          id={`${id}-repo`}
          placeholder={copy.repoPlaceholder}
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          autoComplete="off"
          required
          disabled={pending}
        />
      </Field>
      <Field id={`${id}-token`} label="Access token" hint={copy.tokenHint}>
        <Input
          id={`${id}-token`}
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          autoComplete="off"
          required
          disabled={pending}
        />
      </Field>
      {provider === 'bitbucket' && (
        <Field
          id={`${id}-user`}
          label="Username (optional)"
          hint="Only for API tokens (your Atlassian email) or app passwords (your Bitbucket username)."
        >
          <Input
            id={`${id}-user`}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="off"
            disabled={pending}
          />
        </Field>
      )}
      {error && <Callout tone="error">{error}</Callout>}
      <div>
        <Button type="submit" disabled={pending || !repo.trim() || !token.trim()}>
          {pending && <Loader2 className="animate-spin" />}
          Connect {copy.name}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Sentry
// ---------------------------------------------------------------------------

function SentrySection({ projectId, canEdit, sentry, sentryWebhookUrl }: DeveloperSettingsProps) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const webhookUrl = sentry?.webhookUrl ?? sentryWebhookUrl;

  const disconnect = () =>
    startTransition(async () => {
      const result = await disconnectIntegration({ projectId, provider: 'sentry' });
      if (!result.ok) toast.error(result.error);
      else toast.success('Sentry disconnected');
    });

  return (
    <section className="flex flex-col gap-4" aria-label="Sentry">
      <SectionHeading
        icon={<SentryMark className="size-4 text-[#7553ff]" />}
        title="Sentry"
        description="Turn Sentry issue alerts into triage issues — one per Sentry issue, with the culprit, event count and a link — and note on the issue when Sentry marks it resolved. To link an existing Sentry issue, paste its URL as a link on the issue."
      />

      {sentry && !editing ? (
        <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
            Connected
            <span className="text-muted-foreground">
              · {sentry.hasToken ? 'event counts on' : 'no auth token (no event counts)'}
            </span>
            {sentry.connectedByName && (
              <span className="ml-auto text-xs text-muted-foreground">Connected by {sentry.connectedByName}</span>
            )}
          </div>
          <Field id="sentry-url" label="Webhook URL">
            <CopyField value={webhookUrl} label="Webhook URL" />
          </Field>
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(true)} disabled={pending}>
                Replace secret
              </Button>
              <DisconnectButton
                name="Sentry"
                description="Alerts stop creating issues here. Issues already created and their Sentry links are kept."
                disabled={pending}
                pending={pending}
                onConfirm={disconnect}
              />
            </div>
          )}
        </div>
      ) : canEdit ? (
        <>
          <ol className="flex max-w-2xl list-decimal flex-col gap-2 pl-5 text-sm text-muted-foreground">
            <li>
              In Sentry, open <span className="text-foreground">Settings → Custom Integrations → Create New Integration</span>{' '}
              and choose <span className="text-foreground">Internal Integration</span>.
            </li>
            <li>
              Set the Webhook URL to:
              <div className="mt-1.5">
                <CopyField value={webhookUrl} label="Webhook URL" />
              </div>
            </li>
            <li>
              Turn on <span className="text-foreground">Alert Rule Action</span>, give it{' '}
              <span className="text-foreground">Issue &amp; Event: Read</span>, and under Webhooks subscribe to{' '}
              <span className="text-foreground">issue</span> (for resolves). Save.
            </li>
            <li>Paste the integration&apos;s Client Secret below (and a token for event counts).</li>
            <li>
              In an issue alert rule, add the action{' '}
              <span className="text-foreground">Send a notification via &lt;your integration&gt;</span>.
            </li>
          </ol>
          <SentryForm
            projectId={projectId}
            onDone={() => setEditing(false)}
            onCancel={sentry ? () => setEditing(false) : undefined}
          />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Not connected.</p>
      )}
    </section>
  );
}

function SentryForm({
  projectId,
  onDone,
  onCancel,
}: {
  projectId: string;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const [secret, setSecret] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await connectSentry({ projectId, clientSecret: secret, authToken: token });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success('Sentry connected');
      setSecret('');
      setToken('');
      onDone();
    });
  };

  return (
    <form onSubmit={submit} className="flex max-w-xl flex-col gap-4">
      <Field id="sentry-secret" label="Client secret" hint="Verifies that webhooks really come from your Sentry integration.">
        <Input
          id="sentry-secret"
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          autoComplete="off"
          required
          disabled={pending}
        />
      </Field>
      <Field
        id="sentry-token"
        label="Auth token (optional)"
        hint="The integration's token. Lets new issues include the Sentry short ID and event / user counts."
      >
        <Input
          id="sentry-token"
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          autoComplete="off"
          disabled={pending}
        />
      </Field>
      {error && <Callout tone="error">{error}</Callout>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending || !secret.trim()}>
          {pending && <Loader2 className="animate-spin" />}
          Connect Sentry
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
