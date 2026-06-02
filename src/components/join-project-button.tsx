'use client';

// JoinProjectButton — MEM-02 client component.
//
// Submits the joinProject Server Action via an HTML form (explicit POST).
// The Server Action itself calls redirect() on success — this component does NOT
// use useRouter/router.push/useEffect for navigation. The action owns navigation
// (03-PATTERNS.md line 262, D-27).
//
// D-27: joining only fires on the explicit submit — never on render.
// No useRouter or useEffect here — the Server Action's redirect() handles navigation.

import { useActionState } from 'react';
import { joinProject, type JoinProjectState } from '@/app/actions/join';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

export function JoinProjectButton({ token }: { token: string }) {
  const [state, formAction, isPending] = useActionState(
    joinProject,
    {} as JoinProjectState,
  );

  return (
    <form action={formAction}>
      {/* Hidden input carries the invite token to the Server Action */}
      <input type="hidden" name="token" value={token} />

      <Button
        type="submit"
        className="w-full mt-6"
        disabled={isPending}
      >
        {isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Joining&hellip;
          </>
        ) : (
          'Join project'
        )}
      </Button>

      {/* Inline error when the action returns an error (e.g. expired link after page load) */}
      {state.error && (
        <p className="text-sm text-destructive mt-2">
          Unable to join. The invite link may have expired.
        </p>
      )}
    </form>
  );
}
