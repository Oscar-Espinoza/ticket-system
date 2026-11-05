<!--
  Registers public/sw.js (offline shell + asset cache). Production only, so dev
  never serves stale bundles — add ?sw=1 to try it in dev, ?sw=0 to unregister.
  Port of src/components/pwa/register-sw.tsx (RegisterServiceWorker). Renders nothing.
-->
<script lang="ts">
  import { dev } from '$app/env';

  $effect(() => {
    if (!('serviceWorker' in navigator)) return;
    const flag = new URLSearchParams(window.location.search).get('sw');
    if (flag === '0') {
      void navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())));
      return;
    }
    if (dev && flag !== '1') return;
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .catch((err) => console.warn('[sw] registration failed', err));
  });
</script>
