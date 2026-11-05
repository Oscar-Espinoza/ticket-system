// SvelteKit app types. Locals carry the Better Auth session resolved once per
// request in src/hooks.server.ts.
import type { auth } from '@/lib/auth';

type AuthSession = typeof auth.$Infer.Session;

declare global {
  namespace App {
    interface Error {
      code?: string;
    }
    interface Locals {
      user: AuthSession['user'] | null;
      session: AuthSession['session'] | null;
    }
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
