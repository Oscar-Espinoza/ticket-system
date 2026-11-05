// Workspace → Security (port of src/app/dashboard/workspaces/[slug]/security/page.tsx):
// SAML / OIDC single sign-on (+ "Require SSO") and SCIM provisioning. Owners
// and admins manage it; other members get a short note, non-members a 404
// (slugs can't be probed). Every action re-checks the role.

import { error, redirect } from '@sveltejs/kit';

import { getWorkspaceMembership } from '@/lib/workspace-access';
import {
  DOMAIN_TXT_LABEL,
  domainProofOptional,
  domainVerificationValue,
  emailDomain,
  getWorkspaceSso,
  isFreeMailDomain,
  workspaceSsoUrls,
} from '@/lib/sso';
import type { SsoProviderView } from '@/lib/components/security/workspace-sso-settings.svelte';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
  if (!locals.user) redirect(303, '/login');
  const membership = await getWorkspaceMembership(params.slug, locals.user.id);
  if (!membership) error(404, 'Not found');

  const workspace = { slug: membership.slug, name: membership.name, role: membership.role };
  if (membership.role === 'member') return { workspace, security: null };

  const workspaceId = membership.workspaceId;
  const view = await getWorkspaceSso(workspaceId);
  const urls = workspaceSsoUrls(workspaceId);
  const ownDomain = emailDomain(locals.user.email);

  const provider: SsoProviderView | null = view.provider && {
    protocol: view.provider.protocol,
    domain: view.provider.domain,
    issuer: view.provider.issuer,
    saml: view.provider.saml,
    oidc: view.provider.oidc,
  };

  return {
    workspace,
    security: {
      workspaceId,
      provider,
      enforced: view.enforced,
      ssoMemberCount: view.ssoMemberIds.length,
      urls: {
        acsUrl: urls.acsUrl,
        spEntityId: urls.spEntityId,
        metadataUrl: urls.metadataUrl,
        oidcRedirectUri: urls.oidcRedirectUri,
      },
      scimBaseUrl: urls.scimBaseUrl,
      scimConfigured: view.scimConfigured,
      txtRecord: { label: DOMAIN_TXT_LABEL, value: domainVerificationValue(workspaceId) },
      proofOptional: domainProofOptional(),
      suggestedDomain: isFreeMailDomain(ownDomain) ? '' : ownDomain,
    },
  };
};
