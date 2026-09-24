// Transactional email. Sends through Resend's REST API when RESEND_API_KEY and
// EMAIL_FROM are set (free tier); otherwise logs the message so local dev and
// $0 deployments work without a provider. Never throws — returns whether the
// message was handed to the provider.

export interface EmailMessage {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
}

export async function sendEmail(message: EmailMessage): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    console.info('[email] (not sent — RESEND_API_KEY/EMAIL_FROM unset)', {
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
    return false;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: Array.isArray(message.to) ? message.to : [message.to],
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
      }),
    });
    if (!response.ok) {
      console.error('[email] Resend rejected the message', response.status, await response.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error('[email] send failed', err);
    return false;
  }
}
