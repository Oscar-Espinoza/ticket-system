<!--
  Collapsible IdP setup notes for the free tiers people actually test with:
  Okta Integrator (developer) accounts and self-hosted Keycloak.
-->
<script lang="ts">
  import { m } from '@/lib/i18n';
  import RichText from '@/lib/components/settings/rich-text.svelte';
  import Notes from './setup-notes-details.svelte';

  let { protocol }: { protocol: 'saml' | 'oidc' } = $props();
</script>

{#if protocol === 'oidc'}
  <div class="flex flex-col gap-2">
    <Notes title={m.settings_sec_okta_integrator()}>
      <p><RichText text={m.settings_sec_oidc_okta()} /></p>
    </Notes>
    <Notes title={m.settings_sec_keycloak_selfhosted()}>
      <p><code>{'docker run -p 8080:8080 -e KC_BOOTSTRAP_ADMIN_USERNAME=admin -e KC_BOOTSTRAP_ADMIN_PASSWORD=admin quay.io/keycloak/keycloak start-dev'}</code></p>
      <p><RichText text={m.settings_sec_oidc_kc_1()} /></p>
      <p><RichText text={m.settings_sec_oidc_kc_2()} /></p>
    </Notes>
  </div>
{:else}
  <div class="flex flex-col gap-2">
    <Notes title={m.settings_sec_okta_integrator()}>
      <p><RichText text={m.settings_sec_saml_okta_1()} /></p>
      <p><RichText text={m.settings_sec_saml_okta_2()} /></p>
      <p><RichText text={m.settings_sec_saml_okta_3()} /></p>
    </Notes>
    <Notes title={m.settings_sec_keycloak_selfhosted()}>
      <p><RichText text={m.settings_sec_saml_kc_1()} /></p>
      <p><RichText text={m.settings_sec_saml_kc_2()} /></p>
    </Notes>
  </div>
{/if}
