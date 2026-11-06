// Turning an action's `error` string into the sentence a user sees. Actions
// answer `'Forbidden'` for "signed in, but your role can't do this"; every
// other error is already user-facing text.

export const FORBIDDEN_IN_PROJECT = "You don't have permission to do that in this project.";

/** `error`, with `'Forbidden'` replaced by `forbidden` (default: the generic project sentence). */
export function actionErrorText(error: string, forbidden: string = FORBIDDEN_IN_PROJECT): string {
  return error === 'Forbidden' ? forbidden : error;
}
