// Sign-in rules the server enforces and the forms mirror. Client-safe.

/** Shortest password Better Auth accepts (emailAndPassword.minPasswordLength). */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Header the email-verification page's password form sends the link's token
 * in; with REQUIRE_EMAIL_VERIFICATION on it lets that one address sign in
 * unverified (src/lib/server/email-proof.ts verifyingSignInContext).
 */
export const VERIFICATION_TOKEN_HEADER = 'x-email-verification-token';

/** Longest display name: sign-up, /update-user and the profile form (names show in every list and audit row). */
export const MAX_NAME_LENGTH = 100;

/**
 * The one display-name rule (sign-up, /update-user, Settings → Profile): a
 * string (not an array or object) of 1..MAX_NAME_LENGTH characters with no
 * control characters (no line breaks to forge extra lines wherever it shows).
 */
export function validUserName(name: unknown): name is string {
  return (
    typeof name === 'string' &&
    name.trim().length > 0 &&
    name.length <= MAX_NAME_LENGTH &&
    // eslint-disable-next-line no-control-regex
    !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(name)
  );
}

/** The error every name check shows. */
export const NAME_RULE_MESSAGE = `Name must be 1 to ${MAX_NAME_LENGTH} characters on one line.`;
