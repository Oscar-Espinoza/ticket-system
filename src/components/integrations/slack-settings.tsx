'use client';

import { useState, useTransition } from 'react';
import { Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';

import { saveSlackSettings, sendSlackTest } from '@/app/actions/integrations';
import { Field } from '@/components/settings/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  SLACK_EVENTS,
  SLACK_URL_PREFIX,
  type SlackEventKind,
} from '@/lib/integrations/event-types';

export function SlackSettings({
  projectId,
  url: savedUrl,
  events: savedEvents,
}: {
  projectId: string;
  /** Saved webhook URL, '' when not connected. */
  url: string;
  events: SlackEventKind[];
}) {
  const [connected, setConnected] = useState(Boolean(savedUrl));
  const [url, setUrl] = useState(savedUrl);
  const [events, setEvents] = useState<SlackEventKind[]>(
    savedUrl ? savedEvents : SLACK_EVENTS.map((e) => e.kind),
  );
  const [error, setError] = useState<string>();
  const [saving, startSave] = useTransition();
  const [testing, startTest] = useTransition();

  function save(nextUrl = url) {
    startSave(async () => {
      const result = await saveSlackSettings({ projectId, url: nextUrl, events });
      if (!result.ok) {
        if (result.field === 'url') setError(result.error);
        else toast.error(result.error);
        return;
      }
      setError(undefined);
      setConnected(result.connected);
      if (!result.connected) setUrl('');
      toast.success(result.connected ? 'Slack settings saved' : 'Slack disconnected');
    });
  }

  function test() {
    startTest(async () => {
      const result = await sendSlackTest({ projectId });
      if (result.ok) toast.success('Test message sent');
      else toast.error(result.error);
    });
  }

  const toggle = (kind: SlackEventKind, on: boolean) =>
    setEvents((prev) => (on ? [...prev, kind] : prev.filter((k) => k !== kind)));

  return (
    <section className="flex flex-col gap-5">
      <div>
        <h2 className="text-base font-medium">Slack</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Post issue activity to a channel through a Slack{' '}
          <a
            href="https://api.slack.com/messaging/webhooks"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            incoming webhook
          </a>
          .
        </p>
      </div>

      <form
        className="flex flex-col gap-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field id="slack-url" label="Webhook URL" error={error}>
          <Input
            id="slack-url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setError(undefined);
            }}
            placeholder={`${SLACK_URL_PREFIX}services/…`}
            autoComplete="off"
            spellCheck={false}
            className="font-mono text-xs"
            aria-invalid={!!error}
            aria-describedby={error ? 'slack-url-error' : undefined}
          />
        </Field>

        <fieldset className="flex flex-col gap-2.5">
          <legend className="mb-2 text-sm font-medium">Post when</legend>
          {SLACK_EVENTS.map(({ kind, label }) => (
            <div key={kind} className="flex items-center gap-3">
              <Switch
                id={`slack-${kind}`}
                size="sm"
                checked={events.includes(kind)}
                onCheckedChange={(on) => toggle(kind, on)}
              />
              <Label htmlFor={`slack-${kind}`} className="font-normal">
                {label}
              </Label>
            </div>
          ))}
        </fieldset>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={saving || !url.trim()}>
            {saving && <Loader2 className="animate-spin" />}
            {connected ? 'Save changes' : 'Connect Slack'}
          </Button>
          {connected && (
            <>
              <Button type="button" variant="outline" onClick={test} disabled={testing}>
                {testing ? <Loader2 className="animate-spin" /> : <Send />}
                Send test message
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="text-muted-foreground"
                onClick={() => save('')}
                disabled={saving}
              >
                Disconnect
              </Button>
            </>
          )}
        </div>
      </form>
    </section>
  );
}
