// Daily cron job stub — owned by D10a. Retry failed outgoing webhook deliveries (webhook_delivery.nextAttemptAt <= now).
// Must be idempotent (Vercel may retry) and never throw past its own try/catch.

export async function run(_now: Date): Promise<string> {
  return 'not implemented';
}
