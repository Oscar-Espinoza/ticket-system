// Protected-route redirect test (AUTH-03 routing behavior, D-10).
//
// The security boundary for /dashboard is the SERVER-SIDE layout guard
// (src/app/dashboard/layout.tsx), NOT middleware (CVE-2025-29927). The guard
// calls `auth.api.getSession({ headers })` and, when there is no session,
// calls `redirect('/login')`.
//
// In Next.js, `redirect()` throws a special control-flow error whose digest is
// `NEXT_REDIRECT;...;/login;...`. We render the layout as a plain async function
// with no session cookie and assert it triggers that redirect to /login. Until
// Task 2 creates the layout (and src/lib/auth.ts), the import fails — the RED state.

import { describe, expect, it } from 'vitest';

import DashboardLayout from '@/app/dashboard/layout';

// next/navigation's redirect() throws an error carrying a NEXT_REDIRECT digest.
// We don't mock it — we let the real redirect run and inspect the thrown error so
// the test verifies actual guard behavior rather than a stub.
function isRedirectTo(error: unknown, path: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT') && digest.includes(path);
}

describe('Protected route guard (AUTH-03 routing, D-10)', () => {
  it('redirects an unauthenticated request to /dashboard to /login (server-side, not middleware)', async () => {
    // No session cookie -> getSession resolves null -> layout must redirect to /login.
    const invoke = async () =>
      DashboardLayout({
        children: null,
      } as Parameters<typeof DashboardLayout>[0]);

    await expect(invoke()).rejects.toSatisfy((error: unknown) =>
      isRedirectTo(error, '/login'),
    );
  });
});
