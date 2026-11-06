<!--
  Collapsible IdP setup notes for the free tiers people actually test with:
  Okta Integrator (developer) accounts and self-hosted Keycloak.
-->
<script lang="ts">
  import Notes from './setup-notes-details.svelte';

  let { protocol }: { protocol: 'saml' | 'oidc' } = $props();
</script>

{#if protocol === 'oidc'}
  <div class="flex flex-col gap-2">
    <Notes title="Okta (free Integrator account)">
      <p>
        Applications → Create App Integration → <b>OIDC – Web Application</b>. Sign-in redirect
        URI = the redirect URI above; grant type Authorization Code. Assign people, then copy the
        client ID and secret. Issuer = your Okta domain, e.g.
        <code>https://integrator-123.okta.com</code>.
      </p>
    </Notes>
    <Notes title="Keycloak (self-hosted, free)">
      <p>
        <code
          >docker run -p 8080:8080 -e KC_BOOTSTRAP_ADMIN_USERNAME=admin -e KC_BOOTSTRAP_ADMIN_PASSWORD=admin quay.io/keycloak/keycloak start-dev</code
        >
      </p>
      <p>
        Create a realm and a client (OpenID Connect, Client authentication on, Standard flow).
        Valid redirect URI = the redirect URI above. Issuer =
        <code>http://localhost:8080/realms/&lt;realm&gt;</code>. Give test users an email on your
        domain with “Email verified” on.
      </p>
      <p>
        Local IdP hosts are private addresses: add them to
        <code>BETTER_AUTH_TRUSTED_ORIGINS</code> (e.g. <code>http://localhost:8080</code>) so
        discovery is allowed.
      </p>
    </Notes>
  </div>
{:else}
  <div class="flex flex-col gap-2">
    <Notes title="Okta (free Integrator account)">
      <p>
        Applications → Create App Integration → <b>SAML 2.0</b>. Single sign-on URL = ACS URL,
        Audience URI = SP entity ID, Name ID format <code>EmailAddress</code>, Application username
        <code>Email</code>.
      </p>
      <p>
        Attribute statements: <code>email</code> → <code>user.email</code>,
        <code>givenName</code> → <code>user.firstName</code>, <code>surname</code> →
        <code>user.lastName</code>, and <code>email_verified</code> → <code>&quot;true&quot;</code>
        (lets SSO sign in people who already have an account here).
      </p>
      <p>Assign people, then paste the app’s metadata XML above.</p>
    </Notes>
    <Notes title="Keycloak (self-hosted, free)">
      <p>
        Clients → Create client → <b>SAML</b>; Client ID = SP entity ID. Valid redirect URI and
        “Assertion Consumer Service POST Binding URL” = ACS URL. Name ID format
        <code>email</code>; turn on “Sign assertions”.
      </p>
      <p>
        Client scopes → dedicated scope → add mappers: User Property <code>email</code> →
        <code>email</code>, and a Hardcoded attribute <code>email_verified</code> =
        <code>true</code>. Metadata:
        <code>http://localhost:8080/realms/&lt;realm&gt;/protocol/saml/descriptor</code>.
      </p>
    </Notes>
  </div>
{/if}
