// Slack mrkdwn helpers shared by the Slack app and the incoming-webhook poster.

/** Slack mrkdwn control characters. */
export function slackEscape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
