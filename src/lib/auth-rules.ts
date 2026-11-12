// Sign-in rules the server enforces and the forms mirror. Client-safe.

/** Shortest password Better Auth accepts (emailAndPassword.minPasswordLength). */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Header the email-verification page's password form sends the link's token
 * in; with REQUIRE_EMAIL_VERIFICATION on it lets that one address sign in
 * unverified (src/lib/server/email-proof.ts verifyingSignInContext).
 */
export const VERIFICATION_TOKEN_HEADER = 'x-email-verification-token';

/** Longest display name (sign-up, /update-user, Settings → Profile). */
export const USER_NAME_MAX = 100;

/**
 * A display name the server accepts: 1..USER_NAME_MAX characters, no control
 * characters (no line breaks to forge extra lines wherever it is shown).
 */
export function validUserName(name: unknown): name is string {
  return (
    typeof name === 'string' &&
    name.trim().length > 0 &&
    name.length <= USER_NAME_MAX &&
    // eslint-disable-next-line no-control-regex
    !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(name)
  );
}
