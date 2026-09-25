'use client';

// Pieces shared by the API importers (Asana, Shortcut): the token step and the
// fetched-records preview. The token lives in component state only — it's
// sent with each server call and never stored.

import { useId, useState, type ReactNode } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { EmptyState } from '@/components/ui-icons';
import type { ExternalFetchResult } from '@/lib/import/external';
import { EXTERNAL_IMPORT_CAP } from '@/lib/import/records';
import { RecordPreview } from './import-runner';

export function TokenForm({
  provider,
  help,
  pending,
  onSubmit,
}: {
  provider: string;
  help: ReactNode;
  pending: boolean;
  onSubmit: (token: string) => void;
}) {
  const id = useId();
  const [token, setToken] = useState('');
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (token.trim()) onSubmit(token.trim());
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-64 flex-1 flex-col gap-1.5">
          <Label htmlFor={id}>{provider} personal access token</Label>
          <Input
            id={id}
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            disabled={pending}
          />
        </div>
        <Button type="submit" variant="outline" disabled={pending || !token.trim()}>
          {pending ? <Loader2 className="animate-spin" /> : <KeyRound />}
          Continue
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {help} The token is only used for this import and isn&apos;t saved.
      </p>
    </form>
  );
}

export function IncludeCompleted({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex h-8 items-center gap-2">
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
      <Label htmlFor={id} className="font-normal">
        Include completed
      </Label>
    </div>
  );
}

export function FetchedPreview({
  fetched,
  noun,
  sourceName,
  includeCompleted,
  onImport,
}: {
  fetched: ExternalFetchResult;
  /** "task" / "story" */
  noun: string;
  sourceName: string;
  includeCompleted: boolean;
  onImport: () => void;
}) {
  if (fetched.records.length === 0) {
    return (
      <EmptyState
        title={`No ${noun === 'story' ? 'stories' : `${noun}s`} to import`}
        description={`${sourceName} has no ${includeCompleted ? '' : 'open '}${noun === 'story' ? 'stories' : `${noun}s`}.`}
      />
    );
  }
  const count = fetched.records.length;
  return (
    <>
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">
          Preview{' '}
          <span className="font-normal text-muted-foreground">
            {fetched.open} open{includeCompleted && ` · ${fetched.closed} completed`}
            {fetched.children > 0 && ` · ${fetched.children} as sub-issues`}
            {fetched.truncated && ` · capped at the first ${EXTERNAL_IMPORT_CAP}`}
          </span>
        </h3>
        <RecordPreview records={fetched.records} />
        <p className="text-xs text-muted-foreground">
          Completed items land in the first completed state; others in the state with the same name when there
          is one, else the default. Assignees match members by email, tags become labels, and each issue links
          back to its source — items imported before are skipped.
        </p>
      </section>
      <div>
        <Button onClick={onImport}>
          Import {count} issue{count === 1 ? '' : 's'}
        </Button>
      </div>
    </>
  );
}
