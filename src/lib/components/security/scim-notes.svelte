<!--
  SCIM setup notes.
-->
<script lang="ts">
  import { m } from '@/lib/i18n';
  import RichText from '@/lib/components/settings/rich-text.svelte';
  import Notes from './setup-notes-details.svelte';

  let { baseUrl }: { baseUrl: string } = $props();

  const curlCommand = $derived(
    `curl -X POST ${baseUrl}/Users -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/scim+json" -d '{"userName":"ana@acme.com","name":{"givenName":"Ana","familyName":"Lee"},"emails":[{"value":"ana@acme.com","primary":true}]}'`,
  );
</script>

<div class="flex flex-col gap-2">
  <Notes title={'Okta'}>
    <p><RichText text={m.settings_sec_scim_okta_1({ baseUrl })} /></p>
    <p>{m.settings_sec_scim_okta_2()}</p>
  </Notes>
  <Notes title={m.settings_sec_scim_keycloak_title()}>
    <p>{m.settings_sec_scim_keycloak_1()}</p>
    <p class="break-all">
      <code>{curlCommand}</code>
    </p>
    <p>
      <RichText
        text={m.settings_sec_scim_deactivate({
          body: '{"Operations":[{"op":"replace","path":"active","value":false}]}',
        })}
      />
    </p>
    <p>
      {m.settings_sec_scim_domain()}
    </p>
  </Notes>
</div>
