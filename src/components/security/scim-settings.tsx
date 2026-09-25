'use client';

// Workspace → Security → SCIM provisioning: one bearer token per workspace,
// shown once (stored hashed), rotate or revoke any time.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw, Users } from 'lucide-react';
import { toast } from 'sonner';

import { generateScimToken, revokeScimToken } from '@/app/actions/security';
import { CopyField } from '@/components/integrations/copy-field';
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
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LabelChip } from '@/components/ui-icons';
import { ScimNotes } from './setup-notes';

export function ScimSettings({
  workspaceId,
  configured: initialConfigured,
  baseUrl,
}: {
  workspaceId: string;
  configured: boolean;
  baseUrl: string;
}) {
  const router = useRouter();
  const [configured, setConfigured] = useState(initialConfigured);
  const [token, setToken] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'rotate' | 'revoke' | null>(null);
  const [pending, startTransition] = useTransition();

  function generate() {
    startTransition(async () => {
      const result = await generateScimToken({ workspaceId });
      if (result.ok) {
        setConfigured(true);
        setToken(result.token);
        router.refresh();
      } else toast.error(result.error);
    });
  }

  function revoke() {
    startTransition(async () => {
      const result = await revokeScimToken({ workspaceId });
      if (result.ok) {
        setConfigured(false);
        toast.success('SCIM token revoked');
        router.refresh();
      } else toast.error(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3 rounded-lg border border-border px-4 py-3">
        <span
          aria-hidden="true"
          className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
        >
          <Users className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-medium">
            SCIM 2.0
            {configured ? <LabelChip color="done">Active</LabelChip> : <LabelChip>Off</LabelChip>}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Your identity provider adds people to the workspace when they’re assigned and removes
            them from the workspace and its teams when they’re deactivated.
          </p>
        </div>
        {configured ? (
          <>
            <Button variant="outline" size="sm" disabled={pending} onClick={() => setConfirm('rotate')}>
              <RefreshCw />
              Rotate token
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={pending}
              onClick={() => setConfirm('revoke')}
            >
              Revoke
            </Button>
          </>
        ) : (
          <Button size="sm" disabled={pending} onClick={generate}>
            {pending && <Loader2 className="animate-spin" />}
            Generate token
          </Button>
        )}
      </div>

      <Field id="scim-base-url" label="SCIM base URL">
        <CopyField id="scim-base-url" value={baseUrl} label="Base URL" />
      </Field>

      <ScimNotes baseUrl={baseUrl} />

      <Dialog open={!!token} onOpenChange={(open) => !open && setToken(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy your SCIM token</DialogTitle>
            <DialogDescription>
              This is the only time it’s shown. Paste it into your identity provider as the bearer
              token — anyone with it can add and remove workspace members.
            </DialogDescription>
          </DialogHeader>
          {token && <CopyField value={token} label="SCIM token" />}
          <DialogFooter>
            <Button onClick={() => setToken(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === 'rotate' ? 'Rotate the SCIM token?' : 'Revoke the SCIM token?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === 'rotate'
                ? 'The current token stops working immediately; update your identity provider with the new one.'
                : 'Provisioning stops immediately. Existing members stay in the workspace.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={confirm === 'revoke' ? 'destructive' : 'default'}
              onClick={() => (confirm === 'rotate' ? generate() : revoke())}
            >
              {confirm === 'rotate' ? 'Rotate' : 'Revoke'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
