'use client';

import { useState, useTransition } from 'react';
import { KeyRound, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { createApiKey, revokeApiKey, type ApiKeyView } from '@/app/actions/api-keys';
import { relativeTime } from '@/components/issues/issue-properties';
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
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/ui-icons';
import { CopyField } from './copy-field';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

export function ApiKeySettings({ keys: initial }: { keys: ApiKeyView[] }) {
  const [keys, setKeys] = useState(initial);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<ApiKeyView | null>(null);
  const [, startTransition] = useTransition();

  function revoke(key: ApiKeyView) {
    startTransition(async () => {
      const result = await revokeApiKey({ id: key.id });
      if (result.ok) {
        setKeys((prev) => prev.filter((k) => k.id !== key.id));
        toast.success('API key revoked');
      } else toast.error(result.error);
    });
  }

  const createButton = (
    <Button size="sm" onClick={() => setCreating(true)}>
      <Plus />
      Create key
    </Button>
  );

  return (
    <div className="flex flex-col gap-4">
      {keys.length === 0 ? (
        <EmptyState
          className="rounded-lg border border-dashed border-border py-10"
          icon={<KeyRound />}
          title="No API keys"
          description="Create a key to script issues from CI, bots or your own tools."
          action={createButton}
        />
      ) : (
        <>
          <div className="flex justify-end">{createButton}</div>
          <div className="rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead className="w-0">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((key) => (
                  <TableRow key={key.id}>
                    <TableCell className="max-w-48 truncate font-medium">{key.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {key.prefix}…
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {dateFormat.format(new Date(key.createdAt))}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {key.lastUsedAt ? relativeTime(new Date(key.lastUsedAt)) : 'Never'}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setRevoking(key)}
                      >
                        Revoke
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {creating && (
        <CreateKeyDialog
          onClose={() => setCreating(false)}
          onCreated={(apiKey, key) => {
            setKeys((prev) => [apiKey, ...prev]);
            setCreating(false);
            setCreated(key);
          }}
        />
      )}

      <Dialog open={!!created} onOpenChange={(open) => !open && setCreated(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy your API key</DialogTitle>
            <DialogDescription>
              This is the only time the key is shown. Store it somewhere safe — anyone with it can
              act as you in every project you belong to.
            </DialogDescription>
          </DialogHeader>
          {created && <CopyField value={created} label="API key" />}
          <DialogFooter>
            <Button onClick={() => setCreated(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!revoking} onOpenChange={(open) => !open && setRevoking(null)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke “{revoking?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Requests using this key will fail immediately. This can&rsquo;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => revoking && revoke(revoking)}>
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CreateKeyDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (apiKey: ApiKeyView, key: string) => void;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createApiKey({ name });
      if (result.ok) onCreated(result.apiKey, result.key);
      else if (result.field) setError(result.error);
      else toast.error(result.error);
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>Create API key</DialogTitle>
            <DialogDescription>The key acts as you, with your project roles.</DialogDescription>
          </DialogHeader>
          <Field id="api-key-name" label="Name" hint="Where it’s used, e.g. “CI bot”." error={error}>
            <Input
              id="api-key-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(undefined);
              }}
              maxLength={60}
              autoFocus
              autoComplete="off"
              aria-invalid={!!error}
              aria-describedby={error ? 'api-key-name-error' : undefined}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending && <Loader2 className="animate-spin" />}
              Create key
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
