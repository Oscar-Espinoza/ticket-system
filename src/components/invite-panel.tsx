'use client';

// InvitePanel — MEM-01 client component.
//
// Renders the invite link section for project owners:
//   - When inviteUrl is set: read-only URL input + Copy button + Regenerate button
//   - When inviteUrl is null: Generate invite link button (primary)
//
// Copy uses navigator.clipboard.writeText with a select() fallback and a
// "Copied!" feedback label for 2000ms. Regenerate/Generate calls generateInviteLink
// via useActionState (so the pending state drives the Loader2 spinner).
//
// The URL arrives as a prop from the server component (never read from env here).
// After a successful generate/regenerate, revalidatePath in the action re-renders
// the page so inviteUrl stays fresh without manual state sync.

import { useActionState, useRef, useState } from 'react';
import { generateInviteLink, type GenerateInviteState } from '@/app/actions/invite';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Copy, RefreshCw, Loader2 } from 'lucide-react';

const initialState: GenerateInviteState = {};

export function InvitePanel({
  projectId,
  inviteUrl,
}: {
  projectId: string;
  inviteUrl: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);

  const [state, formAction, isPending] = useActionState(
    generateInviteLink,
    initialState,
  );

  // Determine the URL to display: prefer state.url (just generated) over the
  // initial prop (from the last page render) — handles the in-flight regenerate case.
  const displayUrl = state.url ?? inviteUrl;

  async function handleCopy() {
    if (!displayUrl) return;
    try {
      await navigator.clipboard.writeText(displayUrl);
    } catch {
      // Fallback: select the input text so the user can copy manually
      inputRef.current?.select();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card>
      <CardContent className="p-4">
        <form action={formAction}>
          {/* Hidden projectId — submitted with every generate/regenerate request */}
          <input type="hidden" name="projectId" value={projectId} />

          {displayUrl ? (
            /* State: invite link exists — show URL + Copy + Regenerate */
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="invite-url">Invite link</Label>
                <Input
                  id="invite-url"
                  readOnly
                  value={displayUrl}
                  className="font-mono text-sm"
                  ref={inputRef}
                />
              </div>

              {/* Helper text — always visible when a link exists */}
              <p className="text-sm text-muted-foreground">
                Anyone with this link can join as a member. The link expires in 30 days.
              </p>

              <div className="flex gap-2">
                {/* Copy button — client-only, no form submission */}
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCopy}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  {copied ? 'Copied!' : 'Copy'}
                </Button>

                {/* Regenerate button — submits the form to replace the token */}
                <Button
                  type="submit"
                  variant="outline"
                  disabled={isPending}
                >
                  {isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Regenerate
                </Button>
              </div>
            </div>
          ) : (
            /* State: no invite link yet — show Generate button */
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Generate a shareable link to invite people to this project.
              </p>
              <Button type="submit" disabled={isPending}>
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating&hellip;
                  </>
                ) : (
                  'Generate invite link'
                )}
              </Button>
            </div>
          )}

          {/* Server-level error (e.g. "Forbidden", "Not authenticated") */}
          {state.errors?.server && (
            <p className="text-sm text-destructive mt-2">{state.errors.server}</p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
