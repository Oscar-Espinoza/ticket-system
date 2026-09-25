'use client';

// Explicit POST to acceptWorkspaceInvite (visiting the invite page never
// joins). The action redirects into the workspace on success.

import { useActionState } from 'react';
import { Loader2 } from 'lucide-react';

import {
  acceptWorkspaceInvite,
  type AcceptWorkspaceInviteState,
} from '@/app/actions/workspaces';
import { Button } from '@/components/ui/button';

const ERROR_MESSAGE: Record<NonNullable<AcceptWorkspaceInviteState['error']>, string> = {
  invalid: 'This invitation is invalid, has expired or was already used.',
  'wrong-account': 'This invitation was sent to a different email address.',
  'Not authenticated': 'Your session expired. Sign in again to join.',
};

export function AcceptWorkspaceInvite({ token }: { token: string }) {
  const [state, formAction, isPending] = useActionState(
    acceptWorkspaceInvite,
    {} as AcceptWorkspaceInviteState,
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="token" value={token} />
      <Button type="submit" className="mt-6 w-full" disabled={isPending}>
        {isPending ? (
          <>
            <Loader2 className="animate-spin" />
            Joining&hellip;
          </>
        ) : (
          'Join workspace'
        )}
      </Button>
      {state.error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {ERROR_MESSAGE[state.error]}
        </p>
      )}
    </form>
  );
}
