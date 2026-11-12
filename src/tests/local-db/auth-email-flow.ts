// Helpers for the email-verification suites: the real Better Auth instance
// (src/lib/auth.ts) driven through its HTTP handler against the local
// database. Only outbound HTTP is replaced: Resend's send endpoint is captured
// and Google's token endpoint answers with an id_token for `google.profile`.
// Any other outbound request fails the test (no real network), except the
// local Neon proxy (NEON_PROXY_HOST), which the neon-http driver reaches by fetch.
//
// Each suite sets its environment in vi.hoisted() BEFORE importing this file,
// because auth.ts reads RESEND_* / GOOGLE_* / REQUIRE_EMAIL_VERIFICATION once.
import { eq } from 'drizzle-orm';
import { vi } from 'vitest';

import { auth } from '@/lib/auth';
import { ACCOUNT_CLAIM_ACK_FIELD } from '@/lib/account-claim';
import { db } from '@/lib/db';
import { POST as previewEndpoint } from '../../routes/api/password-reset/preview/+server';
import { accounts, sessions, users } from '@/db/schema';
import { authRequest } from '../mcp/oauth-flow';

export interface SentEmail {
  from: string;
  to: string[];
  subject: string;
  text: string;
}

export const sent: SentEmail[] = [];

export const google = {
  profile: { sub: 'google-sub', email: 'someone@example.test', email_verified: true, name: 'Someone' } as Record<
    string,
    unknown
  >,
};

const unsignedJwt = (claims: Record<string, unknown>) =>
  [{ alg: 'none', typ: 'JWT' }, { iss: 'https://accounts.google.com', aud: 'test', iat: 1, exp: 9999999999, ...claims }]
    .map((part) => Buffer.from(JSON.stringify(part)).toString('base64url'))
    .join('.') + '.';

/** While set, Resend calls wait for it (to see what a request answers before its email is sent). */
let resendGate: Promise<void> | null = null;

/** Holds every Resend call until the returned function is called. */
export function holdResend(): () => void {
  let release!: () => void;
  resendGate = new Promise((resolve) => (release = resolve));
  return () => {
    resendGate = null;
    release();
  };
}

export function stubOutboundHttp() {
  const realFetch = globalThis.fetch;
  const proxyHost = process.env.NEON_PROXY_HOST;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (proxyHost && new URL(url).host === proxyHost) return realFetch(input, init);
    if (url === 'https://api.resend.com/emails') {
      if (resendGate) await resendGate;
      sent.push(JSON.parse(String(init?.body)));
      return Response.json({ id: `email-${sent.length}` });
    }
    if (url.startsWith('https://oauth2.googleapis.com/token')) {
      return Response.json({
        access_token: 'ya29.test',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'openid email profile',
        id_token: unsignedJwt(google.profile),
      });
    }
    throw new Error(`unexpected outbound request in a test: ${url}`);
  });
}

export const cookieOf = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');

export const uniqueEmail = (label: string) =>
  `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@verify.test`;

export const PASSWORD = 'correct-horse-battery-staple';

export function signUp(email: string, callbackURL = '/dashboard', password = PASSWORD, name = email.split('@')[0]) {
  return authRequest('/sign-up/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, name, callbackURL }),
  });
}

export function signIn(email: string, password = PASSWORD, headers: Record<string, string> = {}) {
  return authRequest('/sign-in/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ email, password }),
  });
}

export function sendVerification(email: string, cookie?: string, callbackURL = '/dashboard') {
  return authRequest('/send-verification-email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, callbackURL }),
    cookie,
  });
}

/** The signed-in user id for a cookie, read from the database (null when signed out or revoked). */
export async function sessionOf(cookie: string): Promise<string | null> {
  const res = await authRequest('/get-session?disableCookieCache=true', { method: 'GET', cookie });
  const body = (await res.json()) as { user?: { id: string } } | null;
  return body?.user?.id ?? null;
}

export function requestReset(email: string) {
  return authRequest('/request-password-reset', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, redirectTo: 'https://evil.example/steal' }),
  });
}

/** The token in the newest reset email to `email` (the link carries it in the fragment). */
export function resetTokenFor(email: string): string {
  const mail = emailsTo(email).filter((m) => m.subject === 'Reset your password').at(-1);
  if (!mail) throw new Error(`no reset email sent to ${email}`);
  const match = /(https?:\/\/\S+)\/reset-password#token=(\S+)/.exec(mail.text);
  if (!match) throw new Error(`no reset link in: ${mail.text}`);
  return decodeURIComponent(match[2]);
}

/** POST /reset-password; `acknowledge` sends the "remove these and secure the account" confirmation. */
export function resetPassword(token: string, newPassword: string, acknowledge = false) {
  return authRequest('/reset-password', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, newPassword, ...(acknowledge ? { [ACCOUNT_CLAIM_ACK_FIELD]: true } : {}) }),
  });
}

/** The reset page's question (src/routes/api/password-reset/preview), through its real handler. */
export async function resetPreview(token: unknown): Promise<unknown> {
  const request = new Request('http://localhost:3000/api/password-reset/preview', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  const response = await previewEndpoint({ request } as Parameters<typeof previewEndpoint>[0]);
  return response.json();
}

export const emailsTo = (email: string) => sent.filter((m) => m.to.includes(email));

/** The verify link in the newest verification email to `email`. */
export function verifyLinkFor(email: string): URL {
  const mail = emailsTo(email).filter((m) => m.subject === 'Verify your email address').at(-1);
  if (!mail) throw new Error(`no email sent to ${email}`);
  const match = /https?:\/\/\S+\/api\/auth\/verify-email\?\S+/.exec(mail.text);
  if (!match) throw new Error(`no verify link in: ${mail.text}`);
  return new URL(match[0]);
}

/** Opens a verify-email URL (as the browser would, optionally with a session cookie). */
export function openVerifyLink(link: URL, cookie?: string) {
  return authRequest(`/verify-email${link.search}`, { method: 'GET', cookie });
}

export async function userByEmail(email: string) {
  const [row] = await db.select().from(users).where(eq(users.email, email));
  return row;
}

export const accountsOf = (userId: string) => db.select().from(accounts).where(eq(accounts.userId, userId));

export async function sessionUserId(response: Response): Promise<string | null> {
  const cookie = response.headers
    .getSetCookie()
    .find((c) => c.startsWith('better-auth.session_token='));
  if (!cookie) return null;
  const token = decodeURIComponent(cookie.split(';')[0].split('=')[1]).split('.')[0];
  const [row] = await db.select({ userId: sessions.userId }).from(sessions).where(eq(sessions.token, token));
  return row?.userId ?? null;
}

/**
 * "Continue with Google" end to end: start the sign-in (state stored by Better
 * Auth), then the callback Google would redirect to. Returns the callback's
 * redirect response.
 */
export async function googleSignIn(profile: Record<string, unknown>) {
  google.profile = profile;
  const start = await authRequest('/sign-in/social', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ provider: 'google', callbackURL: '/dashboard', errorCallbackURL: '/login' }),
  });
  if (!start.ok) throw new Error(`sign-in/social failed: ${start.status} ${await start.text()}`);
  const { url } = (await start.json()) as { url: string };
  const state = new URL(url).searchParams.get('state')!;
  return authRequest(`/callback/google?code=test-code&state=${encodeURIComponent(state)}`, {
    method: 'GET',
    cookie: cookieOf(start),
  });
}

export const authContext = () => auth.$context;
