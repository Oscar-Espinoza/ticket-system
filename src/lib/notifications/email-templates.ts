// Plain-text + minimal inline-styled HTML for notification emails. Email
// clients ignore stylesheets, so styles are inline and the markup is a table-free
// single column that degrades to readable text.

export interface EmailItem {
  /** "Ana assigned you" */
  sentence: string;
  key: string;
  title: string;
  url: string;
  excerpt?: string;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

/** Absolute origin for links that leave the browser. */
export function appOrigin(): string {
  const url =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.BETTER_AUTH_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : 'http://localhost:3000');
  return url.replace(/\/+$/, '');
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const FONT =
  "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

function layout(body: string, settingsUrl: string): string {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f6f7;${FONT}">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e6e6e9;border-radius:8px;padding:24px;color:#1b1b1f;font-size:14px;line-height:1.5">
${body}
</div>
<p style="max-width:560px;margin:12px auto 0;color:#8a8a93;font-size:12px;${FONT}">
You get these emails because of your notification settings. <a href="${escapeHtml(settingsUrl)}" style="color:#8a8a93">Change them</a>.
</p>
</body></html>`;
}

function itemHtml(item: EmailItem): string {
  const excerpt = item.excerpt
    ? `<div style="margin-top:6px;padding-left:10px;border-left:3px solid #e6e6e9;color:#55555c">${escapeHtml(item.excerpt)}</div>`
    : '';
  return `<div style="padding:12px 0;border-top:1px solid #f0f0f2">
<div style="color:#55555c">${escapeHtml(item.sentence)}</div>
<a href="${escapeHtml(item.url)}" style="color:#1b1b1f;font-weight:600;text-decoration:none"><span style="color:#8a8a93;font-weight:400">${escapeHtml(item.key)}</span> ${escapeHtml(item.title)}</a>
${excerpt}
</div>`;
}

function itemText(item: EmailItem): string {
  const lines = [`${item.sentence} — ${item.key} ${item.title}`];
  if (item.excerpt) lines.push(`  "${item.excerpt}"`);
  lines.push(`  ${item.url}`);
  return lines.join('\n');
}

export function notificationEmail(items: EmailItem[], settingsUrl: string): RenderedEmail {
  const [first] = items;
  const single = items.length === 1;
  const issueCount = new Set(items.map((item) => item.key)).size;
  const subject = single
    ? `${first.key} ${first.title} — ${first.sentence}`
    : `${items.length} updates on ${issueCount === 1 ? first.key : `${issueCount} issues`}`;

  const heading = single ? '' : `<p style="margin:0 0 8px;font-weight:600">${escapeHtml(subject)}</p>`;
  const html = layout(`${heading}${items.map(itemHtml).join('')}`, settingsUrl);
  const text = [
    ...(single ? [] : [subject, '']),
    items.map(itemText).join('\n\n'),
    '',
    `Notification settings: ${settingsUrl}`,
  ].join('\n');
  return { subject, text, html };
}

export function testEmail(name: string, settingsUrl: string): RenderedEmail {
  const subject = 'Test notification email';
  const body = `Hi ${name}, this is a test. Notification emails will look like this and link back to the issue.`;
  return {
    subject,
    text: `${body}\n\nNotification settings: ${settingsUrl}`,
    html: layout(`<p style="margin:0">${escapeHtml(body)}</p>`, settingsUrl),
  };
}

export function settingsUrl(): string {
  return `${appOrigin()}/dashboard/settings/notifications`;
}
