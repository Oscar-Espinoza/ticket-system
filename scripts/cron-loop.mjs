// Self-hosted stand-in for Vercel Cron: calls /api/cron/daily once a day
// (first run shortly after start). Uses CRON_SECRET like Vercel does.
const base = (process.env.CRON_TARGET_URL ?? 'http://app:3000').replace(/\/$/, '');
const secret = process.env.CRON_SECRET;
const DAY = 24 * 60 * 60 * 1000;

if (!secret) {
  console.error('[cron] CRON_SECRET is not set; daily jobs are disabled.');
  process.exit(1);
}

async function tick() {
  try {
    const res = await fetch(`${base}/api/cron/daily`, { headers: { authorization: `Bearer ${secret}` } });
    console.log(`[cron] ${new Date().toISOString()} HTTP ${res.status} ${await res.text()}`);
  } catch (err) {
    console.error('[cron] request failed', err);
  }
}

setTimeout(() => {
  void tick();
  setInterval(() => void tick(), DAY);
}, 60_000);
