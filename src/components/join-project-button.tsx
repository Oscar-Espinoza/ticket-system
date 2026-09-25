'use client';

// JoinProjectButton — explicit POST to joinProject (joining never happens on
// render). The action redirects into the project on success, so there is no
// client-side navigation here.

import { useActionState } from 'react';
import { Loader2 } from 'lucide-react';

import { joinProject, type JoinProjectState } from '@/app/actions/join';
import { Button } from '@/components/ui/button';

const ERROR_MESSAGE: Record<NonNullable<JoinProjectState['error']>, string> = {
  invalid: 'Unable to join. The invitation may have expired or already been used.',
  'wrong-account': 'This invitation was sent to a different email address.',
  'Not authenticated': 'Your session expired. Sign in again to join.',
};

export function JoinProjectButton({ token }: { token: string }) {
  const [state, formAction, isPending] = useActionState(joinProject, {} as JoinProjectState);

  return (
    <form action={formAction}>
      <input type="hidden" name="token" value={token} />
      <Button type="submit" className="mt-6 w-full" disabled={isPending}>
        {isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Joining&hellip;
          </>
        ) : (
          'Join project'
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
