'use client';

// Settings → Slack (D7). Workspaces the viewer installed / linked to (where Asks
// land, uninstall), the viewer's own Slack link (DM toggle, unlink), and the
// setup guide with the exact request URLs + an app manifest.

import { useState, useTransition } from 'react';
import { AlertCircle, CheckCircle2, ExternalLink, Hash, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  setSlackDefaultProject,
  setSlackDmNotify,
  uninstallSlack,
  unlinkSlack,
} from '@/app/dashboard/settings/slack/actions';
import { CopyField } from '@/components/integrations/copy-field';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

export interface SlackWorkspace {
  teamId: string;
  teamName: string;
  installedByName: string | null;
  defaultProject: { id: string; name: string } | null;
  canManage: boolean;
  /** The viewer's own link to this workspace. */
  link: { notify: boolean } | null;
}

interface AdminProject {
  id: string;
  name: string;
  ticketKey: string;
}

const NONE = '__none';

export function SlackAppSettings({
  configured,
  urls,
  manifest,
  workspaces,
  adminProjects,
  notice,
}: {
  configured: boolean;
  urls: { redirect: string; commands: string; interactivity: string; events: string };
  manifest: string;
  workspaces: SlackWorkspace[];
  adminProjects: AdminProject[];
  notice: { tone: 'success' | 'error'; text: string } | null;
}) {
  const linked = workspaces.filter((w) => w.link);

  return (
    <div className="flex flex-col gap-10">
      {notice && (
        <div
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={cn(
            'flex items-start gap-2 rounded-lg border px-3 py-2 text-sm',
            notice.tone === 'error'
              ? 'border-destructive/30 bg-destructive/5 text-destructive'
              : 'border-border bg-muted/40',
          )}
        >
          {notice.tone === 'error' ? (
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
          ) : (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
          )}
          {notice.text}
        </div>
      )}

      {!configured && <SetupGuide urls={urls} manifest={manifest} open />}

      <section className="flex flex-col gap-3">
        <SectionHeader
          title="Workspaces"
          description="Slack workspaces where /ask and the “Create issue” shortcut file issues."
          action={
            <LinkButton href="/api/slack/install" enabled={configured}>
              <Hash />
              Add to Slack
            </LinkButton>
          }
        />
        {workspaces.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            No Slack workspaces connected.{' '}
            {configured
              ? 'Add the app to a workspace, or link your account if it’s already installed.'
              : 'Configure the Slack app below first.'}
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {workspaces.map((workspace) => (
              <WorkspaceRow key={workspace.teamId} workspace={workspace} adminProjects={adminProjects} />
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader
          title="Your Slack account"
          description="Link your Slack account to file Asks as yourself and get notifications as DMs."
          action={
            <LinkButton href="/api/slack/link" enabled={configured} variant="outline">
              Link my Slack account
            </LinkButton>
          }
        />
        {linked.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Not linked. Unlinked Asks are filed to the workspace’s default project, in triage.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {linked.map((workspace) => (
              <LinkRow key={workspace.teamId} workspace={workspace} />
            ))}
          </ul>
        )}
      </section>

      {configured && <SetupGuide urls={urls} manifest={manifest} />}
    </div>
  );
}

/** Full-page navigation (the OAuth routes redirect to Slack); disabled until configured. */
function LinkButton({
  href,
  enabled,
  variant,
  children,
}: {
  href: string;
  enabled: boolean;
  variant?: 'outline';
  children: React.ReactNode;
}) {
  if (!enabled) {
    return (
      <Button size="sm" variant={variant} disabled>
        {children}
      </Button>
    );
  }
  return (
    <Button asChild size="sm" variant={variant}>
      <a href={href}>{children}</a>
    </Button>
  );
}

function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <h2 className="text-base font-medium">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

function WorkspaceRow({
  workspace,
  adminProjects,
}: {
  workspace: SlackWorkspace;
  adminProjects: AdminProject[];
}) {
  const [value, setValue] = useState(workspace.defaultProject?.id ?? NONE);
  const [confirming, setConfirming] = useState(false);
  const [saving, startSave] = useTransition();
  const [removing, startRemove] = useTransition();

  // Keep the current default selectable even when the viewer doesn't admin it.
  const options =
    workspace.defaultProject && !adminProjects.some((p) => p.id === workspace.defaultProject!.id)
      ? [{ ...workspace.defaultProject, ticketKey: '', disabled: true }, ...adminProjects]
      : adminProjects;

  function change(next: string) {
    const previous = value;
    setValue(next);
    startSave(async () => {
      const result = await setSlackDefaultProject({
        teamId: workspace.teamId,
        projectId: next === NONE ? null : next,
      });
      if (result.ok) toast.success(next === NONE ? 'Asks from linked users only' : 'Default project updated');
      else {
        setValue(previous);
        toast.error(result.error);
      }
    });
  }

  function uninstall() {
    startRemove(async () => {
      const result = await uninstallSlack({ teamId: workspace.teamId });
      if (result.ok) toast.success(`Removed from ${workspace.teamName}`);
      else toast.error(result.error);
    });
  }

  const selectId = `slack-default-${workspace.teamId}`;

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{workspace.teamName}</p>
        <p className="truncate text-xs text-muted-foreground">
          {workspace.installedByName ? `Installed by ${workspace.installedByName}` : 'Installed'}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {workspace.canManage ? (
          <Label htmlFor={selectId} className="text-xs font-normal text-muted-foreground">
            Unlinked Asks go to
          </Label>
        ) : (
          <span className="text-xs text-muted-foreground">Unlinked Asks go to</span>
        )}
        {workspace.canManage ? (
          <Select value={value} onValueChange={change} disabled={saving}>
            <SelectTrigger id={selectId} size="sm" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Nowhere (linked users only)</SelectItem>
              {options.map((project) => (
                <SelectItem
                  key={project.id}
                  value={project.id}
                  disabled={'disabled' in project && project.disabled}
                >
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-sm">
            {workspace.defaultProject?.name ?? 'Nowhere'}
          </span>
        )}
      </div>
      {workspace.canManage && (
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground"
          onClick={() => setConfirming(true)}
          disabled={removing}
        >
          {removing && <Loader2 className="animate-spin" />}
          Uninstall
        </Button>
      )}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Uninstall from {workspace.teamName}?</AlertDialogTitle>
            <AlertDialogDescription>
              /ask and the message shortcut stop working there, and everyone’s Slack link to this
              workspace is removed. Existing issues stay.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={uninstall}>
              Uninstall
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

function LinkRow({ workspace }: { workspace: SlackWorkspace }) {
  const [notify, setNotify] = useState(workspace.link?.notify ?? true);
  const [pending, start] = useTransition();
  const switchId = `slack-dm-${workspace.teamId}`;

  function toggle(next: boolean) {
    setNotify(next);
    start(async () => {
      const result = await setSlackDmNotify({ teamId: workspace.teamId, notify: next });
      if (!result.ok) {
        setNotify(!next);
        toast.error(result.error);
      }
    });
  }

  function unlink() {
    start(async () => {
      const result = await unlinkSlack({ teamId: workspace.teamId });
      if (result.ok) toast.success(`Unlinked from ${workspace.teamName}`);
      else toast.error(result.error);
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <p className="min-w-0 flex-1 truncate text-sm font-medium">{workspace.teamName}</p>
      <div className="flex items-center gap-2">
        <Switch id={switchId} size="sm" checked={notify} onCheckedChange={toggle} disabled={pending} />
        <Label htmlFor={switchId} className="font-normal">
          Send me notifications as DMs
        </Label>
      </div>
      <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={unlink} disabled={pending}>
        Unlink
      </Button>
    </li>
  );
}

function SetupGuide({
  urls,
  manifest,
  open = false,
}: {
  urls: { redirect: string; commands: string; interactivity: string; events: string };
  manifest: string;
  open?: boolean;
}) {
  const rows = [
    { label: 'OAuth redirect URL', value: urls.redirect },
    { label: 'Slash command /ask', value: urls.commands },
    { label: 'Interactivity & shortcuts', value: urls.interactivity },
    { label: 'Event subscriptions', value: urls.events },
  ];

  return (
    <details open={open} className="group rounded-lg border px-4 py-3">
      <summary className="cursor-pointer text-sm font-medium select-none">
        {open ? 'Set up the Slack app' : 'App configuration'}
      </summary>
      <div className="mt-4 flex flex-col gap-5 text-sm">
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-muted-foreground">
          <li>
            Open{' '}
            <a
              href="https://api.slack.com/apps?new_app=1"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-foreground"
            >
              api.slack.com/apps
              <ExternalLink className="size-3" />
            </a>{' '}
            → Create New App → <em>From a manifest</em>, pick a workspace and paste the JSON below.
          </li>
          <li>
            From <em>Basic Information</em>, copy the Client ID, Client Secret and Signing Secret into
            the server environment as <code className="font-mono text-xs">SLACK_CLIENT_ID</code>,{' '}
            <code className="font-mono text-xs">SLACK_CLIENT_SECRET</code> and{' '}
            <code className="font-mono text-xs">SLACK_SIGNING_SECRET</code>, then redeploy.
          </li>
          <li>Come back here and click “Add to Slack”. The free Slack plan is enough.</li>
        </ol>

        <div className="flex flex-col gap-2">
          <p className="font-medium">Request URLs</p>
          {rows.map((row) => (
            <div key={row.label} className="grid gap-1 sm:grid-cols-[12rem_1fr] sm:items-center">
              <span className="text-xs text-muted-foreground">{row.label}</span>
              <CopyField value={row.value} label="URL" />
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <p className="font-medium">App manifest</p>
          <CopyField value={manifest} label="Manifest" multiline className="[&_textarea]:h-48" />
        </div>
      </div>
    </details>
  );
}
