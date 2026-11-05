// Next.js runs register() once per server start, before serving requests.
// Self-hosted (SELF_HOSTED=true, see docker-compose.yml) it applies database
// migrations and schedules the daily jobs in this process, so a deployment is
// just this app plus Postgres. Vercel deploys leave SELF_HOSTED unset.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.SELF_HOSTED !== 'true') return;
  const { boot } = await import('@/lib/selfhost/boot');
  await boot();
}
