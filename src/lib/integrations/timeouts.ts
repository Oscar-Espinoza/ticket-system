// How long we wait on each kind of third-party HTTP call.

/** Slack Web API and incoming webhooks: they run in after() and must not stall it. */
export const SLACK_TIMEOUT_MS = 3_000;
/** Outgoing webhook deliveries and Sentry's API. */
export const WEBHOOK_TIMEOUT_MS = 5_000;
/** GitHub, GitLab and Bitbucket APIs. */
export const PROVIDER_TIMEOUT_MS = 10_000;
/** Asana import. */
export const ASANA_TIMEOUT_MS = 15_000;
/** Web Push services. */
export const PUSH_TIMEOUT_MS = 15_000;
/** Shortcut import. */
export const SHORTCUT_TIMEOUT_MS = 20_000;
