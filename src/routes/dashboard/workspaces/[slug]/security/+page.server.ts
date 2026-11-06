// Workspace → Security: SAML / OIDC single sign-on (+ "Require SSO") and SCIM provisioning. Owners
// and admins manage it; other members get a short note, non-members a 404
// (slugs can't be probed). Every action re-checks the role.

import { error } from '@sveltejs/kit';

import { getWorkspaceMembership } from '@/lib/workspace-access';
import { workspaceRoleAllows } from '@/lib/workspace-types';
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
import { requireUser } from '@/lib/session';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const user = await requireUser();
  const membership = await getWorkspaceMembership(params.slug, user.id);
  if (!membership) error(404, 'Workspace not found');

  const workspace = { slug: membership.slug, name: membership.name, role: membership.role };
  if (!workspaceRoleAllows(membership.role, 'admin')) return { workspace, security: null };

  const workspaceId = membership.workspaceId;
  const view = await getWorkspaceSso(workspaceId);
  const urls = workspaceSsoUrls(workspaceId);
  const ownDomain = emailDomain(user.email);

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
