'use client';

import { useState, useTransition } from 'react';
import { ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { rotateIntakeToken, setIntakeEnabled } from '@/app/actions/intake';
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
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { CopyField } from './copy-field';

export function IntakeSettings({
  projectId,
  url: initialUrl,
  canEdit,
  triageEnabled,
}: {
  projectId: string;
  url: string | null;
  canEdit: boolean;
  triageEnabled: boolean;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [pending, startTransition] = useTransition();

  function run(task: () => ReturnType<typeof rotateIntakeToken>, success: string) {
    startTransition(async () => {
      const result = await task();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setUrl(result.url);
      toast.success(success);
    });
  }

  const embed = url
    ? `<iframe src="${url}" title="Submit a request" width="100%" height="720" style="border:0"></iframe>`
    : '';

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-start gap-3">
        <Switch
          id="intake-enabled"
          checked={!!url}
          disabled={!canEdit || pending}
          onCheckedChange={(on) =>
            run(
              () => setIntakeEnabled({ projectId, enabled: on }),
              on ? 'Intake form enabled' : 'Intake form turned off',
            )
          }
          className="mt-0.5"
        />
        <div>
          <Label htmlFor="intake-enabled">Accept requests</Label>
          <p className="mt-1 text-sm text-muted-foreground">
            Anyone with the link can submit a request without an account. Requests arrive as
            issues in {triageEnabled ? 'Triage' : 'your default state'}
            {triageEnabled ? '' : ' (turn on triage in Cycles & triage to review them first)'}.
          </p>
        </div>
      </div>

      {url && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="intake-url">Public link</Label>
            <CopyField id="intake-url" value={url} label="Link" />
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button asChild variant="ghost" size="sm">
                <a href={url} target="_blank" rel="noreferrer">
                  <ExternalLink />
                  Open form
                </a>
              </Button>
              {canEdit && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" disabled={pending}>
                      {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                      Rotate link
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent size="sm">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Rotate the public link?</AlertDialogTitle>
                      <AlertDialogDescription>
                        The current link and any embedded forms stop working immediately.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() =>
                          run(() => rotateIntakeToken({ projectId }), 'New link generated')
                        }
                      >
                        Rotate link
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="intake-embed">Embed on your site</Label>
            <CopyField id="intake-embed" value={embed} label="Snippet" multiline />
          </div>
        </>
      )}
    </section>
  );
}
