<!--
  SCIM setup notes.
-->
<script lang="ts">
  import Notes from './setup-notes-details.svelte';

  let { baseUrl }: { baseUrl: string } = $props();
</script>

<div class="flex flex-col gap-2">
  <Notes title="Okta">
    <p>
      In your app integration: General → Provisioning: <b>SCIM</b>. Provisioning tab → SCIM
      connector base URL <code>{baseUrl}</code>, unique identifier field
      <code>userName</code>, actions: Push New Users, Push Profile Updates; authentication
      <b>HTTP Header</b> with the token. Then To App → enable Create / Update / Deactivate Users.
    </p>
    <p>
      Assigning a person provisions them as a workspace member; unassigning or deactivating removes
      them from the workspace and its teams and signs them out.
    </p>
  </Notes>
  <Notes title="Keycloak / any client (curl)">
    <p>Keycloak has no built-in SCIM client — use a SCIM extension, or try the API directly:</p>
    <p class="break-all">
      <code
        >curl -X POST {baseUrl}/Users -H &quot;Authorization: Bearer $TOKEN&quot; -H
        &quot;Content-Type: application/scim+json&quot; -d
        &apos;{'{'}&quot;userName&quot;:&quot;ana@acme.com&quot;,&quot;name&quot;:{'{'}&quot;givenName&quot;:&quot;Ana&quot;,&quot;familyName&quot;:&quot;Lee&quot;},&quot;emails&quot;:[{'{'}&quot;value&quot;:&quot;ana@acme.com&quot;,&quot;primary&quot;:true}]}&apos;</code
      >
    </p>
    <p>
      Deactivate with <code>PATCH /Users/&lt;id&gt;</code> and
      <code>{'{"Operations":[{"op":"replace","path":"active","value":false}]}'}</code>, or
      <code>DELETE /Users/&lt;id&gt;</code>.
    </p>
    <p>
      New users must use an email on the workspace’s SSO domain (when SSO is set up). An existing
      account is adopted only if it’s already a member or on that domain.
    </p>
  </Notes>
</div>
