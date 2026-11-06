/**
 * What a generated remote command sends back: the action's value, or the
 * location of a redirect() it threw (commands cannot redirect, so the client
 * wrapper navigates). Not to be confused with the action-kit `ActionResult`,
 * which is the value an action itself returns.
 */
export type Transported<T> = { ok: true; value: T } | { ok: false; redirect: string };
