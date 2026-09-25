// Collapsible IdP setup notes for the free tiers people actually test with:
// Okta Integrator (developer) accounts and self-hosted Keycloak.

import type { ReactNode } from 'react';

function Notes({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group rounded-md border border-border px-3 py-2 text-sm">
      <summary className="cursor-pointer text-muted-foreground select-none group-open:text-foreground">
        {title}
      </summary>
      <div className="mt-2 flex flex-col gap-1.5 text-xs leading-relaxed text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-foreground">
        {children}
      </div>
    </details>
  );
}

export function SetupNotes({ protocol }: { protocol: 'saml' | 'oidc' }) {
  if (protocol === 'oidc') {
    return (
      <div className="flex flex-col gap-2">
        <Notes title="Okta (free Integrator account)">
          <p>
            Applications → Create App Integration → <b>OIDC – Web Application</b>. Sign-in redirect
            URI = the redirect URI above; grant type Authorization Code. Assign people, then copy
            the client ID and secret. Issuer = your Okta domain, e.g.{' '}
            <code>https://integrator-123.okta.com</code>.
          </p>
        </Notes>
        <Notes title="Keycloak (self-hosted, free)">
          <p>
            <code>docker run -p 8080:8080 -e KC_BOOTSTRAP_ADMIN_USERNAME=admin -e KC_BOOTSTRAP_ADMIN_PASSWORD=admin quay.io/keycloak/keycloak start-dev</code>
          </p>
          <p>
            Create a realm and a client (OpenID Connect, Client authentication on, Standard flow).
            Valid redirect URI = the redirect URI above. Issuer ={' '}
            <code>http://localhost:8080/realms/&lt;realm&gt;</code>. Give test users an email on
            your domain with “Email verified” on.
          </p>
          <p>
            Local IdP hosts are private addresses: add them to{' '}
            <code>BETTER_AUTH_TRUSTED_ORIGINS</code> (e.g. <code>http://localhost:8080</code>) so
            discovery is allowed.
          </p>
        </Notes>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Notes title="Okta (free Integrator account)">
        <p>
          Applications → Create App Integration → <b>SAML 2.0</b>. Single sign-on URL = ACS URL,
          Audience URI = SP entity ID, Name ID format <code>EmailAddress</code>, Application
          username <code>Email</code>.
        </p>
        <p>
          Attribute statements: <code>email</code> → <code>user.email</code>,{' '}
          <code>givenName</code> → <code>user.firstName</code>, <code>surname</code> →{' '}
          <code>user.lastName</code>, and <code>email_verified</code> → <code>&quot;true&quot;</code>{' '}
          (lets SSO sign in people who already have an account here).
        </p>
        <p>Assign people, then paste the app’s metadata XML above.</p>
      </Notes>
      <Notes title="Keycloak (self-hosted, free)">
        <p>
          Clients → Create client → <b>SAML</b>; Client ID = SP entity ID. Valid redirect URI and
          “Assertion Consumer Service POST Binding URL” = ACS URL. Name ID format{' '}
          <code>email</code>; turn on “Sign assertions”.
        </p>
        <p>
          Client scopes → dedicated scope → add mappers: User Property <code>email</code> →{' '}
          <code>email</code>, and a Hardcoded attribute <code>email_verified</code> ={' '}
          <code>true</code>. Metadata:{' '}
          <code>http://localhost:8080/realms/&lt;realm&gt;/protocol/saml/descriptor</code>.
        </p>
      </Notes>
    </div>
  );
}

export function ScimNotes({ baseUrl }: { baseUrl: string }) {
  return (
    <div className="flex flex-col gap-2">
      <Notes title="Okta">
        <p>
          In your app integration: General → Provisioning: <b>SCIM</b>. Provisioning tab → SCIM
          connector base URL <code>{baseUrl}</code>, unique identifier field{' '}
          <code>userName</code>, actions: Push New Users, Push Profile Updates; authentication{' '}
          <b>HTTP Header</b> with the token. Then To App → enable Create / Update / Deactivate
          Users.
        </p>
        <p>
          Assigning a person provisions them as a workspace member; unassigning or deactivating
          removes them from the workspace and its teams and signs them out.
        </p>
      </Notes>
      <Notes title="Keycloak / any client (curl)">
        <p>
          Keycloak has no built-in SCIM client — use a SCIM extension, or try the API directly:
        </p>
        <p className="break-all">
          <code>
            curl -X POST {baseUrl}/Users -H &quot;Authorization: Bearer $TOKEN&quot; -H
            &quot;Content-Type: application/scim+json&quot; -d
            &apos;{'{'}&quot;userName&quot;:&quot;ana@acme.com&quot;,&quot;name&quot;:{'{'}&quot;givenName&quot;:&quot;Ana&quot;,&quot;familyName&quot;:&quot;Lee&quot;{'}'},&quot;emails&quot;:[{'{'}&quot;value&quot;:&quot;ana@acme.com&quot;,&quot;primary&quot;:true{'}'}]{'}'}&apos;
          </code>
        </p>
        <p>
          Deactivate with <code>PATCH /Users/&lt;id&gt;</code> and{' '}
          <code>{'{"Operations":[{"op":"replace","path":"active","value":false}]}'}</code>, or{' '}
          <code>DELETE /Users/&lt;id&gt;</code>.
        </p>
        <p>
          New users must use an email on the workspace’s SSO domain (when SSO is set up). An
          existing account is adopted only if it’s already a member or on that domain.
        </p>
      </Notes>
    </div>
  );
}
